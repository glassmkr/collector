import { hostname } from "os";
import { readProcFile } from "../lib/parse.js";
import { run } from "../lib/exec.js";
import type { SystemInfo } from "../lib/types.js";

export async function collectSystem(): Promise<SystemInfo> {
  const osRelease = readProcFile("/etc/os-release") || "";
  const osName = osRelease.match(/PRETTY_NAME="(.+?)"/)?.[1] || "Unknown";
  const kernel = (await run("uname", ["-r"]))?.trim() || "unknown";
  const uptimeRaw = readProcFile("/proc/uptime") || "0";
  const uptimeSeconds = Math.floor(parseFloat(uptimeRaw.split(" ")[0]));
  const ip = (await run("hostname", ["-I"]))?.trim().split(" ")[0] || "unknown";

  return {
    hostname: hostname(),
    ip,
    os: osName,
    kernel,
    uptime_seconds: uptimeSeconds,
  };
}
