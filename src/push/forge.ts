import type { Snapshot } from "../lib/types.js";

export async function pushToForge(url: string, apiKey: string, snapshot: Snapshot): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/v1/ingest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(snapshot),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const data = await response.json() as { new_alerts?: number; active_alerts?: number };
      console.log(`[forge] Push successful. Active alerts: ${data.active_alerts ?? 0}`);
    } else {
      console.error(`[forge] Push failed: ${response.status} ${response.statusText}`);
    }
    return response.ok;
  } catch (err) {
    console.error("[forge] Push failed, will retry next cycle");
    return false;
  }
}
