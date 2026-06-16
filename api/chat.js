// ============================================================
// /api/chat — Das Gehirn (OpenAI, mit Function-Calling).
// Bekommt den Verlauf + Werkzeugliste; gibt die Antwort-Nachricht
// zurueck (Text ODER Werkzeug-Wunsch). Key bleibt am Server.
// Abgesichert mit Token-Auth, Ratenbegrenzung und Groessen-Limits.
// ============================================================
import { requireAuth, methodGuard, sendJson, getClientIp, getBody } from "./_lib.js";
import { rateLimit } from "./_ratelimit.js";

export default async function handler(req, res) {
  if (!methodGuard(req, res, ["POST"])) return;
  if (!requireAuth(req, res)) return;

  const rl = await rateLimit("chat", getClientIp(req), 45, 60);
  if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); return sendJson(res, 429, { error: "Zu viele Anfragen. Bitte kurz warten." }); }

  const key = process.env.OPENAI_API_KEY;
  if (!key) return sendJson(res, 500, { error: "OPENAI_API_KEY fehlt auf dem Server." });

  try {
    const body = await getBody(req);
    let messages = body.messages;
    if (!Array.isArray(messages) || !messages.length) return sendJson(res, 400, { error: "Es fehlen 'messages'." });
    if (messages.length > 80) messages = messages.slice(-80);
    if (JSON.stringify(messages).length > 300000) return sendJson(res, 413, { error: "Anfrage zu gross." });
    const tools = Array.isArray(body.tools) ? body.tools.slice(0, 40) : null;

    const payload = { model: process.env.LLM_MODEL || "gpt-4o-mini", messages, temperature: 0.7, max_tokens: 700 };
    if (tools && tools.length) { payload.tools = tools; payload.tool_choice = "auto"; }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify(payload),
    });
    if (!r.ok) { const t = await r.text(); return sendJson(res, 502, { error: "OpenAI-Fehler: " + t.slice(0, 500) }); }
    const d = await r.json();
    return sendJson(res, 200, { message: d.choices[0].message });
  } catch (e) {
    return sendJson(res, 500, { error: e.message });
  }
}
