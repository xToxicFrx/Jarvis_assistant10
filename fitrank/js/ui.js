// ============================================================
// ui.js — Oberfläche (XSS-sicher, ohne innerHTML mit Fremddaten).
// ============================================================
import * as DB from "./db.js";
import { createTracker } from "./tracker.js";
import { renderAvatar, tierForLevel } from "./avatar.js";
import { levelFloorXp } from "./leveling.js";

// Mini-DOM-Helfer (gleiches Muster wie Jarvis utils.el).
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
function mount(node) { const r = $app(); r.replaceChildren(node); }
function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------- Setup-Hinweis, falls Supabase nicht konfiguriert ----------
export function renderNotConfigured() {
  mount(el("div", { class: "card setup" }, [
    el("h1", { text: "FitRank — Einrichtung" }),
    el("p", { text: "Bevor es losgeht, verbinde dein Supabase-Projekt:" }),
    el("ol", {}, [
      el("li", { text: "Kostenloses Projekt auf supabase.com anlegen." }),
      el("li", { text: "db/schema.sql im SQL-Editor von Supabase ausführen." }),
      el("li", { text: "Project URL + anon-Key in js/config.js eintragen." }),
      el("li", { text: "Seite neu laden." }),
    ]),
    el("p", { class: "muted", text: "Beide Keys sind öffentlich/ungefährlich — die Sicherheit kommt aus den RLS-Regeln in der Datenbank." }),
  ]));
}

// ---------- Login / Registrierung ----------
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
    } catch (e) {
      hint.classList.add("err"); hint.textContent = e.message || "Fehlgeschlagen.";
    }
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

// ---------- Dashboard ----------
export async function renderDashboard(session) {
  const userId = session.user.id;
  let profile;
  try { profile = await DB.getMyProfile(userId); }
  catch { profile = { level: 1, xp: 0, stats: {}, username: "athlet" }; }

  const tier = tierForLevel(profile.level);
  const xpInLevel = profile.xp - levelFloorXp(profile.level);
  const xpForNext = levelFloorXp(profile.level + 1) - levelFloorXp(profile.level);

  const header = el("header", { class: "topbar" }, [
    el("div", {}, [el("strong", { text: "FitRank" })]),
    el("button", { class: "linkbtn", text: "Abmelden", onclick: () => DB.signOut() }),
  ]);

  const avatarWrap = el("div", { class: "avatar-wrap" }, renderAvatar(profile, 200));
  const rankBadge = el("div", { class: "rank", text: `${tier.name} · Level ${profile.level}` });
  const xpbar = el("div", { class: "xpbar" }, el("span", { style: `width:${Math.min(100, Math.round(100 * xpInLevel / Math.max(1, xpForNext)))}%` }));
  const xpText = el("div", { class: "muted small", text: `${xpInLevel} / ${xpForNext} XP bis Level ${profile.level + 1}` });

  const stats = profile.stats || {};
  const statRow = el("div", { class: "stats" }, [
    statChip("💪 Kraft", stats.strength || 0),
    statChip("🫁 Ausdauer", stats.endurance || 0),
    statChip("⚡ Speed", stats.speed || 0),
    statChip("🔥 Disziplin", stats.discipline || 0),
  ]);

  const startBtn = el("button", { class: "btn btn--block btn--lg", text: "▶ Training starten", onclick: () => renderLiveWorkout(session, profile) });

  const history = el("div", { class: "history" }, el("p", { class: "muted", text: "Lade Verlauf …" }));
  loadHistory(userId, history);

  mount(el("div", { class: "app-shell" }, [
    header,
    el("div", { class: "hero" }, [avatarWrap, rankBadge, xpbar, xpText]),
    statRow,
    startBtn,
    el("h2", { text: "Letzte Workouts" }),
    history,
  ]));
}

function statChip(label, val) {
  return el("div", { class: "chip" }, [el("span", { class: "chip__v", text: String(val) }), el("span", { class: "chip__l", text: label })]);
}

async function loadHistory(userId, container) {
  try {
    const rows = await DB.recentWorkouts(userId, 15);
    if (!rows.length) { container.replaceChildren(el("p", { class: "muted", text: "Noch keine Workouts — starte dein erstes!" })); return; }
    container.replaceChildren(...rows.map((w) => el("div", { class: "wrow" }, [
      el("span", { class: "wrow__type", text: typeLabel(w.type) }),
      el("span", { class: "wrow__dur", text: `${w.duration_min} min` }),
      el("span", { class: w.verified ? "tag tag--ok" : "tag tag--muted", text: w.verified ? "✓ verifiziert" : "manuell" }),
      el("span", { class: "wrow__xp", text: `+${w.xp_awarded} XP` }),
    ])));
  } catch (e) {
    container.replaceChildren(el("p", { class: "err", text: "Verlauf konnte nicht geladen werden." }));
  }
}
function typeLabel(t) { return ({ lifting: "🏋️ Kraft", run: "🏃 Lauf", cycle: "🚴 Rad", other: "🤸 Sonstiges" })[t] || t; }

// ---------- Live-Workout ----------
async function renderLiveWorkout(session, profile) {
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
  const metaLine = el("div", { class: "muted small", text: "Bereit." });
  const setsBox = el("div", { class: "sets" });
  const setForm = el("div", { class: "setform" });

  // Satz-Eingabe (für Kraft)
  const exSel = el("select", {}, exercises.map((e) => el("option", { value: e.id, text: e.name })));
  const reps = el("input", { type: "number", min: "0", placeholder: "Wdh", inputmode: "numeric" });
  const weight = el("input", { type: "number", min: "0", step: "0.5", placeholder: "kg", inputmode: "decimal" });
  const addSetBtn = el("button", { class: "btn", text: "Satz +" });
  setForm.replaceChildren(exSel, reps, weight, addSetBtn);

  addSetBtn.addEventListener("click", async () => {
    if (!workout) return;
    const r = parseInt(reps.value, 10) || 0;
    const w = parseFloat(weight.value) || 0;
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
      metaLine.textContent = saved.verified
        ? `Verifiziert! +${saved.xp_awarded} XP`
        : `Gespeichert (manuell, +${saved.xp_awarded} XP).`;
      setTimeout(() => renderDashboard(session), 1200);
    } catch (e) { metaLine.textContent = e.message || "Speichern fehlgeschlagen."; }
  });

  setsBox.replaceChildren(el("h3", { text: "Sätze" }), setForm);
  setForm.style.display = "none";

  mount(el("div", { class: "app-shell" }, [
    el("header", { class: "topbar" }, [
      el("button", { class: "linkbtn", text: "‹ Zurück", onclick: () => renderDashboard(session) }),
      el("strong", { text: "Live-Training" }),
    ]),
    el("div", { class: "field" }, [el("label", { text: "Art" }), typeSel]),
    el("div", { class: "card timercard" }, [timer, metaLine]),
    startBtn, finishBtn,
    setsBox,
    el("p", { class: "muted small", text: "Tipp: Bei Lauf/Rad GPS erlauben, sonst Bewegungssensor — nur so zählt das Workout als verifiziert." }),
  ]));
}
