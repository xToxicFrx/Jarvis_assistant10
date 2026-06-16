// ============================================================
// /api/_session.js — signierte Sitzungs-Tokens (HMAC-SHA256).
//
// Statt das Passwort bei JEDER Anfrage mitzuschicken, meldet sich
// der Browser einmal bei /api/login an und bekommt ein kurzlebiges,
// serverseitig signiertes Token. Das Token kann NICHT gefaelscht
// werden (HMAC mit Server-Geheimnis) und laeuft nach einer Weile ab.
//
// Das Geheimnis ist SESSION_SECRET (empfohlen) oder wird sonst aus
// APP_PASSWORD abgeleitet. Es verlaesst niemals den Server.
// ============================================================
import crypto from "node:crypto";

const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 Tage

// Geheimnis fuer die Signatur. Bevorzugt eine eigene Variable,
// sonst stabil aus APP_PASSWORD abgeleitet (aendert sich mit dem Passwort).
export function getSecret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  const base = process.env.APP_PASSWORD || "";
  return crypto.createHash("sha256").update("jarvis-session-v1:" + base).digest("hex");
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

function hmac(secret, data) {
  return crypto.createHmac("sha256", secret).update(data).digest();
}

// Token bauen: <payload>.<signatur>
export function signToken(extra = {}, ttlSeconds = TTL_SECONDS) {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload = { v: 1, iat: now, exp: now + ttlSeconds, ...extra };
  const payloadStr = b64url(JSON.stringify(payload));
  const sig = b64url(hmac(secret, payloadStr));
  return { token: payloadStr + "." + sig, exp: payload.exp, ttl: ttlSeconds };
}

// Token pruefen: Signatur (zeitkonstant) + Ablauf. Gibt payload oder null.
export function verifyToken(token) {
  if (typeof token !== "string" || token.length > 4096) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const payloadStr = token.slice(0, dot);
  const sigStr = token.slice(dot + 1);
  const secret = getSecret();
  const expected = hmac(secret, payloadStr);
  let given;
  try { given = b64urlDecode(sigStr); } catch (e) { return null; }
  if (given.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(given, expected)) return null;
  let payload;
  try { payload = JSON.parse(b64urlDecode(payloadStr).toString("utf8")); } catch (e) { return null; }
  const now = Math.floor(Date.now() / 1000);
  if (!payload || typeof payload.exp !== "number" || payload.exp < now) return null;
  return payload;
}
