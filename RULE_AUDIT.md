# Crucible collector rule audit

Audits every rule in `src/alerts/rules.ts` for field-mismatch bugs of the
"reads a field nothing populates" class that hid `disk_latency_high` for the
entire history of the rule.

Run this audit again whenever a rule is added or modified.

---

## Methodology

For each rule:

1. **Reads from**: snapshot fields the rule's `evaluate()` reads.
2. **Populated by**: collector(s) that write those fields.
3. **Status**:
   - `OK` — fields are written by some collector under realistic conditions.
   - `DEAD` — rule reads a field nothing writes.
   - `DEPENDS_ON_FLAG(<flag>)` — only fires when an optional collection flag is on.
   - `DEPENDS_ON_HARDWARE(<class>)` — silent on hosts without the relevant hardware.

Hardware-conditional rules are not dead, just hardware-gated. Flagged for
visibility, not as bugs.

---

## Rules

### 1. `ram_high` (`rules.ts:21`)
- **Reads from**: `snap.memory.{used_mb, total_mb, available_mb}`
- **Populated by**: `collectMemory` (`src/collect/memory.ts`)
- **Status**: OK

### 2. `swap_active` (`rules.ts:32`)
- **Reads from**: `snap.memory.swap_used_mb`, threshold `t.swap_alert`
- **Populated by**: `collectMemory`
- **Status**: OK

### 3. `disk_space_high` (`rules.ts:40`)
- **Reads from**: `snap.disks[].{percent_used, device, mount, used_gb, total_gb, available_gb}`
- **Populated by**: `collectDisks` (`src/collect/disks.ts`)
- **Status**: OK

### 4. `cpu_iowait_high` (`rules.ts:51`)
- **Reads from**: `snap.cpu.iowait_percent`
- **Populated by**: `collectCpu` (`src/collect/cpu.ts`)
- **Status**: OK

### 5. `oom_kills` (`rules.ts:59`)
- **Reads from**: `snap.os_alerts.oom_kills_recent`
- **Populated by**: `collectOsAlerts` (`src/collect/os-alerts.ts`)
- **Status**: OK

### 6. `smart_failing` (`rules.ts:67`)
- **Reads from**: `snap.smart[].{health, reallocated_sectors, pending_sectors}`
- **Populated by**: `collectSmart` (`src/collect/smart.ts`), gated by `config.collection.smart`
- **Status**: DEPENDS_ON_FLAG(`collection.smart`); also DEPENDS_ON_HARDWARE(`SMART-capable block device`)

### 7. `nvme_wear_high` (`rules.ts:76`)
- **Reads from**: `snap.smart[].percentage_used`
- **Populated by**: `collectSmart` (NVMe path)
- **Status**: DEPENDS_ON_HARDWARE(`NVMe`)

### 8. `raid_degraded` (`rules.ts:86`)
- **Reads from**: `snap.raid[].{degraded, failed_disks, device, level}`
- **Populated by**: `collectRaid` (`/proc/mdstat`)
- **Status**: DEPENDS_ON_HARDWARE(`mdraid`)

### 9. `disk_latency_high` (`rules.ts:101`) — **fixed in this commit**
- **Reads from**: `snap.io_latency[].{avg_read_latency_ms, avg_write_latency_ms, read_iops, write_iops, device}`
- **Populated by**: `collectIoLatency` (`src/collect/io-latency.ts`)
- **Status**: OK
- **Note**: previously read `snap.disks[].latency_p99_ms` which was never populated by any collector. Rule had never fired. Now reads from the `io_latency` snapshot field where the data actually lives. Threshold semantics: max(avg_read, avg_write) over the collection interval, against per-class thresholds (50ms NVMe / 200ms HDD/SATA default).

### 10. `interface_errors` (`rules.ts:131`)
- **Reads from**: `snap.network[].{rx_errors, tx_errors, rx_drops, tx_drops, interface}`
- **Populated by**: `collectNetwork` (`src/collect/network.ts`)
- **Status**: OK

### 11. `link_speed_mismatch` (`rules.ts:141`)
- **Reads from**: `snap.network[].{speed_mbps, interface}`
- **Populated by**: `collectNetwork` (reads `/sys/class/net/*/speed`)
- **Status**: OK

### 12. `interface_saturation` (`rules.ts:151`)
- **Reads from**: `snap.network[].{speed_mbps, rx_bytes_sec, tx_bytes_sec, interface}`
- **Populated by**: `collectNetwork`
- **Status**: OK

### 13. `cpu_temperature_high` (`rules.ts:169`)
- **Reads from**: `snap.ipmi.{available, sensors[].name, value, unit, upper_critical}`
- **Populated by**: `collectIpmi` (`src/collect/ipmi.ts`)
- **Status**: DEPENDS_ON_HARDWARE(`BMC`)
- **Known issue**: substring filter `n.includes("cpu") && n.includes("temp")` requires both tokens in the same sensor name. Fails on Dell iDRAC (uses bare `Temp`) and HPE iLO (uses `02-CPU 1` style). To be fixed by `CC_CRUCIBLE_HWMON_THERMAL.md`.

