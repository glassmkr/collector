// Side-effect-free public API for tooling consumers (Glassmkr drift
// validator, future SDKs). The default entry point (`dist/index.js`)
// is the CLI and runs the collector on import; this module exists so
// downstream packages can read public metadata without spinning up
// the agent.

export { ALL_RULE_IDS } from "./alerts/rules.js";
export type { Snapshot, AlertResult, IpmiInfo, IpmiCapability, DmiInfo, ThermalInfo, Vendor } from "./lib/types.js";
