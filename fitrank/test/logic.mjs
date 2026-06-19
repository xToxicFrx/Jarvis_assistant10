// ============================================================
// logic.mjs — abhängigkeitsfreie Tests für die reine Logik.
// Ausführen:  node test/logic.mjs
// ============================================================
import { xpToLevel, levelFloorXp } from "../js/leveling.js";
import { tierForLevel } from "../js/avatar.js";

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

console.log(fail === 0 ? "\nAlle Tests bestanden ✅" : `\n${fail} Test(s) fehlgeschlagen ❌`);
process.exit(fail === 0 ? 0 : 1);
