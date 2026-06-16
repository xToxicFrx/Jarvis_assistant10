// ============================================================
// /api/tts — Stimme raus (ElevenLabs, mehrsprachig fuer Deutsch).
// Bekommt Text, gibt die Audio-Datei (MP3) zurueck. Key am Server.
// Token-Auth + Ratenbegrenzung + Text-Limit.
// ============================================================
import { requireAuth, methodGuard, sendJson, getClientIp, getBody, vString } from "./_lib.js";
import { rateLimit } from "./_ratelimit.js";

export default async function handler(req, res) {
  if (!methodGuard(req, res, ["POST"])) return;
  if (!requireAuth(req, res)) return;

  const rl = await rateLimit("tts", getClientIp(req), 45, 60);
  if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); return sendJson(res, 429, { error: "Zu viele Anfragen." }); }

  const key = process.env.ELEVENLABS_API_KEY;
  const voice = process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voice) return sendJson(res, 500, { error: "ElevenLabs-Variablen fehlen auf dem Server." });

  try {
    const body = await getBody(req);
    let text;
    try { text = vString(body.text, "text", { required: true, max: 3000 }); }
    catch (e) { return sendJson(res, 400, { error: e.message }); }

    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": key },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!r.ok) { const t = await r.text(); return sendJson(res, 502, { error: "ElevenLabs-Fehler: " + t.slice(0, 400) }); }

    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.status(200).send(buf);
  } catch (e) {
    return sendJson(res, 500, { error: e.message });
  }
}
