import { readFileSync } from "fs";

export function readProcFile(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

export function parseKeyValue(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return result;
}

export function parseKb(val: string | undefined): number {
  if (!val) return 0;
  const num = parseInt(val.replace(/\s*kB$/i, ""), 10);
  return isNaN(num) ? 0 : num;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
