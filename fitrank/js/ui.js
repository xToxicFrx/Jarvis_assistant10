// ============================================================
// ui.js — Oberfläche (XSS-sicher, ohne innerHTML mit Fremddaten).
// Navigation + Views: Home, Training, Fortschritt, Habits + Live-Workout.
// ============================================================
import * as DB from "./db.js";
import { createTracker } from "./tracker.js";
import { renderAvatar, tierForLevel, nextTier, GEAR, GEAR_SLOTS, gearForSlot, isUnlocked } from "./avatar.js";
import { levelFloorXp } from "./leveling.js";
import { computeQuests } from "./quests.js";
import { lineChart, barChart } from "./charts.js";
import { computeStreak, ymd } from "./streaks.js";

// ---------- DOM-Helfer (Muster wie Jarvis utils.el) ----------
function el(tag, attrs, children) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  if (children != null) (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null || c === false) return;
    n.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  });
  return n;
}
const $app = () => document.getElementById("app");
function mount(node) { $app().replaceChildren(node); }
function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

async function getProfile(userId) {
  try { return await DB.getMyProfile(userId); }
  catch { return { id: userId, level: 1, xp: 0, stats: {}, equipped: {}, username: "athlet" }; }
}

// ============================================================
// Statische Ansichten
// ============================================================
export function renderNotConfigured() {
  mount(el("div", { class: "card setup" }, [
    el("h1", { text: "FitRank — Einrichtung" }),
    el("p", { text: "Bevor es losgeht, verbinde dein Supabase-Projekt:" }),
    el("ol", {}, [
      el("li", { text: "Kostenloses Projekt auf supabase.com anlegen." }),
      el("li", { text: "db/schema.sql und db/migration_phase3.sql im SQL-Editor ausführen." }),
      el("li", { text: "Project URL + anon-Key in js/config.js eintragen." }),
      el("li", { text: "Seite neu laden." }),
    ]),
    el("p", { class: "muted", text: "Beide Keys sind öffentlich/ungefährlich — die Sicherheit kommt aus den RLS-Regeln in der Datenbank." }),
  ]));
}

export function renderAuth() {
  let mode = "login";
  const email = el("input", { type: "email", placeholder: "E-Mail", autocomplete: "email" });
  const pass = el("input", { type: "password", placeholder: "Passwort (min. 6 Zeichen)", autocomplete: "current-password" });
  const hint = el("p", { class: "hint" });
  const submit = el("button", { class: "btn btn--block", text: "Anmelden" });
  const toggle = el("button", { class: "linkbtn", text: "Noch kein Konto? Registrieren" });
  const google = el("button", { class: "btn btn--ghost btn--block", text: "Mit Google fortfahren" });

  function setMode(m) {
    mode = m;
    submit.textContent = m === "login" ? "Anmelden" : "Konto erstellen";
    toggle.textContent = m === "login" ? "Noch kein Konto? Registrieren" : "Schon ein Konto? Anmelden";
    hint.textContent = "";
  }
  toggle.addEventListener("click", () => setMode(mode === "login" ? "signup" : "login"));
  submit.addEventListener("click", async () => {
    hint.className = "hint"; hint.textContent = "Moment …";
    try {
      const fn = mode === "login" ? DB.signIn : DB.signUp;
      const { error } = await fn(email.value.trim(), pass.value);
      if (error) throw error;
      if (mode === "signup") { hint.classList.add("ok"); hint.textContent = "Konto erstellt! Prüfe ggf. deine E-Mails zur Bestätigung."; }
    } catch (e) { hint.classList.add("err"); hint.textContent = e.message || "Fehlgeschlagen."; }
  });
  google.addEventListener("click", () => DB.signInWithGoogle().catch((e) => { hint.classList.add("err"); hint.textContent = e.message; }));

  mount(el("div", { class: "card auth" }, [
    el("div", { class: "brand" }, [el("span", { class: "brand__mark", text: "▲" }), el("h1", { text: "FitRank" })]),
    el("p", { class: "tagline", text: "Trainiere echt. Level up. Nichts ist erschummelt." }),
    el("div", { class: "field" }, [el("label", { text: "E-Mail" }), email]),
    el("div", { class: "field" }, [el("label", { text: "Passwort" }), pass]),
    submit, google, hint, toggle,
  ]));
}

