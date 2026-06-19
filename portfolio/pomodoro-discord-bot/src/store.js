// Einfacher, datei-basierter Speicher für Nutzer-Statistiken.
// Bewusst simpel gehalten (JSON-Datei) – für ein echtes Produkt würde man
// hier eine richtige DB (z.B. Redis/Postgres) anbinden. Die Schnittstelle
// unten bleibt dabei gleich.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, "..", "data.json");

let cache = load();

function load() {
  if (!existsSync(FILE)) return { users: {} };
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return { users: {} };
  }
}

function save() {
  writeFileSync(FILE, JSON.stringify(cache, null, 2));
}

function todayKey() {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

function getUser(id) {
  if (!cache.users[id]) {
    cache.users[id] = { minutes: 0, sessions: 0, streak: 0, lastDay: null };
  }
  return cache.users[id];
}

/** Schreibt abgeschlossene Fokus-Minuten gut und aktualisiert die Tages-Streak. */
export function addFocus(id, minutes) {
  const u = getUser(id);
  u.minutes += minutes;
  u.sessions += 1;

  const today = todayKey();
  if (u.lastDay !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    u.streak = u.lastDay === yesterday ? u.streak + 1 : 1;
    u.lastDay = today;
  }
  save();
  return u;
}

export function getStats(id) {
  return { ...getUser(id) };
}

/** Top-Nutzer nach Gesamt-Fokusminuten. */
export function leaderboard(limit = 10) {
  return Object.entries(cache.users)
    .map(([id, u]) => ({ id, ...u }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, limit);
}
