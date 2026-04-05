import { readProcFile, sleep } from "../lib/parse.js";
import type { CpuInfo } from "../lib/types.js";

interface CpuStat {
  user: number; nice: number; system: number; idle: number;
  iowait: number; irq: number; softirq: number; steal: number;
}

function parseProcStat(): CpuStat {
  const raw = readProcFile("/proc/stat") || "";
  const line = raw.split("\n").find((l) => l.startsWith("cpu "));
  if (!line) return { user: 0, nice: 0, system: 0, idle: 0, iowait: 0, irq: 0, softirq: 0, steal: 0 };
  const parts = line.split(/\s+/).slice(1).map(Number);
  return {
    user: parts[0] || 0, nice: parts[1] || 0, system: parts[2] || 0, idle: parts[3] || 0,
    iowait: parts[4] || 0, irq: parts[5] || 0, softirq: parts[6] || 0, steal: parts[7] || 0,
  };
}

export async function collectCpu(): Promise<CpuInfo> {
  const stat1 = parseProcStat();
  await sleep(1000);
  const stat2 = parseProcStat();

  const d = {
    user: stat2.user - stat1.user, nice: stat2.nice - stat1.nice,
    system: stat2.system - stat1.system, idle: stat2.idle - stat1.idle,
    iowait: stat2.iowait - stat1.iowait, irq: stat2.irq - stat1.irq,
    softirq: stat2.softirq - stat1.softirq, steal: stat2.steal - stat1.steal,
  };
  const total = Object.values(d).reduce((a, b) => a + b, 0) || 1;

  const loadavg = (readProcFile("/proc/loadavg") || "0 0 0").trim().split(" ");

  return {
    user_percent: Math.round((d.user / total) * 10000) / 100,
    system_percent: Math.round((d.system / total) * 10000) / 100,
    iowait_percent: Math.round((d.iowait / total) * 10000) / 100,
    idle_percent: Math.round((d.idle / total) * 10000) / 100,
    load_1m: parseFloat(loadavg[0]) || 0,
    load_5m: parseFloat(loadavg[1]) || 0,
    load_15m: parseFloat(loadavg[2]) || 0,
  };
}
