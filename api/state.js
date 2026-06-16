// ============================================================
// /api/state — Cloud-Sync fuer den Schueler-Planer.
//
// Speichert EIN JSON-Dokument pro Nutzer (Aufgaben, Hausaufgaben,
// Stundenplan, Erinnerungen, Einstellungen) in Upstash Redis
// ueber dessen REST-API. Kein SDK noetig — nur fetch().
//
//   GET  /api/state           -> { state: <doc> | null, cloud: true }
//   PUT  /api/state {state}    -> { ok: true, updatedAt, cloud: true }
//
// Sind die KV-Variablen nicht gesetzt, antwortet der Endpoint mit
// 501 — der Browser laeuft dann nur lokal (localStorage) weiter.
// Die Schluessel-Adresse haengt am Passwort-Hash; das echte
// Passwort bleibt serverseitig (checkAuth).
// ============================================================
import { checkAuth } from "./_lib.js";
import crypto from "node:crypto";

const MAX_BYTES = 256 * 1024;

function readRaw(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

function kvConfig() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

function stateKey() {
  const pw = process.env.APP_PASSWORD || "";
  const hash = crypto.createHash("sha256").update(pw).digest("hex");
  return "jarvis:state:" + hash;
}

async function kvGet(cfg, key) {
  const r = await fetch(`${cfg.url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: "Bearer " + cfg.token },
  });
  if (!r.ok) throw new Error("KV GET " + r.status);
  const d = await r.json();
  return d.result; // string | null
}

async function kvSet(cfg, key, value) {
  const r = await fetch(`${cfg.url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: "Bearer " + cfg.token },
    body: value,
  });
  if (!r.ok) throw new Error("KV SET " + r.status);
  return r.json();
}

export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;

  const cfg = kvConfig();
  if (!cfg) {
    return res.status(501).json({
      error: "Cloud-Sync nicht eingerichtet (KV_REST_API_URL / KV_REST_API_TOKEN fehlen).",
      cloud: false,
    });
  }

  const key = stateKey();

  try {
    if (req.method === "GET") {
      const raw = await kvGet(cfg, key);
      let state = null;
      if (raw) { try { state = JSON.parse(raw); } catch (e) { state = null; } }
      return res.status(200).json({ state, cloud: true });
    }

    if (req.method === "PUT" || req.method === "POST") {
      let body = req.body;
      if (body == null) { const raw = await readRaw(req); try { body = JSON.parse(raw); } catch (e) { body = {}; } }
      if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      const state = body && body.state;
      if (!state || typeof state !== "object") {
        return res.status(400).json({ error: "Es fehlt 'state'." });
      }
      const serialized = JSON.stringify(state);
      if (serialized.length > MAX_BYTES) {
        return res.status(413).json({ error: "State zu gross (Limit 256 KB)." });
      }
      await kvSet(cfg, key, serialized);
      return res.status(200).json({ ok: true, updatedAt: state.updatedAt || Date.now(), cloud: true });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Nur GET oder PUT erlaubt." });
  } catch (e) {
    return res.status(502).json({ error: "KV-Fehler: " + e.message });
  }
}
