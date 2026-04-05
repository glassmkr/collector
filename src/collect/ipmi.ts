import { run } from "../lib/exec.js";
import type { IpmiInfo } from "../lib/types.js";

export async function collectIpmi(): Promise<IpmiInfo> {
  const sensorRaw = await run("ipmitool", ["sensor"]);
  if (!sensorRaw) {
    return { available: false, sensors: [], ecc_errors: { correctable: 0, uncorrectable: 0 }, sel_entries_count: 0 };
  }

  // Parse sensor readings
  const sensors: IpmiInfo["sensors"] = [];
  for (const line of sensorRaw.split("\n")) {
    const parts = line.split("|").map((s) => s.trim());
    if (parts.length < 4) continue;
    const name = parts[0];
    const rawValue = parts[1];
    const unit = parts[2];
    const status = parts[3];

    const numValue = parseFloat(rawValue);
    const value: number | string = isNaN(numValue) ? rawValue : numValue;

    // Parse upper critical threshold
    let upperCritical: number | undefined;
    if (parts[8]) {
      const uc = parseFloat(parts[8]);
      if (!isNaN(uc)) upperCritical = uc;
    }

    sensors.push({ name, value, unit, status, upper_critical: upperCritical });
  }

  // ECC errors from memory-type sensors
  let correctable = 0;
  let uncorrectable = 0;
  for (const sensor of sensors) {
    const name = sensor.name.toLowerCase();
    if (name.includes("correctable") && typeof sensor.value === "number") {
      correctable += sensor.value;
    }
    if (name.includes("uncorrectable") && typeof sensor.value === "number") {
      uncorrectable += sensor.value;
    }
  }

  // SEL entry count
  let selCount = 0;
  const selInfo = await run("ipmitool", ["sel", "info"]);
  if (selInfo) {
    const match = selInfo.match(/Entries\s*:\s*(\d+)/i);
    if (match) selCount = parseInt(match[1], 10);
  }

  return {
    available: true,
    sensors,
    ecc_errors: { correctable, uncorrectable },
    sel_entries_count: selCount,
  };
}
