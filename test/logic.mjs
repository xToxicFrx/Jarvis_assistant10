// ============================================================
// test/logic.mjs — Logik- und Sicherheits-Tests (ohne Browser).
// Start:  node test/logic.mjs
// Deckt ab: Session-Token, Ratenbegrenzung, Verschluesselung,
// und die gesamte Store-/Werkzeug-Logik (Aufgaben, Noten, Tests,
// Gewohnheiten, Wiederholung, Pomodoro, Vokabeln, Budget, Snapshot).
// ============================================================
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-test-secret-1234567890";
delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;

import vm from "node:vm";
import fs from "node:fs";
import { webcrypto } from "node:crypto";

let fail = 0;
const ok = (c, m) => { console.log((c ? "PASS" : "FAIL") + " " + m); if (!c) fail++; };

// ---------- Sicherheit: Session-Token ----------
const { signToken, verifyToken } = await import(process.cwd() + "/api/_session.js");
ok(verifyToken(signToken({ sub: "owner" }).token)?.sub === "owner", "Token wird verifiziert");
ok(verifyToken("x.y") === null, "Falsches Token abgelehnt");
ok(verifyToken(signToken({}, -5).token) === null, "Abgelaufenes Token abgelehnt");

// ---------- Sicherheit: Ratenbegrenzung ----------
const { rateLimit, recordFailure, failureCount, clearFailures } = await import(process.cwd() + "/api/_ratelimit.js");
let r; for (let i = 0; i < 3; i++) r = await rateLimit("t", "ipA", 3, 60);
ok(r.ok, "Innerhalb Limit ok");
ok(!(await rateLimit("t", "ipA", 3, 60)).ok, "Ueber Limit blockiert");
await recordFailure("ipB", 900); ok((await failureCount("ipB")) === 1, "Fehlversuch gezaehlt");
await clearFailures("ipB"); ok((await failureCount("ipB")) === 0, "Fehlversuche zurueckgesetzt");

// ---------- Browser-Module in Sandbox laden ----------
function mem() { const m = new Map(); return { getItem: (k) => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }
const sandbox = { localStorage: mem(), sessionStorage: mem(), crypto: webcrypto, btoa, atob, TextEncoder, TextDecoder, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON, console, document: { title: "" }, matchMedia: () => ({ matches: false, addEventListener() {} }), Auth: { key: () => null, password: () => null, restoreKey: async () => null, deriveAndStoreKey: async () => null, clearPassword() {}, saltB64: () => null, apiFetch: async () => ({ cloud: false }) } };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ["constants", "utils", "crypto", "store", "reminders", "pomodoro", "tools"]) vm.runInContext(fs.readFileSync("js/" + f + ".js", "utf8"), sandbox);
const { Store, runTool, Utils, Enc } = sandbox;

// ---------- Verschluesselung (Zero-Knowledge) ----------
const salt = Enc.genSaltB64();
const key = await Enc.deriveKey("pw", salt);
const env = await Enc.encrypt({ a: 1 }, key);
ok((await Enc.decrypt(env, key)).a === 1, "Verschluesselung Round-Trip");
let threw = false; try { await Enc.decrypt(env, await Enc.deriveKey("falsch", salt)); } catch (e) { threw = true; }
ok(threw, "Falsches Passwort entschluesselt NICHT");

// ---------- Store-Logik ----------
const ymd = Utils.todayYMD();
Store.addGrade({ subject: "Mathe", value: 2 }); Store.addGrade({ subject: "Mathe", value: 1 });
ok(Store.subjectAverage("Mathe") === 1.5, "Notenschnitt 1.5");
ok(Store.neededGrade("Mathe", 2, 1) === 3, "Notenziel: braucht eine 3 fuer Schnitt 2");
ok(Store.projectedAverage("Mathe", 3, 1) === 2, "Notenziel: Projektion ergibt 2.0");
await runTool("add_homework", { subject: "Bio", title: "AB", due: Utils.ymd(Utils.addDays(new Date(), 2)) }, {});
ok(Store.get().tasks.some((t) => t.type === "homework"), "Hausaufgabe via Werkzeug");
const rt = Store.addTask({ title: "Mappe", due: ymd, repeat: { freq: "daily" } });
Store.completeTask(rt.id);
ok(Utils.daysUntil(Store.get().tasks.find((t) => t.id === rt.id).due) === 1, "Wiederkehrende Aufgabe rollt weiter");
const st = Store.addTask({ title: "Projekt", subtasks: [{ title: "Recherche" }, { title: "Schreiben" }, { title: "" }] });
ok(st.subtasks.length === 2, "Subtasks angelegt (leere verworfen)");
Store.toggleSubtask(st.id, st.subtasks[0].id);
ok(Store.get().tasks.find((t) => t.id === st.id).subtasks[0].done === true, "Subtask abgehakt");
await runTool("add_subtask", { task: "Projekt", title: "Abgabe" }, {});
ok(Store.get().tasks.find((t) => t.id === st.id).subtasks.length === 3, "Subtask via Werkzeug hinzugefuegt");
// Stundenplan: naechste Stunde eines Fachs
Store.setTimetableEntry({ day: "mon", subject: "Mathe", period: 1, start: "08:00", end: "08:45", room: "R1" });
Store.setTimetableEntry({ day: "thu", subject: "Mathe", period: 2, start: "09:00", end: "09:45" });
const nlo = Store.nextLessonOf("Mathe");
ok(nlo && /Mathe/i.test(nlo.entry.subject) && /^\d{4}-\d{2}-\d{2}$/.test(nlo.date) && ["mon", "thu"].includes(nlo.dayKey), "nextLessonOf findet naechste Mathe-Stunde");
ok(Store.nextLessonOf("Chemie") === null, "nextLessonOf ohne Eintrag -> null");
Store.addExam({ subject: "Bio", date: Utils.ymd(Utils.addDays(new Date(), 3)) });
ok(Store.upcomingExams().length === 1, "Test mit Countdown");
const h = Store.addHabit("Sport"); Store.toggleHabitToday(h.id);
ok(Store.habitStreak(h.id) === 1, "Gewohnheit Streak 1");
Store.pomodoroStart(); const adv = Store.pomodoroAdvance();
ok(adv.prev === "work" && Store.focusToday() === 25, "Pomodoro Fokus geloggt");
const v = Store.addVocab({ front: "house", back: "Haus" });
ok(Store.vocabDue().length === 1, "Vokabel faellig"); Store.reviewVocab(v.id, true);
ok(Store.get().vocab[0].box === 2 && Store.vocabDue().length === 0, "Vokabel nach 'gewusst' in Box 2");
await runTool("add_money", { amount: 10, type: "income", label: "Taschengeld" }, {});
await runTool("add_money", { amount: 4, type: "expense" }, {});
ok(Store.balance() === 6, "Budget-Saldo 6");
const snap = Store.snapshot();
ok(snap.includes("NOTENSCHNITT") && snap.includes("KONTOSTAND"), "Snapshot enthaelt Noten + Kontostand");
const dump = Store.exportData(); const before = Store.get().tasks.length; Store.importData(JSON.parse(dump));
ok(Store.get().tasks.length === before, "Export/Import Round-Trip");

console.log(fail === 0 ? "\nALL GREEN" : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
