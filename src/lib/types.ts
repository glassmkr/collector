export interface Snapshot {
  collector_version: string;
  timestamp: string;
  system: SystemInfo;
  cpu: CpuInfo;
  memory: MemoryInfo;
  disks: DiskInfo[];
  smart: SmartInfo[];
  network: NetworkInfo[];
  raid: RaidInfo[];
  ipmi: IpmiInfo;
  os_alerts: OsAlerts;
}

export interface SystemInfo {
  hostname: string;
  ip: string;
  os: string;
  kernel: string;
  uptime_seconds: number;
}

export interface CpuInfo {
  user_percent: number;
  system_percent: number;
  iowait_percent: number;
  idle_percent: number;
  load_1m: number;
  load_5m: number;
  load_15m: number;
}

export interface MemoryInfo {
  total_mb: number;
  used_mb: number;
  available_mb: number;
  swap_total_mb: number;
  swap_used_mb: number;
}

export interface DiskInfo {
  device: string;
  mount: string;
  total_gb: number;
  used_gb: number;
  available_gb: number;
  percent_used: number;
  io_read_mb_s?: number;
  io_write_mb_s?: number;
  latency_p99_ms?: number;
}

export interface SmartInfo {
  device: string;
  model: string;
  health: string;
  temperature_c?: number;
  percentage_used?: number;
  reallocated_sectors?: number;
  pending_sectors?: number;
  power_on_hours?: number;
}

export interface NetworkInfo {
  interface: string;
  speed_mbps: number;
  rx_bytes_sec: number;
  tx_bytes_sec: number;
  rx_errors: number;
  tx_errors: number;
  rx_drops: number;
  tx_drops: number;
}

export interface RaidInfo {
  device: string;
  level: string;
  status: string;
  degraded: boolean;
  disks: string[];
  failed_disks: string[];
}

export interface IpmiInfo {
  available: boolean;
  sensors: Array<{
    name: string;
    value: number | string;
    unit: string;
    status: string;
    upper_critical?: number;
  }>;
  ecc_errors: { correctable: number; uncorrectable: number };
  sel_entries_count: number;
}

export interface OsAlerts {
  oom_kills_recent: number;
  zombie_processes: number;
  time_drift_ms: number;
}

export interface AlertResult {
  type: string;
  severity: "critical" | "warning";
  title: string;
  message: string;
  evidence: Record<string, unknown>;
  recommendation: string;
}
