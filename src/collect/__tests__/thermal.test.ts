import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectFromHwmon, collectFromThermalZone } from "../thermal.js";

let root: string;

async function writeChip(name: string, files: Record<string, string>) {
  const dir = join(root, name);
  await fs.mkdir(dir, { recursive: true });
  for (const [k, v] of Object.entries(files)) {
    await fs.writeFile(join(dir, k), v);
  }
}

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "thermal-test-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("collectFromHwmon: Intel coretemp", () => {
  it("uses Package id N for cpu_readings, cores for other_readings", async () => {
    await writeChip("hwmon0", {
      name: "coretemp",
      temp1_input: "55000",  // Package id 0
      temp1_label: "Package id 0",
      temp2_input: "53000",  // Core 0
      temp2_label: "Core 0",
      temp3_input: "54000",  // Core 1
      temp3_label: "Core 1",
    });
    await writeChip("hwmon1", {
      name: "coretemp",
      temp1_input: "60000",  // Package id 1 (second socket)
      temp1_label: "Package id 1",
    });
    const result = await collectFromHwmon(root);
    expect(result).not.toBeNull();
    const cpuLabels = result!.cpu.map(r => r.label).sort();
    expect(cpuLabels).toEqual(["coretemp Package id 0", "coretemp Package id 1"]);
    const max = Math.max(...result!.cpu.map(r => r.value_celsius));
    expect(max).toBe(60);
    expect(result!.other.map(r => r.label).sort()).toEqual(["coretemp Core 0", "coretemp Core 1"]);
  });
});

describe("collectFromHwmon: AMD k10temp", () => {
  it("prefers Tdie; Tctl + remaining Tccd go to other_readings", async () => {
    await writeChip("hwmon0", {
      name: "k10temp",
      temp1_input: "65000", temp1_label: "Tctl",
      temp2_input: "62000", temp2_label: "Tdie",
      temp3_input: "60000", temp3_label: "Tccd1",
      temp4_input: "61000", temp4_label: "Tccd2",
    });
    const result = await collectFromHwmon(root);
    expect(result!.cpu).toHaveLength(1);
    expect(result!.cpu[0].label).toBe("k10temp Tdie");
    expect(result!.cpu[0].value_celsius).toBe(62);
    // Tctl now goes to other_readings (visible to operators) rather than
    // being silently dropped. Tccd1/Tccd2 also other.
    expect(result!.other.map(r => r.label).sort()).toEqual([
      "k10temp Tccd1", "k10temp Tccd2", "k10temp Tctl",
    ]);
  });
});

describe("collectFromHwmon: Raspberry Pi", () => {
  it("treats cpu_thermal as a single CPU reading", async () => {
    await writeChip("hwmon0", {
      name: "cpu_thermal",
      temp1_input: "48500",
    });
    const result = await collectFromHwmon(root);
    expect(result!.cpu).toHaveLength(1);
    expect(result!.cpu[0].value_celsius).toBe(48.5);
    expect(result!.cpu[0].source_chip).toBe("cpu_thermal");
    expect(result!.other).toHaveLength(0);
  });
});

describe("collectFromHwmon: VM-like with no CPU sensors", () => {
  it("returns empty cpu, populated other when only acpitz is present", async () => {
    await writeChip("hwmon0", {
      name: "acpitz",
      temp1_input: "40000",
    });
    const result = await collectFromHwmon(root);
    expect(result!.cpu).toHaveLength(0);
    expect(result!.other).toHaveLength(1);
    expect(result!.other[0].source_chip).toBe("acpitz");
  });
});

describe("collectFromHwmon: nvme is filtered out", () => {
  it("does not include nvme readings in either bucket", async () => {
    await writeChip("hwmon0", {
      name: "nvme",
      temp1_input: "45000", temp1_label: "Composite",
    });
    await writeChip("hwmon1", {
      name: "coretemp",
      temp1_input: "50000", temp1_label: "Package id 0",
    });
    const result = await collectFromHwmon(root);
    expect(result!.cpu.map(r => r.source_chip)).toEqual(["coretemp"]);
    expect(result!.other.find(r => r.source_chip === "nvme")).toBeUndefined();
  });
});

describe("collectFromHwmon: threshold files are not read as inputs", () => {
  it("ignores temp*_max, temp*_crit, temp*_max_hyst", async () => {
    await writeChip("hwmon0", {
      name: "coretemp",
      temp1_input: "50000", temp1_label: "Package id 0",
      temp1_max: "80000",
      temp1_crit: "100000",
      temp1_max_hyst: "78000",
    });
    const result = await collectFromHwmon(root);
    expect(result!.cpu).toHaveLength(1);
    expect(result!.cpu[0].value_celsius).toBe(50);
  });
});

