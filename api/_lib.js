// ============================================================
// /api/_lib.js — gemeinsame Helfer + Sicherheit fuer alle Endpunkte.
//
//  - requireAuth: prueft das Sitzungs-Token (oder Passwort als Fallback)
//  - checkAuth:   alter Name, zeigt jetzt auf requireAuth
//  - Validatoren: pruefen Eingaben (Typ, Laenge, Bereich)
//  - getClientIp, sendJson, methodGuard
//
// Geheimnisse (APP_PASSWORD, Keys) bleiben IMMER auf dem Server.
// ============================================================
import crypto from "node:crypto";
import { verifyToken } from "./_session.js";

export function sendJson(res, code, obj) { res.status(code).json(obj); }

export function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  if (Array.isArray(xff) && xff.length) return String(xff[0]).trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

// Zeitkonstanter Vergleich (gegen Timing-Angriffe). Vergleicht Hashes,
// damit auch unterschiedliche Laengen kein Leck sind.
export function constantTimeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a || "")).digest();
  const hb = crypto.createHash("sha256").update(String(b || "")).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Authentifizierung: Bearer-Token bevorzugt, Passwort-Header als Fallback.
export function requireAuth(req, res) {
  const expectedPw = process.env.APP_PASSWORD;
  if (!expectedPw) { sendJson(res, 500, { error: "Server nicht eingerichtet: APP_PASSWORD fehlt." }); return false; }

  // 1) Token aus Authorization: Bearer <token> oder x-app-token
  let token = null;
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ")) token = auth.slice(7).trim();
  if (!token && typeof req.headers["x-app-token"] === "string") token = req.headers["x-app-token"];
  if (token && verifyToken(token)) return true;

  // 2) Fallback: direktes Passwort (zeitkonstant)
  const given = req.headers["x-app-password"];
  if (given && constantTimeEqual(given, expectedPw)) return true;

  sendJson(res, 401, { error: "Nicht autorisiert. Bitte neu anmelden." });
  return false;
}

// Alter Name (andere Endpunkte importieren checkAuth).
export const checkAuth = requireAuth;

export function methodGuard(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  res.setHeader("Allow", allowed.join(", "));
  sendJson(res, 405, { error: "Methode nicht erlaubt." });
  return false;
}

// Body sicher lesen (falls Vercel ihn nicht geparst hat).
export function readRawBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 2_000_000) { try { req.destroy(); } catch (e) {} resolve(""); } });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}
export async function getBody(req) {
  let b = req.body;
  if (b == null) { const raw = await readRawBody(req); try { b = JSON.parse(raw); } catch (e) { b = {}; } }
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b && typeof b === "object" ? b : {};
}

// ---- Validatoren (werfen ValidationError; Handler faengt sie) ----
export class ValidationError extends Error {}

export function vString(val, name, { required = false, min = 0, max = 5000 } = {}) {
  if (val == null || val === "") { if (required) throw new ValidationError(`${name} fehlt.`); return null; }
  if (typeof val !== "string") throw new ValidationError(`${name} muss Text sein.`);
  if (val.length < min) throw new ValidationError(`${name} ist zu kurz.`);
  if (val.length > max) throw new ValidationError(`${name} ist zu lang (max ${max}).`);
  return val;
}
export function vInt(val, name, { required = false, min = -1e9, max = 1e9 } = {}) {
  if (val == null || val === "") { if (required) throw new ValidationError(`${name} fehlt.`); return null; }
  const n = Number(val);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new ValidationError(`${name} muss eine ganze Zahl sein.`);
  if (n < min || n > max) throw new ValidationError(`${name} liegt ausserhalb des erlaubten Bereichs.`);
  return n;
}
export function vEnum(val, name, allowed, { required = false } = {}) {
  if (val == null || val === "") { if (required) throw new ValidationError(`${name} fehlt.`); return null; }
  if (!allowed.includes(val)) throw new ValidationError(`${name} ist ungueltig.`);
  return val;
}
export function vArray(val, name, { max = 10000 } = {}) {
  if (val == null) return [];
  if (!Array.isArray(val)) throw new ValidationError(`${name} muss eine Liste sein.`);
  if (val.length > max) throw new ValidationError(`${name} hat zu viele Eintraege.`);
  return val;
}
