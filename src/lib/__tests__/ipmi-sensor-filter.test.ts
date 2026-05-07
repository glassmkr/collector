import { describe, it, expect } from "vitest";
import { filterRedundantCpuDtsSensors } from "../ipmi-sensor-filter.js";

const s = (name: string) => ({ name });

describe("filterRedundantCpuDtsSensors", () => {
  it("Gigabyte AMD: drops CPU0_DTS when CPU0_TEMP is present", () => {
    const out = filterRedundantCpuDtsSensors([s("CPU0_TEMP"), s("CPU0_DTS"), s("DIMMG0_TEMP")]);
    expect(out.map((x) => x.name)).toEqual(["CPU0_TEMP", "DIMMG0_TEMP"]);
  });

  it("dual-socket EPYC: drops both DTS sensors when both _TEMP are present", () => {
    const out = filterRedundantCpuDtsSensors([
      s("CPU0_TEMP"),
      s("CPU1_TEMP"),
      s("CPU0_DTS"),
      s("CPU1_DTS"),
      s("System Temp"),
    ]);
    expect(out.map((x) => x.name)).toEqual(["CPU0_TEMP", "CPU1_TEMP", "System Temp"]);
  });

  it("keeps DTS as fallback when no _TEMP sensor exists for that socket", () => {
    const out = filterRedundantCpuDtsSensors([s("CPU0_DTS"), s("System Temp")]);
    expect(out.map((x) => x.name)).toEqual(["CPU0_DTS", "System Temp"]);
  });

  it("mixed: keeps CPU1_DTS when only CPU0_TEMP/CPU0_DTS pair has a sibling", () => {
    const out = filterRedundantCpuDtsSensors([
      s("CPU0_TEMP"),
      s("CPU0_DTS"),
      s("CPU1_DTS"),
    ]);
    expect(out.map((x) => x.name)).toEqual(["CPU0_TEMP", "CPU1_DTS"]);
  });

  it("Dell-style single 'CPU Temp' sensor passes through unchanged", () => {
    const out = filterRedundantCpuDtsSensors([s("CPU Temp"), s("PS1 Status")]);
    expect(out.map((x) => x.name)).toEqual(["CPU Temp", "PS1 Status"]);
  });

  it("Supermicro 'CPU1 Temp' (space-form) passes through unchanged", () => {
    const out = filterRedundantCpuDtsSensors([s("CPU1 Temp"), s("CPU2 Temp")]);
    expect(out.map((x) => x.name)).toEqual(["CPU1 Temp", "CPU2 Temp"]);
  });

  it("Supermicro 'CPU1 Temp' (space-form) drops 'CPU1_DTS' on the same socket", () => {
    // Hypothetical: a board exposing both space-form _TEMP and underscore-form _DTS.
    // The socket prefix matches via either of the two patterns we recognise.
    const out = filterRedundantCpuDtsSensors([s("CPU1 Temp"), s("CPU1_DTS")]);
    expect(out.map((x) => x.name)).toEqual(["CPU1 Temp"]);
  });

  it("preserves non-CPU sensors unchanged (DIMM, PSU, fan)", () => {
    const out = filterRedundantCpuDtsSensors([
      s("CPU0_TEMP"),
      s("CPU0_DTS"),
      s("DIMMG0_TEMP"),
      s("PSU1 Status"),
      s("FAN1"),
    ]);
    expect(out.map((x) => x.name)).toEqual(["CPU0_TEMP", "DIMMG0_TEMP", "PSU1 Status", "FAN1"]);
  });

  it("empty input returns empty array", () => {
    expect(filterRedundantCpuDtsSensors([])).toEqual([]);
  });

  it("input with no DTS sensors is a pass-through", () => {
    const input = [s("CPU0_TEMP"), s("CPU1_TEMP"), s("System Temp")];
    expect(filterRedundantCpuDtsSensors(input).map((x) => x.name)).toEqual(input.map((x) => x.name));
  });

  it("does not match non-CPU DTS-shaped names (e.g. random vendor sensors)", () => {
    // Defensive: only `^CPU\d+_DTS$` is filtered. A sensor like `BOARD_DTS`
    // or `CPU_DTS` (no socket index) is preserved.
    const out = filterRedundantCpuDtsSensors([s("CPU_DTS"), s("BOARD_DTS"), s("CPU0_TEMP")]);
    expect(out.map((x) => x.name)).toEqual(["CPU_DTS", "BOARD_DTS", "CPU0_TEMP"]);
  });

  it("preserves stable order of kept sensors", () => {
    const out = filterRedundantCpuDtsSensors([
      s("System Temp"),
      s("CPU0_DTS"),
      s("CPU1_TEMP"),
      s("CPU0_TEMP"),
      s("CPU1_DTS"),
      s("PSU1 Status"),
    ]);
    expect(out.map((x) => x.name)).toEqual([
      "System Temp",
      "CPU1_TEMP",
      "CPU0_TEMP",
      "PSU1 Status",
    ]);
  });
});
