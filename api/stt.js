// ============================================================
// /api/stt — Stimme rein (Speech-to-Text via Whisper).
// Bekommt die Aufnahme als Base64, gibt den erkannten Text zurueck.
// Key bleibt am Server. Token-Auth + Ratenbegrenzung + Groessen-Limit.
// ============================================================
import { requireAuth, methodGuard, sendJson, getClientIp, getBody, vString } from "./_lib.js";
import { rateLimit } from "./_ratelimit.js";

const MAX_AUDIO_B64 = 12_000_000; // ~9 MB Audio

export default async function handler(req, res) {
  if (!methodGuard(req, res, ["POST"])) return;
  if (!requireAuth(req, res)) return;

  const rl = await rateLimit("stt", getClientIp(req), 30, 60);
  if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); return sendJson(res, 429, { error: "Zu viele Anfragen." }); }

  const key = process.env.OPENAI_API_KEY;
  if (!key) return sendJson(res, 500, { error: "OPENAI_API_KEY fehlt auf dem Server." });

  try {
    const body = await getBody(req);
    const audio = body.audio;
    if (!audio || typeof audio !== "string") return sendJson(res, 400, { error: "Es fehlt 'audio'." });
    if (audio.length > MAX_AUDIO_B64) return sendJson(res, 413, { error: "Aufnahme zu lang." });
    const mime = vString(body.mime, "mime", { max: 100 }) || "audio/webm";

    const bytes = Buffer.from(audio, "base64");
    const blob = new Blob([bytes], { type: mime });
    const ext = mime.includes("mp4") || mime.includes("m4a") ? "mp4" : mime.includes("ogg") ? "ogg" : mime.includes("mpeg") || mime.includes("mp3") ? "mp3" : mime.includes("wav") ? "wav" : "webm";

    const form = new FormData();
    form.append("file", blob, "audio." + ext);
    form.append("model", "whisper-1");
    form.append("language", "de");

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key },
      body: form,
    });
    if (!r.ok) { const t = await r.text(); return sendJson(res, 502, { error: "Whisper-Fehler: " + t.slice(0, 400) }); }
    const d = await r.json();
    return sendJson(res, 200, { text: d.text || "" });
  } catch (e) {
    return sendJson(res, 500, { error: e.message });
  }
}
