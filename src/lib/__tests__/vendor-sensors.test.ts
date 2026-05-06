import { describe, it, expect } from "vitest";
import { isPsuSensor, isPsuRedundancySensor, classifyPsuRedundancyState } from "../vendor-sensors.js";

describe("isPsuSensor", () => {
  it("matches generic Supermicro/HPE patterns regardless of vendor", () => {
    expect(isPsuSensor("PSU1 Status", "supermicro")).toBe(true);
    expect(isPsuSensor("PSU1 Status", "dell")).toBe(true);
    expect(isPsuSensor("Power Supply 1", "hpe")).toBe(true);
    expect(isPsuSensor("Power Supply 1", "generic")).toBe(true);
  });
  it("matches Dell PS<N> pattern only when vendor is dell", () => {
    expect(isPsuSensor("PS1 Status", "dell")).toBe(true);
    expect(isPsuSensor("PS2 Status", "dell")).toBe(true);
    expect(isPsuSensor("PS1 Status", "supermicro")).toBe(false);
    expect(isPsuSensor("PS1 Status", "generic")).toBe(false);
  });
  it("does not match PS Redundancy as an individual PSU sensor", () => {
    expect(isPsuSensor("PS Redundancy", "dell")).toBe(false);
  });
  it("rejects unrelated sensors", () => {
    expect(isPsuSensor("CPU1 Temp", "dell")).toBe(false);
    expect(isPsuSensor("Some Random Sensor", "supermicro")).toBe(false);
  });
});

describe("isPsuRedundancySensor", () => {
  it("matches Dell PS Redundancy", () => {
    expect(isPsuRedundancySensor("PS Redundancy", "dell")).toBe(true);
  });
  it("does not match on other vendors", () => {
    expect(isPsuRedundancySensor("PS Redundancy", "supermicro")).toBe(false);
    expect(isPsuRedundancySensor("PS Redundancy", "generic")).toBe(false);
  });
  it("does not match individual PSU sensors", () => {
    expect(isPsuRedundancySensor("PS1 Status", "dell")).toBe(false);
  });
});

describe("classifyPsuRedundancyState", () => {
  it("recognises fully redundant", () => {
    expect(classifyPsuRedundancyState("Fully Redundant")).toBe("fully_redundant");
    expect(classifyPsuRedundancyState("ok")).toBe("fully_redundant");
  });
  it("recognises lost / degraded", () => {
    expect(classifyPsuRedundancyState("Redundancy Lost")).toBe("redundancy_lost");
    expect(classifyPsuRedundancyState("Redundancy Degraded")).toBe("redundancy_degraded");
  });
  it("returns unknown for unrecognised text", () => {
    expect(classifyPsuRedundancyState("0x42")).toBe("unknown");
  });
});