// ============================================================
// App-Hülle mit Bottom-Navigation
// ============================================================
const TABS = [
  { id: "home", label: "Home", icon: "🏠" },
  { id: "train", label: "Training", icon: "🏋️" },
  { id: "progress", label: "Fortschritt", icon: "📈" },
  { id: "habits", label: "Habits", icon: "✅" },
];

export function renderDashboard(session) { renderApp(session, "home"); }

function renderApp(session, tab) {
  const content = el("div", { class: "content" }, el("p", { class: "muted", text: "Lädt …" }));
  const nav = el("nav", { class: "bottomnav" }, TABS.map((t) =>
    el("button", { class: "navbtn" + (t.id === tab ? " is-active" : ""), onclick: () => renderApp(session, t.id) }, [
      el("span", { class: "navbtn__i", text: t.icon }),
      el("span", { class: "navbtn__l", text: t.label }),
    ])));

  mount(el("div", { class: "app-shell" }, [
    el("header", { class: "topbar" }, [
      el("strong", { text: "FitRank" }),
      el("button", { class: "linkbtn", text: "Abmelden", onclick: () => DB.signOut() }),
    ]),
    content, nav,
  ]));

  const view = { home: viewHome, train: viewTrain, progress: viewProgress, habits: viewHabits }[tab];
  view(session, content);
}

// ============================================================
// HOME — Avatar, XP, Stats, Quests, Gear
// ============================================================
async function viewHome(session, root) {
  const userId = session.user.id;
  const profile = await getProfile(userId);
  let workouts = [];
  try { workouts = await DB.recentWorkouts(userId, 50); } catch {}

  const tier = tierForLevel(profile.level);
  const floor = levelFloorXp(profile.level), nextFloor = levelFloorXp(profile.level + 1);
  const inLevel = profile.xp - floor, forNext = nextFloor - floor;

  const hero = el("div", { class: "hero" }, [
    el("div", { class: "avatar-wrap" }, renderAvatar(profile, 200)),
    el("div", { class: "rank", text: `${tier.name} · Level ${profile.level}` }),
    el("div", { class: "xpbar" }, el("span", { class: "xpbar__fill", "data-pct": Math.min(100, Math.round(100 * inLevel / Math.max(1, forNext))) })),
    el("div", { class: "muted small", text: `${inLevel} / ${forNext} XP bis Level ${profile.level + 1}` }),
  ]);

  const stats = profile.stats || {};
  const statRow = el("div", { class: "stats" }, [
    statChip("💪", "Kraft", stats.strength || 0),
    statChip("🫁", "Ausdauer", stats.endurance || 0),
    statChip("⚡", "Speed", stats.speed || 0),
    statChip("🔥", "Disziplin", stats.discipline || 0),
  ]);

  // Quests
  const quests = computeQuests(workouts);
  const questList = el("div", { class: "quests" }, quests.map((q) => el("div", { class: "quest" + (q.done ? " is-done" : "") }, [
    el("div", { class: "quest__top" }, [
      el("span", { text: (q.done ? "✓ " : "") + q.title }),
      el("span", { class: "tag " + (q.kind === "daily" ? "tag--day" : "tag--week"), text: q.kind === "daily" ? "täglich" : "Woche" }),
    ]),
    el("div", { class: "minixp" }, el("span", { class: "minixp__fill", "data-pct": q.pct })),
    el("div", { class: "muted small", text: `${q.progress} / ${q.goal}` }),
  ])));

  // Gear
  const gearSection = renderGearSection(session, profile, root);

  // KI-Coach
  const coachSection = renderCoachSection();

  root.replaceChildren(
    hero, statRow,
    el("button", { class: "btn btn--block btn--lg", text: "▶ Training starten", onclick: () => openWorkout(session, null) }),
    el("h2", { text: "Quests" }), questList,
    el("h2", { text: "Dein KI-Coach" }), coachSection,
    el("h2", { text: "Ausrüstung" }), gearSection,
  );
  applyBars(root);
}

