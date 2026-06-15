// ============================================================
// /api/tts — Stimme raus (Text-to-Speech).
// Bekommt Text, fragt ElevenLabs (mehrsprachig, für Deutsch),
// und gibt die fertige Audio-Datei zurück.
// Der ElevenLabs-Key bleibt auf dem Server.
// ============================================================
import { checkAuth } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt." });
  if (!checkAuth(req, res)) return;

  const key = process.env.ELEVENLABS_API_KEY;
  const voice = process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voice) {
    return res.status(500).json({ error: "ElevenLabs-Variablen fehlen auf dem Server." });
  }

  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: "Es fehlt 'text'." });

    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": key,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2", // wichtig für deutsche Aussprache
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: "ElevenLabs-Fehler: " + t });
    }

    // Audio (MP3) als Bytes zurückgeben
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
