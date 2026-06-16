// ============================================================
// ui.js — zeichnet das Dashboard und die Dialoge.
//
// Reines Rendering: liest aus dem Store und baut die Karten,
// oeffnet Modals zum Eintragen/Bearbeiten und zeigt Toasts.
// Aenderungen laufen ueber Store.* -> Pub/Sub -> neu zeichnen.
// ============================================================
(function () {
  const SVGNS = "http://www.w3.org/2000/svg";
  const DAY_NAMES = { mon: "Montag", tue: "Dienstag", wed: "Mittwoch", thu: "Donnerstag", fri: "Freitag", sat: "Samstag", sun: "Sonntag" };
  const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const WMO_ICON = { 0: "w-sun", 1: "w-partly", 2: "w-partly", 3: "w-cloud", 45: "w-fog", 48: "w-fog", 51: "w-rain", 53: "w-rain", 55: "w-rain", 61: "w-rain", 63: "w-rain", 65: "w-rain", 71: "w-snow", 73: "w-snow", 75: "w-snow", 80: "w-rain", 81: "w-rain", 82: "w-rain", 95: "w-storm", 96: "w-storm", 99: "w-storm" };

  let lastTip = "";
  const expanded = { doneTasks: false, fullWeek: false };

  // ---- kleine DOM-Helfer ----
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    if (children != null) (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }
  function icon(name, cls) {
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "icon" + (cls ? " " + cls : ""));
    const use = document.createElementNS(SVGNS, "use");
    use.setAttribute("href", "#" + name);
    svg.appendChild(use);
    return svg;
  }
  function iconBtn(name, title, onClick, cls) {
    return el("button", { class: "icon-btn" + (cls ? " " + cls : ""), title, onclick: onClick }, icon(name));
  }
  function field(label, input) { return el("div", { class: "field" }, [el("label", { text: label }), input]); }
  function empty(text) { return el("div", { class: "empty", text }); }

  function cardShell(title, iconName, action, extraClass) {
    const head = el("div", { class: "card-head" }, [icon(iconName), el("div", { class: "card-title", text: title })]);
    const body = el("div", { class: "card-body" });
    const card = el("div", { class: "card" + (extraClass ? " " + extraClass : "") }, [head]);
    return { card, head, body, action };
  }
  function pill(text) { return el("span", { class: "count-pill", text: String(text) }); }

  function byDue(a, b) {
    const da = Store.daysUntil(a.due), db = Store.daysUntil(b.due);
    if (da === null && db === null) return (a.createdAt || 0) - (b.createdAt || 0);
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  }

  // ---- ein Aufgaben-Eintrag ----
  function taskItem(t, opts) {
    opts = opts || {};
    const check = el("button", {
      class: "check", title: t.done ? "Wieder offen" : "Erledigt",
      onclick: () => t.done ? Store.updateTask(t.id, { done: false }) : Store.completeTask(t.id),
    }, t.done ? icon("i-check") : null);

    const meta = el("div", { class: "task-meta" }, el("span", { class: "prio " + t.priority }));
    if (t.due) {
      const n = Store.daysUntil(t.due);
      const cls = "chip due" + (n !== null && n < 0 ? " overdue" : n === 0 ? " today" : "");
      meta.append(el("span", { class: cls, text: Store.dueLabel(t.due) }));
    }
    if (!opts.hideSubject && t.subject) meta.append(el("span", { class: "chip subject", text: t.subject }));

    const actions = el("div", { class: "row-actions" }, [
      iconBtn("i-edit", "Bearbeiten", () => openTaskModal(t.type, t)),
      iconBtn("i-trash", "Loeschen", () => { Store.removeTask(t.id); toast("Geloescht"); }),
    ]);
    const main = el("div", { class: "task-main" }, [el("div", { class: "task-title", text: t.title }), meta]);
    return el("div", { class: "task" + (t.done ? " done" : "") }, [check, main, actions]);
  }

  // ---- Karten ----
  function buildOverview(s) {
    const { card, head, body } = cardShell("Ueberblick", "i-list", null, "card-wide");
    card.append(body);
    const hour = new Date().getHours();
    const greet = hour < 11 ? "Guten Morgen" : hour < 17 ? "Hallo" : "Guten Abend";
    body.append(el("div", { class: "ov-greeting", text: greet + "!" }));

    if (lastTip) body.append(el("div", { class: "ov-tip" }, [icon("i-spark"), el("span", { text: lastTip })]));

    const open = s.tasks.filter((t) => !t.done);
    const dueToday = open.filter((t) => Store.daysUntil(t.due) === 0).length;
    const overdue = open.filter((t) => { const n = Store.daysUntil(t.due); return n !== null && n < 0; }).length;

    const order = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const todayKey = order[new Date().getDay()];
    const lessons = (s.timetable[todayKey] || []).length;

    const stats = el("div", { class: "ov-stats" }, [
      el("div", { class: "ov-stat" }, [el("b", { text: String(dueToday) }), el("span", { text: "heute faellig" })]),
      el("div", { class: "ov-stat" }, [el("b", { text: String(overdue) }), el("span", { text: "ueberfaellig" })]),
      el("div", { class: "ov-stat" }, [el("b", { text: String(open.length) }), el("span", { text: "offen gesamt" })]),
      el("div", { class: "ov-stat" }, [el("b", { text: String(lessons) }), el("span", { text: "Stunden heute" })]),
    ]);
    body.append(stats);
    return card;
  }

  function buildTasks(s) {
    const add = iconBtn("i-plus", "Aufgabe hinzufuegen", () => openTaskModal("todo"));
    const { card, head, body } = cardShell("Aufgaben", "i-check");
    const todos = s.tasks.filter((t) => t.type === "todo");
    const open = todos.filter((t) => !t.done).sort(byDue);
    const done = todos.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    head.append(pill(open.length), add);
    card.append(body);

    if (open.length) open.forEach((t) => body.append(taskItem(t)));
    else body.append(empty("Keine offenen Aufgaben. Gut gemacht."));

    if (done.length) {
      const toggle = el("button", { class: "toggle-done", onclick: () => { expanded.doneTasks = !expanded.doneTasks; render(Store.get()); } },
        (expanded.doneTasks ? "Erledigte ausblenden" : `Erledigte anzeigen (${done.length})`));
      body.append(toggle);
      if (expanded.doneTasks) done.forEach((t) => body.append(taskItem(t)));
    }
    return card;
  }

  function buildHomework(s) {
    const add = iconBtn("i-plus", "Hausaufgabe hinzufuegen", () => openTaskModal("homework"));
    const { card, head, body } = cardShell("Hausaufgaben", "i-book");
    const hw = s.tasks.filter((t) => t.type === "homework" && !t.done).sort(byDue);
    head.append(pill(hw.length), add);
    card.append(body);

    if (!hw.length) { body.append(empty("Keine offenen Hausaufgaben.")); return card; }

    const groups = {};
    hw.forEach((t) => { const k = t.subject || "Sonstige"; (groups[k] = groups[k] || []).push(t); });
    Object.keys(groups).sort().forEach((subj) => {
      const g = el("div", { class: "subject-group" }, el("div", { class: "subject-head" }, [el("span", { text: subj }), pill(groups[subj].length)]));
      groups[subj].forEach((t) => g.append(taskItem(t, { hideSubject: true })));
      body.append(g);
    });
    return card;
  }

  function buildTimetable(s) {
    const add = iconBtn("i-plus", "Stunde hinzufuegen", () => openTimetableModal());
    const { card, head, body } = cardShell("Stundenplan", "i-calendar");
    head.append(add);
    card.append(body);

    const order = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const todayKey = order[new Date().getDay()];
    const hasAny = DAY_ORDER.some((k) => (s.timetable[k] || []).length);
    if (!hasAny) { body.append(empty("Noch kein Stundenplan. Trag deine Stunden ein.")); return card; }

    const showFull = expanded.fullWeek || !(s.timetable[todayKey] || []).length;
    const days = showFull ? DAY_ORDER.filter((k) => (s.timetable[k] || []).length) : [todayKey];

    days.forEach((k) => {
      const dayEl = el("div", { class: "tt-day" + (k === todayKey ? " is-today" : "") }, el("div", { class: "tt-day-name", text: DAY_NAMES[k] + (k === todayKey ? " (heute)" : "") }));
      const lessons = s.timetable[k] || [];
      if (!lessons.length) dayEl.append(el("div", { class: "empty", text: "frei" }));
      lessons.forEach((e) => {
        dayEl.append(el("div", { class: "tt-lesson" }, [
          el("span", { class: "period", text: e.period ? e.period + "." : "" }),
          el("span", { class: "subj", text: e.subject }),
          e.room ? el("span", { class: "room", text: e.room }) : null,
          (e.start ? el("span", { class: "time", text: e.start + (e.end ? "-" + e.end : "") }) : null),
          iconBtn("i-trash", "Loeschen", () => { Store.removeTimetableEntry(k, e.id); toast("Geloescht"); }),
        ]));
      });
      body.append(dayEl);
    });

    const toggle = el("button", { class: "toggle-done", onclick: () => { expanded.fullWeek = !expanded.fullWeek; render(Store.get()); } },
      expanded.fullWeek ? "Nur heute" : "Ganze Woche");
    body.append(toggle);
    return card;
  }

  function buildReminders(s) {
    const add = iconBtn("i-plus", "Erinnerung hinzufuegen", () => openReminderModal());
    const { card, head, body } = cardShell("Erinnerungen", "i-bell");
    head.append(add);
    card.append(body);

    const now = Date.now();
    const up = s.reminders.filter((r) => !r.fired && r.at >= now).sort((a, b) => a.at - b.at);
    const past = s.reminders.filter((r) => r.fired || r.at < now).sort((a, b) => b.at - a.at).slice(0, 4);

    if (Reminders.permission() === "default") {
      body.append(el("button", { class: "btn btn-ghost btn-block", onclick: async () => { await Reminders.requestPermission(); render(Store.get()); }, style: "margin-bottom:8px" }, "Benachrichtigungen aktivieren"));
    }

    if (!up.length && !past.length) { body.append(empty("Keine Erinnerungen.")); return card; }
    up.forEach((r) => body.append(reminderItem(r, false)));
    past.forEach((r) => body.append(reminderItem(r, true)));
    return card;
  }

  function reminderItem(r, isPast) {
    const when = new Date(r.at).toLocaleString("de-DE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return el("div", { class: "reminder" + (isPast ? " past" : "") }, [
      icon("i-bell"),
      el("div", { class: "reminder-main" }, [el("div", { class: "reminder-text", text: r.text }), el("div", { class: "reminder-when", text: when })]),
      iconBtn("i-trash", "Loeschen", () => { Store.removeReminder(r.id); toast("Geloescht"); }),
    ]);
  }

  // ---- Dashboard zusammensetzen ----
  function render(s) {
    const root = document.getElementById("dashboard");
    if (!root) return;
    root.replaceChildren(
      buildOverview(s),
      buildTasks(s),
      buildHomework(s),
      buildTimetable(s),
      buildReminders(s),
    );
  }

  // ---- Modals ----
  function closeModal() { const r = document.getElementById("modalRoot"); if (r) r.replaceChildren(); }
  function openModal(title, bodyEl) {
    closeModal();
    const head = el("div", { class: "modal-head" }, [el("h3", { text: title }), iconBtn("i-x", "Schliessen", closeModal)]);
    const modal = el("div", { class: "modal" }, [head, bodyEl]);
    const back = el("div", { class: "modal-back", onclick: (e) => { if (e.target === back) closeModal(); } }, modal);
    document.getElementById("modalRoot").append(back);
    setTimeout(() => { const i = modal.querySelector("input,select,textarea"); if (i) i.focus(); }, 40);
  }

  function prioritySeg(initial) {
    let value = initial || "med";
    const labels = { low: "Niedrig", med: "Mittel", high: "Hoch" };
    const seg = el("div", { class: "seg" });
    ["low", "med", "high"].forEach((p) => {
      const b = el("button", { type: "button", class: p === value ? "on" : "", text: labels[p], onclick: () => { value = p; seg.querySelectorAll("button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); } });
      seg.append(b);
    });
    return { seg, get: () => value };
  }

  function subjectDatalist() {
    return el("datalist", { id: "subjectList" }, Store.subjects().map((x) => el("option", { value: x })));
  }

  function openTaskModal(type, existing) {
    type = existing ? existing.type : (type || "todo");
    const isHw = type === "homework";
    const titleI = el("input", { type: "text", placeholder: isHw ? "Was ist auf?" : "Was ist zu tun?", value: existing ? existing.title : "" });
    const subjI = el("input", { type: "text", placeholder: "Fach", list: "subjectList", value: existing && existing.subject ? existing.subject : "" });
    const dueI = el("input", { type: "date", value: existing && existing.due ? existing.due : "" });
    const prio = prioritySeg(existing ? existing.priority : "med");

    const save = el("button", {
      class: "btn btn-primary", text: existing ? "Speichern" : "Hinzufuegen",
      onclick: () => {
        const title = titleI.value.trim();
        if (!title) { titleI.focus(); return; }
        const data = { title, type, subject: subjI.value.trim() || null, due: dueI.value || null, priority: prio.get() };
        if (existing) Store.updateTask(existing.id, data); else Store.addTask(data);
        closeModal(); toast(existing ? "Gespeichert" : "Hinzugefuegt", "success");
      },
    });
    const cancel = el("button", { class: "btn", text: "Abbrechen", onclick: closeModal });

    const body = el("div", { class: "modal-body" }, [
      subjectDatalist(),
      field("Titel", titleI),
      field(isHw ? "Fach" : "Fach (optional)", subjI),
      el("div", { class: "field-row" }, [field("Faellig bis", dueI), field("Prioritaet", prio.seg)]),
      el("div", { class: "modal-actions" }, [cancel, save]),
    ]);
    titleI.addEventListener("keydown", (e) => { if (e.key === "Enter") save.click(); });
    openModal(existing ? (isHw ? "Hausaufgabe bearbeiten" : "Aufgabe bearbeiten") : (isHw ? "Neue Hausaufgabe" : "Neue Aufgabe"), body);
  }

  function pad(n) { return String(n).padStart(2, "0"); }
  function toLocalInput(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

  function openReminderModal() {
    const textI = el("input", { type: "text", placeholder: "Woran erinnern?" });
    const dtI = el("input", { type: "datetime-local", value: toLocalInput(new Date(Date.now() + 3600000)) });
    const save = el("button", {
      class: "btn btn-primary", text: "Erinnerung setzen",
      onclick: async () => {
        const text = textI.value.trim();
        if (!text) { textI.focus(); return; }
        const at = dtI.value ? new Date(dtI.value).getTime() : 0;
        if (!at) { dtI.focus(); return; }
        Store.addReminder(text, at);
        if (Reminders.permission() === "default") await Reminders.requestPermission();
        closeModal(); toast("Erinnerung gesetzt", "success");
      },
    });
    const cancel = el("button", { class: "btn", text: "Abbrechen", onclick: closeModal });
    const body = el("div", { class: "modal-body" }, [
      field("Text", textI), field("Wann", dtI),
      el("div", { class: "modal-actions" }, [cancel, save]),
    ]);
    textI.addEventListener("keydown", (e) => { if (e.key === "Enter") save.click(); });
    openModal("Neue Erinnerung", body);
  }

  function openTimetableModal() {
    const daySel = el("select", {}, DAY_ORDER.map((k) => el("option", { value: k }, DAY_NAMES[k])));
    const order = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    daySel.value = order[new Date().getDay()] === "sun" || order[new Date().getDay()] === "sat" ? "mon" : order[new Date().getDay()];
    const subjI = el("input", { type: "text", placeholder: "Fach", list: "subjectList" });
    const periodI = el("input", { type: "number", min: "1", max: "12", placeholder: "z.B. 1" });
    const startI = el("input", { type: "time" });
    const endI = el("input", { type: "time" });
    const roomI = el("input", { type: "text", placeholder: "Raum (optional)" });

    const save = el("button", {
      class: "btn btn-primary", text: "Eintragen",
      onclick: () => {
        const subject = subjI.value.trim();
        if (!subject) { subjI.focus(); return; }
        Store.setTimetableEntry({ day: daySel.value, subject, period: periodI.value, start: startI.value, end: endI.value, room: roomI.value });
        closeModal(); toast("Eingetragen", "success");
      },
    });
    const cancel = el("button", { class: "btn", text: "Abbrechen", onclick: closeModal });
    const body = el("div", { class: "modal-body" }, [
      subjectDatalist(),
      el("div", { class: "field-row" }, [field("Tag", daySel), field("Stunde", periodI)]),
      field("Fach", subjI),
      el("div", { class: "field-row" }, [field("Von", startI), field("Bis", endI)]),
      field("Raum", roomI),
      el("div", { class: "modal-actions" }, [cancel, save]),
    ]);
    openModal("Schulstunde eintragen", body);
  }

  function openSettings() {
    const s = Store.get().settings;
    // Theme
    let theme = s.theme || "system";
    const themeSeg = el("div", { class: "seg" });
    [["light", "Hell"], ["dark", "Dunkel"], ["system", "System"]].forEach(([val, lab]) => {
      const b = el("button", { type: "button", class: val === theme ? "on" : "", text: lab, onclick: () => { theme = val; themeSeg.querySelectorAll("button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); Store.setSetting("theme", val); applyTheme(val); } });
      themeSeg.append(b);
    });
    // Wake on start
    let wake = !!s.wakeOnStart;
    const wakeSeg = el("div", { class: "seg" });
    [["1", "An"], ["0", "Aus"]].forEach(([val, lab]) => {
      const on = (val === "1") === wake;
      const b = el("button", { type: "button", class: on ? "on" : "", text: lab, onclick: () => { wake = val === "1"; wakeSeg.querySelectorAll("button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); Store.setSetting("wakeOnStart", wake); if (window.Jarvis) window.Jarvis.setWake(wake); } });
      wakeSeg.append(b);
    });

    const cloud = el("div", { class: "cloud-pill" + (Store.cloudEnabled ? " on" : "") }, [el("span", { class: "d" }), el("span", { text: Store.cloudEnabled ? "Cloud-Sync aktiv (alle Geraete)" : "Cloud-Sync aus (nur dieses Geraet)" })]);

    const notif = el("div", {}, Reminders.permission() === "granted"
      ? el("span", { class: "muted", text: "Benachrichtigungen erlaubt." })
      : el("button", { class: "btn btn-ghost btn-block", onclick: async () => { await Reminders.requestPermission(); closeModal(); openSettings(); } }, "Benachrichtigungen aktivieren"));

    const body = el("div", { class: "modal-body" }, [
      field("Design", themeSeg),
      field("Wake-Word automatisch starten (nur Desktop Chrome/Edge)", wakeSeg),
      field("Benachrichtigungen", notif),
      field("Synchronisierung", cloud),
      el("div", { class: "modal-actions" }, [el("button", { class: "btn btn-primary btn-block", text: "Fertig", onclick: closeModal })]),
    ]);
    openModal("Einstellungen", body);
  }

  // ---- Toasts ----
  function toast(msg, type) {
    const root = document.getElementById("toastRoot");
    if (!root) return;
    const t = el("div", { class: "toast" + (type ? " " + type : ""), text: msg });
    root.append(t);
    setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 250); }, 2400);
  }

  // ---- Theme ----
  function applyTheme(theme) {
    let t = theme || (Store.get().settings.theme) || "system";
    if (t === "system") t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#16181c" : "#3b82f6");
    const btn = document.getElementById("themeBtn");
    if (btn) btn.replaceChildren(icon(t === "dark" ? "i-sun" : "i-moon"));
  }

  // ---- Setter fuer app.js ----
  function setVoiceState(st) { const e = document.getElementById("voiceState"); if (e) e.setAttribute("data-state", st); }
  function setLevel(x) { const e = document.getElementById("voiceState"); if (e) e.style.setProperty("--level", String(Math.max(0, Math.min(1, x)) * 0.7)); }
  function setTranscript(label, text) { const e = document.getElementById("transcript"); if (e) e.replaceChildren(el("b", { text: label + ": " }), document.createTextNode(text || "")); }
  function setTip(text) { lastTip = text || ""; render(Store.get()); }
  function setClock(time, date) { const c = document.getElementById("clock"), d = document.getElementById("today"); if (c) c.textContent = time; if (d) d.textContent = date; }
  function setWeather(temp, code) { const e = document.getElementById("weather"); if (e) e.replaceChildren(icon(WMO_ICON[code] || "w-cloud"), document.createTextNode(Math.round(temp) + "°")); }
  function setWakeActive(on) { const b = document.getElementById("wakeBtn"); if (b) b.classList.toggle("active", !!on); }

  function init() {
    applyTheme();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", () => { if ((Store.get().settings.theme || "system") === "system") applyTheme(); });

    const themeBtn = document.getElementById("themeBtn");
    if (themeBtn) themeBtn.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      const next = cur === "dark" ? "light" : "dark";
      Store.setSetting("theme", next); applyTheme(next);
    });
    const settingsBtn = document.getElementById("settingsBtn");
    if (settingsBtn) settingsBtn.addEventListener("click", openSettings);

    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

    Store.subscribe((s) => render(s));
    render(Store.get());
  }

  window.UI = {
    init, render, toast, applyTheme,
    setVoiceState, setLevel, setTranscript, setTip, setClock, setWeather, setWakeActive,
    openSettings,
  };
})();
