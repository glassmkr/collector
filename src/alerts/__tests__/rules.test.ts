import { describe, it, expect } from "vitest";
import { allRules } from "../rules.js";
import type { Snapshot } from "../../lib/types.js";

const baseThresholds = {
  ram_percent: 90,
  swap_alert: true,
  disk_percent: 85,
  iowait_percent: 20,
  nvme_wear_percent: 85,
  disk_latency_nvme_ms: 50,
  disk_latency_hdd_ms: 200,
  cpu_temp_warning_c: 80,
  cpu_temp_critical_c: 90,
  interface_utilization_percent: 90,
};

function emptySnap(): Snapshot {
  return {
    collector_version: "test",
    timestamp: "2026-01-01T00:00:00Z",
    system: { hostname: "h", ip: "1.2.3.4", os: "linux", kernel: "6.0", uptime_seconds: 1000 },
    cpu: { user_percent: 0, system_percent: 0, iowait_percent: 0, idle_percent: 100, load_1m: 0, load_5m: 0, load_15m: 0 },
    memory: { total_mb: 16384, used_mb: 1000, available_mb: 15000, swap_total_mb: 0, swap_used_mb: 0 },
    disks: [],
    smart: [],
    network: [],
    raid: [],
    ipmi: { available: false, sensors: [], ecc_errors: { correctable: 0, uncorrectable: 0 }, sel_entries_count: 0, sel_events_recent: [], fans: [] },
    os_alerts: { oom_kills_recent: 0, zombie_processes: 0, time_drift_ms: 0 },
  };
}

const diskLatencyRule = allRules.find(r => r.type === "disk_latency_high")!;

describe("disk_latency_high", () => {
  it("does not fire when io_latency is missing", () => {
    const snap = emptySnap();
    expect(diskLatencyRule.evaluate(snap, baseThresholds)).toEqual([]);
  });

  it("does not fire when io_latency is empty", () => {
    const snap = emptySnap();
    snap.io_latency = [];
    expect(diskLatencyRule.evaluate(snap, baseThresholds)).toEqual([]);
  });

  it("does not fire on healthy NVMe (1ms)", () => {
    const snap = emptySnap();
    snap.io_latency = [
      { device: "nvme0n1", avg_read_latency_ms: 1, avg_write_latency_ms: 0.5, read_iops: 100, write_iops: 50 },
    ];
    expect(diskLatencyRule.evaluate(snap, baseThresholds)).toEqual([]);
  });

  it("fires on hot NVMe (60ms read on default 50ms threshold)", () => {
    const snap = emptySnap();
    snap.io_latency = [
      { device: "nvme0n1", avg_read_latency_ms: 60, avg_write_latency_ms: 1, read_iops: 100, write_iops: 50 },
    ];
    const out = diskLatencyRule.evaluate(snap, baseThresholds);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("warning");
    expect(out[0].evidence.device).toBe("nvme0n1");
    expect(out[0].evidence.threshold_ms).toBe(50);
  });

  it("fires on hot SATA HDD (250ms write on default 200ms threshold)", () => {
    const snap = emptySnap();
    snap.io_latency = [
      { device: "sda", avg_read_latency_ms: 10, avg_write_latency_ms: 250, read_iops: 5, write_iops: 20 },
    ];
    const out = diskLatencyRule.evaluate(snap, baseThresholds);
    expect(out).toHaveLength(1);
    expect(out[0].evidence.device).toBe("sda");
    expect(out[0].evidence.threshold_ms).toBe(200);
  });

  it("does not fire on borderline-cold SATA (180ms vs 200ms threshold)", () => {
    const snap = emptySnap();
    snap.io_latency = [
      { device: "sda", avg_read_latency_ms: 180, avg_write_latency_ms: 50, read_iops: 5, write_iops: 5 },
    ];
    expect(diskLatencyRule.evaluate(snap, baseThresholds)).toEqual([]);
  });

  it("fires once per hot device when multiple devices present", () => {
    const snap = emptySnap();
    snap.io_latency = [
      { device: "nvme0n1", avg_read_latency_ms: 1, avg_write_latency_ms: 1, read_iops: 100, write_iops: 50 }, // healthy
      { device: "sda", avg_read_latency_ms: 300, avg_write_latency_ms: 10, read_iops: 5, write_iops: 5 }, // hot HDD
      { device: "nvme1n1", avg_read_latency_ms: 80, avg_write_latency_ms: 0.5, read_iops: 100, write_iops: 50 }, // hot NVMe
    ];
    const out = diskLatencyRule.evaluate(snap, baseThresholds);
    expect(out).toHaveLength(2);
    expect(out.map(a => a.evidence.device).sort()).toEqual(["nvme1n1", "sda"]);
  });

  it("skips devices with zero IOPS over the interval (no samples)", () => {
    const snap = emptySnap();
    snap.io_latency = [
      { device: "sda", avg_read_latency_ms: null, avg_write_latency_ms: null, read_iops: 0, write_iops: 0 },
    ];
    expect(diskLatencyRule.evaluate(snap, baseThresholds)).toEqual([]);
  });
});
