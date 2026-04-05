// Alert rules for the collector are identical to the Forge evaluator.
// Re-export from a shared definition to avoid duplication.
// For the collector, we use the same 15 rules but with local thresholds from config.

import type { Snapshot, AlertResult } from "../lib/types.js";
import type { Config } from "../config.js";

export interface AlertRule {
  type: string;
  evaluate(snap: Snapshot, thresholds: Config["thresholds"]): AlertResult[];
}

export const allRules: AlertRule[] = [
  // 1. RAM high
  { type: "ram_high", evaluate(snap, t) {
    if (!snap.memory?.total_mb) return [];
    const pct = (snap.memory.used_mb / snap.memory.total_mb) * 100;
    if (pct < (t.ram_percent ?? 90)) return [];
    return [{ type: "ram_high", severity: pct >= 95 ? "critical" : "warning",
      title: `RAM usage at ${pct.toFixed(1)}%`,
      message: `Using ${snap.memory.used_mb}MB of ${snap.memory.total_mb}MB. ${snap.memory.available_mb}MB available.`,
      evidence: { used_mb: snap.memory.used_mb, total_mb: snap.memory.total_mb, percent: Math.round(pct * 10) / 10 },
      recommendation: "Check: ps aux --sort=-rss | head -20" }];
  }},
  // 2. Swap active
  { type: "swap_active", evaluate(snap, t) {
    if (t.swap_alert === false || !snap.memory || snap.memory.swap_used_mb <= 0) return [];
    return [{ type: "swap_active", severity: "warning", title: `Swap in use: ${snap.memory.swap_used_mb}MB`,
      message: "Server is using swap space, indicating memory pressure.",
      evidence: { swap_used_mb: snap.memory.swap_used_mb },
      recommendation: "Check: free -h && ps aux --sort=-rss | head -20" }];
  }},
  // 3. Disk space high
  { type: "disk_space_high", evaluate(snap, t) {
    if (!snap.disks) return [];
    const threshold = t.disk_percent ?? 85;
    return snap.disks.filter(d => d.percent_used >= threshold).map(d => ({
      type: "disk_space_high", severity: d.percent_used >= 95 ? "critical" as const : "warning" as const,
      title: `Disk ${d.mount} at ${d.percent_used}%`,
      message: `${d.device}: ${d.used_gb}GB of ${d.total_gb}GB used. ${d.available_gb}GB available.`,
      evidence: { device: d.device, mount: d.mount, percent_used: d.percent_used },
      recommendation: "Check: du -sh /* | sort -rh | head -20" }));
  }},
  // 4. CPU iowait
  { type: "cpu_iowait_high", evaluate(snap, t) {
    if (!snap.cpu || snap.cpu.iowait_percent < (t.iowait_percent ?? 20)) return [];
    return [{ type: "cpu_iowait_high", severity: "warning", title: `CPU iowait at ${snap.cpu.iowait_percent.toFixed(1)}%`,
      message: `High I/O wait: CPU spending ${snap.cpu.iowait_percent.toFixed(1)}% waiting for disk.`,
      evidence: { iowait_percent: snap.cpu.iowait_percent },
      recommendation: "Check: iotop -oP or iostat -x 1 5" }];
  }},
  // 5. OOM kills
  { type: "oom_kills", evaluate(snap) {
    if (!snap.os_alerts || snap.os_alerts.oom_kills_recent <= 0) return [];
    return [{ type: "oom_kills", severity: "critical", title: `${snap.os_alerts.oom_kills_recent} OOM kill(s)`,
      message: `Kernel OOM killer terminated ${snap.os_alerts.oom_kills_recent} process(es).`,
      evidence: { oom_kills_recent: snap.os_alerts.oom_kills_recent },
      recommendation: "Check: dmesg | grep -i 'out of memory'" }];
  }},
  // 6. SMART failing
  { type: "smart_failing", evaluate(snap) {
    if (!snap.smart) return [];
    return snap.smart.filter(d => d.health !== "PASSED" || (d.reallocated_sectors && d.reallocated_sectors > 0) || (d.pending_sectors && d.pending_sectors > 0))
      .map(d => ({ type: "smart_failing", severity: "critical" as const,
        title: `SMART failure: ${d.device}`, message: `${d.model}: drive showing signs of failure.`,
        evidence: { device: d.device, health: d.health, reallocated_sectors: d.reallocated_sectors, pending_sectors: d.pending_sectors },
        recommendation: `Back up data. Schedule replacement for ${d.device}.` }));
  }},
  // 7. NVMe wear
  { type: "nvme_wear_high", evaluate(snap, t) {
    if (!snap.smart) return [];
    const threshold = t.nvme_wear_percent ?? 85;
    return snap.smart.filter(d => d.percentage_used != null && d.percentage_used >= threshold)
      .map(d => ({ type: "nvme_wear_high", severity: d.percentage_used! >= 95 ? "critical" as const : "warning" as const,
        title: `NVMe ${d.device} wear at ${d.percentage_used}%`, message: `${d.model} at ${d.percentage_used}% lifetime wear.`,
        evidence: { device: d.device, percentage_used: d.percentage_used },
        recommendation: "Plan drive replacement." }));
  }},
  // 8. RAID degraded
  { type: "raid_degraded", evaluate(snap) {
    if (!snap.raid) return [];
    return snap.raid.filter(r => r.degraded || r.failed_disks.length > 0)
      .map(r => ({ type: "raid_degraded", severity: "critical" as const,
        title: `RAID ${r.device} degraded`, message: `${r.device} (${r.level}) degraded. Failed: ${r.failed_disks.join(", ") || "unknown"}.`,
        evidence: { device: r.device, failed_disks: r.failed_disks },
        recommendation: "Replace failed drive immediately." }));
  }},
  // 9. Disk latency
  { type: "disk_latency_high", evaluate(snap, t) {
    if (!snap.disks) return [];
    return snap.disks.filter(d => {
      if (d.latency_p99_ms == null) return false;
      const thresh = d.device.includes("nvme") ? (t.disk_latency_nvme_ms ?? 50) : (t.disk_latency_hdd_ms ?? 200);
      return d.latency_p99_ms >= thresh;
    }).map(d => ({ type: "disk_latency_high", severity: "warning" as const,
      title: `Disk ${d.device} latency ${d.latency_p99_ms!.toFixed(1)}ms`,
      message: `p99 I/O latency on ${d.device} is high.`,
      evidence: { device: d.device, latency_p99_ms: d.latency_p99_ms },
      recommendation: "Check: iotop -oP" }));
  }},
  // 10. Interface errors
  { type: "interface_errors", evaluate(snap) {
    if (!snap.network) return [];
    return snap.network.filter(i => (i.rx_errors + i.tx_errors + i.rx_drops + i.tx_drops) > 0)
      .map(i => ({ type: "interface_errors", severity: "warning" as const,
        title: `${i.interface}: errors/drops detected`,
        message: `RX errors=${i.rx_errors}, TX errors=${i.tx_errors}, RX drops=${i.rx_drops}, TX drops=${i.tx_drops}.`,
        evidence: { interface: i.interface, rx_errors: i.rx_errors, tx_errors: i.tx_errors, rx_drops: i.rx_drops, tx_drops: i.tx_drops },
        recommendation: "Check cables and SFP/transceiver." }));
  }},
  // 11. Link speed mismatch
  { type: "link_speed_mismatch", evaluate(snap) {
    if (!snap.network) return [];
    return snap.network.filter(i => i.speed_mbps > 0 && i.speed_mbps < 1000)
      .map(i => ({ type: "link_speed_mismatch", severity: "warning" as const,
        title: `${i.interface} at ${i.speed_mbps} Mbps`,
        message: `Interface negotiated below 1 Gbps.`,
        evidence: { interface: i.interface, speed_mbps: i.speed_mbps },
        recommendation: "Check cable, SFP, switch port config." }));
  }},
  // 12. Interface saturation
  { type: "interface_saturation", evaluate(snap, t) {
    if (!snap.network) return [];
    const threshold = (t.interface_utilization_percent ?? 90) / 100;
    return snap.network.filter(i => {
      if (!i.speed_mbps) return false;
      const maxBps = (i.speed_mbps * 1_000_000) / 8;
      return Math.max(i.rx_bytes_sec, i.tx_bytes_sec) / maxBps >= threshold;
    }).map(i => {
      const maxBps = (i.speed_mbps * 1_000_000) / 8;
      const util = Math.max(i.rx_bytes_sec, i.tx_bytes_sec) / maxBps * 100;
      return { type: "interface_saturation", severity: "warning" as const,
        title: `${i.interface} at ${util.toFixed(0)}% utilization`,
        message: `Interface ${i.interface} (${i.speed_mbps} Mbps) near saturation.`,
        evidence: { interface: i.interface, utilization_percent: Math.round(util * 10) / 10 },
        recommendation: "Check: iftop or nload" };
    });
  }},
  // 13. CPU temperature
  { type: "cpu_temperature_high", evaluate(snap, t) {
    if (!snap.ipmi?.available || !snap.ipmi.sensors) return [];
    const warn = t.cpu_temp_warning_c ?? 80;
    return snap.ipmi.sensors.filter(s => {
      const n = s.name.toLowerCase();
      if (!n.includes("cpu") && !n.includes("temp")) return false;
      const v = typeof s.value === "number" ? s.value : parseFloat(String(s.value));
      return !isNaN(v) && v >= warn;
    }).map(s => {
      const v = typeof s.value === "number" ? s.value : parseFloat(String(s.value));
      const crit = s.upper_critical ?? (t.cpu_temp_critical_c ?? 90);
      return { type: "cpu_temperature_high", severity: v >= crit ? "critical" as const : "warning" as const,
        title: `${s.name}: ${v}${s.unit}`, message: `Temperature above warning threshold.`,
        evidence: { sensor: s.name, value: v },
        recommendation: "Check cooling, fans, airflow." };
    });
  }},
  // 14. ECC errors
  { type: "ecc_errors", evaluate(snap) {
    if (!snap.ipmi?.ecc_errors) return [];
    const { correctable, uncorrectable } = snap.ipmi.ecc_errors;
    if (correctable <= 0 && uncorrectable <= 0) return [];
    if (uncorrectable > 0) return [{ type: "ecc_errors", severity: "critical",
      title: `${uncorrectable} uncorrectable ECC error(s)`, message: "Data corruption possible. DIMM failing.",
      evidence: { correctable, uncorrectable },
      recommendation: "Replace DIMM immediately. Run: ipmitool sdr type Memory" }];
    return [{ type: "ecc_errors", severity: "warning",
      title: `${correctable} correctable ECC error(s)`, message: "Early warning of DIMM failure.",
      evidence: { correctable, uncorrectable },
      recommendation: "Schedule DIMM replacement. Run: ipmitool sdr type Memory" }];
  }},
  // 15. PSU redundancy
  { type: "psu_redundancy_loss", evaluate(snap) {
    if (!snap.ipmi?.available || !snap.ipmi.sensors) return [];
    const psus = snap.ipmi.sensors.filter(s => { const n = s.name.toLowerCase(); return n.includes("psu") || n.includes("power supply"); });
    if (psus.length < 2) return [];
    const failed = psus.filter(s => { const st = String(s.status).toLowerCase(); const v = String(s.value).toLowerCase();
      return st.includes("fail") || st.includes("absent") || v.includes("fail") || v.includes("absent"); });
    if (failed.length === 0) return [];
    return [{ type: "psu_redundancy_loss", severity: "critical",
      title: "PSU redundancy lost", message: `${failed.length} PSU(s) failed/absent: ${failed.map(p => p.name).join(", ")}.`,
      evidence: { failed: failed.map(p => ({ name: p.name, status: p.status })) },
      recommendation: "Replace failed PSU. Check power connections." }];
  }},
];
