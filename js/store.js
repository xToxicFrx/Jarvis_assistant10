// ============================================================
// store.js — die EINZIGE Datenquelle der App.
//
// Haelt ein State-Objekt (Aufgaben, Hausaufgaben, Stundenplan,
// Erinnerungen, Einstellungen) im Speicher, sichert es sofort in
// localStorage und synchronisiert es (debounced) mit der Cloud
// (/api/state). Funktioniert auch ganz ohne Cloud (nur lokal).
//
// UI und Werkzeuge aendern Daten NUR ueber diese Funktionen, damit
// alles automatisch gespeichert und neu gezeichnet wird.
// ============================================================
(function () {
  const LS_KEY = "jarvis_state_v1";
  const SAVE_DEBOUNCE = 800;
  const DAYKEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  let state = defaultState();
  let subscribers = [];
  let saveTimer = null;
  let pendingCloud = false;
  let cloudEnabled = false;

  function uid() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function defaultState() {
    return {
      v: 1,
      updatedAt: Date.now(),
      settings: { theme: "system", wakeOnStart: false },
      tasks: [],
      timetable: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
      reminders: [],
    };
  }

  function migrate(s) {
    const d = defaultState();
    const tt = Object.assign({}, d.timetable);
    if (s.timetable) for (const k of DAYKEYS) if (Array.isArray(s.timetable[k])) tt[k] = s.timetable[k];
    return {
      v: 1,
      updatedAt: s.updatedAt || Date.now(),
      settings: Object.assign(d.settings, s.settings || {}),
      tasks: Array.isArray(s.tasks) ? s.tasks : [],
      timetable: tt,
      reminders: Array.isArray(s.reminders) ? s.reminders : [],
    };
  }

  // ---- Speichern / Sync ----
  function pw() { return sessionStorage.getItem("jarvis_pw") || ""; }

  function saveLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }

  async function cloudGet() {
    const res = await fetch("/api/state", { headers: { "x-app-password": pw() } });
    if (res.status === 501) { cloudEnabled = false; return undefined; }
    if (!res.ok) throw new Error("state GET " + res.status);
    cloudEnabled = true;
    const d = await res.json();
    return d.state; // object | null
  }

  async function cloudPut() {
    if (!cloudEnabled) return;
    try {
      const res = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-app-password": pw() },
        body: JSON.stringify({ state }),
      });
      if (res.status === 501) { cloudEnabled = false; return; }
      if (!res.ok) throw new Error("state PUT " + res.status);
      pendingCloud = false;
    } catch (e) {
      pendingCloud = true; // beim naechsten Mal / bei "online" erneut
    }
  }

  function scheduleCloud() {
    if (!cloudEnabled) return;
    pendingCloud = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(cloudPut, SAVE_DEBOUNCE);
  }

  function notify() { subscribers.forEach((cb) => { try { cb(state); } catch (e) {} }); }

  function touched() {
    state.updatedAt = Date.now();
    saveLocal();
    scheduleCloud();
    notify();
  }

  function patch(fn) { fn(state); touched(); return state; }
  function subscribe(cb) { subscribers.push(cb); return () => { subscribers = subscribers.filter((x) => x !== cb); }; }

  async function init() {
    // 1) Lokalen Stand sofort laden + zeigen
    try {
      const cached = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (cached && cached.v) state = migrate(cached);
    } catch (e) {}
    archiveOld();
    notify();

    // 2) Cloud abgleichen (Last-Write-Wins per updatedAt)
    try {
      const remote = await cloudGet();
      if (remote === undefined) {
        // Cloud nicht eingerichtet -> nur lokal
      } else if (remote === null) {
        await cloudPut(); // Cloud leer -> lokalen Stand hochladen
      } else {
        const localUpdated = state.updatedAt || 0;
        const remoteUpdated = remote.updatedAt || 0;
        if (remoteUpdated >= localUpdated) {
          state = migrate(remote);
          saveLocal();
          notify();
        } else {
          await cloudPut();
        }
      }
    } catch (e) { /* offline -> lokal weiter */ }

    window.addEventListener("online", () => { if (pendingCloud) cloudPut(); });
    return state;
  }

  // ---- Datum-Helfer ----
  function ymd(date) { const p = (n) => String(n).padStart(2, "0"); return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`; }
  function daysUntil(due) {
    if (!due) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(due + "T00:00:00");
    if (isNaN(d)) return null;
    return Math.round((d - today) / 86400000);
  }
  function dueLabel(due) {
    const n = daysUntil(due);
    if (n === null) return "";
    if (n < 0) return `ueberfaellig ${-n} T`;
    if (n === 0) return "heute";
    if (n === 1) return "morgen";
    if (n <= 7) return `in ${n} T`;
    const d = new Date(due + "T00:00:00");
    return d.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
  }

  // ---- Aufgaben ----
  function addTask(t) {
    const task = {
      id: uid(),
      title: String(t.title || "").trim(),
      type: t.type === "homework" ? "homework" : "todo",
      subject: t.subject ? String(t.subject).trim() : null,
      due: t.due || null,
      priority: ["low", "med", "high"].includes(t.priority) ? t.priority : "med",
      done: false, doneAt: null,
      notes: t.notes ? String(t.notes) : null,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    patch((s) => s.tasks.push(task));
    return task;
  }
  function findTask(ref) {
    if (!ref) return null;
    const byId = state.tasks.find((x) => x.id === ref);
    if (byId) return byId;
    const q = String(ref).toLowerCase();
    return state.tasks.find((x) => !x.done && x.title.toLowerCase().includes(q)) ||
           state.tasks.find((x) => x.title.toLowerCase().includes(q)) || null;
  }
  function completeTask(ref) {
    const t = findTask(ref);
    if (!t) return null;
    patch(() => { t.done = true; t.doneAt = Date.now(); t.updatedAt = Date.now(); });
    return t;
  }
  function updateTask(ref, c) {
    const t = findTask(ref);
    if (!t) return null;
    patch(() => {
      if (c.title != null && c.title !== "") t.title = String(c.title).trim();
      if (c.due !== undefined) t.due = c.due || null;
      if (c.priority && ["low", "med", "high"].includes(c.priority)) t.priority = c.priority;
      if (c.subject !== undefined) t.subject = c.subject ? String(c.subject).trim() : null;
      if (c.type) t.type = c.type === "homework" ? "homework" : "todo";
      if (c.notes !== undefined) t.notes = c.notes || null;
      if (c.done !== undefined) { t.done = !!c.done; t.doneAt = c.done ? Date.now() : null; }
      t.updatedAt = Date.now();
    });
    return t;
  }
  function removeTask(ref) {
    const t = findTask(ref);
    if (!t) return null;
    patch((s) => { s.tasks = s.tasks.filter((x) => x.id !== t.id); });
    return t;
  }
  function archiveOld() {
    const cutoff = Date.now() - 30 * 86400000;
    const kept = state.tasks.filter((t) => !(t.done && t.doneAt && t.doneAt < cutoff));
    if (kept.length !== state.tasks.length) { state.tasks = kept; saveLocal(); }
  }

  // ---- Erinnerungen ----
  function addReminder(text, at) {
    const r = { id: uid(), text: String(text || "").trim(), at: Number(at), fired: false, createdAt: Date.now() };
    patch((s) => s.reminders.push(r));
    return r;
  }
  function removeReminder(id) { patch((s) => { s.reminders = s.reminders.filter((r) => r.id !== id); }); }
  function markReminderFired(id) {
    const r = state.reminders.find((x) => x.id === id);
    if (r && !r.fired) patch(() => { r.fired = true; });
  }

  // ---- Stundenplan ----
  function dayKey(d) {
    if (!d) return null;
    const x = String(d).trim().toLowerCase();
    const table = {
      mon: "mon", montag: "mon", monday: "mon", mo: "mon",
      tue: "tue", dienstag: "tue", tuesday: "tue", di: "tue",
      wed: "wed", mittwoch: "wed", wednesday: "wed", mi: "wed",
      thu: "thu", donnerstag: "thu", thursday: "thu", do: "thu",
      fri: "fri", freitag: "fri", friday: "fri", fr: "fri",
      sat: "sat", samstag: "sat", saturday: "sat", sa: "sat",
      sun: "sun", sonntag: "sun", sunday: "sun", so: "sun",
    };
    return table[x] || (DAYKEYS.includes(x.slice(0, 3)) ? x.slice(0, 3) : null);
  }
  function setTimetableEntry(e) {
    const dk = dayKey(e.day);
    if (!dk) return null;
    const entry = {
      id: uid(),
      period: e.period != null && e.period !== "" ? Number(e.period) : null,
      subject: String(e.subject || "").trim(),
      room: e.room ? String(e.room).trim() : null,
      start: e.start || null, end: e.end || null,
    };
    patch((s) => {
      s.timetable[dk] = s.timetable[dk] || [];
      s.timetable[dk].push(entry);
      s.timetable[dk].sort((a, b) => (a.period || 99) - (b.period || 99) || String(a.start || "").localeCompare(String(b.start || "")));
    });
    return { dayKey: dk, entry };
  }
  function removeTimetableEntry(dk, id) { patch((s) => { if (s.timetable[dk]) s.timetable[dk] = s.timetable[dk].filter((x) => x.id !== id); }); }

  // ---- Einstellungen ----
  function setSetting(k, v) { patch((s) => { s.settings[k] = v; }); }

  function subjects() {
    const set = new Set();
    state.tasks.forEach((t) => { if (t.subject) set.add(t.subject); });
    Object.values(state.timetable).forEach((arr) => arr.forEach((e) => { if (e.subject) set.add(e.subject); }));
    return [...set].sort();
  }

  // ---- Kompakter Schnappschuss fuer das KI-Modell ----
  function snapshot() {
    const today = new Date();
    const open = state.tasks.filter((t) => !t.done);
    const overdue = open.filter((t) => { const n = daysUntil(t.due); return n !== null && n < 0; })
      .sort((a, b) => daysUntil(a.due) - daysUntil(b.due));
    const soon = open.filter((t) => { const n = daysUntil(t.due); return n !== null && n >= 0 && n <= 7; })
      .sort((a, b) => daysUntil(a.due) - daysUntil(b.due));
    const noDate = open.filter((t) => !t.due);
    const hw = open.filter((t) => t.type === "homework");
    const bySubject = {};
    hw.forEach((t) => { const s = t.subject || "Sonstige"; (bySubject[s] = bySubject[s] || []).push(t); });

    const order = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const todayKey = order[today.getDay()];
    const tmrKey = order[(today.getDay() + 1) % 7];
    const ttText = (key) => (state.timetable[key] || [])
      .map((e) => `${e.period ? e.period + "." : ""}${e.subject}${e.room ? "(" + e.room + ")" : ""}`).join(" ");

    const now = Date.now();
    const rem = state.reminders.filter((r) => !r.fired && r.at >= now).sort((a, b) => a.at - b.at).slice(0, 3)
      .map((r) => `${new Date(r.at).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" })} ${r.text}`);

    const L = [];
    L.push(`Heute ist ${today.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}.`);
    if (overdue.length) L.push("UEBERFAELLIG: " + overdue.slice(0, 10).map((t) => `${t.title}${t.subject ? " [" + t.subject + "]" : ""} (${dueLabel(t.due)})`).join("; "));
    if (soon.length) L.push("OFFEN (7 Tage): " + soon.slice(0, 15).map((t) => `${t.title}${t.subject ? " [" + t.subject + "]" : ""} (${dueLabel(t.due)}, ${t.priority})`).join("; "));
    if (noDate.length) L.push(`OHNE DATUM (${noDate.length}): ` + noDate.slice(0, 8).map((t) => t.title).join("; "));
    const subjLine = Object.keys(bySubject).map((s) => `${s}(${bySubject[s].length})`).join(", ");
    if (subjLine) L.push("HAUSAUFGABEN je Fach: " + subjLine);
    if (ttText(todayKey)) L.push("HEUTE Stundenplan: " + ttText(todayKey));
    if (ttText(tmrKey)) L.push("MORGEN Stundenplan: " + ttText(tmrKey));
    if (rem.length) L.push("ERINNERUNGEN: " + rem.join("; "));
    if (L.length === 1) L.push("Noch keine Aufgaben oder Termine eingetragen.");
    return L.join("\n");
  }

  window.Store = {
    init, get: () => state, patch, subscribe, snapshot,
    addTask, findTask, completeTask, updateTask, removeTask, archiveOld,
    addReminder, removeReminder, markReminderFired,
    dayKey, setTimetableEntry, removeTimetableEntry,
    setSetting, subjects,
    daysUntil, dueLabel, ymd,
    get cloudEnabled() { return cloudEnabled; },
  };
})();
