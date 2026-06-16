// ============================================================
// /api/login.js — Anmeldung: Passwort rein, Sitzungs-Token raus.
//
// Sicherheit:
//  - Ratenbegrenzung pro IP (gegen Hammern)
//  - Fehlversuch-Sperre (Brute-Force-Schutz)
//  - zeitkonstanter Passwortvergleich
// Bei Erfolg gibt es ein signiertes, kurzlebiges Token zurueck.
// ============================================================
import { sendJson, methodGuard, getClientIp, constantTimeEqual, getBody, vString } from "./_lib.js";
import { rateLimit, recordFailure, failureCount, clearFailures } from "./_ratelimit.js";
import { signToken } from "./_session.js";

const MAX_FAILS = 8;       // danach kurzzeitige Sperre
const LOCK_WINDOW = 900;   // 15 Minuten

export default async function handler(req, res) {
  if (!methodGuard(req, res, ["POST"])) return;

  const expected = process.env.APP_PASSWORD;
  if (!expected) return sendJson(res, 500, { error: "Server nicht eingerichtet: APP_PASSWORD fehlt." });

  const ip = getClientIp(req);

  // Grobe Ratenbegrenzung: max 15 Login-Versuche pro Minute pro IP
  const rl = await rateLimit("login", ip, 15, 60);
  if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); return sendJson(res, 429, { error: "Zu viele Versuche. Bitte kurz warten." }); }

  // Brute-Force-Sperre
  const fails = await failureCount(ip);
  if (fails >= MAX_FAILS) { res.setHeader("Retry-After", String(LOCK_WINDOW)); return sendJson(res, 429, { error: "Zu viele Fehlversuche. Konto kurz gesperrt." }); }

  let password;
  try { const body = await getBody(req); password = vString(body.password, "Passwort", { required: true, max: 512 }); }
  catch (e) { return sendJson(res, 400, { error: e.message }); }

  if (!constantTimeEqual(password, expected)) {
    const n = await recordFailure(ip, LOCK_WINDOW);
    const left = Math.max(0, MAX_FAILS - n);
    return sendJson(res, 401, { error: "Falsches Passwort." + (left <= 3 ? ` Noch ${left} Versuch(e).` : "") });
  }

  await clearFailures(ip);
  const { token, exp, ttl } = signToken({ sub: "owner" });
  return sendJson(res, 200, { ok: true, token, exp, ttl });
}
