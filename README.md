# Glassmkr Collector

Lightweight bare metal server monitoring. Collects hardware and OS health data, evaluates 15 opinionated alert rules, sends notifications directly (Telegram, Slack, email), and optionally pushes to [Forge](https://forge.glassmkr.com) for dashboard and history.

Runs as a systemd service. Wakes up every 5 minutes, collects everything, alerts if needed, sleeps.

## Quick Install

```bash
curl -sf https://forge.glassmkr.com/install | bash
```

Or manual:

```bash
npm install -g @glassmkr/collector
```

## What It Monitors

**Hardware (IPMI):** CPU temperature, ECC memory errors, PSU redundancy
**Storage:** SMART health, NVMe wear, RAID status, disk space, I/O latency
**Network:** Interface errors/drops, link speed, saturation
**OS:** RAM pressure, swap usage, CPU iowait, OOM kills, disk space

## 15 Alert Rules

| # | Alert | Severity | Default Threshold |
|---|-------|----------|-------------------|
| 1 | RAM usage high | Warning/Critical | 90% / 95% |
| 2 | Swap active | Warning | Any usage |
| 3 | Disk space high | Warning/Critical | 85% / 95% |
| 4 | CPU iowait high | Warning | 20% |
| 5 | OOM kills detected | Critical | Any |
| 6 | SMART failure | Critical | Bad health/sectors |
| 7 | NVMe wear high | Warning/Critical | 85% / 95% |
| 8 | RAID degraded | Critical | Any degradation |
| 9 | Disk latency high | Warning | 50ms NVMe, 200ms HDD |
| 10 | Interface errors | Warning | Any errors/drops |
| 11 | Link speed mismatch | Warning | Below 1 Gbps |
| 12 | Interface saturation | Warning | 90% utilization |
| 13 | CPU temperature high | Warning/Critical | 80C / 90C |
| 14 | ECC memory errors | Warning/Critical | Correctable / Uncorrectable |
| 15 | PSU redundancy loss | Critical | Any PSU failed/absent |

## Configuration

Edit `/etc/glassmkr/collector.yaml`:

```yaml
server_name: "web-01"
collection:
  interval_seconds: 300
  ipmi: true
  smart: true
forge:
  enabled: true
  url: "https://forge.glassmkr.com"
  api_key: "col_xxx"
thresholds:
  ram_percent: 90
  disk_percent: 85
channels:
  telegram:
    enabled: true
    bot_token: "123:abc"
    chat_id: "123456"
```

See [config/collector.example.yaml](config/collector.example.yaml) for all options.

## Requirements

- Linux (Ubuntu 22.04/24.04, Debian 11/12)
- Node.js 22+
- Root access
- Optional: smartmontools (for SMART monitoring)
- Optional: ipmitool (for IPMI/BMC monitoring)

## Notification Channels

**Telegram:** Provide bot token and chat ID. Create a bot via @BotFather.
**Email:** Uses local sendmail. Install postfix or msmtp.
**Slack:** Provide an incoming webhook URL.

## Forge Integration

Optional. Register at [forge.glassmkr.com](https://forge.glassmkr.com), add a server, get an API key. The collector pushes health snapshots for dashboard display and history.

## License

[MIT](LICENSE)
