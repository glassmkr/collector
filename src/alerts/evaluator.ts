import { allRules } from "./rules.js";
import type { Snapshot, AlertResult } from "../lib/types.js";
import type { Config } from "../config.js";

export function evaluateAlerts(snapshot: Snapshot, thresholds: Config["thresholds"]): AlertResult[] {
  const results: AlertResult[] = [];
  for (const rule of allRules) {
    try {
      results.push(...rule.evaluate(snapshot, thresholds));
    } catch (err) {
      console.error(`[alerts] Rule ${rule.type} error:`, err);
    }
  }
  return results;
}
