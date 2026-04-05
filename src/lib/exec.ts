import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function run(cmd: string, args: string[], timeoutMs = 10000): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: timeoutMs });
    return stdout;
  } catch (err: any) {
    if (err.code === "ENOENT") return null; // command not installed
    if (err.killed) return null; // timeout
    if (err.stdout) return err.stdout; // non-zero exit but has output
    return null;
  }
}
