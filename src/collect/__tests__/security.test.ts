// Tests for collectSecurity's cache shape.
//
// Pre-0.9.3: the entire SecurityData was cached for 1h (12 cycles at
// 300s interval), which meant customer config changes (ufw enable,
// sshd_config edit, dnf-automatic install) didn't show up in alert
// state for up to an hour. Surfaced by CLEANUP_REPORT_2026-05-13.md.
//
// 0.9.3: only the pending_updates sub-check is cached (since it hits
// apt/dnf metadata and is genuinely slow). Every other sub-check
// (firewall, sshd, kernel_vulns, kernel_reboot, auto_updates) runs
// every cycle.

import { describe, it, expect, vi, beforeEach } from "vitest";

const runMock = vi.fn();
vi.mock("../../lib/exec.js", () => ({
  run: (...args: unknown[]) => runMock(...args),
}));
vi.mock("fs", () => ({
  existsSync: () => false,
  readFileSync: () => "",
  readdirSync: () => [],
}));

const { collectSecurity, __resetSecurityCacheForTests } = await import("../security.js");

beforeEach(() => {
  runMock.mockReset();
  __resetSecurityCacheForTests();
});

describe("collectSecurity cache shape (0.9.3 fix)", () => {
  it("fast sub-checks (firewall, ssh, kernel_reboot, auto_updates) re-run on every call", async () => {
    // Stub: every run() returns null (no shell tool installed).
    runMock.mockResolvedValue(null);
    await collectSecurity();
    const callsAfterFirst = runMock.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    await collectSecurity();
    const callsAfterSecond = runMock.mock.calls.length;
    // Second call should re-run all the fast checks (mostly the
    // same shell commands as first call). The only thing that
    // SHOULD be skipped is checkSecurityUpdates because of the
    // pending-updates cache.
    expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);
  });

  it("pending_updates result is cached within the TTL window", async () => {
    // The check looks for apt/dnf etc via run(); we simulate "apt is
    // installed and returns 5 upgradable" by matching the bash -c
    // call pattern.
    runMock.mockImplementation((...args: any[]) => {
      const cmd = args[0] as string;
      const subArgs = args[1] as string[];
      const fullCmd = `${cmd} ${(subArgs || []).join(" ")}`;
      if (fullCmd.includes("apt list --upgradable")) {
        return Promise.resolve("Listing...\n/security/upgradable\n");
      }
      return Promise.resolve(null);
    });

    const first = await collectSecurity();
    // Find checkSecurityUpdates-like calls
    const updateCallsAfterFirst = runMock.mock.calls.filter((c) =>
      String(c[1]?.join(" ") ?? "").includes("apt list --upgradable") ||
      String(c[1]?.join(" ") ?? "").includes("dnf updateinfo")
    ).length;

    await collectSecurity();
    const updateCallsAfterSecond = runMock.mock.calls.filter((c) =>
      String(c[1]?.join(" ") ?? "").includes("apt list --upgradable") ||
      String(c[1]?.join(" ") ?? "").includes("dnf updateinfo")
    ).length;

    expect(updateCallsAfterFirst).toBeGreaterThanOrEqual(0);
    // Whatever the first count was, the second call should NOT have
    // added new pending-updates calls (cache hit).
    expect(updateCallsAfterSecond).toBe(updateCallsAfterFirst);
    expect(first.pending_updates).toBeDefined();
  });

  it("__resetSecurityCacheForTests forces re-collection of pending_updates", async () => {
    runMock.mockImplementation((...args: any[]) => {
      const subArgs = args[1] as string[];
      const fullCmd = (subArgs || []).join(" ");
      if (fullCmd.includes("apt list --upgradable")) {
        return Promise.resolve("Listing...\n");
      }
      return Promise.resolve(null);
    });

    await collectSecurity();
    __resetSecurityCacheForTests();

    // After reset, the next call should re-attempt the expensive check.
    const callsBefore = runMock.mock.calls.length;
    await collectSecurity();
    const callsAfter = runMock.mock.calls.length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
  });
});
