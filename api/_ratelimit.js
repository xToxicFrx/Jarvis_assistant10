// ============================================================
// /api/_ratelimit.js — einfache, robuste Ratenbegrenzung.
//
// Schuetzt die API vor zu vielen Anfragen (z.B. Passwort-Raten).
// Nutzt bevorzugt Upstash Redis (zaehlt zentral ueber alle
// Server-Instanzen). Ist kein KV eingerichtet, faellt es auf einen
// In-Memory-Zaehler zurueck (pro warmer Instanz) — besser als nichts.
// ============================================================

function kv() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function kvCmd(cfg, parts) {
  // Pipeline-freier Einzelbefehl ueber den Pfad: /CMD/arg1/arg2...
  const path = parts.map((p) => encodeURIComponent(String(p))).join("/");
  const r = await fetch(`${cfg.url}/${path}`, { headers: { Authorization: "Bearer " + cfg.token } });
  if (!r.ok) throw new Error("KV " + r.status);
  const d = await r.json();
  return d.result;
}

// ---- In-Memory-Fallback ----
const mem = new Map(); // key -> { count, resetAt }
function memHit(key, windowSec) {
  const now = Date.now();
  let e = mem.get(key);
  if (!e || e.resetAt <= now) { e = { count: 0, resetAt: now + windowSec * 1000 }; mem.set(key, e); }
  e.count++;
  // gelegentlich aufraeumen
  if (mem.size > 5000) for (const [k, v] of mem) if (v.resetAt <= now) mem.delete(k);
  return { count: e.count, ttl: Math.ceil((e.resetAt - now) / 1000) };
}

// Ein Treffer auf einen Zaehler; gibt aktuellen Stand zurueck.
async function hit(key, windowSec) {
  const cfg = kv();
  if (!cfg) return memHit(key, windowSec);
  try {
    const count = await kvCmd(cfg, ["incr", key]);
    if (count === 1) { try { await kvCmd(cfg, ["expire", key, windowSec]); } catch (e) {} }
    let ttl = windowSec;
    try { const t = await kvCmd(cfg, ["ttl", key]); if (typeof t === "number" && t >= 0) ttl = t; } catch (e) {}
    return { count, ttl };
  } catch (e) {
    return memHit(key, windowSec); // bei KV-Fehler nicht aussperren
  }
}

// Prueft ein Limit. Gibt { ok, remaining, retryAfter } zurueck.
export async function rateLimit(name, id, limit, windowSec) {
  const key = `jarvis:rl:${name}:${id}`;
  const { count, ttl } = await hit(key, windowSec);
  const ok = count <= limit;
  return { ok, remaining: Math.max(0, limit - count), retryAfter: ok ? 0 : ttl };
}

// ---- Fehlversuch-Sperre (Brute-Force-Schutz fuer Login) ----
export async function recordFailure(id, windowSec = 900) {
  const { count } = await hit(`jarvis:fail:${id}`, windowSec);
  return count;
}
export async function failureCount(id) {
  const cfg = kv();
  if (!cfg) { const e = mem.get(`jarvis:fail:${id}`); return e && e.resetAt > Date.now() ? e.count : 0; }
  try { const c = await kvCmd(cfg, ["get", `jarvis:fail:${id}`]); return c ? parseInt(c) || 0 : 0; } catch (e) { return 0; }
}
export async function clearFailures(id) {
  const cfg = kv();
  if (!cfg) { mem.delete(`jarvis:fail:${id}`); return; }
  try { await kvCmd(cfg, ["del", `jarvis:fail:${id}`]); } catch (e) {}
}
