// ============================================================
// logic.mjs — abhängigkeitsfreie Tests für die reine Logik.
// Ausführen:  node test/logic.mjs
// ============================================================
import { xpToLevel, levelFloorXp } from "../js/leveling.js";
import { tierForLevel } from "../js/avatar.js";
import { computeQuests } from "../js/quests.js";
import { computeStreak } from "../js/streaks.js";

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) fail++; };

// --- Level-Kurve ---
ok(xpToLevel(0) === 1, "0 XP -> Level 1");
ok(xpToLevel(99) === 1, "99 XP -> Level 1");
ok(xpToLevel(100) === 2, "100 XP -> Level 2");
ok(xpToLevel(400) === 3, "400 XP -> Level 3");

// --- Umkehrung muss konsistent sein (wichtig: Client == Server-SQL) ---
for (let L = 1; L <= 40; L++) {
  ok(xpToLevel(levelFloorXp(L)) === L, `Level ${L}: floor-XP ergibt wieder Level ${L}`);
}

// --- Liga-Stufen (Avatar) ---
ok(tierForLevel(1).name === "Bronze", "Level 1 -> Bronze");
ok(tierForLevel(9).name === "Silber", "Level 9 -> Silber");
ok(tierForLevel(10).name === "Gold", "Level 10 -> Gold");
ok(tierForLevel(40).name === "Radiant", "Level 40 -> Radiant");

// --- Quests (aus echten Workout-Daten berechnet) ---
{
  const now = new Date(2026, 5, 17, 12, 0, 0); // Mi, 17.06.2026 (Woche ab Mo 15.06.)
  const workouts = [
    { ended_at: "2026-06-17T12:00:00", duration_min: 30, verified: true, type: "run", distance_m: 3000 },
    { ended_at: "2026-06-15T18:00:00", duration_min: 40, verified: true, type: "lifting" },
    { ended_at: "2026-06-01T18:00:00", duration_min: 99, verified: true, type: "lifting" }, // alte Woche -> zählt nicht
  ];
  const q = computeQuests(workouts, now);
  const by = (id) => q.find((x) => x.id === id);
  ok(by("daily_train").done === true, "Quest: heute trainiert -> erfüllt");
  ok(by("week_3").progress === 2 && by("week_3").done === false, "Quest: 2/3 Workouts diese Woche");
  ok(by("week_verified_min").progress === 60 && by("week_verified_min").done === true, "Quest: 70 verif. Min -> 60/60 erfüllt (gedeckelt)");
  ok(by("week_distance").progress === 3, "Quest: 3 km Strecke diese Woche");
}

// --- Streaks ---
{
  const now = new Date(2026, 5, 17, 9, 0, 0);
  ok(computeStreak(["2026-06-17", "2026-06-16", "2026-06-15"], now) === 3, "Streak: 3 zusammenhängende Tage inkl. heute");
  ok(computeStreak(["2026-06-16", "2026-06-15"], now) === 2, "Streak: 2 Tage (heute offen, gestern erledigt)");
  ok(computeStreak(["2026-06-17", "2026-06-15"], now) === 1, "Streak: nur heute (Lücke gestern)");
  ok(computeStreak([], now) === 0, "Streak: keine Logs -> 0");
}

console.log(fail === 0 ? "\nAlle Tests bestanden ✅" : `\n${fail} Test(s) fehlgeschlagen ❌`);
process.exit(fail === 0 ? 0 : 1);