### 14. `ecc_errors` (`rules.ts:187`)
- **Reads from**: `snap.ipmi.ecc_errors.{correctable, uncorrectable}`
- **Populated by**: `collectIpmi` (sums sensors whose name contains `correctable`/`uncorrectable`)
- **Status**: DEPENDS_ON_HARDWARE(`BMC`)
- **Known issue**: Dell does not expose ECC counters as named sensors; reports them only as SEL events. Counter stays at 0 on Dell. To be fixed by `CC_CRUCIBLE_DELL_VENDOR_HANDLING.md`.

### 15. `psu_redundancy_loss` (`rules.ts:201`)
- **Reads from**: `snap.ipmi.{available, sensors[].name, value, status}`
- **Populated by**: `collectIpmi`
- **Status**: DEPENDS_ON_HARDWARE(`BMC + redundant PSU`)
- **Known issue**: substring filter `n.includes("psu") || n.includes("power supply")` misses Dell (`PS1 Status`, `PS2 Status`, `PS Redundancy`). To be fixed by `CC_CRUCIBLE_DELL_VENDOR_HANDLING.md`.

### 16. `ipmi_sel_critical` (`rules.ts:214`)
- **Reads from**: `snap.ipmi.{available, sel_events_recent[]}`
- **Populated by**: `collectIpmi` (`ipmitool sel elist`)
- **Status**: DEPENDS_ON_HARDWARE(`BMC`)

### 17. `ipmi_fan_failure` (`rules.ts:234`)
- **Reads from**: `snap.ipmi.{available, fans[]}`
- **Populated by**: `collectIpmi` (`ipmitool sdr type Fan`)
- **Status**: DEPENDS_ON_HARDWARE(`BMC`)

### 18. `ssh_root_password` (`rules.ts:248`)
- **Reads from**: `snap.security.ssh.{permitRootLogin, passwordAuthentication, rootPasswordExposed}`
- **Populated by**: `collectSecurity` (`sshd -T`)
- **Status**: OK

### 19. `no_firewall` (`rules.ts:257`)
- **Reads from**: `snap.security.firewall.{active, source}`
- **Populated by**: `collectSecurity` (probes UFW, firewalld, nftables, iptables)
- **Status**: OK

### 20. `pending_security_updates` (`rules.ts:266`)
- **Reads from**: `snap.security.pending_updates.{available, pendingCount, distro}`
- **Populated by**: `collectSecurity` (apt/dnf path)
- **Status**: OK

### 21. `kernel_vulnerabilities` (`rules.ts:278`)
- **Reads from**: `snap.security.kernel_vulns[].{name, status, mitigated}`
- **Populated by**: `collectSecurity` (`/sys/devices/system/cpu/vulnerabilities`)
- **Status**: OK

### 22. `kernel_needs_reboot` (`rules.ts:290`)
- **Reads from**: `snap.security.kernel_reboot.{needsReboot, running, installed}`
- **Populated by**: `collectSecurity`
- **Status**: OK

### 23. `unattended_upgrades_disabled` (`rules.ts:300`)
- **Reads from**: `snap.security.auto_updates.{configured, mechanism, details}`
- **Populated by**: `collectSecurity`
- **Status**: OK

---

## Summary

- **Total rules**: 22 (numbered up to 23 because of historical gaps in
  the numbering scheme; one comment-numbered slot is unused).
- **DEAD before this commit**: 1 (`disk_latency_high`). Fixed.
- **DEAD after this commit**: 0.
- **DEPENDS_ON_HARDWARE**: 8 (5 IPMI rules, 2 SMART/NVMe, 1 mdraid).
- **DEPENDS_ON_FLAG**: 1 (`smart_failing` requires `collection.smart`).
- **Hardware-independent (always evaluable on any Linux host)**: 14.

## Open issues found incidentally

- **Rules 13, 14, 15** silently no-op on Dell PowerEdge because of vendor-naming
  assumptions in their substring filters. Tracked in `CC_CRUCIBLE_DELL_VENDOR_HANDLING.md`
  and `CC_CRUCIBLE_HWMON_THERMAL.md`. Not fixed in this commit.
- **No `/sys/class/thermal` or `/sys/class/hwmon` collection** — Pi 4/5 and any
  no-BMC host has zero CPU thermal coverage. Tracked in `CC_CRUCIBLE_HWMON_THERMAL.md`.
- **No IPMI capability detection** — agent retries `ipmitool` four times every
  cycle on hosts without a BMC. Tracked in `CC_CRUCIBLE_IPMI_CAPABILITY_DETECTION.md`.