function statChip(icon, label, val) {
  return el("div", { class: "chip" }, [
    el("span", { class: "chip__v", text: String(val) }),
    el("span", { class: "chip__l", text: `${icon} ${label}` }),
  ]);
}

function renderGearSection(session, profile, homeRoot) {
  const userId = session.user.id;
  const level = profile.level;
  const equipped = { ...(profile.equipped || {}) };

  const wrap = el("div", { class: "gear" });
  GEAR_SLOTS.forEach((slot) => {
    const items = gearForSlot(slot);
    const row = el("div", { class: "gear__row" }, [el("div", { class: "gear__slot", text: slotLabel(slot) })]);
    const opts = el("div", { class: "gear__opts" });
    // "Keins"-Option
    opts.appendChild(gearOption("—", !equipped[slot], false, async () => {
      delete equipped[slot]; await save();
    }));
    items.forEach((item) => {
      const unlocked = isUnlocked(item, level);
      opts.appendChild(gearOption(item.name + (unlocked ? "" : ` · Lvl ${item.minLevel}`),
        equipped[slot] === item.id, !unlocked, async () => {
          if (!unlocked) return;
          equipped[slot] = item.id; await save();
        }));
    });
    row.appendChild(opts);
    wrap.appendChild(row);
  });

  async function save() {
    try {
      await DB.updateProfile(userId, { equipped });
      // Home neu rendern, damit Avatar + Auswahl aktualisiert werden.
      viewHome(session, homeRoot);
    } catch (e) { /* still */ }
  }
  return wrap;
}
function renderCoachSection() {
  const out = el("div", { class: "coach-out muted small", text: "Hol dir einen Tipp basierend auf deinen letzten verifizierten Workouts." });
  const btn = el("button", { class: "btn btn--ghost btn--block", text: "🤖 Coach-Tipp holen" });
  btn.addEventListener("click", async () => {
    btn.setAttribute("disabled", "");
    out.className = "coach-out muted small"; out.textContent = "Coach denkt nach …";
    try {
      const { advice } = await DB.getCoachAdvice();
      out.className = "coach-out"; out.textContent = advice;
    } catch (e) {
      out.className = "coach-out err small"; out.textContent = e.message || "Coach nicht erreichbar.";
    } finally { btn.removeAttribute("disabled"); }
  });
  return el("div", { class: "card coach" }, [out, btn]);
}
function slotLabel(slot) { return ({ headband: "Kopf", cape: "Umhang", aura: "Aura" })[slot] || slot; }
function gearOption(label, active, locked, onClick) {
  return el("button", {
    class: "gearopt" + (active ? " is-active" : "") + (locked ? " is-locked" : ""),
    text: (locked ? "🔒 " : "") + label, onclick: onClick,
  });
}

// ============================================================
// TRAINING — freies Training + Pläne (Routinen)
// ============================================================
async function viewTrain(session, root) {
  const userId = session.user.id;
  let routines = [], exercises = [];
  try { [routines, exercises] = await Promise.all([DB.listRoutines(userId), DB.listExercises()]); } catch {}

  const list = el("div", { class: "routines" });
  if (!routines.length) list.appendChild(el("p", { class: "muted", text: "Noch keine Pläne. Erstelle deinen ersten Split!" }));
  routines.forEach((r) => list.appendChild(routineCard(session, r, exercises)));

  const nameInput = el("input", { placeholder: "z.B. Push, Pull, Beine" });
  const createBtn = el("button", { class: "btn", text: "+ Plan" });
  createBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) return;
    try { await DB.createRoutine(userId, name); viewTrain(session, root); } catch (e) {}
  });

  root.replaceChildren(
    el("button", { class: "btn btn--block btn--lg", text: "▶ Freies Training starten", onclick: () => openWorkout(session, null) }),
    el("h2", { text: "Meine Trainingspläne" }),
    el("div", { class: "setform setform--plan" }, [nameInput, createBtn]),
    list,
  );
}

