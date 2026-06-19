// ============================================================
// streaks.js — Streak-Berechnung für Habits (reine Logik, testbar).
// ============================================================

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// doneDates: Set/Array von "YYYY-MM-DD"-Strings, an denen der Habit erledigt wurde.
// Zählt aufeinanderfolgende Tage rückwärts ab heute. Wird heute (noch) nicht
// abgehakt, bricht die Streak erst, wenn auch gestern fehlt.
export function computeStreak(doneDates, now = new Date()) {
  const set = doneDates instanceof Set ? doneDates : new Set(doneDates || []);
  if (set.size === 0) return 0;

  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);

  // Wenn heute nicht erledigt, aber gestern: bei gestern beginnen.
  if (!set.has(ymd(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(ymd(cursor))) return 0;
  }

  let streak = 0;
  while (set.has(ymd(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export { ymd };
