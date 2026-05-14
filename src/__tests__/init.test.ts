import { describe, it, expect, beforeEach } from "vitest";
import { runInit, isValidApiKey, buildCollectorYaml, buildSystemdUnit, type InitDeps, SYSTEMD_UNIT_PATH } from "../init.js";

const VALID_NEW_KEY = "gmk_cru_live_abcdefghijklmnopqrstuvwx_a1b2";
const VALID_LEGACY_KEY = "col_abcdef0123456789abcdef0123456789ab";

interface FakeFs {
  files: Map<string, { data: string; mode: number }>;
  dirs: Set<string>;
}

function makeDeps(opts?: {
  preExistingFiles?: string[];
  binPath?: string | null;
  systemctlExitCode?: number | null;
  fetchStatus?: number;
  fetchThrows?: boolean;
  stdin?: string;
}): { deps: InitDeps; fs: FakeFs; logs: string[]; warns: string[]; errors: string[]; systemctlCalls: string[][] } {
  const fs: FakeFs = { files: new Map(), dirs: new Set() };
  for (const f of opts?.preExistingFiles ?? []) fs.files.set(f, { data: "stale", mode: 0o600 });

  const logs: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];
  const systemctlCalls: string[][] = [];

  const deps: InitDeps = {
    fs: {
      existsSync: (p) => fs.files.has(p),
      mkdirSync: (p) => { fs.dirs.add(p); },
      writeFileSync: (p, data, o) => { fs.files.set(p, { data, mode: o?.mode ?? 0o644 }); },
      chmodSync: (p, mode) => {
        const f = fs.files.get(p);
        if (f) f.mode = mode;
      },
    },
    exec: (cmd, args) => {
      if (cmd === "command" && args[0] === "-v" && args[1] === "glassmkr-crucible") {
        return { stdout: opts?.binPath === null ? "" : `${opts?.binPath ?? "/usr/local/bin/glassmkr-crucible"}\n`, status: 0 };
      }
      if (cmd === "which" && args[0] === "glassmkr-crucible") {
        return { stdout: opts?.binPath === null ? "" : `${opts?.binPath ?? "/usr/local/bin/glassmkr-crucible"}\n`, status: 0 };
      }
      if (cmd === "systemctl") {
        systemctlCalls.push(args);
        return { stdout: "", status: opts?.systemctlExitCode ?? 0 };
      }
      return { stdout: "", status: 0 };
    },
    hostname: () => "test-host-01",
    log: (m) => logs.push(m),
    warn: (m) => warns.push(m),
    error: (m) => errors.push(m),
    fetch: async () => {
      if (opts?.fetchThrows) throw new Error("network down");
      return { status: opts?.fetchStatus ?? 200 };
    },
    readStdin: async () => opts?.stdin ?? "",
  };
  return { deps, fs, logs, warns, errors, systemctlCalls };
}

describe("isValidApiKey", () => {
  it("accepts the new gmk_cru_live_<...>_<4> format", () => {
    expect(isValidApiKey(VALID_NEW_KEY)).toBe(true);
  });
  it("accepts the legacy col_<hex> format", () => {
    expect(isValidApiKey(VALID_LEGACY_KEY)).toBe(true);
  });
  it("rejects forge_ session tokens", () => {
    expect(isValidApiKey("forge_abc123")).toBe(false);
  });
  it("rejects random strings", () => {
    expect(isValidApiKey("just-some-string")).toBe(false);
  });
  it("rejects empty / whitespace", () => {
    expect(isValidApiKey("")).toBe(false);
    expect(isValidApiKey("   ")).toBe(false);
    expect(isValidApiKey("gmk_cru_live_abc def_1234")).toBe(false);
  });
});

describe("buildCollectorYaml", () => {
  it("emits a parseable YAML with name, url, key", () => {
    const y = buildCollectorYaml("web-01", "https://app.glassmkr.com/api/v1/ingest", VALID_NEW_KEY);
    expect(y).toContain('server_name: "web-01"');
    expect(y).toContain('url: "https://app.glassmkr.com"');
    expect(y).toContain(`api_key: "${VALID_NEW_KEY}"`);
  });
  it("strips /api/v1/ingest from the URL when present", () => {
    const y = buildCollectorYaml("h", "https://dashboard.example.com/api/v1/ingest", VALID_NEW_KEY);
    expect(y).toContain('url: "https://dashboard.example.com"');
    expect(y).not.toContain("/api/v1/ingest");
  });
  it("escapes embedded double quotes in name", () => {
    const y = buildCollectorYaml('we"ird', "https://x", VALID_NEW_KEY);
    expect(y).toContain('server_name: "we\\"ird"');
  });
});

describe("buildSystemdUnit", () => {
  it("references the dynamic binary path with the config path", () => {
    const u = buildSystemdUnit("/usr/local/bin/glassmkr-crucible", "/etc/glassmkr/collector.yaml");
    expect(u).toContain("ExecStart=/usr/local/bin/glassmkr-crucible /etc/glassmkr/collector.yaml");
    expect(u).toContain("Type=simple");
    expect(u).toContain("Restart=always");
  });
});

