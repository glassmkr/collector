# Changelog

All notable changes to `@glassmkr/crucible` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Pre-1.0 convention: minor bumps may include breaking changes; we call them
out under `### Breaking` so downstream consumers can audit.

## [0.9.1] - 2026-05-08

### Added

- `glassmkr-crucible init` subcommand for canonical first-run setup. Validates the API key, optionally probes the ingest endpoint, writes `/etc/glassmkr/collector.yaml` (mode 0600), writes a systemd unit at `/etc/systemd/system/glassmkr-crucible.service` (mode 0644) with `ExecStart` pointing at the dynamically-detected binary path, runs `daemon-reload`, and (unless `--no-start`) enables and starts the service. Closes the F2 protocol gap surfaced in the Phase 2 API dogfood synthesis. See README "Quick Start" and `glassmkr-crucible init --help`. Supports `--api-key -` to read the key from stdin (avoids leaking to shell history). Requires root for the filesystem and systemd writes.
- IPMI sensor classifier: per-socket pre-filter in `src/lib/ipmi-sensor-filter.ts` that drops `CPU<N>_DTS` when `CPU<N>_TEMP` (or `CPU<N> Temp`) is also present on the same socket. Closes [#2](https://github.com/glassmkr/crucible/issues/2): false-positive `cpu_temperature_high` alerts on Gigabyte AMD platforms with BMC firmware 12.61, where `CPU<N>_DTS` reports ~30°C above the actual k10temp die temperature.

### Changed

- README: `init` is now documented as the canonical first-run path. The manual install flow is retained as a "Manual install" section for ops engineers customising the systemd unit, with the dynamic `command -v` snippet from the F5 fix. New "Migrating from manual install" subsection covers the (no-op) upgrade path for existing 0.9.0 hand-rolled setups.

### Backwards-compatibility

- Existing 0.9.0 installations with a hand-written `collector.yaml` and systemd unit continue working unchanged. No migration required.
- Customers on Gigabyte AMD platforms may see fewer false-positive `cpu_temperature_high` alerts after upgrading. This is the intended fix (#2). The `*_DTS` sensors are dropped in-collector before publish, so Forge's IPMI fallback path no longer sees them; hwmon-primary on Forge already used the correct `k10temp` value, so this also closes the IPMI-fallback parity gap.

### Internal

- New tests: `src/lib/__tests__/ipmi-sensor-filter.test.ts` (11 cases covering Gigabyte AMD, dual-socket EPYC, Dell-style, Supermicro-style, fallback-when-only-DTS, stable order); `src/__tests__/init.test.ts` (23 cases covering API-key validation, YAML emission, systemd unit shape, happy path, `--no-start`, `--force`, stdin, missing binary, connectivity probe 401/5xx/network-error, `--name`, `--ingest-url`, `systemctl enable` failure); `src/__tests__/cli.test.ts` extended with 6 cases for `init` argument parsing.
- Test count: 210 passing (was 168). Build: 0 type errors.

## [0.9.0] - 2026-05-07

Aligns Crucible with the Forge programmatic-API workstream. **No
collector-side code changes required for this release** — the agent
still reads its key as an opaque string and sends it as a Bearer
token. The version bump exists to let operators correlate "I rotated
on Forge to a `gmk_cru_live_*` key" with "I'm running Crucible
0.9.0 or later".

### Operator-facing change

When you next rotate a server's collector key on Forge (via the
dashboard or `POST /api/v1/servers/{id}/rotate-key`), Forge issues a
key in the new format:

  gmk_cru_live_<43-char-base62>_<4-char-checksum>     (49 chars total)

instead of the old:

  col_<32 hex>                                        (36 chars total)

The new format includes a Stripe-style prefix for support legibility,
a CRC32 checksum so Forge can reject malformed keys at the edge
without a DB lookup, and HMAC+pepper storage on the Forge side
(replacing bcrypt, which was overkill for 256-bit high-entropy keys).
GitHub secret-scanning partner registration for the `gmk_cru_live_`
prefix is queued.

After rotating: update the agent's config file with the new value:

  forge:
    api_key: "gmk_cru_live_..."

then `sudo systemctl restart glassmkr-collector`.

### Breaking

- **None for the agent itself.** Both old (`col_*`) and new
  (`gmk_cru_live_*`) keys continue to authenticate against Forge.
  Operators rotate at their own pace; Forge accepts both formats
  during the migration window. There is no scheduled cutoff for
  the legacy format in v0.9; that decision lands at v1.0 or earlier
  if customer demand drives it.

### Notes

- 0.9.0 is the floor version Forge documents for the new `gmk_cru_*`
  rotation flow. Earlier 0.8.x agents work fine; the version bump is
  about narrative alignment rather than wire-format incompatibility.
- The agent's auto-update path picks up 0.9.0 on next service restart
  for any field agent on 0.8.x.
- glassmkr-services-1 (currently 0.7.0) and glassmkr-gpu-1 (currently
  0.6.6) will both auto-update to 0.9.0 on next restart.

## [0.8.1] - 2026-05-06

Patch release closing P1 bugs Codex identified in 0.8.0. No new
features, no schema changes. Recommended upgrade for anyone running
0.8.0.

### Fixed
- **AMD k10temp / zenpower CPU temperature is now produced even when
  Tdie is unavailable**. 0.8.0 always skipped Tctl and never picked
  Tccd as a CPU reading, so kernels exposing only Tctl, or only Tccd*,
  produced no CPU reading and `cpu_temperature_high` couldn't fire on
  affected AMD hosts. Fallback order: Tdie → first Tccd → Tctl. Tctl
  now also surfaces in `other_readings` rather than being silently
  dropped.
- **`cpu_temperature_high` IPMI fallback no longer false-fires on
  non-temperature sensors.** 0.8.0's filter accepted any sensor whose
  name contained `cpu` or `temp`, ignoring the unit. A `CPU_FAN1`
  reading 2000 RPM would alert as `2000°C critical`. Filter now
  requires the sensor unit to indicate temperature (`C`, `°C`,
  `degrees C`, etc.), the name to include `cpu` or `processor`, and
  excludes ambient/inlet/PCH/DIMM/PSU sensors that happen to read in
  °C. Mirrors Forge's evaluator.
- **`psu_redundancy_loss` now matches IPMI discrete `cr`/`nr` status
  codes.** 0.8.0 only matched the text `fail`/`absent`. ipmitool
  commonly reports critical PSU states as the short codes `cr`
  (critical) or `nr` (non-recoverable) in the status column; on
  Supermicro and Dell that meant a PSU in fault state with status
  `cr` and a hex value did not fire unless the Dell aggregate
  redundancy field happened to save it.
- **DMI `Hewlett-Packard Company` is now classified as `hpe`.** 0.8.0's
  legacy-HP regex `(^|\W)hp(\W|$)` did not match the literal
  "Hewlett-Packard" string (no `HP` token in `Hewlett`). Added explicit
  `Hewlett-Packard` / `Hewlett Packard` matching, ahead of the
  standalone `HP` rule. Tightened the standalone `HP` rule to
  whitespace boundaries only so `HP-UX` (an OS name) doesn't
  false-match.

### Internal
- 18 new regression tests covering the four fixes above. Total tests:
  168 (was 150).
- Glassmkr's `validate-rule-ids.mjs` now schema-checks `RULES.json`
  before running drift comparison: catches invalid `side` values,
  duplicate IDs, malformed entries, non-snake_case ids.

### Note on Forge integration

The Codex review against 0.8.0 flagged that Forge's server-side
evaluator doesn't yet read the new `snap.thermal`,
`snap.ipmi.ecc_errors_from_sel`, `snap.ipmi.psu_redundancy_state`, or
`snap.dmi` fields. **Collector-side rules (used for Telegram / Slack /
email notifications shipped directly from the agent) DO use these
fields.** The Forge dashboard alerts come from a separate server-side
evaluator that needs to be extended in a future Forge release. Snapshot
ingestion accepts the new fields without erroring (TS cast, no Zod);
they're persisted but not yet evaluated.

This is a Forge feature gap, not a 0.8.0 / 0.8.1 collector bug.

## [0.8.0] - 2026-05-06

### Added
- `/sys/class/hwmon` thermal collection. CPU temperature now monitored on any
  Linux host with thermal sensors, not just hosts with a BMC. Works on
  Raspberry Pi, Dell, HPE, Supermicro, AMD (k10temp/zenpower), Intel (coretemp),
  and a range of ARM SoCs via the `cpu-thermal-chips.ts` allowlist.
- `/sys/class/thermal/thermal_zone*` fallback when hwmon is empty.
- DMI/SMBIOS vendor detection (`/sys/class/dmi/id/`). New `snap.dmi` field
  with vendor classification (Dell, HPE, Supermicro, ASRockRack, Lenovo,
  Inspur, Cisco, virtual, generic) and BIOS metadata.
- Vendor-aware IPMI sensor classification. Dell PowerEdge PSU sensors
  (`PS1 Status`, `PS2 Status`, `PS Redundancy`) now match correctly.
- Dell ECC error counting from SEL events. Dell does not expose ECC counters
  as named numeric sensors; cumulative counts now derived from
  `ipmitool sel elist` parsing.
- IPMI capability detection at startup. No-BMC hosts (Raspberry Pi, VMs,
  containers without `/dev` mapped) skip the four per-cycle `ipmitool`
  exec attempts. Reasoned failure surfaced as `snap.ipmi.detection`.
- New snapshot fields: `snap.thermal`, `snap.dmi`, `snap.ipmi.detection`,
  `snap.ipmi.psu_redundancy_state`, `snap.ipmi.ecc_errors_from_sel`.
- New public API: `ALL_RULE_IDS` exported from `@glassmkr/crucible/api`.
  Side-effect-free entry point added; the default `@glassmkr/crucible`
  entry point is the CLI and runs the agent on import.
- Static `rule-ids.json` shipped alongside `dist/`. Read by the Glassmkr
  drift validator without spawning a JS module load.
- New config flags: `collection.thermal: true` (default), `collection.dmi: true`
  (default).

### Changed
- `cpu_temperature_high` rule now prefers the hwmon source and falls back
  to IPMI substring filtering only when hwmon yielded no usable readings.
  Alert payload includes the source (`hwmon coretemp Package id 0` vs
  `IPMI CPU1 Temp`).
- `ecc_errors` rule reads `max(named_sensor_count, sel_derived_count)`.
  Alert payload calls out which source fired.
- `psu_redundancy_loss` rule supports Dell aggregate redundancy sensor
  in addition to per-PSU detection. Per-PSU detection now uses a
  vendor-aware classifier that recognises Dell `PS<N>` patterns.
- File header in `src/alerts/rules.ts` corrected to state 23 rules
  (was 15, off by 8).

### Fixed
- `disk_latency_high` rule now reads from `snap.io_latency` where the
  data lives, instead of `snap.disks[].latency_p99_ms` which no
  collector ever populated. Rule had never fired since being added.

### Breaking
- Rule ID `swap_active` renamed to `swap_high` to match Forge convention.
  Downstream consumers routing alerts on the old ID must update. The
  rule's behaviour is unchanged.

### Internal
- New rule audit document at `RULE_AUDIT.md` covering all 23 rules.
- 84 new tests across thermal, DMI, vendor sensors, IPMI capability
  detection, swap rule, ALL_RULE_IDS sync, and rule integration.
  Total test count: 150 (was 66).

### Migration

If you route alerts on rule ID:

```diff
- swap_active
+ swap_high
```

If you read snapshots: new optional fields are additive. Existing
fields unchanged. Forge ingestion in 2026-05 already accepts the
new shape (snapshot validation is a TS cast, not a Zod schema).

## [0.7.1] - 2026-04 (and earlier)

See git history for releases prior to this changelog being introduced.
Last release before this was published as `c8af7bf`:
"chore: kill hardcoded 'Glassmkr Collector v0.1.0' strings;
centralise version".
