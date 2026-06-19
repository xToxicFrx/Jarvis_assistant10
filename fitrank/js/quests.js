// ============================================================
// quests.js — tägliche/wöchentliche Ziele aus echten Trainingsdaten.
// ============================================================
// Reine Logik (keine DOM-/Netz-Abhängigkeit), daher gut testbar.
// Quests sind motivierende Fortschrittsanzeigen, berechnet aus den bereits
// (serverseitig) gespeicherten Workouts. Die XP kommen aus den Workouts selbst
// — Quests vergeben also keine zusätzlichen, fälschbaren XP.
// ============================================================

// Wochenstart (Montag, lokal) als Date.
export function weekStart(now = new Date()) {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // Mo=0 ... So=6
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// workouts: Array completed Workouts mit { ended_at, duration_min, verified, type, distance_m }
export function computeQuests(workouts, now = new Date()) {
  const ws = weekStart(now);
  const today = new Date(now);

  let todayCount = 0, weekCount = 0, verifiedMinWeek = 0, distanceWeekM = 0;
  for (const w of workouts || []) {
    const end = w.ended_at ? new Date(w.ended_at) : null;
    if (!end) continue;
    if (sameDay(end, today)) todayCount++;
    if (end >= ws) {
      weekCount++;
      if (w.verified) verifiedMinWeek += w.duration_min || 0;
      if (w.type === "run" || w.type === "cycle") distanceWeekM += w.distance_m || 0;
    }
  }

  const q = (id, title, kind, progress, goal) => ({
    id, title, kind, progress: Math.min(progress, goal), goal,
    done: progress >= goal,
    pct: Math.min(100, Math.round((progress / goal) * 100)),
  });

  return [
    q("daily_train", "Heute trainieren", "daily", todayCount, 1),
    q("week_3", "3 Workouts diese Woche", "weekly", weekCount, 3),
    q("week_verified_min", "60 verifizierte Minuten", "weekly", verifiedMinWeek, 60),
    q("week_distance", "5 km Strecke (Lauf/Rad)", "weekly", Math.round(distanceWeekM / 1000), 5),
  ];
}
