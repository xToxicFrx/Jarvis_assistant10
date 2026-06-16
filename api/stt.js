// ============================================================
// /api/stt — Stimme rein (Speech-to-Text).
// Bekommt die Audio-Aufnahme (als Base64-Text), schickt sie an
// OpenAI Whisper und gibt den erkannten Text zurück.
// Der OpenAI-Key bleibt auf dem Server.
// ============================================================
import { checkAuth } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt." });
  if (!checkAuth(req, res)) return;

  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: "OPENAI_API_KEY fehlt auf dem Server." });

  try {
    const { audio, mime } = req.body || {};
    if (!audio) return res.status(400).json({ error: "Es fehlt 'audio'." });

    // Base64-Text zurück in echte Audio-Bytes verwandeln
    const bytes = Buffer.from(audio, "base64");
    const blob = new Blob([bytes], { type: mime || "audio/webm" });

    // Dateiendung passend zum MIME waehlen (Chrome=webm, Safari=mp4 ...)
    const m = mime || "audio/webm";
    const ext = m.includes("mp4") || m.includes("m4a") ? "mp4"
      : m.includes("ogg") ? "ogg"
      : m.includes("mpeg") || m.includes("mp3") ? "mp3"
      : m.includes("wav") ? "wav" : "webm";

    // Multipart-Formular für Whisper bauen
    const form = new FormData();
    form.append("file", blob, "audio." + ext);
    form.append("model", "whisper-1");
    form.append("language", "de");

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + key },
      body: form,
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: "Whisper-Fehler: " + t });
    }

    const d = await r.json();
    res.status(200).json({ text: d.text || "" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
