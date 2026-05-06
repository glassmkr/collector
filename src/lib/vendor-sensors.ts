// Vendor-aware classifiers for IPMI sensor names.
//
// The substring filters in alert rules historically assumed Supermicro /
// ASRockRack naming conventions (`PSU1 Status`, `CPU1 Temp`, etc.). Dell
// iDRAC names sensors very differently: `PS1 Status`, `PS Redundancy`,
// bare `Temp` per processor entity. HPE iLO is closer to Supermicro's
// shape but has its own quirks. Adding a new vendor means adding a case
// here, not editing every rule.

import type { Vendor } from "./types.js";

/**
 * True if `name` looks like an individual PSU sensor (status / wattage / etc.)
 * for the given vendor.
 *
 * Generic patterns cover Supermicro, HPE iLO, ASRockRack:
 *   "PSU1 Status", "Power Supply 1", "PSU2 Power Out"
 *
 * Dell iDRAC adds:
 *   "PS1 Status", "PS2 Status", "PS3 Status"
 *
 * Note that "PS Redundancy" is NOT an individual PSU sensor; see
 * `isPsuRedundancySensor`.
 */
export function isPsuSensor(name: string, vendor: Vendor): boolean {
  const lower = name.toLowerCase();
  if (lower.includes("psu") || lower.includes("power supply")) return true;
  if (vendor === "dell") {
    // PS1, PS2 ... optionally followed by " Status" or other suffix.
    // Excludes "PS Redundancy" and similar non-numeric.
    if (/^ps\d+\b/i.test(name)) return true;
  }
  return false;
}

/**
 * True if `name` is the aggregate PSU redundancy state sensor.
 * Currently only Dell exposes this as a discrete sensor reading;
 * HPE/Supermicro report it via SEL events instead.
 */
export function isPsuRedundancySensor(name: string, vendor: Vendor): boolean {
  if (vendor === "dell") {
    return /^ps\s+redundancy$/i.test(name);
  }
  return false;
}

/**
 * Map the value/status text of a Dell `PS Redundancy` sensor to a canonical
 * state. Dell reports strings like "Fully Redundant", "Redundancy Lost",
 * "Redundancy Degraded", or "0x01"-style raw codes depending on iDRAC firmware.
 */
export function classifyPsuRedundancyState(valueOrStatus: string): "fully_redundant" | "redundancy_lost" | "redundancy_degraded" | "unknown" {
  const lower = valueOrStatus.toLowerCase();
  if (lower.includes("fully redundant") || lower.includes("fully-redundant")) return "fully_redundant";
  if (lower.includes("lost")) return "redundancy_lost";
  if (lower.includes("degraded")) return "redundancy_degraded";
  // Some iDRAC firmwares report "ok" + numeric value 1 = fully redundant
  if (lower === "ok") return "fully_redundant";
  return "unknown";
}
