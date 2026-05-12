import { run } from "../lib/exec.js";

export interface SystemdData {
  failed_units: string[];
  failed_count: number;
  /** Last 5 journal lines per failed unit. Populated only when units
   *  are present so the happy path stays cheap. Keys match
   *  `failed_units`. Codex experiment 2026-05-12 P2 — closes the
   *  "service failed → what went wrong" seam without forcing the
   *  customer to SSH to the box. */
  journal_excerpts?: Record<string, string[]>;
}

// Units commonly in failed state by design or misconfiguration
const DEFAULT_EXCLUDES = [
  "systemd-networkd-wait-online.service",
];

const JOURNAL_LINES_PER_UNIT = 5;

export async function collectSystemd(extraExcludes: string[] = []): Promise<SystemdData> {
  const output = await run("systemctl", [
    "list-units", "--type=service", "--state=failed", "--no-legend", "--plain",
  ]);

  if (!output || output.trim() === "") {
    return { failed_units: [], failed_count: 0 };
  }

  const excludes = new Set([...DEFAULT_EXCLUDES, ...extraExcludes]);
  const units: string[] = [];

  for (const line of output.trim().split("\n")) {
    const unit = line.trim().split(/\s+/)[0];
    if (unit && unit.endsWith(".service") && !excludes.has(unit)) {
      units.push(unit);
    }
  }

  // For each failed unit, collect the last N journal lines. Skipped
  // when there are no failed units (no journal calls on the happy
  // path). Per-unit failure is tolerated (an unreadable journal on
  // one unit doesn't drop the whole excerpt block) — we surface an
  // empty array for that unit so the receiver knows it tried.
  const journal_excerpts: Record<string, string[]> = {};
  for (const unit of units) {
    journal_excerpts[unit] = await readJournalExcerpt(unit);
  }

  return {
    failed_units: units,
    failed_count: units.length,
    ...(units.length > 0 ? { journal_excerpts } : {}),
  };
}

async function readJournalExcerpt(unit: string): Promise<string[]> {
  // `--no-pager` so we don't block; `-n N` for the most recent N
  // lines; `-o cat` to drop the systemd-prefix metadata and keep
  // only the message body (cleaner display, less log volume on the
  // ingest path).
  const out = await run("journalctl", [
    "-u", unit,
    "--no-pager",
    "-n", String(JOURNAL_LINES_PER_UNIT),
    "-o", "cat",
  ]);
  if (!out) return [];
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(-JOURNAL_LINES_PER_UNIT);
}