function routineCard(session, routine, exercises) {
  const userId = session.user.id;
  const body = el("div", { class: "routine__body" }, el("p", { class: "muted small", text: "Lädt …" }));
  let open = false;

  async function loadBody() {
    let rex = [];
    try { rex = await DB.listRoutineExercises(routine.id); } catch {}
    const items = el("div", {}, rex.length
      ? rex.map((x) => el("div", { class: "setrow" }, [
          el("span", { text: `${x.exercises?.name || "Übung"} — ${x.target_sets}×${x.target_reps}` }),
          el("button", { class: "linkbtn", text: "✕", onclick: async () => { await DB.removeRoutineExercise(x.id); loadBody(); } }),
        ]))
      : [el("p", { class: "muted small", text: "Noch keine Übungen im Plan." })]);

    // Übung hinzufügen
    const exSel = el("select", {}, exercises.map((e) => el("option", { value: e.id, text: e.name })));
    const sets = el("input", { type: "number", min: "1", value: "3", inputmode: "numeric" });
    const reps = el("input", { type: "number", min: "1", value: "10", inputmode: "numeric" });
    const addBtn = el("button", { class: "btn", text: "+" });
    addBtn.addEventListener("click", async () => {
      try {
        await DB.addRoutineExercise(userId, routine.id, exSel.value, parseInt(sets.value) || 3, parseInt(reps.value) || 10, rex.length);
        loadBody();
      } catch (e) {}
    });

    body.replaceChildren(
      items,
      el("div", { class: "setform" }, [exSel, sets, reps, addBtn]),
      el("div", { class: "routine__actions" }, [
        el("button", { class: "btn btn--block", text: "▶ Diesen Plan starten", onclick: () => openWorkout(session, { name: routine.name, exercises: rex }) }),
        el("button", { class: "linkbtn", text: "Plan löschen", onclick: async () => { await DB.deleteRoutine(routine.id); const c = body.closest(".content"); if (c) viewTrain(session, c); } }),
      ]),
    );
  }

  const head = el("button", { class: "routine__head", onclick: () => { open = !open; body.style.display = open ? "" : "none"; if (open) loadBody(); } }, [
    el("strong", { text: routine.name }), el("span", { class: "muted", text: "bearbeiten ▾" }),
  ]);
  body.style.display = "none";
  return el("div", { class: "routine card" }, [head, body]);
}

// ============================================================
// FORTSCHRITT — Körpergewicht-Chart + Wochen-Volumen
// ============================================================
async function viewProgress(session, root) {
  const userId = session.user.id;
  let metrics = [], workouts = [];
  try { [metrics, workouts] = await Promise.all([DB.listBodyMetrics(userId), DB.recentWorkouts(userId, 100)]); } catch {}

  // Gewichtsverlauf
  const points = metrics.filter((m) => m.weight != null).map((m) => ({ label: m.date, value: Number(m.weight) }));

  // Wochen-Volumen (Minuten pro Wochentag)
  const ws = startOfWeekLocal();
  const perDay = [0, 0, 0, 0, 0, 0, 0];
  workouts.forEach((w) => {
    if (!w.ended_at) return;
    const d = new Date(w.ended_at);
    if (d >= ws) perDay[(d.getDay() + 6) % 7] += w.duration_min || 0;
  });
  const bars = WEEKDAYS.map((lbl, i) => ({ label: lbl, value: perDay[i] }));

  // Gewicht eintragen
  const weightInput = el("input", { type: "number", step: "0.1", min: "0", placeholder: "kg", inputmode: "decimal" });
  const saveBtn = el("button", { class: "btn", text: "Speichern" });
  const hint = el("span", { class: "muted small" });
  saveBtn.addEventListener("click", async () => {
    const w = parseFloat(weightInput.value);
    if (!w) return;
    try { await DB.addBodyMetric(userId, ymd(new Date()), w); hint.textContent = "Gespeichert ✓"; viewProgress(session, root); }
    catch (e) { hint.textContent = e.message || "Fehler"; }
  });

  root.replaceChildren(
    el("h2", { text: "Körpergewicht" }),
    el("div", { class: "card" }, lineChart(points, { height: 150 })),
    el("div", { class: "setform setform--plan" }, [weightInput, saveBtn, hint]),
    el("h2", { text: "Diese Woche — Minuten/Tag" }),
    el("div", { class: "card" }, barChart(bars, { height: 150 })),
  );
}

