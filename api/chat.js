// ============================================================
// /api/chat — Das Gehirn (mit Function-Calling).
//
// Bekommt den Gesprächsverlauf UND eine Liste von "Werkzeugen"
// (tools). Das KI-Modell darf selbst entscheiden, ob es direkt
// antwortet oder erst ein Werkzeug benutzen will (z.B. Wetter holen).
//
// Wir geben die KOMPLETTE Antwort-Nachricht zurück. Wenn das Modell
// ein Werkzeug benutzen will, steht das in message.tool_calls — das
// führt dann der Browser aus und schickt das Ergebnis zurück.
//
// Der OpenAI-Key bleibt sicher auf dem Server.
// ============================================================
import { checkAuth } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt." });
  if (!checkAuth(req, res)) return;

  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: "OPENAI_API_KEY fehlt auf dem Server." });

  try {
    const { messages, tools } = req.body || {};
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "Es fehlen 'messages'." });
    }

    // Anfrage an OpenAI zusammenbauen
    const body = {
      model: process.env.LLM_MODEL || "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 600,
    };
    // Wenn Werkzeuge mitgegeben wurden, darf das Modell sie benutzen
    if (Array.isArray(tools) && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key,
      },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: "OpenAI-Fehler: " + t });
    }

    const d = await r.json();
    // Die ganze Nachricht zurückgeben (Text ODER Werkzeug-Wunsch)
    res.status(200).json({ message: d.choices[0].message });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
