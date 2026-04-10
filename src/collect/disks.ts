import { run } from "../lib/exec.js";
import { readProcFile } from "../lib/parse.js";
import type { DiskInfo } from "../lib/types.js";

interface MountInfo {
  device: string;
  mount: string;
  fstype: string;
  options: string;
}

function parseMounts(): MountInfo[] {
  const raw = readProcFile("/proc/mounts") || "";
  const result: MountInfo[] = [];
  for (const line of raw.split("\n")) {
    const parts = line.split(" ");
    if (parts.length < 4) continue;
    result.push({
      device: parts[0],
      mount: parts[1],
      fstype: parts[2],
      options: parts[3],
    });
  }
  return result;
}

export async function collectDisks(): Promise<DiskInfo[]> {
  const dfOutput = await run("df", ["-B1", "--output=source,target,size,used,avail,pcent", "-x", "tmpfs", "-x", "devtmpfs", "-x", "squashfs"]);
  if (!dfOutput) return [];

  // Get inode data (df -i without --output, parse standard columns)
  const dfInodeOutput = await run("df", ["-i", "-x", "tmpfs", "-x", "devtmpfs", "-x", "squashfs"]);
  const inodeMap = new Map<string, { total: number; used: number; free: number }>();
  if (dfInodeOutput) {
    // Standard df -i output: Filesystem Inodes IUsed IFree IUse% Mounted_on
    for (const line of dfInodeOutput.trim().split("\n").slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) continue;
      const mountPoint = parts[5];
      inodeMap.set(mountPoint, {
        total: parseInt(parts[1]) || 0,
        used: parseInt(parts[2]) || 0,
        free: parseInt(parts[3]) || 0,
      });
    }
  }

  // Get mount options and fstype from /proc/mounts
  const mounts = parseMounts();
  const mountMap = new Map<string, MountInfo>();
  for (const m of mounts) {
    mountMap.set(m.mount, m);
  }

  const lines = dfOutput.trim().split("\n").slice(1);
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

    if (!device.startsWith("/dev/")) continue;

    const mountInfo = mountMap.get(mount);
    const inodes = inodeMap.get(mount);

    disks.push({
      device,
      mount,
      total_gb: Math.round((totalBytes / 1073741824) * 100) / 100,
      used_gb: Math.round((usedBytes / 1073741824) * 100) / 100,
      available_gb: Math.round((availBytes / 1073741824) * 100) / 100,
      percent_used: percent,
      fstype: mountInfo?.fstype,
      options: mountInfo?.options,
      inodes_total: inodes?.total,
      inodes_used: inodes?.used,
      inodes_free: inodes?.free,
    });
  }

  return disks;
}
