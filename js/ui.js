// ============================================================
// ui.js — zeichnet das Dashboard und alle Dialoge.
//
// Reines Rendering aus dem Store. Aenderungen laufen ueber Store.*
// -> Pub/Sub -> neu zeichnen. Bewusst ohne Inline-Styles (CSP).
// ============================================================
window.UI = (function () {
  const U = window.Utils;
  const { el, icon, iconBtn, field, clear } = U;

  let briefingText = "";
  let pomoTotalMs = 0;
  const expanded = { doneTasks: false, fullWeek: false };
  const taskFilter = { mode: "all" };
  const expandedTasks = new Set();

  // ---------- gemeinsame Bausteine ----------
  function cardShell(title, iconName, extraClass) {
    const head = el("div", { class: "card-head" }, [icon(iconName), el("div", { class: "card-title", text: title })]);
    const body = el("div", { class: "card-body" });
    const card = el("section", { class: "card" + (extraClass ? " " + extraClass : "") }, [head]);
    return { card, head, body };
  }
  function pill(text) { return el("span", { class: "count-pill", text: String(text) }); }
  function empty(text) { return el("div", { class: "empty", text }); }
  function chip(text, cls) { return el("span", { class: "chip" + (cls ? " " + cls : ""), text }); }
  function byDue(a, b) { const da = U.daysUntil(a.due), db = U.daysUntil(b.due); if (da === null && db === null) return (a.createdAt || 0) - (b.createdAt || 0); if (da === null) return 1; if (db === null) return -1; return da - db; }
  function dueChip(due) { const n = U.daysUntil(due); const cls = "due" + (n !== null && n < 0 ? " overdue" : n === 0 ? " today" : ""); return chip(U.dueLabel(due), cls); }

  // ---------- Aufgaben-Eintrag ----------
  function taskItem(t, opts) {
    opts = opts || {};
    const check = el("button", { class: "check", type: "button", title: t.done ? "Wieder offen" : "Erledigt", onclick: (e) => { if (t.done) { Store.updateTask(t.id, { done: false }); } else { const r = e.currentTarget.getBoundingClientRect(); burstConfetti(r.left + r.width / 2, r.top + r.height / 2); Store.completeTask(t.id); } } }, t.done ? icon("i-check") : null);
    const meta = el("div", { class: "task-meta" }, el("span", { class: "prio " + t.priority }));
    if (t.due) meta.appendChild(dueChip(t.due));
    if (t.repeat) meta.appendChild(chip(t.repeat.freq === "weekly" ? "woechentlich" : "taeglich", "repeat"));
    if (!opts.hideSubject && t.subject) meta.appendChild(chip(t.subject, "subject"));
    const actions = el("div", { class: "row-actions" }, [iconBtn("i-edit", "Bearbeiten", () => openTaskModal(t.type, t)), iconBtn("i-trash", "Loeschen", () => { Store.removeTask(t.id); toast("Geloescht"); })]);
    const mainKids = [el("div", { class: "task-title", text: t.title }), meta];
    const subs = t.subtasks || [];
    if (subs.length) {
      const doneN = subs.filter((x) => x.done).length, open = expandedTasks.has(t.id);
      const fill = el("div", { class: "sub-fill" });
      const prog = el("button", { class: "sub-prog", type: "button", title: "Unteraufgaben anzeigen", onclick: () => { open ? expandedTasks.delete(t.id) : expandedTasks.add(t.id); render(Store.get()); } }, [el("div", { class: "sub-bar" }, fill), el("span", { class: "sub-count", text: doneN + "/" + subs.length })]);
      fill.style.width = Math.round(doneN / subs.length * 100) + "%";
      mainKids.push(prog);
      if (open) mainKids.push(el("div", { class: "sub-list" }, subs.map((st) => el("div", { class: "sub-item" + (st.done ? " done" : "") }, [el("button", { class: "sub-check" + (st.done ? " on" : ""), type: "button", title: st.done ? "Offen" : "Erledigt", onclick: () => Store.toggleSubtask(t.id, st.id) }, st.done ? icon("i-check") : null), el("span", { class: "sub-text", text: st.title })]))));
    }
    return el("div", { class: "task" + (t.done ? " done" : "") }, [check, el("div", { class: "task-main" }, mainKids), actions]);
  }

  // ============================================================
  // Karten
  // ============================================================
  function buildOverview(s) {
    const { card, body } = cardShell("Ueberblick", "i-list", "card-wide");
    card.appendChild(body);
    const hour = new Date().getHours();
    body.appendChild(el("div", { class: "ov-greeting", text: (hour < 11 ? "Guten Morgen" : hour < 17 ? "Hallo" : "Guten Abend") + "!" }));

    if (briefingText) {
      const banner = el("div", { class: "ov-briefing" }, [icon("i-spark"), el("div", { class: "ov-briefing-text", text: briefingText }), iconBtn("i-x", "Ausblenden", () => { briefingText = ""; render(Store.get()); })]);
      body.appendChild(banner);
    }

    const open = s.tasks.filter((t) => !t.done);
    const dueToday = open.filter((t) => U.daysUntil(t.due) === 0).length;
    const overdue = open.filter((t) => { const n = U.daysUntil(t.due); return n !== null && n < 0; }).length;
    const todayKey = U.weekdayKey(new Date());
    const lessons = (s.timetable[todayKey] || []).length;
    const avg = Store.overallAverage();
    // Tagesfortschritt-Ring: heute erledigt vs. (heute erledigt + offen faellig/ueberfaellig)
    const today = U.todayYMD();
    const doneToday = s.tasks.filter((t) => t.done && t.doneAt && U.ymd(new Date(t.doneAt)) === today).length;
    const actionable = open.filter((t) => { const n = U.daysUntil(t.due); return n !== null && n <= 0; }).length;
    const total = doneToday + actionable, pct = total ? doneToday / total : 1;
    body.appendChild(el("div", { class: "ov-progress" }, [
      el("div", { class: "ring-wrap" }, [Charts.ring(pct), el("div", { class: "ring-pct", text: Math.round(pct * 100) + "%" })]),
      el("div", {}, [el("div", { class: "ov-prog-title", text: "Tagesfortschritt" }), el("div", { class: "muted small", text: total ? `${doneToday} von ${total} erledigt` : "Nichts faellig fuer heute" })]),
    ]));
    const stats = [
      ["heute faellig", dueToday], ["ueberfaellig", overdue], ["offen", open.length],
      ["Stunden heute", lessons], ["Fokus heute", Store.focusToday() + "m"], ["Schnitt", avg != null ? avg : "–"],
    ];
    body.appendChild(el("div", { class: "ov-stats" }, stats.map(([lab, val]) => el("div", { class: "ov-stat" }, [el("b", { text: String(val) }), el("span", { text: lab })]))));

    // Proaktive Tipps (lokal, ohne KI)
    const tips = [];
    if (overdue > 0) tips.push(["i-bell", `${overdue} ueberfaellige Aufgabe${overdue > 1 ? "n" : ""} – zuerst erledigen?`]);
    const nextExam = Store.upcomingExams(1)[0];
    if (nextExam) { const d = U.daysUntil(nextExam.date); if (d != null && d >= 0 && d <= 3) tips.push(["i-clipboard", `Test ${nextExam.subject} ${Store.dueLabel(nextExam.date)} – schon gelernt?`]); }
    const vDue = Store.vocabDue().length;
    if (vDue) tips.push(["i-book", `${vDue} Vokabel${vDue > 1 ? "n" : ""} faellig – kurz wiederholen?`]);
    const openHabit = s.habits.find((h) => !Store.isHabitDoneToday(h.id));
    if (openHabit) tips.push(["i-flame", `Gewohnheit „${openHabit.name}" heute noch offen.`]);
    if (tips.length) body.appendChild(el("div", { class: "ov-tips" }, tips.slice(0, 3).map(([ic, tx]) => el("div", { class: "ov-tip" }, [icon(ic), el("span", { text: tx })]))));

    const qa = el("div", { class: "ov-actions" }, [
      el("button", { class: "btn btn-sm", type: "button", onclick: () => openTaskModal("todo") }, [icon("i-plus"), document.createTextNode("Aufgabe")]),
      el("button", { class: "btn btn-sm", type: "button", onclick: () => openTaskModal("homework") }, [icon("i-book"), document.createTextNode("Hausaufgabe")]),
      el("button", { class: "btn btn-sm", type: "button", onclick: togglePomodoro }, [icon("i-play"), document.createTextNode("Fokus")]),
      el("button", { class: "btn btn-sm", type: "button", onclick: () => { if (window.App && App.runBriefing) App.runBriefing(true); } }, [icon("i-spark"), document.createTextNode("Briefing")]),
    ]);
    body.appendChild(qa);
    return card;
  }

  function buildPomodoro(s) {
    const { card, head, body } = cardShell("Lern-Timer", "i-clock");
    head.appendChild(iconBtn("i-settings", "Zeiten einstellen", openPomodoroSettings));
    card.appendChild(body);
    const p = s.pomodoro;
    const total = (p.phase === "work" ? p.settings.workMin : p.phase === "longbreak" ? p.settings.longBreakMin : p.phase === "break" ? p.settings.breakMin : p.settings.workMin) * 60000;
    pomoTotalMs = total;
    const remain = window.Pomodoro ? Pomodoro.remainingMs() : Math.max(0, p.endsAt - Date.now());

    // Ring
    const NS = "http://www.w3.org/2000/svg";
    const R = 52, C = 2 * Math.PI * R;
    const ring = document.createElementNS(NS, "svg"); ring.setAttribute("viewBox", "0 0 120 120"); ring.setAttribute("class", "pomo-ring");
    const bg = document.createElementNS(NS, "circle"); bg.setAttribute("cx", 60); bg.setAttribute("cy", 60); bg.setAttribute("r", R); bg.setAttribute("class", "pomo-ring-bg");
    const fg = document.createElementNS(NS, "circle"); fg.setAttribute("cx", 60); fg.setAttribute("cy", 60); fg.setAttribute("r", R); fg.setAttribute("class", "pomo-ring-fg"); fg.id = "pomoRing";
    fg.setAttribute("stroke-dasharray", C.toFixed(1));
    fg.setAttribute("stroke-dashoffset", String(C * (1 - (total ? Math.min(1, remain / total) : 0))));
    ring.appendChild(bg); ring.appendChild(fg);
    const label = el("div", { class: "pomo-center" }, [el("div", { id: "pomoTime", class: "pomo-time", text: U.fmtDuration(remain / 1000) }), el("div", { id: "pomoPhase", class: "pomo-phase", text: window.Pomodoro ? Pomodoro.phaseLabel(p.phase) : p.phase })]);
    body.appendChild(el("div", { class: "pomo-wrap" }, [ring, label]));

    const controls = el("div", { class: "pomo-controls" });
    if (p.phase === "idle" || (!p.running && p.remainingMs === 0)) controls.appendChild(el("button", { class: "btn btn-primary", type: "button", onclick: () => Store.pomodoroStart() }, [icon("i-play"), document.createTextNode("Start")]));
    else if (p.running) controls.appendChild(el("button", { class: "btn", type: "button", onclick: () => Store.pomodoroPause() }, [icon("i-pause"), document.createTextNode("Pause")]));
    else controls.appendChild(el("button", { class: "btn btn-primary", type: "button", onclick: () => Store.pomodoroResume() }, [icon("i-play"), document.createTextNode("Weiter")]));
    controls.appendChild(iconBtn("i-rotate", "Zuruecksetzen", () => Store.pomodoroReset()));
    body.appendChild(controls);
    body.appendChild(el("div", { class: "pomo-foot muted", text: `Heute ${Store.focusToday()} min · diese Woche ${Store.focusThisWeek()} min · ${p.settings.workMin}/${p.settings.breakMin} min` }));
    return card;
  }

  function buildTasks(s) {
    const { card, head, body } = cardShell("Aufgaben", "i-check");
    const todos = s.tasks.filter((t) => t.type === "todo");
    const allOpen = todos.filter((t) => !t.done).sort(byDue);
    const done = todos.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    head.appendChild(pill(allOpen.length)); head.appendChild(iconBtn("i-plus", "Aufgabe hinzufuegen", () => openTaskModal("todo")));
    card.appendChild(body);
    const isOverdue = (t) => { const n = U.daysUntil(t.due); return n !== null && n < 0; };
    const counts = { all: allOpen.length, today: allOpen.filter((t) => U.daysUntil(t.due) === 0).length, overdue: allOpen.filter(isOverdue).length, high: allOpen.filter((t) => t.priority === "high").length };
    if (allOpen.length) {
      const defs = [["all", "Alle"], ["today", "Heute"], ["overdue", "Ueberfaellig"], ["high", "Wichtig"]];
      body.appendChild(el("div", { class: "mini-filter" }, defs.map(([k, lab]) => el("button", { type: "button", class: "mini-chip" + (taskFilter.mode === k ? " on" : ""), onclick: () => { taskFilter.mode = k; render(Store.get()); } }, lab + (counts[k] ? " " + counts[k] : "")))));
    }
    let open = allOpen;
    if (taskFilter.mode === "today") open = allOpen.filter((t) => U.daysUntil(t.due) === 0);
    else if (taskFilter.mode === "overdue") open = allOpen.filter(isOverdue);
    else if (taskFilter.mode === "high") open = allOpen.filter((t) => t.priority === "high");
    if (open.length) open.forEach((t) => body.appendChild(taskItem(t)));
    else body.appendChild(empty(taskFilter.mode === "all" ? "Keine offenen Aufgaben. Stark!" : "Nichts in diesem Filter."));
    if (done.length) {
      body.appendChild(el("button", { class: "toggle-link", type: "button", onclick: () => { expanded.doneTasks = !expanded.doneTasks; render(Store.get()); } }, expanded.doneTasks ? "Erledigte ausblenden" : `Erledigte anzeigen (${done.length})`));
      if (expanded.doneTasks) done.forEach((t) => body.appendChild(taskItem(t)));
    }
    return card;
  }

  function buildHomework(s) {
    const { card, head, body } = cardShell("Hausaufgaben", "i-book");
    const hw = s.tasks.filter((t) => t.type === "homework" && !t.done).sort(byDue);
    head.appendChild(pill(hw.length)); head.appendChild(iconBtn("i-plus", "Hausaufgabe hinzufuegen", () => openTaskModal("homework")));
    card.appendChild(body);
    if (!hw.length) { body.appendChild(empty("Keine offenen Hausaufgaben.")); return card; }
    const groups = {}; hw.forEach((t) => { const k = t.subject || "Sonstige"; (groups[k] = groups[k] || []).push(t); });
    const lessonDate = (subj) => { const nl = Store.nextLessonOf(subj); return nl ? nl.date : "9999"; };
    Object.keys(groups).sort((a, b) => { const da = lessonDate(a), db = lessonDate(b); return da < db ? -1 : da > db ? 1 : a.localeCompare(b); }).forEach((subj) => {
      const g = el("div", { class: "subject-group" }, el("div", { class: "subject-head" }, [el("span", { text: subj }), pill(groups[subj].length)]));
      groups[subj].forEach((t) => g.appendChild(taskItem(t, { hideSubject: true })));
      body.appendChild(g);
    });
    return card;
  }

  function buildExams(s) {
    const { card, head, body } = cardShell("Tests", "i-clipboard");
    const list = Store.upcomingExams(20);
    head.appendChild(pill(list.length)); head.appendChild(iconBtn("i-plus", "Test hinzufuegen", openExamModal));
    card.appendChild(body);
    if (!list.length) { body.appendChild(empty("Keine Tests eingetragen.")); return card; }
    list.forEach((e) => {
      const n = U.daysUntil(e.date);
      const cd = el("span", { class: "exam-countdown" + (n <= 2 ? " soon" : ""), text: n <= 0 ? "heute" : n + " T" });
      body.appendChild(el("div", { class: "exam" }, [cd, el("div", { class: "exam-main" }, [el("div", { class: "exam-title", text: e.subject + (e.title ? " — " + e.title : "") }), el("div", { class: "exam-when muted", text: U.fmtDateShort(U.parseYMD(e.date)) })]), iconBtn("i-trash", "Loeschen", () => { Store.removeExam(e.id); toast("Geloescht"); })]));
    });
    return card;
  }

  function ttLessonRow(k, e) {
    return el("div", { class: "tt-lesson" }, [el("span", { class: "period", text: e.period ? e.period + "." : "" }), el("span", { class: "subj", text: e.subject }), e.room ? el("span", { class: "room", text: e.room }) : null, e.start ? el("span", { class: "time", text: e.start + (e.end ? "-" + e.end : "") }) : null, iconBtn("i-trash", "Loeschen", () => { Store.removeTimetableEntry(k, e.id); toast("Geloescht"); })]);
  }
  function buildTimetableGrid(s, todayKey) {
    const days = CONST.WEEKDAYS.slice(0, 5); // Mo–Fr
    const periodsSet = new Set(); let hasNoPeriod = false;
    days.forEach((k) => (s.timetable[k] || []).forEach((e) => { if (e.period != null) periodsSet.add(e.period); else hasNoPeriod = true; }));
    const periods = [...periodsSet].sort((a, b) => a - b);
    const grid = el("div", { class: "tt-grid" });
    grid.appendChild(el("div", { class: "tt-grid-head tt-period-label" }));
    days.forEach((k) => grid.appendChild(el("div", { class: "tt-grid-head" + (k === todayKey ? " is-today" : ""), text: CONST.WEEKDAY_SHORT[k] })));
    const rowFor = (label, period, pred) => {
      grid.appendChild(el("div", { class: "tt-period-label", text: label }));
      days.forEach((k) => {
        const entries = (s.timetable[k] || []).filter(pred);
        const cell = el("div", { class: "tt-cell" + (entries.length ? " has" : " empty") + (k === todayKey ? " is-today" : "") },
          entries.map((e) => el("div", { class: "tt-cell-lesson", title: "Loeschen", onclick: (ev) => { ev.stopPropagation(); Store.removeTimetableEntry(k, e.id); toast("Geloescht"); } }, [el("span", { class: "tt-cell-subj", text: e.subject }), e.room ? el("span", { class: "tt-cell-room", text: e.room }) : null])));
        cell.addEventListener("click", () => openTimetableModal({ day: k, period: period }));
        grid.appendChild(cell);
      });
    };
    periods.forEach((p) => rowFor(p + ".", p, (e) => e.period === p));
    if (hasNoPeriod) rowFor("—", null, (e) => e.period == null);
    return grid;
  }
  function buildTimetable(s) {
    const { card, head, body } = cardShell("Stundenplan", "i-calendar");
    const todayKey = U.weekdayKey(new Date());
    const view = expanded.ttView || "day";
    head.appendChild(el("div", { class: "mini-filter tt-toggle" }, [["day", "Heute"], ["week", "Woche"]].map(([k, lab]) => el("button", { type: "button", class: "mini-chip" + (view === k ? " on" : ""), onclick: () => { expanded.ttView = k; render(Store.get()); } }, lab))));
    head.appendChild(iconBtn("i-plus", "Stunde hinzufuegen", () => openTimetableModal()));
    card.appendChild(body);
    const hasAny = CONST.WEEKDAYS.some((k) => (s.timetable[k] || []).length);
    if (!hasAny) { body.appendChild(empty("Noch kein Stundenplan.")); return card; }
    if (view === "week") { body.appendChild(buildTimetableGrid(s, todayKey)); return card; }
    // Tagesansicht
    const nl = Store.nextLessonNow();
    if (nl) {
      const e = nl.entry, when = nl.startsInMin <= 0 ? "laeuft gerade" : "in " + nl.startsInMin + " min";
      const parts = [icon("i-clock"), el("b", { text: e.subject })];
      if (e.start) parts.push(document.createTextNode(" " + e.start));
      if (e.room) parts.push(document.createTextNode(" · " + e.room));
      parts.push(document.createTextNode(" — " + when));
      body.appendChild(el("div", { class: "tt-next" }, parts));
    }
    let dayK = todayKey;
    if (!(s.timetable[dayK] || []).length) { for (let i = 1; i <= 7; i++) { const k = U.weekdayKey(U.addDays(new Date(), i)); if ((s.timetable[k] || []).length) { dayK = k; break; } } }
    const dayEl = el("div", { class: "tt-day is-today" }, el("div", { class: "tt-day-name", text: CONST.WEEKDAY_LABELS[dayK] + (dayK === todayKey ? " (heute)" : "") }));
    (s.timetable[dayK] || []).forEach((e) => dayEl.appendChild(ttLessonRow(dayK, e)));
    body.appendChild(dayEl);
    return card;
  }

  function buildReminders(s) {
    const { card, head, body } = cardShell("Erinnerungen", "i-bell");
    head.appendChild(iconBtn("i-plus", "Erinnerung hinzufuegen", openReminderModal));
    card.appendChild(body);
    if (window.Reminders && Reminders.permission() === "default") body.appendChild(el("button", { class: "btn btn-ghost btn-block btn-mb", type: "button", onclick: async () => { await Reminders.requestPermission(); render(Store.get()); } }, "Benachrichtigungen aktivieren"));
    const now = Date.now();
    const up = s.reminders.filter((r) => !r.fired && r.at >= now).sort((a, b) => a.at - b.at);
    const past = s.reminders.filter((r) => r.fired || r.at < now).sort((a, b) => b.at - a.at).slice(0, 4);
    if (!up.length && !past.length) { body.appendChild(empty("Keine Erinnerungen.")); return card; }
    up.concat(past).forEach((r) => body.appendChild(el("div", { class: "reminder" + (r.fired || r.at < now ? " past" : "") }, [icon("i-bell"), el("div", { class: "reminder-main" }, [el("div", { class: "reminder-text", text: r.text }), el("div", { class: "reminder-when", text: U.fmtDateTime(r.at) })]), iconBtn("i-trash", "Loeschen", () => { Store.removeReminder(r.id); toast("Geloescht"); })])));
    return card;
  }

  function buildGrades(s) {
    const { card, head, body } = cardShell("Noten", "i-award");
    const avg = Store.overallAverage();
    if (avg != null) head.appendChild(el("span", { class: "count-pill strong", text: "Ø " + avg }));
    head.appendChild(iconBtn("i-target", "Notenziel rechnen", () => openGradeGoalModal()));
    head.appendChild(iconBtn("i-plus", "Note eintragen", openGradeModal));
    card.appendChild(body);
    if (!s.grades.length) { body.appendChild(empty("Noch keine Noten.")); return card; }
    const chart = Charts.gradeBars(); if (chart) body.appendChild(chart);
    const avgs = Store.subjectAverages();
    Object.keys(avgs).forEach((subj) => {
      const list = s.grades.filter((g) => g.subject === subj);
      const row = el("div", { class: "grade-row" }, [el("span", { class: "grade-subj", text: subj }), el("span", { class: "grade-avg", text: "Ø " + avgs[subj] }), el("span", { class: "grade-list muted", text: list.map((g) => g.value).join(", ") })]);
      row.addEventListener("click", () => openGradeListModal(subj));
      body.appendChild(row);
    });
    return card;
  }

  function buildHabits(s) {
    const { card, head, body } = cardShell("Gewohnheiten", "i-flame");
    head.appendChild(iconBtn("i-plus", "Gewohnheit hinzufuegen", openHabitModal));
    card.appendChild(body);
    if (!s.habits.length) { body.appendChild(empty("Noch keine Gewohnheiten.")); return card; }
    s.habits.forEach((h) => {
      const doneToday = Store.isHabitDoneToday(h.id), streak = Store.habitStreak(h.id);
      const check = el("button", { class: "check" + (doneToday ? " on" : ""), type: "button", title: "Heute abhaken", onclick: () => Store.toggleHabitToday(h.id) }, doneToday ? icon("i-check") : null);
      const main = el("div", { class: "habit-main" }, [el("div", { class: "habit-name", text: h.name }), Charts.habitStrip(h)]);
      const streakEl = el("div", { class: "habit-streak" + (streak > 0 ? " on" : "") }, [icon("i-flame"), el("span", { text: String(streak) })]);
      const del = iconBtn("i-trash", "Loeschen", () => { Store.removeHabit(h.id); toast("Geloescht"); });
      body.appendChild(el("div", { class: "habit" }, [check, main, streakEl, del]));
    });
    return card;
  }

  function buildNotes(s) {
    const { card, head, body } = cardShell("Notizen", "i-note");
    head.appendChild(iconBtn("i-plus", "Notiz hinzufuegen", () => openNoteModal()));
    card.appendChild(body);
    if (!s.notes.length) { body.appendChild(empty("Noch keine Notizen.")); return card; }
    const sorted = s.notes.slice().sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
    sorted.forEach((n) => {
      const item = el("div", { class: "note" + (n.pinned ? " pinned" : "") }, [
        el("div", { class: "note-main", onclick: () => openNoteModal(n) }, [el("div", { class: "note-title", text: n.title || "(ohne Titel)" }), el("div", { class: "note-body muted", text: n.body.slice(0, 80) })]),
        el("div", { class: "row-actions" }, [iconBtn("i-pin", n.pinned ? "Loesen" : "Anpinnen", () => Store.updateNote(n.id, { pinned: !n.pinned }), n.pinned ? "active" : ""), iconBtn("i-trash", "Loeschen", () => { Store.removeNote(n.id); toast("Geloescht"); })]),
      ]);
      body.appendChild(item);
    });
    return card;
  }

  function buildEvents(s) {
    const { card, head, body } = cardShell("Termine", "i-calendar");
    const list = Store.upcomingEvents(20);
    head.appendChild(pill(list.length)); head.appendChild(iconBtn("i-plus", "Termin hinzufuegen", openEventModal));
    card.appendChild(body);
    if (!list.length) { body.appendChild(empty("Keine Termine.")); return card; }
    list.forEach((e) => body.appendChild(el("div", { class: "event" }, [el("div", { class: "event-date" }, [el("b", { text: U.parseYMD(e.date).toLocaleDateString("de-DE", { day: "numeric" }) }), el("span", { text: U.parseYMD(e.date).toLocaleDateString("de-DE", { month: "short" }) })]), el("div", { class: "event-main" }, [el("div", { class: "event-title", text: e.title }), el("div", { class: "muted", text: [e.time, e.location].filter(Boolean).join(" · ") || U.dueLabel(e.date) })]), iconBtn("i-trash", "Loeschen", () => { Store.removeEvent(e.id); toast("Geloescht"); })])));
    return card;
  }

  function buildGoals(s) {
    const { card, head, body } = cardShell("Ziele", "i-target");
    head.appendChild(iconBtn("i-plus", "Ziel hinzufuegen", openGoalModal));
    card.appendChild(body);
    if (!s.goals.length) { body.appendChild(empty("Noch keine Ziele.")); return card; }
    s.goals.forEach((g) => {
      const frac = g.target ? U.clamp(g.progress / g.target, 0, 1) : 0;
      const bar = el("div", { class: "goal-bar" }, el("div", { class: "goal-fill" }));
      bar.firstChild.style.width = Math.round(frac * 100) + "%"; // CSSOM (CSP-ok)
      const step = Math.max(1, Math.round(g.target / 10));
      body.appendChild(el("div", { class: "goal" }, [
        el("div", { class: "goal-top" }, [el("span", { class: "goal-title", text: g.title }), el("span", { class: "muted", text: `${g.progress}/${g.target}` })]),
        bar,
        el("div", { class: "goal-actions" }, [iconBtn("i-minus", "Weniger", () => Store.updateGoal(g.id, { progress: g.progress - step })), iconBtn("i-plus", "Mehr", () => Store.updateGoal(g.id, { progress: g.progress + step })), iconBtn("i-trash", "Loeschen", () => { Store.removeGoal(g.id); toast("Geloescht"); })]),
      ]));
    });
    return card;
  }

  function buildCalendar(s) {
    const { card, body } = cardShell("Kalender", "i-calendar", "card-wide");
    card.appendChild(body);
    body.appendChild(Calendar.build(s));
    return card;
  }

  function buildStats(s) {
    const { card, body } = cardShell("Statistik", "i-chart");
    card.appendChild(body);
    body.appendChild(el("div", { class: "stat-title muted", text: "Fokuszeit diese Woche (min)" }));
    body.appendChild(Charts.weekFocus());
    const trend = Charts.gradeTrend && Charts.gradeTrend();
    if (trend) { body.appendChild(el("div", { class: "stat-title muted", text: "Noten-Verlauf (oben = besser)" })); body.appendChild(trend); }
    body.appendChild(el("div", { class: "ov-stats" }, [
      el("div", { class: "ov-stat" }, [el("b", { text: String(Store.tasksDoneThisWeek()) }), el("span", { text: "erledigt (Woche)" })]),
      el("div", { class: "ov-stat" }, [el("b", { text: Store.focusThisWeek() + "m" }), el("span", { text: "Fokus (Woche)" })]),
    ]));
    return card;
  }

  function buildVocab(s) {
    const { card, head, body } = cardShell("Vokabeln", "i-book");
    const due = Store.vocabDue().length;
    head.appendChild(pill(s.vocab.length));
    head.appendChild(iconBtn("i-plus", "Vokabel hinzufuegen", openVocabModal));
    card.appendChild(body);
    body.appendChild(el("button", { class: "btn btn-primary btn-block btn-mb", type: "button", onclick: openVocabQuiz }, [icon("i-play"), document.createTextNode(due ? `Lernen (${due} faellig)` : "Alles wiederholt")]));
    if (!s.vocab.length) { body.appendChild(empty("Noch keine Vokabeln.")); return card; }
    s.vocab.slice(0, 6).forEach((v) => body.appendChild(el("div", { class: "vocab-row" }, [el("span", { class: "vocab-front", text: v.front }), el("span", { class: "vocab-back muted", text: v.back }), el("span", { class: "vocab-box", text: "Box " + v.box }), iconBtn("i-trash", "Loeschen", () => { Store.removeVocab(v.id); toast("Geloescht"); })])));
    if (s.vocab.length > 6) body.appendChild(el("div", { class: "muted small", text: `und ${s.vocab.length - 6} weitere` }));
    return card;
  }

  function buildBudget(s) {
    const { card, body } = cardShell("Taschengeld", "i-wallet");
    card.appendChild(body);
    const bal = Store.balance(), flow = Store.monthFlow();
    body.appendChild(el("div", { class: "budget-balance" }, [el("b", { text: bal.toFixed(2) + " " + CONST.CURRENCY }), el("span", { class: "muted", text: `diesen Monat +${flow.inc.toFixed(2)} / ${flow.exp.toFixed(2)}` })]));
    body.appendChild(el("div", { class: "btn-row btn-mb" }, [el("button", { class: "btn btn-sm", type: "button", onclick: () => openBudgetModal("income") }, [icon("i-plus"), document.createTextNode("Einnahme")]), el("button", { class: "btn btn-sm", type: "button", onclick: () => openBudgetModal("expense") }, [icon("i-minus"), document.createTextNode("Ausgabe")])]));
    const recent = s.budget.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
    if (!recent.length) { body.appendChild(empty("Noch keine Buchungen.")); return card; }
    recent.forEach((e) => body.appendChild(el("div", { class: "budget-row" }, [el("span", { class: "budget-label", text: e.label || (e.amount >= 0 ? "Einnahme" : "Ausgabe") }), el("span", { class: "budget-amt " + (e.amount >= 0 ? "pos" : "neg"), text: (e.amount >= 0 ? "+" : "") + e.amount.toFixed(2) }), iconBtn("i-trash", "Loeschen", () => { Store.removeBudgetEntry(e.id); toast("Geloescht"); })])));
    return card;
  }

  let _firstRender = true;
  function render(s) {
    const root = document.getElementById("dashboard");
    if (!root) return;
    root.replaceChildren(
      buildOverview(s), buildPomodoro(s), buildTasks(s), buildHomework(s), buildExams(s),
      buildTimetable(s), buildReminders(s), buildGrades(s), buildVocab(s), buildHabits(s),
      buildNotes(s), buildEvents(s), buildGoals(s), buildBudget(s), buildCalendar(s), buildStats(s),
    );
    if (_firstRender) {
      _firstRender = false;
      // Karten fliegen einmalig gestaffelt herein. Spaetere Re-Renders erzeugen neue
      // (klassenlose) Karten -> keine Wiederholung der Animation bei jeder Aenderung.
      if (!reduceMotion()) {
        const kids = root.children;
        for (let i = 0; i < kids.length; i++) { kids[i].classList.add("card-enter"); kids[i].style.animationDelay = (i * 0.06).toFixed(3) + "s"; }
        root.querySelectorAll(".ov-stat b").forEach((b) => countUp(b, b.textContent));
      }
    }
  }

  // ============================================================
  // Modals
  // ============================================================
  function prefersReduced() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function reduceMotion() { try { if (window.Store && Store.get().settings && Store.get().settings.reduceAnim) return true; } catch (e) {} return prefersReduced(); }
  function removeModalBack(back) {
    if (!back || back.dataset.closing) return;
    back.dataset.closing = "1";
    if (reduceMotion()) { back.remove(); return; }
    back.classList.add("closing");
    let done = false; const fin = () => { if (done) return; done = true; back.remove(); };
    back.addEventListener("animationend", fin, { once: true });
    setTimeout(fin, 400); // Fallback, falls animationend ausbleibt
  }
  function closeModal() { const r = document.getElementById("modalRoot"); if (r) removeModalBack(r.querySelector(".modal-back")); }
  function openModal(title, bodyEl, opts) {
    const r = document.getElementById("modalRoot"); if (!r) return;
    const existing = r.querySelector(".modal-back"); if (existing) existing.remove(); // sofort weg -> kein Stapeln/Doppel-Backdrop
    const head = el("div", { class: "modal-head" }, [el("h3", { text: title }), iconBtn("i-x", "Schliessen", closeModal)]);
    const modal = el("div", { class: "modal" + (opts && opts.wide ? " wide" : "") }, [head, bodyEl]);
    const back = el("div", { class: "modal-back", onclick: (e) => { if (e.target === back) closeModal(); } }, modal);
    r.appendChild(back);
    setTimeout(() => { const i = modal.querySelector("input,textarea,select"); if (i) i.focus(); }, 40);
  }
  function subjectDatalist() { return el("datalist", { id: "subjectList" }, Store.subjects().map((x) => el("option", { value: x }))); }
  function actions(saveLabel, onSave) { return el("div", { class: "modal-actions" }, [el("button", { class: "btn", type: "button", text: "Abbrechen", onclick: closeModal }), el("button", { class: "btn btn-primary", type: "button", text: saveLabel, onclick: onSave })]); }
  function seg(options, initial, onPick) {
    let value = initial; const box = el("div", { class: "seg" });
    options.forEach(([val, lab]) => { const b = el("button", { type: "button", class: val === value ? "on" : "", text: lab, onclick: () => { value = val; box.querySelectorAll("button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); if (onPick) onPick(val); } }); box.appendChild(b); });
    return { box, get: () => value };
  }

  function openTaskModal(type, existing) {
    type = existing ? existing.type : (type || "todo");
    const isHw = type === "homework";
    const titleI = el("input", { type: "text", value: existing ? existing.title : "", placeholder: isHw ? "Was ist auf?" : "Was ist zu tun?" });
    const subjI = el("input", { type: "text", list: "subjectList", value: existing && existing.subject ? existing.subject : "", placeholder: "Fach" });
    const dueI = el("input", { type: "date", value: existing && existing.due ? existing.due : "" });
    const prio = seg([["low", "Niedrig"], ["med", "Mittel"], ["high", "Hoch"]], existing ? existing.priority : "med");
    const rep = seg(CONST.REPEAT_OPTIONS.map((r) => [r.id, r.label]), existing && existing.repeat ? existing.repeat.freq : "none");
    const subWrap = el("div", { class: "sub-edit" });
    const subRow = (st) => { const inp = el("input", { type: "text", value: st.title || "", placeholder: "Unteraufgabe" }); const row = el("div", { class: "sub-edit-row" }, [inp, iconBtn("i-x", "Entfernen", () => row.remove())]); row._get = () => ({ id: st.id, title: inp.value.trim(), done: !!st.done }); inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }); return row; };
    const addSub = () => { const r = subRow({}); subWrap.appendChild(r); const i = r.querySelector("input"); if (i) i.focus(); };
    ((existing && existing.subtasks) || []).forEach((st) => subWrap.appendChild(subRow(st)));
    const addSubBtn = el("button", { class: "btn btn-sm btn-ghost", type: "button", onclick: addSub }, [icon("i-plus"), document.createTextNode("Unteraufgabe")]);
    // Hausaufgaben: Faelligkeit per Datum ODER "naechste Stunde dieses Fachs"
    const dueField = field("Faellig bis", dueI);
    const dueModeInit = existing && existing.dueMode === "nextLesson" ? "nextLesson" : "date";
    const preview = el("div", { class: "field-hint hidden" });
    const dueMode = isHw ? seg([["date", "Datum"], ["nextLesson", "Naechste Stunde"]], dueModeInit, () => syncDue()) : null;
    function syncDue() {
      const mode = dueMode ? dueMode.get() : "date";
      if (mode === "nextLesson") {
        dueField.classList.add("hidden"); preview.classList.remove("hidden");
        const subj = subjI.value.trim();
        if (!subj) { preview.textContent = "Bitte Fach angeben."; return; }
        const nl = Store.nextLessonOf(subj); const d = nl && U.parseYMD(nl.date);
        preview.textContent = nl ? ("→ faellig am " + (d ? U.fmtDateShort(d) : nl.date) + " (naechste " + subj + "-Stunde)") : ("Kein Stundenplan-Eintrag fuer " + subj + " — bitte Datum waehlen.");
      } else { dueField.classList.remove("hidden"); preview.classList.add("hidden"); }
    }
    if (isHw) subjI.addEventListener("input", syncDue);
    const save = () => {
      const title = titleI.value.trim(); if (!title) { titleI.focus(); return; }
      const subtasks = Array.from(subWrap.children).map((r) => r._get && r._get()).filter((x) => x && x.title);
      const data = { title, type, subject: subjI.value.trim() || null, due: dueI.value || null, dueMode: isHw ? dueMode.get() : "date", priority: prio.get(), repeat: rep.get() !== "none" ? { freq: rep.get() } : null, subtasks };
      if (existing) Store.updateTask(existing.id, data); else Store.addTask(data);
      closeModal(); toast(existing ? "Gespeichert" : "Hinzugefuegt", "success");
    };
    titleI.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    const kids = [subjectDatalist(), field("Titel", titleI), field(isHw ? "Fach" : "Fach (optional)", subjI)];
    if (isHw) kids.push(field("Faelligkeit", dueMode.box));
    kids.push(el("div", { class: "field-row" }, [dueField, field("Prioritaet", prio.box)]));
    if (isHw) kids.push(preview);
    kids.push(field("Wiederholen", rep.box), field("Unteraufgaben", el("div", {}, [subWrap, addSubBtn])), actions(existing ? "Speichern" : "Hinzufuegen", save));
    if (isHw) syncDue();
    openModal(existing ? "Bearbeiten" : (isHw ? "Neue Hausaufgabe" : "Neue Aufgabe"), el("div", { class: "modal-body" }, kids));
  }
  function editTask(t) { openTaskModal(t.type, t); }

  function openReminderModal() {
    const textI = el("input", { type: "text", placeholder: "Woran erinnern?" });
    const dtI = el("input", { type: "datetime-local", value: toLocalInput(new Date(Date.now() + 3600000)) });
    const save = async () => { const text = textI.value.trim(); if (!text) { textI.focus(); return; } const at = dtI.value ? new Date(dtI.value).getTime() : 0; if (!at) { dtI.focus(); return; } Store.addReminder(text, at); if (window.Reminders && Reminders.permission() === "default") await Reminders.requestPermission(); closeModal(); toast("Erinnerung gesetzt", "success"); };
    textI.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    openModal("Neue Erinnerung", el("div", { class: "modal-body" }, [field("Text", textI), field("Wann", dtI), actions("Setzen", save)]));
  }

  function openTimetableModal(prefill) {
    prefill = prefill || {};
    const daySel = el("select", {}, CONST.WEEKDAYS.map((k) => el("option", { value: k }, CONST.WEEKDAY_LABELS[k])));
    const tk = U.weekdayKey(new Date()); daySel.value = prefill.day || ((tk === "sat" || tk === "sun") ? "mon" : tk);
    const subjI = el("input", { type: "text", list: "subjectList", placeholder: "Fach" });
    const periodI = el("input", { type: "number", min: "1", max: "12", placeholder: "1", value: prefill.period != null ? String(prefill.period) : "" });
    const startI = el("input", { type: "time" }), endI = el("input", { type: "time" }), roomI = el("input", { type: "text", placeholder: "Raum" });
    const save = () => { const subject = subjI.value.trim(); if (!subject) { subjI.focus(); return; } Store.setTimetableEntry({ day: daySel.value, subject, period: periodI.value, start: startI.value, end: endI.value, room: roomI.value }); closeModal(); toast("Eingetragen", "success"); };
    openModal("Schulstunde", el("div", { class: "modal-body" }, [subjectDatalist(), el("div", { class: "field-row" }, [field("Tag", daySel), field("Stunde", periodI)]), field("Fach", subjI), el("div", { class: "field-row" }, [field("Von", startI), field("Bis", endI)]), field("Raum", roomI), actions("Eintragen", save)]));
  }

  function openGradeModal() {
    const subjI = el("input", { type: "text", list: "subjectList", placeholder: "Fach" });
    const valI = el("input", { type: "number", min: "1", max: "6", step: "0.25", placeholder: "z.B. 2 oder 2.5" });
    const wI = el("input", { type: "number", min: "0.5", max: "5", step: "0.5", value: "1" });
    const labI = el("input", { type: "text", placeholder: "z.B. Klassenarbeit (optional)" });
    const save = () => { const subject = subjI.value.trim(); const value = Number(valI.value); if (!subject) { subjI.focus(); return; } if (!(value >= 1 && value <= 6)) { valI.focus(); return; } Store.addGrade({ subject, value, weight: Number(wI.value) || 1, label: labI.value.trim() || null }); closeModal(); toast("Note eingetragen", "success"); };
    openModal("Note eintragen", el("div", { class: "modal-body" }, [subjectDatalist(), field("Fach", subjI), el("div", { class: "field-row" }, [field("Note (1-6)", valI), field("Gewicht", wI)]), field("Bezeichnung", labI), actions("Eintragen", save)]));
  }
  function openGradeListModal(subject) {
    const list = Store.get().grades.filter((g) => g.subject === subject);
    const body = el("div", { class: "modal-body" }, [el("div", { class: "muted mb", text: "Schnitt: " + Store.subjectAverage(subject) })]);
    const dated = list.filter((g) => g.date).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (dated.length >= 2 && Charts.lineChart) { const sp = Charts.lineChart(dated.map((g) => g.value)); if (sp) { body.appendChild(el("div", { class: "stat-title muted", text: "Verlauf (oben = besser)" })); body.appendChild(sp); } }
    list.forEach((g) => body.appendChild(el("div", { class: "grade-item" }, [el("span", { class: "grade-val", text: String(g.value) }), el("span", { class: "muted", text: (g.label || "") + (g.weight !== 1 ? ` ·×${g.weight}` : "") + " · " + g.date }), iconBtn("i-trash", "Loeschen", () => { Store.removeGrade(g.id); closeModal(); toast("Geloescht"); })])));
    body.appendChild(el("div", { class: "modal-actions" }, el("button", { class: "btn btn-block", type: "button", text: "Schliessen", onclick: closeModal })));
    openModal("Noten: " + subject, body);
  }

  function openGradeGoalModal(prefillSubject) {
    const subjects = Store.gradeSubjects();
    const list = el("datalist", { id: "goalSubjects" }, subjects.map((x) => el("option", { value: x })));
    const subjI = el("input", { type: "text", list: "goalSubjects", placeholder: "Fach", value: prefillSubject || subjects[0] || "" });
    const targetI = el("input", { type: "number", min: "1", max: "6", step: "0.25", value: "2" });
    const weightI = el("input", { type: "number", min: "0.5", max: "5", step: "0.5", value: "2" });
    const result = el("div", { class: "goal-result" });
    function calc() {
      const subject = subjI.value.trim(), target = Number(targetI.value), weight = Number(weightI.value) || 1;
      clear(result);
      if (!subject || !(target >= 1 && target <= 6)) { result.appendChild(el("div", { class: "muted", text: "Fach und Wunsch-Schnitt (1-6) eingeben." })); return; }
      const cur = Store.subjectAverage(subject), needed = Store.neededGrade(subject, target, weight);
      let msg, cls;
      if (needed >= 6) { msg = "Selbst eine 6 reicht - du haeltst den Schnitt locker."; cls = "ok"; }
      else if (needed < 1) { msg = "Mit einer einzelnen Note nicht mehr erreichbar (selbst eine 1 reicht nicht)."; cls = "bad"; }
      else { msg = `Du brauchst mindestens eine ${needed} (oder besser).`; cls = needed >= 4 ? "bad" : needed >= 2.5 ? "warn" : "ok"; }
      result.appendChild(el("div", { class: "goal-needed " + cls, text: msg }));
      result.appendChild(el("div", { class: "muted small", text: `Aktueller Schnitt in ${subject}: ${cur != null ? cur : "noch keine Noten"} · Gewicht: ${weight}` }));
      result.appendChild(el("div", { class: "muted small", text: "Schnitt je naechster Note:" }));
      const table = el("div", { class: "goal-table" });
      [1, 2, 3, 4, 5, 6].forEach((g) => table.appendChild(el("div", { class: "goal-cell" }, [el("b", { text: String(g) }), el("span", { text: "→ " + Store.projectedAverage(subject, g, weight) })])));
      result.appendChild(table);
    }
    [subjI, targetI, weightI].forEach((i) => i.addEventListener("input", calc));
    openModal("Notenziel-Rechner", el("div", { class: "modal-body" }, [list, field("Fach", subjI), el("div", { class: "field-row" }, [field("Wunsch-Schnitt", targetI), field("Gewicht naechste Note", weightI)]), result, el("div", { class: "modal-actions" }, el("button", { class: "btn btn-block", type: "button", text: "Schliessen", onclick: closeModal }))]));
    calc();
  }

  function openExamModal() {
    const subjI = el("input", { type: "text", list: "subjectList", placeholder: "Fach" });
    const titleI = el("input", { type: "text", placeholder: "Thema (optional)" });
    const dateI = el("input", { type: "date", value: U.ymd(U.addDays(new Date(), 7)) });
    const save = () => { const subject = subjI.value.trim(); if (!subject) { subjI.focus(); return; } if (!dateI.value) { dateI.focus(); return; } Store.addExam({ subject, title: titleI.value.trim() || null, date: dateI.value }); closeModal(); toast("Test eingetragen", "success"); };
    openModal("Test / Klassenarbeit", el("div", { class: "modal-body" }, [subjectDatalist(), field("Fach", subjI), field("Thema", titleI), field("Datum", dateI), actions("Eintragen", save)]));
  }

  function openHabitModal() {
    const nameI = el("input", { type: "text", placeholder: "z.B. Vokabeln lernen" });
    const save = () => { const name = nameI.value.trim(); if (!name) { nameI.focus(); return; } Store.addHabit(name); closeModal(); toast("Gewohnheit angelegt", "success"); };
    nameI.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    openModal("Neue Gewohnheit", el("div", { class: "modal-body" }, [field("Name", nameI), actions("Anlegen", save)]));
  }

  function openNoteModal(existing) {
    const titleI = el("input", { type: "text", value: existing ? existing.title : "", placeholder: "Titel (optional)" });
    const bodyI = el("textarea", { class: "ta", placeholder: "Notiz..." }); bodyI.value = existing ? existing.body : "";
    const save = () => { const body = bodyI.value.trim(); if (!body && !titleI.value.trim()) { bodyI.focus(); return; } if (existing) Store.updateNote(existing.id, { title: titleI.value, body: bodyI.value }); else Store.addNote({ title: titleI.value, body: bodyI.value }); closeModal(); toast("Gespeichert", "success"); };
    openModal(existing ? "Notiz" : "Neue Notiz", el("div", { class: "modal-body" }, [field("Titel", titleI), field("Text", bodyI), actions("Speichern", save)]));
  }
  function openNote(n) { openNoteModal(n); }

  function openEventModal() {
    const titleI = el("input", { type: "text", placeholder: "Titel" });
    const dateI = el("input", { type: "date", value: U.todayYMD() });
    const timeI = el("input", { type: "time" }), locI = el("input", { type: "text", placeholder: "Ort (optional)" });
    const save = () => { const title = titleI.value.trim(); if (!title) { titleI.focus(); return; } if (!dateI.value) { dateI.focus(); return; } Store.addEvent({ title, date: dateI.value, time: timeI.value, location: locI.value.trim() }); closeModal(); toast("Termin angelegt", "success"); };
    openModal("Neuer Termin", el("div", { class: "modal-body" }, [field("Titel", titleI), el("div", { class: "field-row" }, [field("Datum", dateI), field("Uhrzeit", timeI)]), field("Ort", locI), actions("Anlegen", save)]));
  }

  function openGoalModal() {
    const titleI = el("input", { type: "text", placeholder: "z.B. 100 Vokabeln lernen" });
    const targetI = el("input", { type: "number", min: "1", value: "100" });
    const save = () => { const title = titleI.value.trim(); if (!title) { titleI.focus(); return; } Store.addGoal({ title, target: Number(targetI.value) || 100 }); closeModal(); toast("Ziel angelegt", "success"); };
    openModal("Neues Ziel", el("div", { class: "modal-body" }, [field("Ziel", titleI), field("Zielwert", targetI), actions("Anlegen", save)]));
  }

  function openVocabModal() {
    const f = el("input", { type: "text", placeholder: "Vorderseite (z.B. the house)" });
    const b = el("input", { type: "text", placeholder: "Rueckseite (z.B. das Haus)" });
    const save = () => { if (!f.value.trim() || !b.value.trim()) { f.focus(); return; } Store.addVocab({ front: f.value, back: b.value }); f.value = ""; b.value = ""; toast("Vokabel gespeichert", "success"); f.focus(); };
    f.addEventListener("keydown", (e) => { if (e.key === "Enter") b.focus(); });
    b.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    openModal("Neue Vokabel", el("div", { class: "modal-body" }, [field("Vorderseite", f), field("Rueckseite", b), el("div", { class: "modal-actions" }, [el("button", { class: "btn", type: "button", text: "Fertig", onclick: closeModal }), el("button", { class: "btn btn-primary", type: "button", text: "Speichern", onclick: save })])]));
  }
  function openVocabQuiz() {
    const due = Store.vocabDue();
    if (!due.length) { toast("Keine Vokabeln faellig. Stark!"); return; }
    let i = 0, correct = 0;
    const bodyEl = el("div", { class: "modal-body quiz" });
    function draw() {
      clear(bodyEl);
      if (i >= due.length) { bodyEl.appendChild(el("div", { class: "quiz-done" }, [el("p", { text: `Fertig! ${correct} von ${due.length} gewusst.` }), el("button", { class: "btn btn-primary btn-block", type: "button", text: "Schliessen", onclick: closeModal })])); return; }
      const c = due[i];
      bodyEl.appendChild(el("div", { class: "quiz-count muted", text: `${i + 1} / ${due.length}` }));
      const flipCard = el("div", { class: "flip", title: "Zum Umdrehen tippen" }, el("div", { class: "flip-inner" }, [
        el("div", { class: "flip-face flip-front" }, el("span", { text: c.front })),
        el("div", { class: "flip-face flip-back" }, el("span", { text: c.back })),
      ]));
      const judge = el("div", { class: "quiz-judge hidden" }, [el("button", { class: "btn", type: "button", text: "Nochmal", onclick: () => { Store.reviewVocab(c.id, false); i++; draw(); } }), el("button", { class: "btn btn-primary", type: "button", text: "Gewusst", onclick: () => { Store.reviewVocab(c.id, true); correct++; i++; draw(); } })]);
      const reveal = el("button", { class: "btn btn-block", type: "button", text: "Antwort zeigen (Karte drehen)", onclick: flip });
      function flip() { if (flipCard.classList.contains("flipped")) return; flipCard.classList.add("flipped"); reveal.classList.add("hidden"); judge.classList.remove("hidden"); }
      flipCard.addEventListener("click", flip);
      bodyEl.appendChild(flipCard); bodyEl.appendChild(reveal); bodyEl.appendChild(judge);
    }
    draw();
    openModal("Vokabeln lernen", bodyEl);
  }
  function openBudgetModal(type) {
    const amt = el("input", { type: "number", step: "0.01", min: "0", placeholder: "Betrag in EUR" });
    const lab = el("input", { type: "text", placeholder: "Wofuer? (optional)" });
    const save = () => { const a = Number(amt.value); if (!(a > 0)) { amt.focus(); return; } Store.addBudgetEntry({ amount: a, label: lab.value.trim(), type }); closeModal(); toast("Gebucht", "success"); };
    amt.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    openModal(type === "income" ? "Einnahme" : "Ausgabe", el("div", { class: "modal-body" }, [field("Betrag (" + CONST.CURRENCY + ")", amt), field("Bezeichnung", lab), actions("Buchen", save)]));
  }

  function openPomodoroSettings() {
    const p = Store.get().pomodoro.settings;
    const wI = el("input", { type: "number", min: "1", max: "180", value: String(p.workMin) });
    const bI = el("input", { type: "number", min: "1", max: "60", value: String(p.breakMin) });
    const lI = el("input", { type: "number", min: "1", max: "60", value: String(p.longBreakMin) });
    const eI = el("input", { type: "number", min: "2", max: "12", value: String(p.longEvery) });
    const autoS = seg([["1", "An"], ["0", "Aus"]], p.autostart ? "1" : "0");
    const save = () => { Store.pomodoroSetSettings({ workMin: U.clamp(+wI.value, 1, 180), breakMin: U.clamp(+bI.value, 1, 60), longBreakMin: U.clamp(+lI.value, 1, 60), longEvery: U.clamp(+eI.value, 2, 12), autostart: autoS.get() === "1" }); closeModal(); toast("Gespeichert", "success"); };
    openModal("Lern-Timer Einstellungen", el("div", { class: "modal-body" }, [el("div", { class: "field-row" }, [field("Lernen (min)", wI), field("Pause (min)", bI)]), el("div", { class: "field-row" }, [field("Lange Pause (min)", lI), field("Lange Pause alle", eI)]), field("Automatisch weiter", autoS.box), actions("Speichern", save)]));
  }
  function togglePomodoro() { const p = Store.get().pomodoro; if (p.running) Store.pomodoroPause(); else if (p.remainingMs > 0) Store.pomodoroResume(); else Store.pomodoroStart(); }

  function openSettings() {
    const s = Store.get().settings;
    const themeBox = seg([["light", "Hell"], ["dark", "Dunkel"], ["system", "System"]], s.theme || "system", (v) => { Store.setSetting("theme", v); applyTheme(v); });
    const accentBox = el("div", { class: "accent-row" });
    Object.keys(CONST.ACCENTS).forEach((id) => { const a = CONST.ACCENTS[id]; const b = el("button", { type: "button", class: "accent-dot" + (s.accent === id ? " on" : ""), title: a.name, "aria-label": a.name, onclick: () => { Store.setSetting("accent", id); applyAccentVars(); accentBox.querySelectorAll("button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); } }); b.style.background = a.color; accentBox.appendChild(b); });
    const wakeBox = seg([["1", "An"], ["0", "Aus"]], s.wakeOnStart ? "1" : "0", (v) => { Store.setSetting("wakeOnStart", v === "1"); if (window.App && App.setWake) App.setWake(v === "1"); });
    const encBox = seg([["1", "An (empfohlen)"], ["0", "Aus"]], s.encryptCloud ? "1" : "0", (v) => Store.setSetting("encryptCloud", v === "1"));
    const briefBox = seg([["1", "An"], ["0", "Aus"]], s.briefingEnabled ? "1" : "0", (v) => Store.setSetting("briefingEnabled", v === "1"));
    const voiceBox = seg([["auto", "ElevenLabs"], ["browser", "Browser"], ["off", "Aus"]], s.voiceMode || "auto", (v) => Store.setSetting("voiceMode", v));
    const animBox = seg([["full", "Voll"], ["reduced", "Reduziert"]], s.reduceAnim ? "reduced" : "full", (v) => { Store.setSetting("reduceAnim", v === "reduced"); applyAnimPref(); });
    const cloud = el("div", { class: "cloud-pill" + (Store.cloudEnabled ? " on" : "") }, [el("span", { class: "d" }), el("span", { text: Store.cloudEnabled ? (s.encryptCloud ? "Cloud-Sync aktiv, verschluesselt" : "Cloud-Sync aktiv") : "Cloud-Sync aus (nur dieses Geraet)" })]);
    const fileIn = el("input", { type: "file", accept: "application/json" }); fileIn.addEventListener("change", importBackup);
    const dataRow = el("div", { class: "btn-row" }, [el("button", { class: "btn", type: "button", onclick: exportBackup }, [icon("i-download"), document.createTextNode("Backup")]), el("button", { class: "btn", type: "button", onclick: () => fileIn.click() }, [icon("i-upload"), document.createTextNode("Wiederherstellen")]), fileIn]);
    const notif = window.Reminders && Reminders.permission() === "granted" ? el("span", { class: "muted", text: "Benachrichtigungen erlaubt." }) : el("button", { class: "btn btn-ghost btn-block", type: "button", onclick: async () => { if (window.Reminders) await Reminders.requestPermission(); closeModal(); openSettings(); } }, "Benachrichtigungen aktivieren");
    openModal("Einstellungen", el("div", { class: "modal-body" }, [
      field("Design", themeBox.box), field("Akzentfarbe", accentBox),
      field("Wake-Word automatisch (Desktop)", wakeBox.box),
      field("Cloud verschluesseln (Zero-Knowledge)", encBox.box),
      field("Tagesbriefing", briefBox.box),
      field("Stimme", voiceBox.box),
      field("Animationen", animBox.box),
      field("Benachrichtigungen", notif),
      field("Daten", dataRow), field("Synchronisierung", cloud),
      el("div", { class: "muted small", text: "Version " + CONST.APP_VERSION + " · abmelden schliesst die Sitzung." }),
      el("div", { class: "modal-actions" }, [el("button", { class: "btn btn-danger", type: "button", text: "Abmelden", onclick: () => { if (window.App && App.logout) App.logout(); } }), el("button", { class: "btn btn-primary", type: "button", text: "Fertig", onclick: closeModal })]),
    ]), { wide: true });
  }

  function exportBackup() { Utils.downloadText(`jarvis-backup-${U.todayYMD()}.json`, Store.exportData()); toast("Backup gespeichert"); }
  async function importBackup(e) {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    try { const txt = await Utils.readFileText(file); Store.importData(JSON.parse(txt)); closeModal(); toast("Wiederhergestellt", "success"); }
    catch (err) { toast("Fehler: " + err.message, "error"); }
  }

  function openHelp() {
    const rows = [["Strg/Cmd + K", "Befehlspalette / Suche"], ["t", "Neue Aufgabe"], ["h", "Neue Hausaufgabe"], ["n", "Neue Notiz"], ["g", "Note eintragen"], ["e", "Test eintragen"], ["p", "Pomodoro Start/Pause"], ["b", "Tagesbriefing"], ["Leertaste", "Sprechen (halten)"]];
    openModal("Tastenkuerzel", el("div", { class: "modal-body" }, [el("div", { class: "kbd-list" }, rows.map(([k, v]) => el("div", { class: "kbd-row" }, [el("kbd", { text: k }), el("span", { text: v })]))), el("div", { class: "modal-actions" }, el("button", { class: "btn btn-block", type: "button", text: "Schliessen", onclick: closeModal }))]));
  }

  function openCommandPalette(commands) {
    const input = el("input", { type: "text", class: "cmd-input", placeholder: "Befehl oder Suche... (z.B. Aufgabe, Mathe)" });
    const listEl = el("div", { class: "cmd-list" });
    function run(fn) { closeModal(); if (fn) fn(); }
    function draw() {
      clear(listEl);
      const q = input.value.trim().toLowerCase();
      const cmds = commands.filter((c) => !q || c.label.toLowerCase().includes(q)).slice(0, 8);
      cmds.forEach((c) => listEl.appendChild(el("button", { class: "cmd-item", type: "button", onclick: () => run(c.run) }, [icon(c.icon || "i-command"), el("span", { text: c.label }), el("span", { class: "cmd-tag", text: "Befehl" })])));
      if (q) Search.query(q).forEach((r) => listEl.appendChild(el("button", { class: "cmd-item", type: "button", onclick: () => run(r.run) }, [icon("i-search"), el("span", { text: r.label }), el("span", { class: "cmd-tag", text: r.type + (r.sub ? " · " + r.sub : "") })])));
      if (!listEl.children.length) listEl.appendChild(empty("Nichts gefunden."));
    }
    input.addEventListener("input", draw);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { const first = listEl.querySelector(".cmd-item"); if (first) first.click(); } });
    const body = el("div", { class: "modal-body cmd-body" }, [input, listEl]);
    openModal("Befehle & Suche", body, { wide: true });
    draw();
  }

  function openOnboarding(done) {
    const body = el("div", { class: "modal-body" }, [
      el("p", { text: "Willkommen bei Jarvis! Dein Assistent fuer den Schulalltag." }),
      el("ul", { class: "ob-list" }, [
        el("li", { text: "Aufgaben, Hausaufgaben (nach Fach), Stundenplan und Tests an einem Ort." }),
        el("li", { text: "Noten mit Durchschnitt, Gewohnheiten mit Streak, Lern-Timer." }),
        el("li", { text: "Mit Jarvis reden: Mikro halten oder 'Jarvis' sagen (Desktop)." }),
        el("li", { text: "Alles ist synchron und (optional) verschluesselt." }),
      ]),
      el("div", { class: "modal-actions" }, [el("button", { class: "btn", type: "button", text: "Leer starten", onclick: () => { done && done(); closeModal(); } }), el("button", { class: "btn btn-primary", type: "button", text: "Mit Beispielen starten", onclick: () => { Onboarding.addExamples(); closeModal(); toast("Beispiele angelegt"); } })]),
    ]);
    openModal("Hallo!", body);
  }

  function openDayDetail(ymd, items) {
    const body = el("div", { class: "modal-body" }, items.length ? items.map((it) => el("div", { class: "day-item" }, [el("span", { class: "cal-dot " + it.type }), el("span", { text: it.label })])) : [empty("Nichts an diesem Tag.")]);
    body.appendChild(el("div", { class: "modal-actions" }, el("button", { class: "btn btn-block", type: "button", text: "Schliessen", onclick: closeModal })));
    openModal(U.parseYMD(ymd).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }), body);
  }

  // ---------- Toast ----------
  function toast(msg, type) {
    const root = document.getElementById("toastRoot"); if (!root) return;
    const t = el("div", { class: "toast" + (type ? " " + type : ""), text: msg });
    root.appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 250); }, 2400);
  }

  // ---------- Theme / Accent ----------
  function resolveTheme(theme) { let t = theme || (Store.get().settings.theme) || "system"; if (t === "system") t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; return t; }
  let _themeReady = false, _themeFadeT = 0;
  function crossfadeColors() {
    if (!_themeReady || reduceMotion()) return; // erster Aufruf (Start) ohne Animation
    const r = document.documentElement; r.classList.add("theme-anim");
    clearTimeout(_themeFadeT); _themeFadeT = setTimeout(() => r.classList.remove("theme-anim"), 420);
  }
  function applyAccentVars() {
    crossfadeColors();
    const id = (Store.get().settings.accent) || "blue"; const a = CONST.ACCENTS[id] || CONST.ACCENTS.blue;
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    document.documentElement.style.setProperty("--accent", a.color);
    document.documentElement.style.setProperty("--accent-weak", dark ? a.weakDark : a.weak);
  }
  function applyTheme(theme) {
    crossfadeColors();
    const t = resolveTheme(theme);
    document.documentElement.setAttribute("data-theme", t);
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute("content", t === "dark" ? "#16181c" : "#ffffff");
    const btn = document.getElementById("themeBtn"); if (btn) btn.replaceChildren(icon(t === "dark" ? "i-sun" : "i-moon"));
    applyAccentVars();
    _themeReady = true;
  }
  function toggleTheme() { const cur = document.documentElement.getAttribute("data-theme"); const next = cur === "dark" ? "light" : "dark"; Store.setSetting("theme", next); applyTheme(next); }

  // ---------- Setter fuer app.js ----------
  function setVoiceState(st) {
    const e = document.getElementById("voiceState"); if (e) e.setAttribute("data-state", st);
    const w = document.getElementById("orbWrap"); if (w) w.classList.toggle("show", st !== "idle");
    if (window.VoiceOrb) VoiceOrb.setState(st);
  }
  function setLevel(x) {
    const v = U.clamp(x, 0, 1);
    const e = document.getElementById("voiceState"); if (e) e.style.setProperty("--level", String(v * 0.7));
    if (window.VoiceOrb) VoiceOrb.setLevel(v);
  }
  function setTranscript(label, text) { const e = document.getElementById("transcript"); if (e) e.replaceChildren(el("b", { text: label + ": " }), document.createTextNode(text || "")); }
  function setTip(text) { briefingText = text || briefingText; }
  function setBriefing(text) { briefingText = text || ""; render(Store.get()); }
  function setClock(time, date) { const c = document.getElementById("clock"), d = document.getElementById("today"); if (c) c.textContent = time; if (d) d.textContent = date; }
  function setWeather(temp, code) { const e = document.getElementById("weather"); if (!e) return; const map = { 0: "w-sun", 1: "w-partly", 2: "w-partly", 3: "w-cloud", 45: "w-fog", 48: "w-fog", 51: "w-rain", 53: "w-rain", 55: "w-rain", 61: "w-rain", 63: "w-rain", 65: "w-rain", 71: "w-snow", 73: "w-snow", 75: "w-snow", 80: "w-rain", 81: "w-rain", 82: "w-rain", 95: "w-storm", 96: "w-storm", 99: "w-storm" }; e.replaceChildren(icon(map[code] || "w-cloud"), document.createTextNode(Math.round(temp) + "°")); }
  function setWakeActive(on) { const b = document.getElementById("wakeBtn"); if (b) b.classList.toggle("active", !!on); }
  function setPomodoroTime(ms, phase) {
    const t = document.getElementById("pomoTime"); if (t) t.textContent = U.fmtDuration(ms / 1000);
    const ph = document.getElementById("pomoPhase"); if (ph && window.Pomodoro) ph.textContent = Pomodoro.phaseLabel(phase);
    const ring = document.getElementById("pomoRing"); if (ring && pomoTotalMs) { const C = 2 * Math.PI * 52; ring.setAttribute("stroke-dashoffset", String(C * (1 - U.clamp(ms / pomoTotalMs, 0, 1)))); }
  }

  // ---------- Befehle registrieren ----------
  function registerCommands() {
    if (!window.Shortcuts) return;
    Shortcuts.register([
      { id: "add-task", label: "Neue Aufgabe", icon: "i-check", run: () => openTaskModal("todo") },
      { id: "add-homework", label: "Neue Hausaufgabe", icon: "i-book", run: () => openTaskModal("homework") },
      { id: "add-note", label: "Neue Notiz", icon: "i-note", run: () => openNoteModal() },
      { id: "add-grade", label: "Note eintragen", icon: "i-award", run: openGradeModal },
      { id: "grade-goal", label: "Notenziel rechnen", icon: "i-target", run: () => openGradeGoalModal() },
      { id: "add-exam", label: "Test eintragen", icon: "i-clipboard", run: openExamModal },
      { id: "add-event", label: "Termin anlegen", icon: "i-calendar", run: openEventModal },
      { id: "add-habit", label: "Gewohnheit anlegen", icon: "i-flame", run: openHabitModal },
      { id: "add-reminder", label: "Erinnerung setzen", icon: "i-bell", run: openReminderModal },
      { id: "add-goal", label: "Ziel anlegen", icon: "i-target", run: openGoalModal },
      { id: "add-vocab", label: "Vokabel anlegen", icon: "i-book", run: openVocabModal },
      { id: "add-money", label: "Einnahme/Ausgabe", icon: "i-wallet", run: () => openBudgetModal("expense") },
      { id: "toggle-pomodoro", label: "Lern-Timer Start/Pause", icon: "i-clock", run: togglePomodoro },
      { id: "briefing", label: "Tagesbriefing", icon: "i-spark", run: () => { if (window.App && App.runBriefing) App.runBriefing(true); } },
      { id: "toggle-theme", label: "Hell/Dunkel wechseln", icon: "i-moon", run: toggleTheme },
      { id: "settings", label: "Einstellungen", icon: "i-settings", run: openSettings },
      { id: "export", label: "Backup exportieren", icon: "i-download", run: exportBackup },
      { id: "help", label: "Tastenkuerzel anzeigen", icon: "i-command", run: openHelp },
    ]);
  }

  // ============================================================
  // Effekte: Konfetti, 3D-Tilt (Cursor), Ripple
  // ============================================================
  function cssColor(name, fallback) { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; }
  function burstConfetti(x, y) {
    if (reduceMotion() || !document.body) return;
    const cv = el("canvas", { class: "fx-confetti" });
    const cx = cv.getContext && cv.getContext("2d"); if (!cx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.floor((window.innerWidth || 360) * dpr); cv.height = Math.floor((window.innerHeight || 640) * dpr);
    document.body.appendChild(cv);
    const cols = [cssColor("--accent", "#3b6df6"), cssColor("--success", "#16a34a"), cssColor("--warn", "#d97706"), "#ffffff"];
    const N = 90, ps = [];
    for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, sp = (4 + Math.random() * 8) * dpr; ps.push({ x: x * dpr, y: y * dpr, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4 * dpr, g: 0.22 * dpr, life: 1, col: cols[(Math.random() * cols.length) | 0], r: (3 + Math.random() * 4) * dpr, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.5 }); }
    let last = performance.now();
    (function frame(now) {
      const dt = Math.min(2.5, (now - last) / 16.67); last = now;
      cx.clearRect(0, 0, cv.width, cv.height); let alive = false;
      for (const p of ps) { if (p.life <= 0) continue; p.vy += p.g * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= 0.011 * dt; if (p.life > 0 && p.y < cv.height + 40) { alive = true; cx.save(); cx.globalAlpha = Math.max(0, p.life); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillStyle = p.col; cx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.62); cx.restore(); } }
      if (alive) requestAnimationFrame(frame); else cv.remove();
    })(last);
  }
  function initTilt() {
    const dash = document.getElementById("dashboard");
    if (!dash || !(window.matchMedia && window.matchMedia("(hover: hover)").matches)) return;
    let raf = 0, card = null, mx = 0, my = 0;
    const apply = () => {
      raf = 0; if (!card) return; const r = card.getBoundingClientRect(); if (!r.width) return;
      const px = (mx - r.left) / r.width, py = (my - r.top) / r.height, max = 7;
      card.classList.add("tilting");
      card.style.setProperty("--ry", ((px - 0.5) * 2 * max).toFixed(2) + "deg");
      card.style.setProperty("--rx", (-(py - 0.5) * 2 * max).toFixed(2) + "deg");
      card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
      card.style.setProperty("--my", (py * 100).toFixed(1) + "%");
    };
    dash.addEventListener("pointermove", (e) => {
      if (reduceMotion()) return;
      const c = e.target.closest(".card"); if (!c) return;
      card = c; mx = e.clientX; my = e.clientY; if (!raf) raf = requestAnimationFrame(apply);
    });
    dash.addEventListener("pointerout", (e) => {
      const c = e.target.closest(".card"); if (c && !c.contains(e.relatedTarget)) { c.classList.remove("tilting"); c.style.removeProperty("--rx"); c.style.removeProperty("--ry"); }
    });
  }
  function initRipple() {
    document.addEventListener("pointerdown", (e) => {
      if (reduceMotion() || e.button) return;
      const b = e.target.closest(".btn, .icon-btn"); if (!b) return;
      const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height);
      const s = el("span", { class: "ripple" });
      s.style.width = s.style.height = d + "px"; s.style.left = (e.clientX - r.left - d / 2) + "px"; s.style.top = (e.clientY - r.top - d / 2) + "px";
      b.appendChild(s); setTimeout(() => s.remove(), 620);
    });
  }
  function countUp(node, raw) {
    const str = String(raw); const m = str.match(/^(-?\d+(?:\.\d+)?)(.*)$/); if (!m) return;
    const end = parseFloat(m[1]); if (!isFinite(end)) return;
    const suffix = m[2] || "", dec = (m[1].split(".")[1] || "").length, dur = 750, t0 = performance.now();
    node.textContent = (dec ? (0).toFixed(dec) : "0") + suffix;
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3), v = end * e;
      node.textContent = (dec ? v.toFixed(dec) : Math.round(v).toString()) + suffix;
      if (p < 1) requestAnimationFrame(step); else node.textContent = str;
    })(t0);
  }
  function applyAnimPref() { document.documentElement.classList.toggle("reduce-anim", !!(Store.get().settings && Store.get().settings.reduceAnim)); }

  function init() {
    applyTheme();
    applyAnimPref();
    if (window.VoiceOrb) { const orbC = document.getElementById("orb"); if (orbC) VoiceOrb.init(orbC); }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", () => { if ((Store.get().settings.theme || "system") === "system") applyTheme(); });

    const on = (id, fn) => { const e = document.getElementById(id); if (e) e.addEventListener("click", fn); };
    on("themeBtn", toggleTheme);
    on("settingsBtn", openSettings);
    on("searchBtn", () => openCommandPalette(window.Shortcuts ? Shortcuts.all() : []));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

    if (window.Calendar) Calendar.onDay = openDayDetail;
    registerCommands();
    initTilt(); initRipple();

    Store.subscribe((s) => render(s));
    render(Store.get());
  }

  function toLocalInput(d) { return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}T${U.pad(d.getHours())}:${U.pad(d.getMinutes())}`; }

  return {
    init, render, toast, applyTheme, applyAccentVars,
    openSettings, openCommandPalette, openOnboarding, editTask, openNote,
    setVoiceState, setLevel, setTranscript, setTip, setBriefing, setClock, setWeather, setWakeActive, setPomodoroTime,
  };
})();
