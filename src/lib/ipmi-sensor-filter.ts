// Per-socket pre-filter for IPMI CPU thermal sensors.
//
// Background: Gigabyte BMC firmware (observed on H262-Z63 and MC12-LE0
// with firmware 12.61) reports a `CPU<N>_DTS` sensor that runs ~30°C
// hotter than the actual AMD die temperature read directly via the
// kernel's k10temp driver. The same boards also expose a much closer
// `CPU<N>_TEMP` sensor on each socket. The IPMI fallback path of
// Forge's `cpu_temperature_high` evaluator picks the maximum across
// all CPU thermal sensors, which over-fires when both are present.
//
// Fix: when the IPMI sensor list contains both `CPU<N>_TEMP` and
// `CPU<N>_DTS` for the same socket, drop the DTS variant. If only DTS
// exists for a socket (rare, but possible on firmware that doesn't
// expose `*_TEMP`), keep it as the only available CPU thermal reading.
//
// Tracked: glassmkr/crucible#2. Closed in 0.9.1.
//
// This filter only inspects names matching `^CPU\d+_DTS$` (Gigabyte's
// specific convention). Non-CPU sensors and DTS-shaped sensors that
// don't fit the per-socket prefix pattern are passed through unchanged
// so we don't accidentally hide a useful reading on a vendor we
// haven't characterised.

export interface SensorLike {
  name: string;
}

const DTS_RE = /^CPU(\d+)_DTS$/i;

function tempSensorPatternsForSocket(socket: string): RegExp[] {
  // Match the two observed temperature naming conventions on the same
  // socket: `CPU0_TEMP` (Gigabyte) and `CPU0 Temp` (Supermicro-style
  // with a space). Either form being present means we have a non-DTS
  // reading for this socket and can safely drop the DTS variant.
  const escaped = socket.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    new RegExp(`^CPU${escaped}_TEMP$`, "i"),
    new RegExp(`^CPU${escaped}\\s+Temp$`, "i"),
  ];
}

/**
 * Drop `CPU<N>_DTS` sensors whose socket has a sibling `CPU<N>_TEMP`
 * (or `CPU<N> Temp`) sensor in the same list. Returns a new array.
 *
 * Stable order: kept sensors retain their original input order. Pure
 * function; safe to call multiple times.
 */
export function filterRedundantCpuDtsSensors<T extends SensorLike>(sensors: T[]): T[] {
  const sockets = new Set<string>();
  const dtsBySocket = new Map<string, T[]>();
  for (const s of sensors) {
    const m = DTS_RE.exec(s.name);
    if (!m) continue;
    sockets.add(m[1]);
    const list = dtsBySocket.get(m[1]) ?? [];
    list.push(s);
    dtsBySocket.set(m[1], list);
  }
  if (sockets.size === 0) return sensors.slice();

  // For each socket with a DTS sensor, check whether any non-DTS CPU
  // thermal sensor exists for the same socket.
  const dropDts = new Set<string>();
  for (const socket of sockets) {
    const patterns = tempSensorPatternsForSocket(socket);
    const hasTemp = sensors.some((s) => patterns.some((re) => re.test(s.name)));
    if (hasTemp) dropDts.add(socket);
  }
  if (dropDts.size === 0) return sensors.slice();

  return sensors.filter((s) => {
    const m = DTS_RE.exec(s.name);
    if (!m) return true;
    return !dropDts.has(m[1]);
  });
}
