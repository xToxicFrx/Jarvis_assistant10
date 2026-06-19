// ============================================================
// leveling.js — XP/Level-Kurve (Client-Seite).
// ============================================================
// MUSS mit der Server-Funktion public.xp_to_level in db/schema.sql
// übereinstimmen: level = floor(sqrt(xp/100)) + 1.
// Die Server-Version ist maßgeblich (Anti-Cheat); diese hier dient nur
// der Anzeige (Fortschrittsbalken).
// ============================================================

export function xpToLevel(xp) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
}

// XP-Schwelle, ab der ein Level beginnt (Umkehrung der Kurve).
export function levelFloorXp(level) {
  return Math.pow(Math.max(1, level) - 1, 2) * 100;
}
