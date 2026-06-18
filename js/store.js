// ============================================================
// store.js — die EINZIGE Datenquelle der App.
//
// Haelt den gesamten Zustand (Aufgaben, Hausaufgaben, Stundenplan,
// Erinnerungen, Noten, Tests, Gewohnheiten, Notizen, Termine, Ziele,
// Pomodoro). Sichert sofort lokal (localStorage) und synchronisiert
// debounced mit der Cloud (/api/state) — optional Ende-zu-Ende
// verschluesselt (siehe crypto.js). UI und Werkzeuge aendern Daten
// NUR ueber diese Funktionen, damit alles gespeichert und neu
// gezeichnet wird.
// ============================================================
window.Store = (function () {
  const U = window.Utils;
  const LS_KEY = "jarvis_state_v2";
  const SAVE_DEBOUNCE = 800;
  const DAYS = CONST.WEEKDAYS;

  let state = defaultState();
  let subscribers = [];
  let saveTimer = null;
  let pendingCloud = false;
  let cloudEnabled = false;
  let currentSalt = null;

  function defaultState() {
    return {
      v: 2,
      updatedAt: Date.now(),
      settings: Object.assign({}, CONST.DEFAULT_SETTINGS),
      tasks: [],
      timetable: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
      reminders: [],
      grades: [],
      exams: [],
      habits: [],
      notes: [],
      events: [],
      goals: [],
      vocab: [],
      budget: [],
      pomodoro: { running: false, phase: "idle", endsAt: 0, remainingMs: 0, cycle: 0, settings: Object.assign({}, CONST.POMODORO_DEFAULTS), history: [] },
    };
  }

  // Sorgt dafuer, dass jeder geladene Stand alle Felder hat (sichere Defaults).
  function migrate(s) {
    const d = defaultState();
    const tt = Object.assign({}, d.timetable);
    if (s.timetable) for (const k of DAYS) if (Array.isArray(s.timetable[k])) tt[k] = s.timetable[k];
    const pom = Object.assign({}, d.pomodoro, s.pomodoro || {});
    pom.settings = Object.assign({}, d.pomodoro.settings, (s.pomodoro && s.pomodoro.settings) || {});
    if (!Array.isArray(pom.history)) pom.history = [];
    return {
      v: 2,
      updatedAt: s.updatedAt || Date.now(),
      settings: Object.assign({}, d.settings, s.settings || {}),
      tasks: arr(s.tasks), timetable: tt, reminders: arr(s.reminders),
      grades: arr(s.grades).map((g) => Object.assign({ scale: "grade", category: null }, g)), exams: arr(s.exams).map((e) => Object.assign({ plan: null }, e)), habits: arr(s.habits),
      notes: arr(s.notes), events: arr(s.events), goals: arr(s.goals),
      vocab: arr(s.vocab), budget: arr(s.budget),
      pomodoro: pom,
    };
  }
  function arr(x) { return Array.isArray(x) ? x : []; }

  // ---- Speichern / Sync ----
  function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }
  function notify() { subscribers.forEach((cb) => { try { cb(state); } catch (e) {} }); }
  function subscribe(cb) { subscribers.push(cb); return () => { subscribers = subscribers.filter((x) => x !== cb); }; }

  function touched() {
    state.updatedAt = Date.now();
    saveLocal();
    scheduleCloud();
    notify();
  }
  function patch(fn) { fn(state); touched(); return state; }

  async function cloudGet() {
    const d = await Auth.apiFetch("/api/state", { method: "GET" });
    cloudEnabled = !!d.cloud;
    return d; // {cloud, data?, updatedAt?, salt?}
  }
  async function cloudPut() {
    if (!cloudEnabled) return;
    try {
      let data = state;
      const key = Auth.key();
      if (state.settings.encryptCloud && Enc.available && key) data = await Enc.encrypt(state, key);
      const res = await Auth.apiFetch("/api/state", { method: "PUT", json: { data, updatedAt: state.updatedAt, salt: currentSalt } });
      if (res && res.cloud === false) { cloudEnabled = false; return; }
      pendingCloud = false;
    } catch (e) { pendingCloud = true; }
  }
  function scheduleCloud() {
    if (!cloudEnabled) return;
    pendingCloud = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(cloudPut, SAVE_DEBOUNCE);
  }

  async function adoptRemote(resp) {
    // resp.data ist entweder Klartext-Objekt oder ein Verschluesselungs-Umschlag.
    let remote = resp.data;
    if (Enc.isEnvelope(remote)) {
      const key = await Auth.restoreKey() || Auth.key();
      if (!key) return false; // kein Schluessel -> nicht entschluesselbar
      try { remote = await Enc.decrypt(remote, key); } catch (e) { return false; }
    }
    if (!remote || typeof remote !== "object") return false;
    state = migrate(remote);
    saveLocal();
    notify();
    return true;
  }

  async function init() {
    // 1) Lokalen Stand sofort laden + zeigen
    try { const cached = JSON.parse(localStorage.getItem(LS_KEY) || "null"); if (cached && cached.v) state = migrate(cached); } catch (e) {}
    archiveOld();
    rollRecurring();
    notify();

    // 2) Cloud abgleichen
    try {
      const resp = await cloudGet();
      if (!resp.cloud) return state; // nur lokal

      // Salt bestimmen (fuer Verschluesselung). Vom Server, sonst neu.
      currentSalt = resp.salt || Auth.saltB64() || (Enc.available ? Enc.genSaltB64() : null);
      if (state.settings.encryptCloud && Enc.available && currentSalt && !Auth.key()) {
        if (Auth.password()) await Auth.deriveAndStoreKey(currentSalt);
        else await Auth.restoreKey();
      }
      Auth.clearPassword(); // Passwort wird nicht mehr gebraucht

      const remoteUpdated = resp.data ? (resp.updatedAt || 0) : -1;
      if (remoteUpdated < 0) { await cloudPut(); }            // Cloud leer -> hochladen
      else if (remoteUpdated >= (state.updatedAt || 0)) { if (!(await adoptRemote(resp))) await cloudPut(); }
      else { await cloudPut(); }                               // lokal neuer -> hochladen
    } catch (e) { /* offline -> lokal weiter */ }

    window.addEventListener("online", () => { if (pendingCloud) cloudPut(); });
    return state;
  }

  // ============================================================
  // Aufgaben (todo + homework, mit Wiederholung)
  // ============================================================
  function subList(arr) { return Array.isArray(arr) ? arr.map((x) => x && { id: x.id || U.uid(), title: String(x.title != null ? x.title : "").trim(), done: !!x.done }).filter((x) => x && x.title) : []; }
  function addTask(t) {
    const subject = t.subject ? String(t.subject).trim() : null;
    const dueMode = t.dueMode === "nextLesson" ? "nextLesson" : "date";
    let due = t.due || null;
    if (dueMode === "nextLesson" && subject) { const nl = nextLessonOf(subject); if (nl) due = nl.date; }
    const task = {
      id: U.uid(),
      title: String(t.title || "").trim(),
      type: t.type === "homework" ? "homework" : "todo",
      subject,
      due,
      dueMode,
      priority: CONST.PRIORITIES.includes(t.priority) ? t.priority : "med",
      repeat: t.repeat && ["daily", "weekly"].includes(t.repeat.freq) ? { freq: t.repeat.freq } : null,
      done: false, doneAt: null,
      notes: t.notes ? String(t.notes) : null,
      subtasks: subList(t.subtasks),
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    patch((s) => s.tasks.push(task));
    return task;
  }
  function toggleSubtask(ref, subId) { const t = findTask(ref); if (!t || !Array.isArray(t.subtasks)) return null; patch(() => { const sd = t.subtasks.find((x) => x.id === subId); if (sd) { sd.done = !sd.done; t.updatedAt = Date.now(); } }); return t; }
  function findTask(ref) {
    if (!ref) return null;
    const byId = state.tasks.find((x) => x.id === ref);
    if (byId) return byId;
    const q = String(ref).toLowerCase();
    return state.tasks.find((x) => !x.done && x.title.toLowerCase().includes(q)) || state.tasks.find((x) => x.title.toLowerCase().includes(q)) || null;
  }
  function nextDue(dueYMD, freq) {
    let d = U.parseYMD(dueYMD) || new Date();
    const step = freq === "weekly" ? 7 : 1;
    do { d = U.addDays(d, step); } while (U.daysUntil(U.ymd(d)) < 0);
    return U.ymd(d);
  }
  function completeTask(ref) {
    const t = findTask(ref);
    if (!t) return null;
    patch(() => {
      if (t.repeat && t.due) { t.due = nextDue(t.due, t.repeat.freq); t.doneAt = Date.now(); }
      else { t.done = true; t.doneAt = Date.now(); }
      t.updatedAt = Date.now();
    });
    return t;
  }
  function updateTask(ref, c) {
    const t = findTask(ref);
    if (!t) return null;
    patch(() => {
      if (c.title != null && c.title !== "") t.title = String(c.title).trim();
      if (c.due !== undefined) t.due = c.due || null;
      if (c.priority && CONST.PRIORITIES.includes(c.priority)) t.priority = c.priority;
      if (c.subject !== undefined) t.subject = c.subject ? String(c.subject).trim() : null;
      if (c.type) t.type = c.type === "homework" ? "homework" : "todo";
      if (c.notes !== undefined) t.notes = c.notes || null;
      if (c.repeat !== undefined) t.repeat = c.repeat && ["daily", "weekly"].includes(c.repeat.freq) ? { freq: c.repeat.freq } : null;
      if (c.subtasks !== undefined) t.subtasks = subList(c.subtasks);
      if (c.dueMode !== undefined) t.dueMode = c.dueMode === "nextLesson" ? "nextLesson" : "date";
      // Bei "naechste Stunde" das Faelligkeitsdatum aus dem Stundenplan ableiten.
      if (t.dueMode === "nextLesson" && t.subject) { const nl = nextLessonOf(t.subject); if (nl) t.due = nl.date; }
      if (c.done !== undefined) { t.done = !!c.done; t.doneAt = c.done ? Date.now() : null; }
      t.updatedAt = Date.now();
    });
    return t;
  }
  function removeTask(ref) { const t = findTask(ref); if (!t) return null; patch((s) => { s.tasks = s.tasks.filter((x) => x.id !== t.id); }); return t; }
  function archiveOld() {
    const cutoff = Date.now() - 30 * 86400000;
    const kept = state.tasks.filter((t) => !(t.done && !t.repeat && t.doneAt && t.doneAt < cutoff));
    if (kept.length !== state.tasks.length) { state.tasks = kept; saveLocal(); }
  }
  function rollRecurring() {
    let changed = false;
    state.tasks.forEach((t) => { if (t.repeat && t.due && !t.done && U.daysUntil(t.due) < 0) { t.due = nextDue(t.due, t.repeat.freq); changed = true; } });
    if (changed) saveLocal();
  }

  // ============================================================
  // Erinnerungen
  // ============================================================
  function addReminder(text, at) { const r = { id: U.uid(), text: String(text || "").trim(), at: Number(at), fired: false, createdAt: Date.now() }; patch((s) => s.reminders.push(r)); return r; }
  function removeReminder(id) { patch((s) => { s.reminders = s.reminders.filter((r) => r.id !== id); }); }
  function markReminderFired(id) { const r = state.reminders.find((x) => x.id === id); if (r && !r.fired) patch(() => { r.fired = true; }); }

  // ============================================================
  // Stundenplan
  // ============================================================
  function dayKey(d) {
    if (!d) return null;
    const x = String(d).trim().toLowerCase();
    const table = { mon: "mon", montag: "mon", monday: "mon", mo: "mon", tue: "tue", dienstag: "tue", tuesday: "tue", di: "tue", wed: "wed", mittwoch: "wed", wednesday: "wed", mi: "wed", thu: "thu", donnerstag: "thu", thursday: "thu", do: "thu", fri: "fri", freitag: "fri", friday: "fri", fr: "fri", sat: "sat", samstag: "sat", saturday: "sat", sa: "sat", sun: "sun", sonntag: "sun", sunday: "sun", so: "sun" };
    return table[x] || (DAYS.includes(x.slice(0, 3)) ? x.slice(0, 3) : null);
  }
  function setTimetableEntry(e) {
    const dk = dayKey(e.day);
    if (!dk) return null;
    const entry = { id: U.uid(), period: e.period != null && e.period !== "" ? Number(e.period) : null, subject: String(e.subject || "").trim(), room: e.room ? String(e.room).trim() : null, start: e.start || null, end: e.end || null };
    patch((s) => { s.timetable[dk] = s.timetable[dk] || []; s.timetable[dk].push(entry); s.timetable[dk].sort((a, b) => (a.period || 99) - (b.period || 99) || String(a.start || "").localeCompare(String(b.start || ""))); });
    return { dayKey: dk, entry };
  }
  function removeTimetableEntry(dk, id) { patch((s) => { if (s.timetable[dk]) s.timetable[dk] = s.timetable[dk].filter((x) => x.id !== id); }); }
  // Naechstes Vorkommen eines Fachs im Stundenplan ab heute (bis 14 Tage). Heute nur, wenn die Stunde noch nicht begonnen hat.
  function nextLessonOf(subject, fromDate) {
    if (!subject) return null;
    const q = String(subject).trim().toLowerCase(); if (!q) return null;
    const base = fromDate ? new Date(fromDate) : new Date();
    const nowClock = U.fmtClock(base);
    for (let i = 0; i < 14; i++) {
      const d = U.addDays(base, i), dk = U.weekdayKey(d);
      const list = state.timetable[dk] || [];
      for (const e of list) {
        if (!e.subject || !e.subject.toLowerCase().includes(q)) continue;
        if (i === 0 && e.start && e.start <= nowClock) continue; // heute schon vorbei
        return { dayKey: dk, date: U.ymd(d), entry: e };
      }
    }
    return null;
  }
  // Heutige naechste (laufende/kommende) Stunde anhand der Uhrzeit.
  function nextLessonNow() {
    const now = new Date(), dk = U.weekdayKey(now), nowClock = U.fmtClock(now);
    const list = (state.timetable[dk] || []).filter((e) => e.start);
    for (const e of list) {
      if ((e.end || e.start) > nowClock) {
        const [h, m] = e.start.split(":").map(Number);
        const nowMin = now.getHours() * 60 + now.getMinutes();
        return { dayKey: dk, entry: e, startsInMin: Math.max(0, (h * 60 + m) - nowMin) };
      }
    }
    return null;
  }

  // ============================================================
  // Noten
  // ============================================================
  // Notenskala/Kategorie-Helfer
  function gradeScaleInfo(scale) { return CONST.GRADE_SCALES[scale] || CONST.GRADE_SCALES.grade; }
  function catWeight(catId) { const c = (CONST.GRADE_CATEGORIES || []).find((x) => x.id === catId); return c ? (c.weight || 1) : 1; }
  function effWeight(g) { return (g.weight || 1) * catWeight(g.category); }
  // Anzeige-Skala eines Fachs: Mehrheit der Noten, sonst globale Einstellung.
  function scaleOf(subject) {
    const list = state.grades.filter((g) => g.subject === subject);
    if (!list.length) return state.settings.gradeScale || "grade";
    let p = 0, gr = 0; list.forEach((g) => { (g.scale === "points" ? (p++) : (gr++)); });
    return p > gr ? "points" : "grade";
  }
  function addGrade(g) {
    const scale = g.scale === "points" ? "points" : (g.scale === "grade" ? "grade" : (state.settings.gradeScale || "grade"));
    const sc = gradeScaleInfo(scale);
    const value = U.clamp(Number(g.value), sc.min, sc.max);
    const category = g.category && (CONST.GRADE_CATEGORIES || []).some((c) => c.id === g.category) ? g.category : null;
    const grade = { id: U.uid(), subject: String(g.subject || "").trim() || "Sonstige", value, weight: g.weight ? Number(g.weight) : 1, label: g.label ? String(g.label).trim() : null, scale, category, date: g.date || U.todayYMD(), createdAt: Date.now() };
    patch((s) => s.grades.push(grade));
    return grade;
  }
  function removeGrade(id) { patch((s) => { s.grades = s.grades.filter((x) => x.id !== id); }); }
  function subjectAverage(subject) {
    const list = state.grades.filter((g) => g.subject === subject);
    if (!list.length) return null;
    let sum = 0, w = 0; list.forEach((g) => { const ew = effWeight(g); sum += g.value * ew; w += ew; });
    return w ? U.round(sum / w, 2) : null;
  }
  function subjectAverages() { const map = {}; gradeSubjects().forEach((s) => { map[s] = subjectAverage(s); }); return map; }
  function gradeSubjects() { return [...new Set(state.grades.map((g) => g.subject))].sort(); }
  // Gesamtschnitt nur ueber Faecher der aktiven Skala (gemischte Skalen sind nicht vergleichbar).
  function overallAverage() {
    const scale = state.settings.gradeScale || "grade";
    const vals = gradeSubjects().filter((s) => scaleOf(s) === scale).map(subjectAverage).filter((x) => x != null);
    if (!vals.length) return null;
    return U.round(vals.reduce((x, y) => x + y, 0) / vals.length, 2);
  }
  // Notenziel-Rechner: effektiv gewichtete Summe/Gewicht eines Fachs.
  function gradeSumWeight(subject) { let sum = 0, w = 0; state.grades.filter((g) => g.subject === subject).forEach((g) => { const ew = effWeight(g); sum += g.value * ew; w += ew; }); return { sum, w }; }
  // Welche Note (Hoechstwert) brauchst du in der naechsten Arbeit (Gewicht), um Ziel-Schnitt zu erreichen?
  function neededGrade(subject, target, weight) { const { sum, w } = gradeSumWeight(subject); weight = Number(weight) || 1; return U.round((Number(target) * (w + weight) - sum) / weight, 2); }
  // Welcher Schnitt ergibt sich, wenn die naechste Note "value" (Gewicht) ist?
  function projectedAverage(subject, value, weight) { const { sum, w } = gradeSumWeight(subject); weight = Number(weight) || 1; return U.round((sum + Number(value) * weight) / (w + weight), 2); }

  // ============================================================
  // Tests / Klassenarbeiten
  // ============================================================
  function addExam(e) { const ex = { id: U.uid(), subject: String(e.subject || "").trim() || "Sonstige", title: e.title ? String(e.title).trim() : null, date: e.date, note: e.note ? String(e.note).trim() : null, plan: null, createdAt: Date.now() }; patch((s) => s.exams.push(ex)); return ex; }
  function removeExam(id) { patch((s) => { s.exams = s.exams.filter((x) => x.id !== id); }); }
  function upcomingExams(limit = 50) { return state.exams.filter((e) => U.daysUntil(e.date) !== null && U.daysUntil(e.date) >= -1).sort((a, b) => U.daysUntil(a.date) - U.daysUntil(b.date)).slice(0, limit); }
  // ---- Klausur-Lerncoach: Lernplan aus verteilten Bloecken am Exam-Objekt ----
  function generateStudyPlan(examId, opts) {
    opts = opts || {};
    const count = U.clamp(Math.round(opts.count || 3), 1, 20);
    const minutes = U.clamp(Math.round(opts.minutes || 30), 5, 180);
    const rising = !!opts.rising;
    const ex = state.exams.find((x) => x.id === examId); if (!ex) return null;
    const dleft = U.daysUntil(ex.date); if (dleft == null || dleft <= 0) return null;
    const span = Math.max(1, dleft); // heute (0) .. Vortag (span-1)
    const blocks = [];
    for (let i = 0; i < count; i++) {
      const off = Math.min(span - 1, Math.round((i * (span - 1)) / Math.max(1, count - 1)));
      const mins = (rising && count > 1) ? Math.round(minutes * (0.7 + (0.6 * i) / (count - 1))) : minutes;
      blocks.push({ id: U.uid(), date: U.ymd(U.addDays(new Date(), off)), minutes: mins, done: false });
    }
    blocks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    patch(() => { const x = state.exams.find((y) => y.id === examId); if (x) x.plan = { blocks, createdAt: Date.now(), config: { count, minutes, rising } }; });
    return (state.exams.find((y) => y.id === examId) || {}).plan || null;
  }
  function clearStudyPlan(examId) { patch(() => { const ex = state.exams.find((x) => x.id === examId); if (ex) ex.plan = null; }); }
  function toggleStudyBlock(examId, blockId) { const ex = state.exams.find((x) => x.id === examId); if (!ex || !ex.plan) return null; patch(() => { const b = ex.plan.blocks.find((x) => x.id === blockId); if (b) b.done = !b.done; }); return ex; }
  function todaysStudyBlocks() { const today = U.todayYMD(), out = []; state.exams.forEach((ex) => { if (ex.plan && ex.plan.blocks) ex.plan.blocks.forEach((b) => { if (b.date === today && !b.done) out.push({ exam: ex, block: b }); }); }); return out; }
  function studyPlanProgress(examId) { const ex = state.exams.find((x) => x.id === examId); if (!ex || !ex.plan || !ex.plan.blocks.length) return { done: 0, total: 0, pct: 0 }; const total = ex.plan.blocks.length, done = ex.plan.blocks.filter((b) => b.done).length; return { done, total, pct: total ? done / total : 0 }; }

  // ============================================================
  // Gewohnheiten + Streaks
  // ============================================================
  function addHabit(name) { const h = { id: U.uid(), name: String(name || "").trim(), history: [], createdAt: Date.now() }; patch((s) => s.habits.push(h)); return h; }
  function removeHabit(id) { patch((s) => { s.habits = s.habits.filter((x) => x.id !== id); }); }
  function isHabitDoneToday(id) { const h = state.habits.find((x) => x.id === id); return !!h && h.history.includes(U.todayYMD()); }
  function toggleHabitToday(id) {
    const today = U.todayYMD();
    patch(() => { const h = state.habits.find((x) => x.id === id); if (!h) return; if (h.history.includes(today)) h.history = h.history.filter((d) => d !== today); else h.history.push(today); });
  }
  function habitStreak(id) {
    const h = state.habits.find((x) => x.id === id);
    if (!h || !h.history.length) return 0;
    const set = new Set(h.history);
    let streak = 0; const d = new Date(); d.setHours(0, 0, 0, 0);
    if (!set.has(U.ymd(d))) d.setDate(d.getDate() - 1); // gestern zaehlt, falls heute noch offen
    while (set.has(U.ymd(d))) { streak++; d.setDate(d.getDate() - 1); }
    return streak;
  }

  // ============================================================
  // Notizen
  // ============================================================
  function addNote(n) { const note = { id: U.uid(), title: n.title ? String(n.title).trim() : "", body: n.body ? String(n.body) : "", pinned: !!n.pinned, createdAt: Date.now(), updatedAt: Date.now() }; patch((s) => s.notes.push(note)); return note; }
  function updateNote(id, c) { patch(() => { const n = state.notes.find((x) => x.id === id); if (!n) return; if (c.title !== undefined) n.title = String(c.title); if (c.body !== undefined) n.body = String(c.body); if (c.pinned !== undefined) n.pinned = !!c.pinned; n.updatedAt = Date.now(); }); }
  function removeNote(id) { patch((s) => { s.notes = s.notes.filter((x) => x.id !== id); }); }

  // ============================================================
  // Termine (Events)
  // ============================================================
  function addEvent(e) { const ev = { id: U.uid(), title: String(e.title || "").trim(), date: e.date, time: e.time || null, location: e.location ? String(e.location).trim() : null, note: e.note ? String(e.note).trim() : null, createdAt: Date.now() }; patch((s) => s.events.push(ev)); return ev; }
  function removeEvent(id) { patch((s) => { s.events = s.events.filter((x) => x.id !== id); }); }
  function upcomingEvents(limit = 50) { return state.events.filter((e) => U.daysUntil(e.date) !== null && U.daysUntil(e.date) >= 0).sort((a, b) => U.daysUntil(a.date) - U.daysUntil(b.date) || String(a.time || "").localeCompare(String(b.time || ""))).slice(0, limit); }

  // ============================================================
  // Ziele
  // ============================================================
  function addGoal(g) { const goal = { id: U.uid(), title: String(g.title || "").trim(), target: g.target ? Number(g.target) : 100, progress: 0, due: g.due || null, createdAt: Date.now() }; patch((s) => s.goals.push(goal)); return goal; }
  function updateGoal(id, c) { patch(() => { const g = state.goals.find((x) => x.id === id); if (!g) return; if (c.title !== undefined) g.title = String(c.title); if (c.target !== undefined) g.target = Number(c.target); if (c.progress !== undefined) g.progress = U.clamp(Number(c.progress), 0, g.target); if (c.due !== undefined) g.due = c.due || null; }); }
  function removeGoal(id) { patch((s) => { s.goals = s.goals.filter((x) => x.id !== id); }); }

  // ============================================================
  // Vokabeltrainer (Leitner-System: Box 1-5, wachsende Abstaende)
  // ============================================================
  const VOCAB_INTERVALS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 14 };
  function addVocab(v) { const card = { id: U.uid(), front: String(v.front || "").trim(), back: String(v.back || "").trim(), box: 1, due: U.todayYMD(), createdAt: Date.now() }; patch((s) => s.vocab.push(card)); return card; }
  function removeVocab(id) { patch((s) => { s.vocab = s.vocab.filter((x) => x.id !== id); }); }
  function vocabDue() { return state.vocab.filter((v) => { const n = U.daysUntil(v.due); return n === null || n <= 0; }); }
  function reviewVocab(id, correct) { patch(() => { const v = state.vocab.find((x) => x.id === id); if (!v) return; v.box = correct ? Math.min(5, (v.box || 1) + 1) : 1; v.due = U.ymd(U.addDays(new Date(), VOCAB_INTERVALS[v.box] || 1)); }); }

  // ============================================================
  // Taschengeld / Budget (positive = Einnahme, negativ = Ausgabe)
  // ============================================================
  function addBudgetEntry(e) { const amt = Math.abs(Number(e.amount) || 0); const entry = { id: U.uid(), amount: e.type === "expense" ? -amt : amt, label: String(e.label || "").trim(), category: e.category ? String(e.category).trim() : null, date: e.date || U.todayYMD(), createdAt: Date.now() }; patch((s) => s.budget.push(entry)); return entry; }
  function removeBudgetEntry(id) { patch((s) => { s.budget = s.budget.filter((x) => x.id !== id); }); }
  function balance() { return U.round(state.budget.reduce((a, b) => a + b.amount, 0), 2); }
  function monthFlow() { const m = U.todayYMD().slice(0, 7); let inc = 0, exp = 0; state.budget.forEach((e) => { if ((e.date || "").slice(0, 7) === m) { if (e.amount >= 0) inc += e.amount; else exp += e.amount; } }); return { inc: U.round(inc, 2), exp: U.round(exp, 2) }; }

  // ============================================================
  // Pomodoro
  // ============================================================
  function pomodoroStart(opts) {
    patch(() => {
      const p = state.pomodoro;
      if (opts && opts.workMin) p.settings.workMin = U.clamp(Math.round(opts.workMin), 1, 180);
      if (opts && opts.breakMin) p.settings.breakMin = U.clamp(Math.round(opts.breakMin), 1, 60);
      p.phase = "work"; p.running = true; p.cycle = 0; p.remainingMs = 0;
      p.endsAt = Date.now() + p.settings.workMin * 60000;
    });
  }
  function pomodoroPause() { patch(() => { const p = state.pomodoro; if (p.running) { p.remainingMs = Math.max(0, p.endsAt - Date.now()); p.running = false; } }); }
  function pomodoroResume() { patch(() => { const p = state.pomodoro; if (!p.running && p.remainingMs > 0) { p.endsAt = Date.now() + p.remainingMs; p.running = true; p.remainingMs = 0; } }); }
  function pomodoroReset() { patch(() => { state.pomodoro.running = false; state.pomodoro.phase = "idle"; state.pomodoro.endsAt = 0; state.pomodoro.remainingMs = 0; state.pomodoro.cycle = 0; }); }
  function pomodoroSetSettings(partial) { patch(() => { Object.assign(state.pomodoro.settings, partial || {}); }); }
  function logFocusSession(min) {
    const today = U.todayYMD();
    let e = state.pomodoro.history.find((x) => x.date === today);
    if (!e) { e = { date: today, sessions: 0, focusMin: 0 }; state.pomodoro.history.push(e); }
    e.sessions++; e.focusMin += min;
    if (state.pomodoro.history.length > 400) state.pomodoro.history = state.pomodoro.history.slice(-400);
  }
  // Phasenwechsel (von der Pomodoro-Engine aufgerufen).
  function pomodoroAdvance() {
    let prev, next;
    patch(() => {
      const p = state.pomodoro; prev = p.phase;
      if (p.phase === "work") {
        logFocusSession(p.settings.workMin);
        p.cycle++;
        next = (p.cycle % p.settings.longEvery === 0) ? "longbreak" : "break";
      } else { next = "work"; }
      const mins = next === "work" ? p.settings.workMin : next === "longbreak" ? p.settings.longBreakMin : p.settings.breakMin;
      p.phase = next;
      if (p.settings.autostart) { p.running = true; p.endsAt = Date.now() + mins * 60000; p.remainingMs = 0; }
      else { p.running = false; p.endsAt = 0; p.remainingMs = mins * 60000; }
    });
    return { prev, next };
  }

  // ============================================================
  // Einstellungen / Faecher / Export
  // ============================================================
  function setSetting(k, v) { patch((s) => { s.settings[k] = v; }); }
  function subjects() {
    const set = new Set(CONST.SUBJECT_SUGGESTIONS);
    state.tasks.forEach((t) => { if (t.subject) set.add(t.subject); });
    state.grades.forEach((g) => set.add(g.subject));
    state.exams.forEach((e) => set.add(e.subject));
    Object.values(state.timetable).forEach((a) => a.forEach((e) => { if (e.subject) set.add(e.subject); }));
    return [...set].sort();
  }
  function exportData() { return JSON.stringify(state, null, 2); }
  function importData(obj) {
    if (!obj || typeof obj !== "object" || !Array.isArray(obj.tasks)) throw new Error("Datei sieht nicht nach einem Jarvis-Backup aus.");
    state = migrate(obj);
    touched();
    return true;
  }

  // ============================================================
  // Statistik (fuer Karten + Diagramme)
  // ============================================================
  function focusMinutes(dateYMD) { const e = state.pomodoro.history.find((x) => x.date === dateYMD); return e ? e.focusMin : 0; }
  function focusToday() { return focusMinutes(U.todayYMD()); }
  function focusThisWeek() { const start = U.startOfWeek(); let sum = 0; for (let i = 0; i < 7; i++) sum += focusMinutes(U.ymd(U.addDays(start, i))); return sum; }
  function tasksDoneThisWeek() { const start = U.startOfWeek().getTime(); return state.tasks.filter((t) => t.done && t.doneAt && t.doneAt >= start).length; }

  // ============================================================
  // Kompakter Schnappschuss fuer das KI-Modell
  // ============================================================
  function snapshot() {
    const today = new Date();
    const open = state.tasks.filter((t) => !t.done);
    const overdue = open.filter((t) => { const n = U.daysUntil(t.due); return n !== null && n < 0; }).sort((a, b) => U.daysUntil(a.due) - U.daysUntil(b.due));
    const soon = open.filter((t) => { const n = U.daysUntil(t.due); return n !== null && n >= 0 && n <= 7; }).sort((a, b) => U.daysUntil(a.due) - U.daysUntil(b.due));
    const noDate = open.filter((t) => !t.due);
    const hw = open.filter((t) => t.type === "homework");
    const bySubject = {}; hw.forEach((t) => { const s = t.subject || "Sonstige"; (bySubject[s] = bySubject[s] || []).push(t); });
    const order = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const todayKey = order[today.getDay()], tmrKey = order[(today.getDay() + 1) % 7];
    const tt = (k) => (state.timetable[k] || []).map((e) => `${e.period ? e.period + "." : ""}${e.subject}${e.room ? "(" + e.room + ")" : ""}`).join(" ");
    const now = Date.now();
    const rem = state.reminders.filter((r) => !r.fired && r.at >= now).sort((a, b) => a.at - b.at).slice(0, 3).map((r) => `${U.fmtDateTime(r.at)} ${r.text}`);
    const exams = upcomingExams(3).map((e) => `${e.subject}${e.title ? " " + e.title : ""} (${U.dueLabel(e.date)})`);
    const avg = overallAverage();
    const habitsToday = state.habits.map((h) => `${h.name}: ${isHabitDoneToday(h.id) ? "erledigt" : "offen"} (${habitStreak(h.id)} Tage)`);

    const L = [];
    L.push(`Heute ist ${today.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}.`);
    if (overdue.length) L.push("UEBERFAELLIG: " + overdue.slice(0, 10).map((t) => `${t.title}${t.subject ? " [" + t.subject + "]" : ""} (${U.dueLabel(t.due)})`).join("; "));
    if (soon.length) L.push("OFFEN (7 Tage): " + soon.slice(0, 15).map((t) => `${t.title}${t.subject ? " [" + t.subject + "]" : ""} (${U.dueLabel(t.due)}, ${t.priority})`).join("; "));
    if (noDate.length) L.push(`OHNE DATUM (${noDate.length}): ` + noDate.slice(0, 8).map((t) => t.title).join("; "));
    const subjLine = Object.keys(bySubject).map((s) => `${s}(${bySubject[s].length})`).join(", ");
    if (subjLine) L.push("HAUSAUFGABEN je Fach: " + subjLine);
    if (exams.length) L.push("TESTS: " + exams.join("; "));
    if (avg != null) L.push(`NOTENSCHNITT: ${avg}` + (Object.keys(subjectAverages()).length ? " (je Fach: " + Object.entries(subjectAverages()).map(([s, v]) => `${s} ${v}`).join(", ") + ")" : ""));
    if (tt(todayKey)) L.push("HEUTE Stundenplan: " + tt(todayKey));
    if (tt(tmrKey)) L.push("MORGEN Stundenplan: " + tt(tmrKey));
    if (rem.length) L.push("ERINNERUNGEN: " + rem.join("; "));
    if (habitsToday.length) L.push("GEWOHNHEITEN heute: " + habitsToday.join("; "));
    if (state.pomodoro.running) L.push("POMODORO laeuft gerade (" + state.pomodoro.phase + ").");
    if (focusToday()) L.push(`FOKUSZEIT heute: ${focusToday()} min.`);
    const vd = vocabDue().length; if (vd) L.push(`VOKABELN faellig: ${vd}`);
    if (state.budget.length) L.push(`KONTOSTAND: ${balance()} ${CONST.CURRENCY}`);
    if (L.length === 1) L.push("Noch keine Eintraege.");
    return L.join("\n");
  }

  return {
    init, get: () => state, patch, subscribe, snapshot,
    // tasks
    addTask, findTask, completeTask, updateTask, removeTask, archiveOld, rollRecurring, nextDue, toggleSubtask,
    // reminders
    addReminder, removeReminder, markReminderFired,
    // timetable
    dayKey, setTimetableEntry, removeTimetableEntry, nextLessonOf, nextLessonNow,
    // grades
    addGrade, removeGrade, subjectAverage, subjectAverages, gradeSubjects, overallAverage, neededGrade, projectedAverage, scaleOf, gradeScaleInfo,
    // exams
    addExam, removeExam, upcomingExams, generateStudyPlan, clearStudyPlan, toggleStudyBlock, todaysStudyBlocks, studyPlanProgress,
    // habits
    addHabit, removeHabit, toggleHabitToday, isHabitDoneToday, habitStreak,
    // notes
    addNote, updateNote, removeNote,
    // events
    addEvent, removeEvent, upcomingEvents,
    // goals
    addGoal, updateGoal, removeGoal,
    // vocab
    addVocab, removeVocab, vocabDue, reviewVocab,
    // budget
    addBudgetEntry, removeBudgetEntry, balance, monthFlow,
    // pomodoro
    pomodoroStart, pomodoroPause, pomodoroResume, pomodoroReset, pomodoroSetSettings, pomodoroAdvance,
    // stats
    focusMinutes, focusToday, focusThisWeek, tasksDoneThisWeek,
    // misc
    setSetting, subjects, exportData, importData,
    daysUntil: U.daysUntil, dueLabel: U.dueLabel, ymd: U.ymd,
    get cloudEnabled() { return cloudEnabled; },
  };
})();