function startOfWeekLocal(now = new Date()) {
  const d = new Date(now); const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day); return d;
}

// ============================================================
// HABITS — tägliche Gewohnheiten + Streaks
// ============================================================
async function viewHabits(session, root) {
  const userId = session.user.id;
  let habits = [], logs = [];
  const since = ymd(new Date(Date.now() - 90 * 86400000));
  try { [habits, logs] = await Promise.all([DB.listHabits(userId), DB.listHabitLogs(userId, since)]); } catch {}

  const today = ymd(new Date());
  const logsByHabit = new Map();
  logs.forEach((l) => { if (!logsByHabit.has(l.habit_id)) logsByHabit.set(l.habit_id, new Set()); logsByHabit.get(l.habit_id).add(l.date); });

  const list = el("div", { class: "habits" });
  if (!habits.length) list.appendChild(el("p", { class: "muted", text: "Noch keine Habits. Lege z.B. „Wasser“, „Dehnen“, „Schlaf 8h“ an." }));
  habits.forEach((h) => {
    const dates = logsByHabit.get(h.id) || new Set();
    const doneToday = dates.has(today);
    const streak = computeStreak(dates);
    const row = el("div", { class: "habit card" }, [
      el("button", { class: "habit__check" + (doneToday ? " is-on" : ""), text: doneToday ? "✓" : "", onclick: async () => {
        try {
          if (doneToday) await DB.unlogHabit(h.id, today); else await DB.logHabit(userId, h.id, today);
          viewHabits(session, root);
        } catch (e) {}
      } }),
      el("div", { class: "habit__main" }, [
        el("strong", { text: `${h.icon || "•"} ${h.name}` }),
        el("div", { class: "muted small", text: `🔥 ${streak} Tage Streak` }),
      ]),
      el("button", { class: "linkbtn", text: "✕", onclick: async () => { await DB.deleteHabit(h.id); viewHabits(session, root); } }),
    ]);
    list.appendChild(row);
  });

  const iconInput = el("input", { placeholder: "Emoji", value: "💧", maxlength: "2", class: "habit__icon-in" });
  const nameInput = el("input", { placeholder: "z.B. Wasser trinken" });
  const addBtn = el("button", { class: "btn", text: "+" });
  addBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim(); if (!name) return;
    try { await DB.createHabit(userId, name, iconInput.value.trim() || "•"); viewHabits(session, root); } catch (e) {}
  });

  root.replaceChildren(
    el("h2", { text: "Tägliche Habits" }),
    el("div", { class: "setform setform--habit" }, [iconInput, nameInput, addBtn]),
    list,
  );
}

