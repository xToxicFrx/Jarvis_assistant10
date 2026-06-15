// ============================================================
// /api/search — Websuche über DuckDuckGo (kostenlos, kein Key).
// JARVIS ruft das auf, wenn er aktuelle Infos aus dem Internet
// braucht. Gibt eine kurze Text-Zusammenfassung zurück.
// ============================================================
import { checkAuth } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt." });
  if (!checkAuth(req, res)) return;

  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: "query fehlt." });

  try {
    // DuckDuckGo "Instant Answer" API — liefert Zusammenfassungen
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const r = await fetch(url, { headers: { "Accept-Language": "de-DE,de" } });
    const d = await r.json();

    const parts = [];
    if (d.Answer) parts.push(String(d.Answer));
    if (d.AbstractText) parts.push(d.AbstractText);
    if (d.Definition) parts.push(d.Definition);
    (d.RelatedTopics || []).slice(0, 4).forEach((t) => {
      if (t && t.Text) parts.push(t.Text);
    });

    const result = parts.filter(Boolean).join(" — ") || "Keine direkten Ergebnisse gefunden.";
    res.status(200).json({
      result: result.substring(0, 800),
      source: d.AbstractURL || "",
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