describe("collectFromHwmon: missing root", () => {
  it("returns null if /sys/class/hwmon does not exist", async () => {
    const fake = join(root, "does-not-exist");
    const result = await collectFromHwmon(fake);
    expect(result).toBeNull();
  });
});

describe("collectFromHwmon: empty root", () => {
  it("returns empty lists for an existing-but-empty hwmon dir", async () => {
    const result = await collectFromHwmon(root);
    expect(result).not.toBeNull();
    expect(result!.cpu).toHaveLength(0);
    expect(result!.other).toHaveLength(0);
  });
});

describe("collectFromThermalZone: Pi-style fallback", () => {
  it("treats cpu-thermal zone as a CPU reading", async () => {
    const z = join(root, "thermal_zone0");
    await fs.mkdir(z, { recursive: true });
    await fs.writeFile(join(z, "type"), "cpu-thermal\n");
    await fs.writeFile(join(z, "temp"), "47800\n");
    const result = await collectFromThermalZone(root);
    expect(result!.cpu).toHaveLength(1);
    expect(result!.cpu[0].value_celsius).toBe(47.8);
    expect(result!.cpu[0].source).toBe("thermal_zone");
  });

  it("treats unrelated zones as other_readings", async () => {
    const z = join(root, "thermal_zone0");
    await fs.mkdir(z, { recursive: true });
    await fs.writeFile(join(z, "type"), "iwlwifi\n");
    await fs.writeFile(join(z, "temp"), "42000\n");
    const result = await collectFromThermalZone(root);
    expect(result!.cpu).toHaveLength(0);
    expect(result!.other).toHaveLength(1);
  });
});

describe("collectFromHwmon: rejects bogus values", () => {
  it("filters readings outside [-50, 200]°C", async () => {
    await writeChip("hwmon0", {
      name: "coretemp",
      temp1_input: "50000", temp1_label: "Package id 0",
      temp2_input: "999999000", temp2_label: "Package id 1", // bogus
    });
    const result = await collectFromHwmon(root);
    expect(result!.cpu).toHaveLength(1);
    expect(result!.cpu[0].value_celsius).toBe(50);
  });
});

describe("collectFromHwmon: AMD k10temp Tdie fallback (regression for 0.8.0 P1)", () => {
  it("uses Tccd1 when Tdie is missing", async () => {
    await writeChip("hwmon0", {
      name: "k10temp",
      temp1_input: "65000", temp1_label: "Tctl",
      temp2_input: "60000", temp2_label: "Tccd1",
      temp3_input: "62000", temp3_label: "Tccd2",
    });
    const result = await collectFromHwmon(root);
    expect(result!.cpu).toHaveLength(1);
    expect(result!.cpu[0].label).toBe("k10temp Tccd1");
    expect(result!.cpu[0].value_celsius).toBe(60);
    // Remaining Tccd2 + Tctl in other.
    const otherLabels = result!.other.map(r => r.label).sort();
    expect(otherLabels).toEqual(["k10temp Tccd2", "k10temp Tctl"]);
  });

  it("uses Tctl as last resort when only Tctl is exposed", async () => {
    await writeChip("hwmon0", {
      name: "k10temp",
      temp1_input: "70000", temp1_label: "Tctl",
    });
    const result = await collectFromHwmon(root);
    expect(result!.cpu).toHaveLength(1);
    expect(result!.cpu[0].label).toBe("k10temp Tctl");
    expect(result!.cpu[0].value_celsius).toBe(70);
    expect(result!.other).toHaveLength(0);
  });

  it("picks Tccd1 over Tccd2/Tccd3 by sort order", async () => {
    await writeChip("hwmon0", {
      name: "k10temp",
      temp1_input: "61000", temp1_label: "Tccd2",
      temp2_input: "60000", temp2_label: "Tccd1",
      temp3_input: "62000", temp3_label: "Tccd3",
    });
    const result = await collectFromHwmon(root);
    expect(result!.cpu).toHaveLength(1);
    expect(result!.cpu[0].label).toBe("k10temp Tccd1");
  });

  it("zenpower with only Tccd: still produces a CPU reading", async () => {
    await writeChip("hwmon0", {
      name: "zenpower",
      temp1_input: "55000", temp1_label: "Tccd1",
    });
    const result = await collectFromHwmon(root);
    expect(result!.cpu).toHaveLength(1);
    expect(result!.cpu[0].source_chip).toBe("zenpower");
  });

  it("anonymous AMD reading (no label files) is taken", async () => {
    await writeChip("hwmon0", {
      name: "k10temp",
      temp1_input: "55000",
    });
    const result = await collectFromHwmon(root);
    expect(result!.cpu).toHaveLength(1);
    expect(result!.cpu[0].label).toBe("k10temp temp1");
  });
});