describe("runInit", () => {
  let configPath: string;
  beforeEach(() => { configPath = "/tmp/init-test-collector.yaml"; });

  it("rejects malformed --api-key with exit code 2", async () => {
    const { deps, errors } = makeDeps();
    const code = await runInit({ apiKey: "nope", configPath, noVerify: true }, deps);
    expect(code).toBe(2);
    expect(errors[0]).toContain("invalid --api-key");
  });

  it("happy path: writes config (0600) + systemd unit (0644), enables service", async () => {
    const { deps, fs, systemctlCalls } = makeDeps();
    const code = await runInit({ apiKey: VALID_NEW_KEY, configPath, noVerify: true }, deps);
    expect(code).toBe(0);
    const yaml = fs.files.get(configPath);
    expect(yaml?.mode).toBe(0o600);
    expect(yaml?.data).toContain(VALID_NEW_KEY);
    const unit = fs.files.get(SYSTEMD_UNIT_PATH);
    expect(unit?.mode).toBe(0o644);
    expect(unit?.data).toContain("ExecStart=/usr/local/bin/glassmkr-crucible /tmp/init-test-collector.yaml");
    expect(systemctlCalls).toContainEqual(["daemon-reload"]);
    expect(systemctlCalls).toContainEqual(["enable", "--now", "glassmkr-crucible"]);
  });

  it("--no-start: skips enable but still daemon-reloads", async () => {
    const { deps, systemctlCalls } = makeDeps();
    const code = await runInit({ apiKey: VALID_NEW_KEY, configPath, noVerify: true, noStart: true }, deps);
    expect(code).toBe(0);
    expect(systemctlCalls).toContainEqual(["daemon-reload"]);
    expect(systemctlCalls.find((c) => c[0] === "enable")).toBeUndefined();
  });

  it("refuses to overwrite an existing config without --force", async () => {
    const { deps, errors } = makeDeps({ preExistingFiles: [configPath] });
    const code = await runInit({ apiKey: VALID_NEW_KEY, configPath, noVerify: true }, deps);
    expect(code).toBe(4);
    expect(errors[0]).toContain("config already exists");
  });

  it("--force overwrites an existing config", async () => {
    const { deps, fs } = makeDeps({ preExistingFiles: [configPath] });
    const code = await runInit({ apiKey: VALID_NEW_KEY, configPath, noVerify: true, force: true }, deps);
    expect(code).toBe(0);
    expect(fs.files.get(configPath)?.data).toContain(VALID_NEW_KEY);
  });

  it("reads --api-key from stdin when value is '-'", async () => {
    const { deps, fs } = makeDeps({ stdin: VALID_LEGACY_KEY + "\n" });
    const code = await runInit({ apiKey: "-", configPath, noVerify: true }, deps);
    expect(code).toBe(0);
    expect(fs.files.get(configPath)?.data).toContain(VALID_LEGACY_KEY);
  });

  it("aborts when binary not on PATH (exit code 7)", async () => {
    const { deps, errors } = makeDeps({ binPath: null });
    const code = await runInit({ apiKey: VALID_NEW_KEY, configPath, noVerify: true }, deps);
    expect(code).toBe(7);
    expect(errors[errors.length - 1]).toContain("could not locate the glassmkr-crucible binary");
  });

  it("connectivity probe: 401 from ingest endpoint -> exit code 3", async () => {
    const { deps, errors } = makeDeps({ fetchStatus: 401 });
    const code = await runInit({ apiKey: VALID_NEW_KEY, configPath }, deps);
    expect(code).toBe(3);
    expect(errors[0]).toContain("api key rejected");
  });

  it("connectivity probe: 5xx warns but continues", async () => {
    const { deps, warns } = makeDeps({ fetchStatus: 502 });
    const code = await runInit({ apiKey: VALID_NEW_KEY, configPath }, deps);
    expect(code).toBe(0);
    expect(warns.some((w) => w.includes("502"))).toBe(true);
  });

  it("connectivity probe: network error warns and continues", async () => {
    const { deps, warns } = makeDeps({ fetchThrows: true });
    const code = await runInit({ apiKey: VALID_NEW_KEY, configPath }, deps);
    expect(code).toBe(0);
    expect(warns.some((w) => w.includes("connectivity probe failed"))).toBe(true);
  });

  it("--name overrides hostname", async () => {
    const { deps, fs } = makeDeps();
    await runInit({ apiKey: VALID_NEW_KEY, name: "custom-name", configPath, noVerify: true }, deps);
    expect(fs.files.get(configPath)?.data).toContain('server_name: "custom-name"');
  });

  it("falls back to hostname when --name not provided", async () => {
    const { deps, fs } = makeDeps();
    await runInit({ apiKey: VALID_NEW_KEY, configPath, noVerify: true }, deps);
    expect(fs.files.get(configPath)?.data).toContain('server_name: "test-host-01"');
  });

  it("--ingest-url override is reflected in collector.yaml", async () => {
    const { deps, fs } = makeDeps();
    await runInit({ apiKey: VALID_NEW_KEY, ingestUrl: "https://dashboard.example.com/api/v1/ingest", configPath, noVerify: true }, deps);
    expect(fs.files.get(configPath)?.data).toContain('url: "https://dashboard.example.com"');
  });

  it("systemctl enable failure surfaces as exit code 9", async () => {
    const { deps, errors } = makeDeps({ systemctlExitCode: 1 });
    const code = await runInit({ apiKey: VALID_NEW_KEY, configPath, noVerify: true }, deps);
    expect(code).toBe(9);
    expect(errors[errors.length - 1]).toContain("systemctl enable --now");
  });
});
