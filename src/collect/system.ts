import { hostname } from "os";
import { readProcFile } from "../lib/parse.js";
import { run } from "../lib/exec.js";
import type { SystemInfo } from "../lib/types.js";

// Matches KEY=value with optional surrounding double quotes. Handles both
// `ID=ubuntu` and `ID="rocky"` styles found in the wild.
export function readOsReleaseField(osRelease: string, key: string): string | undefined {
  const m = osRelease.match(new RegExp(`^${key}=("?)(.+?)\\1$`, "m"));
  return m ? m[2].toLowerCase() : undefined;
}

export async function collectSystem(): Promise<SystemInfo> {
  const osRelease = readProcFile("/etc/os-release") || "";
  const osName = osRelease.match(/PRETTY_NAME="(.+?)"/)?.[1] || "Unknown";
  const os_id = readOsReleaseField(osRelease, "ID");
  const os_id_like = readOsReleaseField(osRelease, "ID_LIKE");
  const kernel = (await run("uname", ["-r"]))?.trim() || "unknown";
  const uptimeRaw = readProcFile("/proc/uptime") || "0";
  const uptimeSeconds = Math.floor(parseFloat(uptimeRaw.split(" ")[0]));
  const ip = (await run("hostname", ["-I"]))?.trim().split(" ")[0] || "unknown";

  return {
    hostname: hostname(),
    ip,
    os: osName,
    ...(os_id ? { os_id } : {}),
    ...(os_id_like ? { os_id_like } : {}),
    kernel,
    uptime_seconds: uptimeSeconds,
  };
}
