import type { AlertResult } from "../lib/types.js";

export async function sendTelegram(
  botToken: string,
  chatId: string,
  newAlerts: AlertResult[],
  resolvedAlerts: AlertResult[],
  serverName: string
): Promise<boolean> {
  const parts: string[] = [];

  if (newAlerts.length > 0) {
    const criticals = newAlerts.filter((a) => a.severity === "critical");
    const warnings = newAlerts.filter((a) => a.severity === "warning");

    if (criticals.length > 0) {
      parts.push(`\u{1F534} <b>${criticals.length} CRITICAL</b> on <b>${serverName}</b>:\n`);
      for (const a of criticals) parts.push(`  \u2022 <b>${a.title}</b>\n  ${a.recommendation}\n`);
    }
    if (warnings.length > 0) {
      parts.push(`\u{1F7E1} <b>${warnings.length} WARNING</b> on <b>${serverName}</b>:\n`);
      for (const a of warnings) parts.push(`  \u2022 <b>${a.title}</b>\n  ${a.recommendation}\n`);
    }
  }

  if (resolvedAlerts.length > 0) {
    parts.push(`\u2705 <b>${resolvedAlerts.length} resolved</b> on <b>${serverName}</b>:\n`);
    for (const a of resolvedAlerts) parts.push(`  \u2022 ${a.title}\n`);
  }

  if (parts.length === 0) return true;

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: parts.join("\n"), parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    console.error("[telegram] Failed to send notification");
    return false;
  }
}