// ============================================================
// LIVE-WORKOUT (Vollbild) — optional mit Plan-Vorlage
// ============================================================
async function openWorkout(session, plan) {
  const userId = session.user.id;
  const tracker = createTracker();
  let workout = null;
  let exercises = [];
  try { exercises = await DB.listExercises(); } catch {}

  const typeSel = el("select", {}, [
    el("option", { value: "lifting", text: "🏋️ Kraft" }),
    el("option", { value: "run", text: "🏃 Lauf (GPS)" }),
    el("option", { value: "cycle", text: "🚴 Rad (GPS)" }),
    el("option", { value: "other", text: "🤸 Sonstiges" }),
  ]);
  const timer = el("div", { class: "bigtimer", text: "00:00" });
  const metaLine = el("div", { class: "muted small", text: plan ? `Plan: ${plan.name}` : "Bereit." });
  const setsBox = el("div", { class: "sets" });

  const exSel = el("select", {}, exercises.map((e) => el("option", { value: e.id, text: e.name })));
  const reps = el("input", { type: "number", min: "0", placeholder: "Wdh", inputmode: "numeric" });
  const weight = el("input", { type: "number", min: "0", step: "0.5", placeholder: "kg", inputmode: "decimal" });
  const addSetBtn = el("button", { class: "btn", text: "Satz +" });
  const setForm = el("div", { class: "setform" }, [exSel, reps, weight, addSetBtn]);

  // Plan-Vorlage: geplante Übungen als Schnellauswahl
  let planChips = null;
  if (plan && plan.exercises && plan.exercises.length) {
    planChips = el("div", { class: "planchips" }, plan.exercises.map((x) =>
      el("button", { class: "planchip", text: `${x.exercises?.name || "Übung"} ${x.target_sets}×${x.target_reps}`,
        onclick: () => { exSel.value = x.exercise_id; reps.value = x.target_reps; } })));
  }

  addSetBtn.addEventListener("click", async () => {
    if (!workout) { metaLine.textContent = "Erst „Los!“ drücken."; return; }
    const r = parseInt(reps.value, 10) || 0, w = parseFloat(weight.value) || 0;
    try {
      const set = await DB.addSet(userId, workout.id, exSel.value, r, w);
      const name = exercises.find((e) => e.id === exSel.value)?.name || "Übung";
      setsBox.appendChild(el("div", { class: "setrow" }, [
        el("span", { text: `${name}: ${r}×${w}kg` }),
        set.is_pr ? el("span", { class: "tag tag--pr", text: "🏆 PR!" }) : null,
      ]));
      reps.value = ""; weight.value = "";
    } catch (e) { metaLine.textContent = e.message; }
  });

  const startBtn = el("button", { class: "btn btn--block btn--lg", text: "▶ Los!" });
  const finishBtn = el("button", { class: "btn btn--block btn--lg btn--danger", text: "■ Beenden & Speichern", disabled: "" });

  tracker.subscribe((st) => {
    timer.textContent = fmtTime(st.elapsedSec);
    const bits = [];
    if (st.hasGps) bits.push(`${(st.distanceM / 1000).toFixed(2)} km`);
    if (st.hasMotion) bits.push(`~${st.steps} Bewegungen`);
    bits.push(st.source === "manual" ? "noch unverifiziert" : "✓ Sensor aktiv");
    metaLine.textContent = bits.join(" · ");
  });

  startBtn.addEventListener("click", async () => {
    const type = typeSel.value;
    try {
      workout = await DB.startWorkout(userId, type, type === "run" || type === "cycle" ? "gps" : "motion");
      await tracker.start(type);
      startBtn.setAttribute("disabled", ""); typeSel.setAttribute("disabled", "");
      finishBtn.removeAttribute("disabled");
      setForm.style.display = type === "lifting" ? "" : "none";
    } catch (e) { metaLine.textContent = e.message || "Start fehlgeschlagen."; }
  });

  finishBtn.addEventListener("click", async () => {
    if (!workout) return;
    finishBtn.setAttribute("disabled", "");
    const result = tracker.stop();
    try {
      const saved = await DB.finishWorkout(workout.id, result.distanceM);
      metaLine.textContent = saved.verified ? `Verifiziert! +${saved.xp_awarded} XP` : `Gespeichert (manuell, +${saved.xp_awarded} XP).`;
      setTimeout(() => renderApp(session, "home"), 1200);
    } catch (e) { metaLine.textContent = e.message || "Speichern fehlgeschlagen."; }
  });

  setsBox.replaceChildren(el("h3", { text: "Sätze" }), planChips || el("span"), setForm);
  setForm.style.display = "none";

  mount(el("div", { class: "app-shell" }, [
    el("header", { class: "topbar" }, [
      el("button", { class: "linkbtn", text: "‹ Zurück", onclick: () => renderApp(session, "home") }),
      el("strong", { text: "Live-Training" }),
    ]),
    el("div", { class: "field" }, [el("label", { text: "Art" }), typeSel]),
    el("div", { class: "card timercard" }, [timer, metaLine]),
    startBtn, finishBtn,
    setsBox,
    el("p", { class: "muted small", text: "Tipp: Bei Lauf/Rad GPS erlauben, sonst Bewegungssensor — nur so zählt das Workout als verifiziert." }),
  ]));
}

// ---------- Fortschrittsbalken-Breiten setzen (CSP-freundlich, ohne Inline-Style-String) ----------
function applyBars(root) {
  root.querySelectorAll("[data-pct]").forEach((bar) => { bar.style.width = `${bar.getAttribute("data-pct")}%`; });
}
