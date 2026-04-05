import { run } from "../lib/exec.js";
import type { DiskInfo } from "../lib/types.js";

export async function collectDisks(): Promise<DiskInfo[]> {
  const dfOutput = await run("df", ["-B1", "--output=source,target,size,used,avail,pcent", "-x", "tmpfs", "-x", "devtmpfs", "-x", "squashfs"]);
  if (!dfOutput) return [];

  const lines = dfOutput.trim().split("\n").slice(1); // skip header
  const disks: DiskInfo[] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const device = parts[0];
    const mount = parts[1];
    const totalBytes = parseInt(parts[2]) || 0;
    const usedBytes = parseInt(parts[3]) || 0;
    const availBytes = parseInt(parts[4]) || 0;
    const pctStr = parts[5].replace("%", "");
    const percent = parseInt(pctStr) || 0;

    // Skip pseudo-filesystems
    if (!device.startsWith("/dev/")) continue;

    disks.push({
      device,
      mount,
      total_gb: Math.round((totalBytes / 1073741824) * 100) / 100,
      used_gb: Math.round((usedBytes / 1073741824) * 100) / 100,
      available_gb: Math.round((availBytes / 1073741824) * 100) / 100,
      percent_used: percent,
    });
  }

  return disks;
}
