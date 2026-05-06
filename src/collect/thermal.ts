import { promises as fs } from "node:fs";
import { join } from "node:path";
import { isCpuChip } from "../lib/cpu-thermal-chips.js";
import type { ThermalInfo, ThermalReading } from "../lib/types.js";

const HWMON_ROOT = "/sys/class/hwmon";
const THERMAL_ZONE_ROOT = "/sys/class/thermal";

// Driver names we skip entirely (not in cpu_readings, not in other_readings).
// Kept short: anything not on this list and not on the CPU allowlist becomes
// other_readings so users can still see the data.
const SKIP_CHIPS: ReadonlySet<string> = new Set([
  "nvme", // already covered by SMART
]);

async function readTrim(path: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path, "utf-8");
    return raw.trim();
  } catch {
    return null;
  }
}

async function listDir(path: string): Promise<string[] | null> {
  try {
    return await fs.readdir(path);
  } catch {
    return null;
  }
}

/**
 * Decide whether a particular hwmon entry within a CPU chip is the right one
 * to use for max_cpu_celsius vs. what should go to other_readings.
 *
 * Intel coretemp:  prefer "Package id N", per-core to other_readings.
 * AMD k10temp:     prefer "Tdie", "Tctl" skipped (vendor offset), Tccd to other.
 * AMD zenpower:    prefer "Tdie".
 * Pi cpu_thermal:  single anonymous reading, take it.
 *
 * Returns "cpu" | "other" | "skip".
 */
function classifyCpuReading(chip: string, label: string): "cpu" | "other" | "skip" {
  const lower = label.toLowerCase();
  if (chip === "coretemp") {
    if (lower.startsWith("package id")) return "cpu";
    if (lower.startsWith("core ")) return "other";
    return "other";
  }
  if (chip === "k10temp" || chip === "zenpower") {
    if (lower === "tdie") return "cpu";
    if (lower === "tctl") return "skip"; // offset version of Tdie, redundant
    if (lower.startsWith("tccd")) return "other";
    // If the driver only exposes one anonymous reading (some kernels), accept it.
    return "cpu";
  }
  // Pi cpu_thermal and other ARM SoCs: usually one reading per chip, take it.
  return "cpu";
}

interface RawHwmonReading {
  chip: string;
  label: string;
  value_celsius: number;
}

export async function collectFromHwmon(root: string = HWMON_ROOT): Promise<{ cpu: ThermalReading[]; other: ThermalReading[] } | null> {
  const entries = await listDir(root);
  if (!entries) return null;

  const cpu: ThermalReading[] = [];
  const other: ThermalReading[] = [];

  for (const entry of entries) {
    const chipDir = join(root, entry);
    const chipName = await readTrim(join(chipDir, "name"));
    if (!chipName) continue;
    if (SKIP_CHIPS.has(chipName)) continue;

    const files = await listDir(chipDir);
    if (!files) continue;

    // Find tempN_input files. Skip threshold files (max, crit, max_hyst, min, etc.)
    const tempInputs = files.filter(f => /^temp\d+_input$/.test(f));
    const isCpu = isCpuChip(chipName);

    for (const inputFile of tempInputs) {
      const idx = inputFile.match(/^temp(\d+)_input$/)![1];
      const valueRaw = await readTrim(join(chipDir, inputFile));
      if (!valueRaw) continue;
      const millideg = parseInt(valueRaw, 10);
      if (!Number.isFinite(millideg)) continue;
      const celsius = millideg / 1000;
      // Reject obviously bogus values (millideg out of range / sensor offline)
      if (celsius < -50 || celsius > 200) continue;

      const labelFile = await readTrim(join(chipDir, `temp${idx}_label`));
      const label = labelFile ? `${chipName} ${labelFile}` : `${chipName} temp${idx}`;
      const reading: ThermalReading = {
        label,
        value_celsius: Math.round(celsius * 10) / 10,
        source_chip: chipName,
        source: "hwmon",
      };

      if (!isCpu) {
        other.push(reading);
        continue;
      }

      const cls = classifyCpuReading(chipName, labelFile ?? "");
      if (cls === "cpu") cpu.push(reading);
      else if (cls === "other") other.push(reading);
      // "skip" → drop
    }
  }

  return { cpu, other };
}

export async function collectFromThermalZone(root: string = THERMAL_ZONE_ROOT): Promise<{ cpu: ThermalReading[]; other: ThermalReading[] } | null> {
  const entries = await listDir(root);
  if (!entries) return null;

  const cpu: ThermalReading[] = [];
  const other: ThermalReading[] = [];

  for (const entry of entries) {
    if (!entry.startsWith("thermal_zone")) continue;
    const zoneDir = join(root, entry);
    const type = await readTrim(join(zoneDir, "type"));
    const tempRaw = await readTrim(join(zoneDir, "temp"));
    if (!type || !tempRaw) continue;
    const millideg = parseInt(tempRaw, 10);
    if (!Number.isFinite(millideg)) continue;
    const celsius = Math.round((millideg / 1000) * 10) / 10;
    if (celsius < -50 || celsius > 200) continue;

    const reading: ThermalReading = {
      label: `${type} (${entry})`,
      value_celsius: celsius,
      source_chip: type,
      source: "thermal_zone",
    };

    const lower = type.toLowerCase();
    const isCpuZone =
      lower === "cpu-thermal" ||
      lower === "cpu_thermal" ||
      lower === "x86_pkg_temp" ||
      lower.startsWith("cpu");
    if (isCpuZone) cpu.push(reading);
    else other.push(reading);
  }

  return { cpu, other };
}

export async function collectThermal(): Promise<ThermalInfo> {
  // Try hwmon first.
  const hwmon = await collectFromHwmon();
  if (hwmon && (hwmon.cpu.length > 0 || hwmon.other.length > 0)) {
    const max = hwmon.cpu.length > 0 ? Math.max(...hwmon.cpu.map(r => r.value_celsius)) : null;
    return {
      available: true,
      source: hwmon.cpu.length > 0 ? "hwmon" : (hwmon.other.length > 0 ? "hwmon" : "none"),
      cpu_readings: hwmon.cpu,
      other_readings: hwmon.other,
      max_cpu_celsius: max,
    };
  }

  // Fallback to thermal_zone.
  const tz = await collectFromThermalZone();
  if (tz && (tz.cpu.length > 0 || tz.other.length > 0)) {
    const max = tz.cpu.length > 0 ? Math.max(...tz.cpu.map(r => r.value_celsius)) : null;
    return {
      available: true,
      source: "thermal_zone",
      cpu_readings: tz.cpu,
      other_readings: tz.other,
      max_cpu_celsius: max,
    };
  }

  // Nothing available. Distinguish "we looked" (hwmon dir existed but empty)
  // from "we couldn't look at all" (no /sys mounted).
  const everLookedAtHwmon = hwmon !== null;
  const everLookedAtTz = tz !== null;
  if (everLookedAtHwmon || everLookedAtTz) {
    return { available: true, source: "none", cpu_readings: [], other_readings: [], max_cpu_celsius: null };
  }
  return { available: false, source: "none", cpu_readings: [], other_readings: [], max_cpu_celsius: null };
}
