import { readProcFile, sleep } from "../lib/parse.js";
import { readFileSync } from "fs";
import type { NetworkInfo } from "../lib/types.js";

interface IfaceStats {
  rx_bytes: number; rx_packets: number; rx_errors: number; rx_drops: number;
  tx_bytes: number; tx_packets: number; tx_errors: number; tx_drops: number;
}

function parseNetDev(): Record<string, IfaceStats> {
  const raw = readProcFile("/proc/net/dev") || "";
  const result: Record<string, IfaceStats> = {};
  for (const line of raw.split("\n").slice(2)) {
    const match = line.match(/^\s*(\S+):\s+(.*)/);
    if (!match) continue;
    const name = match[1];
    // Skip virtual interfaces
    if (name === "lo" || name.startsWith("veth") || name.startsWith("docker") || name.startsWith("br-") || name.startsWith("virbr")) continue;
    const parts = match[2].trim().split(/\s+/).map(Number);
    result[name] = {
      rx_bytes: parts[0] || 0, rx_packets: parts[1] || 0, rx_errors: parts[2] || 0, rx_drops: parts[3] || 0,
      tx_bytes: parts[8] || 0, tx_packets: parts[9] || 0, tx_errors: parts[10] || 0, tx_drops: parts[11] || 0,
    };
  }
  return result;
}

function getSpeed(iface: string): number {
  try {
    const speed = readFileSync(`/sys/class/net/${iface}/speed`, "utf-8").trim();
    const val = parseInt(speed, 10);
    return isNaN(val) || val <= 0 ? 0 : val;
  } catch {
    return 0;
  }
}

export async function collectNetwork(): Promise<NetworkInfo[]> {
  const stats1 = parseNetDev();
  await sleep(1000);
  const stats2 = parseNetDev();

  const results: NetworkInfo[] = [];
  for (const [name, s2] of Object.entries(stats2)) {
    const s1 = stats1[name];
    if (!s1) continue;

    results.push({
      interface: name,
      speed_mbps: getSpeed(name),
      rx_bytes_sec: s2.rx_bytes - s1.rx_bytes,
      tx_bytes_sec: s2.tx_bytes - s1.tx_bytes,
      rx_errors: s2.rx_errors,
      tx_errors: s2.tx_errors,
      rx_drops: s2.rx_drops,
      tx_drops: s2.tx_drops,
    });
  }

  return results;
}
