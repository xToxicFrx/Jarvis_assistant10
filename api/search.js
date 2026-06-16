// ============================================================
// /api/search — Websuche ueber DuckDuckGo (kostenlos, kein Key).
// Gibt eine kurze Text-Zusammenfassung zurueck. Token-Auth + Limit.
// ============================================================
import { requireAuth, methodGuard, sendJson, getClientIp, getBody, vString } from "./_lib.js";
import { rateLimit } from "./_ratelimit.js";

export default async function handler(req, res) {
  if (!methodGuard(req, res, ["POST"])) return;
  if (!requireAuth(req, res)) return;

  const rl = await rateLimit("search", getClientIp(req), 25, 60);
  if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); return sendJson(res, 429, { error: "Zu viele Anfragen." }); }

  try {
    const body = await getBody(req);
    let query;
    try { query = vString(body.query, "query", { required: true, max: 300 }); }
    catch (e) { return sendJson(res, 400, { error: e.message }); }

    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const r = await fetch(url, { headers: { "Accept-Language": "de-DE,de" } });
    const d = await r.json();

    const parts = [];
    if (d.Answer) parts.push(String(d.Answer));
    if (d.AbstractText) parts.push(d.AbstractText);
    if (d.Definition) parts.push(d.Definition);
    (d.RelatedTopics || []).slice(0, 4).forEach((t) => { if (t && t.Text) parts.push(t.Text); });

    const result = parts.filter(Boolean).join(" — ") || "Keine direkten Ergebnisse gefunden.";
    return sendJson(res, 200, { result: result.substring(0, 800), source: d.AbstractURL || "" });
  } catch (e) {
    return sendJson(res, 500, { error: e.message });
  }
}
