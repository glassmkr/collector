import { readProcFile, sleep } from "../lib/parse.js";
import type { CpuInfo, CpuCoreInfo } from "../lib/types.js";

interface CpuStat {
  user: number; nice: number; system: number; idle: number;
  iowait: number; irq: number; softirq: number; steal: number;
}

function parseLine(line: string): CpuStat {
  const parts = line.split(/\s+/).slice(1).map(Number);
  return {
    user: parts[0] || 0, nice: parts[1] || 0, system: parts[2] || 0, idle: parts[3] || 0,
    iowait: parts[4] || 0, irq: parts[5] || 0, softirq: parts[6] || 0, steal: parts[7] || 0,
  };
}

function parseProcStat(): { aggregate: CpuStat; cores: CpuStat[] } {
  const raw = readProcFile("/proc/stat") || "";
  const lines = raw.split("\n");
  const aggLine = lines.find((l) => l.startsWith("cpu "));
  const aggregate = aggLine ? parseLine(aggLine) : { user: 0, nice: 0, system: 0, idle: 0, iowait: 0, irq: 0, softirq: 0, steal: 0 };

  const cores: CpuStat[] = [];
  for (const line of lines) {
    if (/^cpu\d+\s/.test(line)) {
      cores.push(parseLine(line));
    }
  }

  return { aggregate, cores };
}

function calcPercents(d: CpuStat): { user: number; system: number; iowait: number; idle: number; irq: number; softirq: number } {
  const total = Object.values(d).reduce((a, b) => a + b, 0) || 1;
  const r = (v: number) => Math.round((v / total) * 10000) / 100;
  return {
    user: r(d.user + d.nice),
    system: r(d.system),
    iowait: r(d.iowait),
    idle: r(d.idle),
    irq: r(d.irq),
    softirq: r(d.softirq),
  };
}

function delta(a: CpuStat, b: CpuStat): CpuStat {
  return {
    user: b.user - a.user, nice: b.nice - a.nice,
    system: b.system - a.system, idle: b.idle - a.idle,
    iowait: b.iowait - a.iowait, irq: b.irq - a.irq,
    softirq: b.softirq - a.softirq, steal: b.steal - a.steal,
  };
}

export async function collectCpu(): Promise<CpuInfo> {
  const stat1 = parseProcStat();
  await sleep(1000);
  const stat2 = parseProcStat();

  const aggDelta = delta(stat1.aggregate, stat2.aggregate);
  const agg = calcPercents(aggDelta);

  const loadavg = (readProcFile("/proc/loadavg") || "0 0 0").trim().split(" ");

  // Per-core stats
  const cores: CpuCoreInfo[] = [];
  const coreCount = Math.min(stat1.cores.length, stat2.cores.length);
  for (let i = 0; i < coreCount; i++) {
    const d = delta(stat1.cores[i], stat2.cores[i]);
    const p = calcPercents(d);
    cores.push({
      core: i,
      user_percent: p.user,
      system_percent: p.system,
      iowait_percent: p.iowait,
      idle_percent: p.idle,
      irq_percent: p.irq,
      softirq_percent: p.softirq,
    });
  }

  return {
    user_percent: agg.user,
    system_percent: agg.system,
    iowait_percent: agg.iowait,
    idle_percent: agg.idle,
    load_1m: parseFloat(loadavg[0]) || 0,
    load_5m: parseFloat(loadavg[1]) || 0,
    load_15m: parseFloat(loadavg[2]) || 0,
    cores,
  };
}
