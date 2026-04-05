import { readProcFile } from "../lib/parse.js";
import type { RaidInfo } from "../lib/types.js";

export async function collectRaid(): Promise<RaidInfo[]> {
  const raw = readProcFile("/proc/mdstat");
  if (!raw) return [];

  const results: RaidInfo[] = [];
  const lines = raw.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(md\d+)\s*:\s*(\w+)\s+(\w+)\s+(.*)/);
    if (!match) continue;

    const device = match[1];
    const status = match[2]; // "active" or "inactive"
    const level = match[3]; // "raid1", "raid5", etc.
    const disksPart = match[4];

    // Parse component disks (e.g., "sda1[0] sdb1[1]")
    const disks = (disksPart.match(/\w+\[\d+\]/g) || []).map((d) => d.replace(/\[\d+\]/, ""));

    // Check next line for degraded status (e.g., "[UU_]" means one drive missing)
    const statusLine = lines[i + 1] || "";
    const bracketMatch = statusLine.match(/\[([U_]+)\]/);
    const degraded = bracketMatch ? bracketMatch[1].includes("_") : false;

    const failedDisks: string[] = [];
    if (degraded && bracketMatch) {
      const pattern = bracketMatch[1];
      pattern.split("").forEach((c, idx) => {
        if (c === "_" && disks[idx]) failedDisks.push(disks[idx]);
      });
    }

    results.push({ device, level, status, degraded, disks, failed_disks: failedDisks });
  }

  return results;
}
