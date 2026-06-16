// ============================================================
// /api/state — Cloud-Sync (ein Dokument pro Nutzer).
//
//   GET  /api/state            -> { cloud, data?, updatedAt?, salt? }
//   PUT  /api/state {data, updatedAt, salt} -> { cloud, ok, updatedAt }
//
// "data" ist fuer den Server UNDURCHSICHTIG: entweder Klartext-JSON
// oder ein Verschluesselungs-Umschlag (Zero-Knowledge). Der Server
// speichert es nur. "salt" (oeffentlich) erlaubt anderen Geraeten,
// denselben Schluessel aus dem Passwort abzuleiten.
//
// Schluessel-Adresse haengt am Passwort-Hash; das echte Passwort
// bleibt serverseitig (requireAuth). Ohne KV -> {cloud:false}.
// ============================================================
import crypto from "node:crypto";
import { requireAuth, methodGuard, sendJson, getClientIp, getBody, vInt } from "./_lib.js";
import { rateLimit } from "./_ratelimit.js";

const MAX_BYTES = 512 * 1024;

function kvConfig() {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}
function stateKey() {
  const pw = process.env.APP_PASSWORD || "";
  return "jarvis:state:" + crypto.createHash("sha256").update(pw).digest("hex");
}
async function kvGet(cfg, key) {
  const r = await fetch(`${cfg.url}/get/${encodeURIComponent(key)}`, { headers: { Authorization: "Bearer " + cfg.token } });
  if (!r.ok) throw new Error("KV GET " + r.status);
  return (await r.json()).result;
}
async function kvSet(cfg, key, value) {
  const r = await fetch(`${cfg.url}/set/${encodeURIComponent(key)}`, { method: "POST", headers: { Authorization: "Bearer " + cfg.token }, body: value });
  if (!r.ok) throw new Error("KV SET " + r.status);
  return r.json();
}

export default async function handler(req, res) {
  if (!methodGuard(req, res, ["GET", "PUT", "POST"])) return;
  if (!requireAuth(req, res)) return;

  const rl = await rateLimit("state", getClientIp(req), 180, 60);
  if (!rl.ok) { res.setHeader("Retry-After", String(rl.retryAfter)); return sendJson(res, 429, { error: "Zu viele Anfragen." }); }

  const cfg = kvConfig();
  if (!cfg) return sendJson(res, 200, { cloud: false });
  const key = stateKey();

  try {
    if (req.method === "GET") {
      const raw = await kvGet(cfg, key);
      if (!raw) return sendJson(res, 200, { cloud: true, data: null, updatedAt: 0, salt: null });
      let rec; try { rec = JSON.parse(raw); } catch (e) { rec = null; }
      if (!rec) return sendJson(res, 200, { cloud: true, data: null, updatedAt: 0, salt: null });
      return sendJson(res, 200, { cloud: true, data: rec.data ?? null, updatedAt: rec.updatedAt || 0, salt: rec.salt || null });
    }

    // PUT / POST
    const body = await getBody(req);
    const data = body.data;
    if (data == null || typeof data !== "object") return sendJson(res, 400, { error: "Es fehlt 'data'." });
    let updatedAt;
    try { updatedAt = vInt(body.updatedAt, "updatedAt", { required: true, min: 0, max: 1e15 }); }
    catch (e) { return sendJson(res, 400, { error: e.message }); }
    const salt = typeof body.salt === "string" ? body.salt.slice(0, 256) : null;

    const serialized = JSON.stringify({ data, updatedAt, salt });
    if (serialized.length > MAX_BYTES) return sendJson(res, 413, { error: "Daten zu gross (Limit 512 KB)." });

    await kvSet(cfg, key, serialized);
    return sendJson(res, 200, { cloud: true, ok: true, updatedAt });
  } catch (e) {
    return sendJson(res, 502, { error: "KV-Fehler: " + e.message });
  }
}
