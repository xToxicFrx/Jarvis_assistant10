// ============================================================
// tools.js — die Werkzeuge, die Jarvis (das KI-Modell) nutzen darf.
//   1) TOOL_SCHEMAS  -> Beschreibung fuers Modell
//   2) runTool(...)  -> Ausfuehrung im Browser (mutiert ueber Store)
// "ctx" liefert Standort, Websuche und kurzen Timer.
// ============================================================
const WMO = {
  0: "klar", 1: "meist klar", 2: "teilweise bewoelkt", 3: "bedeckt", 45: "Nebel", 48: "Reifnebel",
  51: "leichter Nieselregen", 53: "Nieselregen", 55: "starker Nieselregen", 61: "leichter Regen",
  63: "Regen", 65: "starker Regen", 71: "leichter Schnee", 73: "Schnee", 75: "starker Schnee",
  80: "Regenschauer", 81: "Schauer", 82: "heftige Schauer", 95: "Gewitter", 96: "Gewitter", 99: "Gewitter",
};

// Zeitpunkt-Parser fuer Erinnerungen ("in 30 min", "morgen 17:00", "18 Uhr", ISO).
function parseWhen(input) {
  if (!input) return null;
  const raw = String(input).trim(), s = raw.toLowerCase();
  if (/\d{4}-\d{2}-\d{2}/.test(raw)) { const iso = Date.parse(raw); if (!isNaN(iso)) return iso; }
  const now = new Date();
  let m;
  if ((m = s.match(/in\s+(\d+)\s*(min|minuten|m)\b/))) return now.getTime() + parseInt(m[1]) * 60000;
  if ((m = s.match(/in\s+(\d+)\s*(std|stunde|stunden|h)\b/))) return now.getTime() + parseInt(m[1]) * 3600000;
  if ((m = s.match(/in\s+(\d+)\s*(tag|tage|tagen|d)\b/))) return now.getTime() + parseInt(m[1]) * 86400000;
  let hh = null, mm = 0;
  const hhmm = s.match(/(\d{1,2}):(\d{2})/), hUhr = s.match(/(\d{1,2})\s*uhr/);
  if (hhmm) { hh = parseInt(hhmm[1]); mm = parseInt(hhmm[2]); } else if (hUhr) { hh = parseInt(hUhr[1]); }
  if (hh != null && hh >= 0 && hh <= 23) {
    const base = new Date(now);
    const tomorrow = s.includes("morgen") && !s.includes("uebermorgen") && !s.includes("übermorgen");
    const dayAfter = s.includes("uebermorgen") || s.includes("übermorgen");
    if (tomorrow) base.setDate(base.getDate() + 1); else if (dayAfter) base.setDate(base.getDate() + 2);
    base.setHours(hh, mm, 0, 0);
    if (!tomorrow && !dayAfter && base.getTime() < now.getTime()) base.setDate(base.getDate() + 1);
    return base.getTime();
  }
  return null;
}

function filterTasks(args) {
  let list = Store.get().tasks.slice();
  if (args.type) list = list.filter((t) => t.type === args.type);
  if (args.subject) list = list.filter((t) => (t.subject || "").toLowerCase() === String(args.subject).toLowerCase());
  const f = args.filter || "open";
  if (f === "open") list = list.filter((t) => !t.done);
  else if (f === "overdue") list = list.filter((t) => !t.done && Store.daysUntil(t.due) !== null && Store.daysUntil(t.due) < 0);
  else if (f === "today") list = list.filter((t) => !t.done && Store.daysUntil(t.due) === 0);
  list.sort((a, b) => { const da = Store.daysUntil(a.due), db = Store.daysUntil(b.due); if (da === null && db === null) return 0; if (da === null) return 1; if (db === null) return -1; return da - db; });
  return list.slice(0, 30);
}
function timetableText(day) {
  const names = CONST.WEEKDAY_LABELS, tt = Store.get().timetable;
  const fmt = (k) => (tt[k] || []).map((e) => `${e.period ? e.period + ". " : ""}${e.subject}${e.room ? " (" + e.room + ")" : ""}${e.start ? " " + e.start + (e.end ? "-" + e.end : "") : ""}`).join("\n  ");
  const dk = day ? Store.dayKey(day) : null;
  if (dk) { const t = fmt(dk); return t ? `${names[dk]}:\n  ${t}` : `${names[dk]}: keine Stunden eingetragen.`; }
  const out = CONST.WEEKDAYS.filter((k) => (tt[k] || []).length).map((k) => `${names[k]}:\n  ${fmt(k)}`).join("\n");
  return out || "Stundenplan ist noch leer.";
}

const TOOL_SCHEMAS = [
  { type: "function", function: { name: "get_time", description: "Aktuelles Datum und Uhrzeit.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_weather", description: "Wetter und Vorhersage am Standort.", parameters: { type: "object", properties: { days: { type: "integer", description: "Tage (1-5), Standard 3." } } } } },
  { type: "function", function: { name: "web_search", description: "Aktuelle Infos im Internet suchen.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },

  { type: "function", function: { name: "add_task", description: "Neue Aufgabe/Todo (optional mit Datum, Fach, Prioritaet, Wiederholung).", parameters: { type: "object", properties: { title: { type: "string" }, type: { type: "string", enum: ["todo", "homework"] }, subject: { type: "string" }, due: { type: "string", description: "YYYY-MM-DD" }, priority: { type: "string", enum: ["low", "med", "high"] }, repeat: { type: "string", enum: ["none", "daily", "weekly"], description: "Wiederholung." } }, required: ["title"] } } },
  { type: "function", function: { name: "add_homework", description: "Hausaufgabe fuer ein Fach anlegen.", parameters: { type: "object", properties: { subject: { type: "string" }, title: { type: "string" }, due: { type: "string", description: "YYYY-MM-DD" }, priority: { type: "string", enum: ["low", "med", "high"] } }, required: ["subject", "title"] } } },
  { type: "function", function: { name: "complete_task", description: "Aufgabe als erledigt abhaken.", parameters: { type: "object", properties: { id: { type: "string" }, title: { type: "string", description: "Stichwort." } } } } },
  { type: "function", function: { name: "update_task", description: "Aufgabe aendern (Datum, Prioritaet, Fach, Titel).", parameters: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, due: { type: "string" }, priority: { type: "string", enum: ["low", "med", "high"] }, subject: { type: "string" } } } } },
  { type: "function", function: { name: "list_tasks", description: "Aufgaben auflisten.", parameters: { type: "object", properties: { filter: { type: "string", enum: ["today", "overdue", "open", "all"] }, subject: { type: "string" }, type: { type: "string", enum: ["todo", "homework"] } } } } },

  { type: "function", function: { name: "add_reminder", description: "Erinnerung zu einem Zeitpunkt setzen.", parameters: { type: "object", properties: { text: { type: "string" }, at: { type: "string", description: "ISO oder 'morgen 17:00' / 'in 30 min'." } }, required: ["text", "at"] } } },
  { type: "function", function: { name: "set_timetable_entry", description: "Schulstunde eintragen.", parameters: { type: "object", properties: { day: { type: "string" }, subject: { type: "string" }, period: { type: "integer" }, start: { type: "string" }, end: { type: "string" }, room: { type: "string" } }, required: ["day", "subject"] } } },
  { type: "function", function: { name: "get_timetable", description: "Stundenplan (Woche oder ein Tag).", parameters: { type: "object", properties: { day: { type: "string" } } } } },

  { type: "function", function: { name: "add_grade", description: "Schulnote eintragen (1=sehr gut .. 6=ungenuegend).", parameters: { type: "object", properties: { subject: { type: "string" }, value: { type: "number" }, weight: { type: "number", description: "Gewichtung, z.B. 2 fuer Klassenarbeit." }, label: { type: "string" } }, required: ["subject", "value"] } } },
  { type: "function", function: { name: "list_grades", description: "Noten + Durchschnitt (gesamt oder je Fach).", parameters: { type: "object", properties: { subject: { type: "string" } } } } },

  { type: "function", function: { name: "add_exam", description: "Klassenarbeit/Test mit Datum anlegen.", parameters: { type: "object", properties: { subject: { type: "string" }, title: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" } }, required: ["subject", "date"] } } },
  { type: "function", function: { name: "list_exams", description: "Kommende Tests mit Countdown.", parameters: { type: "object", properties: {} } } },

  { type: "function", function: { name: "add_habit", description: "Neue taegliche Gewohnheit.", parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } },
  { type: "function", function: { name: "check_habit", description: "Gewohnheit fuer heute abhaken (oder Haken entfernen).", parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } },
  { type: "function", function: { name: "list_habits", description: "Gewohnheiten + Streaks.", parameters: { type: "object", properties: {} } } },

  { type: "function", function: { name: "add_note", description: "Notiz speichern.", parameters: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["body"] } } },
  { type: "function", function: { name: "list_notes", description: "Notizen auflisten/suchen.", parameters: { type: "object", properties: { query: { type: "string" } } } } },
  { type: "function", function: { name: "add_event", description: "Termin (mit Datum/Uhrzeit) anlegen.", parameters: { type: "object", properties: { title: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" }, time: { type: "string" }, location: { type: "string" } }, required: ["title", "date"] } } },
  { type: "function", function: { name: "add_goal", description: "Ziel mit Fortschritt anlegen.", parameters: { type: "object", properties: { title: { type: "string" }, target: { type: "number" } }, required: ["title"] } } },
  { type: "function", function: { name: "remove_task", description: "Aufgabe loeschen (per Stichwort oder id).", parameters: { type: "object", properties: { id: { type: "string" }, title: { type: "string", description: "Stichwort." } } } } },
  { type: "function", function: { name: "list_events", description: "Kommende Termine auflisten.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "list_goals", description: "Ziele mit Fortschritt auflisten.", parameters: { type: "object", properties: {} } } },

  { type: "function", function: { name: "pomodoro_start", description: "Lern-Timer (Pomodoro) starten.", parameters: { type: "object", properties: { work_min: { type: "integer" }, break_min: { type: "integer" } } } } },
  { type: "function", function: { name: "pomodoro_stop", description: "Lern-Timer stoppen/zuruecksetzen.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "pomodoro_status", description: "Status des Lern-Timers.", parameters: { type: "object", properties: {} } } },

  { type: "function", function: { name: "grade_goal", description: "Berechnet, welche Note in der naechsten Arbeit noetig ist, um einen Wunsch-Schnitt in einem Fach zu erreichen.", parameters: { type: "object", properties: { subject: { type: "string" }, target: { type: "number", description: "Wunsch-Schnitt, z.B. 2.0" }, weight: { type: "number", description: "Gewicht der naechsten Note (z.B. 2 fuer Klassenarbeit), Standard 1." } }, required: ["subject", "target"] } } },
  { type: "function", function: { name: "add_vocab", description: "Vokabel-Karte anlegen (Vorderseite und Rueckseite).", parameters: { type: "object", properties: { front: { type: "string" }, back: { type: "string" } }, required: ["front", "back"] } } },
  { type: "function", function: { name: "list_vocab", description: "Wie viele Vokabeln es gibt und wie viele faellig sind.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "add_money", description: "Einnahme oder Ausgabe (Taschengeld) eintragen.", parameters: { type: "object", properties: { amount: { type: "number" }, label: { type: "string" }, type: { type: "string", enum: ["income", "expense"] } }, required: ["amount", "type"] } } },

  { type: "function", function: { name: "get_overview", description: "Kompakter Ueberblick (Aufgaben, Tests, Noten, Stundenplan, Erinnerungen, Gewohnheiten) — fuer Analyse und Tipps.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "set_timer", description: "Kurzer Timer in Sekunden.", parameters: { type: "object", properties: { seconds: { type: "integer" }, label: { type: "string" } }, required: ["seconds"] } } },
];

async function runTool(name, args, ctx) {
  switch (name) {
    case "get_time": return new Date().toLocaleString("de-DE", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

    case "get_weather": {
      const { lat, lon } = ctx.location();
      const days = Math.min(Math.max(args.days || 3, 1), 5);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum&timezone=auto&forecast_days=${days}`;
      const d = await (await fetch(url)).json(); const c = d.current;
      let out = `Jetzt: ${Math.round(c.temperature_2m)} Grad, ${WMO[c.weather_code] || "?"}, Wind ${Math.round(c.wind_speed_10m)} km/h, Luftfeuchte ${c.relative_humidity_2m}%. `;
      for (let i = 0; i < d.daily.time.length; i++) out += `${d.daily.time[i]}: ${Math.round(d.daily.temperature_2m_min[i])}-${Math.round(d.daily.temperature_2m_max[i])} Grad, ${WMO[d.daily.weather_code[i]] || "?"}. `;
      return out;
    }
    case "web_search": { const d = await ctx.webSearch(args.query); return d.result + (d.source ? ` (Quelle: ${d.source})` : ""); }

    case "add_task": { const t = Store.addTask({ title: args.title, type: args.type, subject: args.subject, due: args.due, priority: args.priority, repeat: args.repeat && args.repeat !== "none" ? { freq: args.repeat } : null }); return `Aufgabe angelegt: "${t.title}"${t.due ? ` (faellig ${t.due})` : ""}${t.repeat ? " (wiederkehrend)" : ""}.`; }
    case "add_homework": { const t = Store.addTask({ title: args.title, type: "homework", subject: args.subject, due: args.due, priority: args.priority }); return `Hausaufgabe: ${t.subject || "?"} - "${t.title}"${t.due ? ` (bis ${t.due})` : ""}.`; }
    case "complete_task": { const t = Store.completeTask(args.id || args.title); return t ? `Erledigt: "${t.title}".` : "Keine passende Aufgabe gefunden."; }
    case "update_task": { const t = Store.updateTask(args.id || args.title, args); return t ? `Aktualisiert: "${t.title}".` : "Keine passende Aufgabe gefunden."; }
    case "list_tasks": { const l = filterTasks(args); return l.length ? l.map((t) => `- ${t.title}${t.subject ? ` [${t.subject}]` : ""}${t.due ? ` (${Store.dueLabel(t.due)})` : ""}${t.done ? " [erledigt]" : ""}`).join("\n") : "Keine passenden Aufgaben."; }

    case "add_reminder": { const at = parseWhen(args.at); if (!at) return "Zeitpunkt unklar. Bitte konkret nennen (z.B. 'morgen 17:00')."; const r = Store.addReminder(args.text, at); if (window.Reminders) Reminders.scheduleAll(); return `Erinnerung: "${r.text}" am ${new Date(at).toLocaleString("de-DE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.`; }
    case "set_timetable_entry": { const r = Store.setTimetableEntry(args); return r ? `Stundenplan: ${args.subject} am ${args.day}${args.period ? ` (${args.period}. Stunde)` : ""}.` : "Wochentag nicht erkannt."; }
    case "get_timetable": return timetableText(args.day);

    case "add_grade": { const g = Store.addGrade({ subject: args.subject, value: args.value, weight: args.weight, label: args.label }); const avg = Store.subjectAverage(g.subject); return `Note ${g.value} in ${g.subject} eingetragen. Schnitt ${g.subject}: ${avg}.`; }
    case "list_grades": {
      if (args.subject) { const avg = Store.subjectAverage(args.subject); const list = Store.get().grades.filter((x) => x.subject.toLowerCase() === String(args.subject).toLowerCase()); return list.length ? `${args.subject} (Schnitt ${avg}): ` + list.map((g) => g.value + (g.label ? ` (${g.label})` : "")).join(", ") : `Keine Noten in ${args.subject}.`; }
      const a = Store.subjectAverages(); const keys = Object.keys(a); if (!keys.length) return "Noch keine Noten."; return `Gesamtschnitt: ${Store.overallAverage()}. Je Fach: ` + keys.map((k) => `${k} ${a[k]}`).join(", ") + ".";
    }

    case "add_exam": { const e = Store.addExam({ subject: args.subject, title: args.title, date: args.date }); return `Test eingetragen: ${e.subject}${e.title ? " " + e.title : ""} am ${e.date} (${Store.dueLabel(e.date)}).`; }
    case "list_exams": { const l = Store.upcomingExams(10); return l.length ? l.map((e) => `- ${e.subject}${e.title ? " " + e.title : ""}: ${Store.dueLabel(e.date)}`).join("\n") : "Keine kommenden Tests."; }

    case "add_habit": { const h = Store.addHabit(args.name); return `Gewohnheit angelegt: "${h.name}".`; }
    case "check_habit": { const h = Store.get().habits.find((x) => x.name.toLowerCase().includes(String(args.name).toLowerCase())); if (!h) return "Keine passende Gewohnheit gefunden."; Store.toggleHabitToday(h.id); return `${h.name}: ${Store.isHabitDoneToday(h.id) ? "abgehakt" : "Haken entfernt"} (Streak ${Store.habitStreak(h.id)} Tage).`; }
    case "list_habits": { const l = Store.get().habits; return l.length ? l.map((h) => `- ${h.name}: ${Store.isHabitDoneToday(h.id) ? "heute erledigt" : "offen"} (${Store.habitStreak(h.id)} Tage)`).join("\n") : "Keine Gewohnheiten."; }

    case "add_note": { const n = Store.addNote({ title: args.title, body: args.body }); return `Notiz gespeichert${n.title ? `: "${n.title}"` : ""}.`; }
    case "list_notes": { let l = Store.get().notes; if (args.query) { const q = String(args.query).toLowerCase(); l = l.filter((n) => (n.title + " " + n.body).toLowerCase().includes(q)); } return l.length ? l.slice(0, 10).map((n) => `- ${n.title || n.body.slice(0, 50)}`).join("\n") : "Keine Notizen."; }
    case "add_event": { const e = Store.addEvent({ title: args.title, date: args.date, time: args.time, location: args.location }); return `Termin: "${e.title}" am ${e.date}${e.time ? " " + e.time : ""}.`; }
    case "add_goal": { const g = Store.addGoal({ title: args.title, target: args.target }); return `Ziel angelegt: "${g.title}".`; }
    case "remove_task": { const t = Store.removeTask(args.id || args.title); return t ? `Geloescht: "${t.title}".` : "Keine passende Aufgabe gefunden."; }
    case "list_events": { const l = Store.upcomingEvents(10); return l.length ? l.map((e) => `- ${e.title}: ${e.date}${e.time ? " " + e.time : ""}${e.location ? " @ " + e.location : ""}`).join("\n") : "Keine kommenden Termine."; }
    case "list_goals": { const l = Store.get().goals || []; return l.length ? l.map((g) => `- ${g.title}: ${g.progress || 0}/${g.target || 100}`).join("\n") : "Keine Ziele."; }

    case "pomodoro_start": { Store.pomodoroStart({ workMin: args.work_min, breakMin: args.break_min }); const p = Store.get().pomodoro.settings; return `Lern-Timer gestartet: ${p.workMin} min lernen, ${p.breakMin} min Pause.`; }
    case "pomodoro_stop": { Store.pomodoroReset(); return "Lern-Timer gestoppt."; }
    case "pomodoro_status": { const p = Store.get().pomodoro; if (!p.running && p.phase === "idle") return "Der Lern-Timer laeuft gerade nicht."; const left = Math.round((window.Pomodoro ? Pomodoro.remainingMs() : Math.max(0, p.endsAt - Date.now())) / 60000); return `Phase: ${Pomodoro ? Pomodoro.phaseLabel(p.phase) : p.phase}, noch ca. ${left} min.`; }

    case "grade_goal": {
      const subject = String(args.subject || "").trim(); const target = Number(args.target); const weight = Number(args.weight) || 1;
      if (!subject || !(target >= 1 && target <= 6)) return "Bitte Fach und Wunsch-Schnitt (1-6) angeben.";
      const cur = Store.subjectAverage(subject); const needed = Store.neededGrade(subject, target, weight);
      if (needed >= 6) return `Um in ${subject} einen Schnitt von ${target} zu halten, reicht selbst eine 6 (Gewicht ${weight}). Aktueller Schnitt: ${cur != null ? cur : "noch keine Noten"}.`;
      if (needed < 1) return `Ein Schnitt von ${target} ist in ${subject} mit einer einzelnen Note (Gewicht ${weight}) nicht mehr erreichbar. Aktueller Schnitt: ${cur != null ? cur : "noch keine Noten"}.`;
      return `Um in ${subject} einen Schnitt von ${target} zu erreichen, brauchst du in der naechsten Arbeit (Gewicht ${weight}) mindestens eine ${needed} (oder besser). Aktueller Schnitt: ${cur != null ? cur : "noch keine Noten"}.`;
    }
    case "add_vocab": { const c = Store.addVocab({ front: args.front, back: args.back }); return `Vokabel gespeichert: ${c.front} = ${c.back}.`; }
    case "list_vocab": { const due = Store.vocabDue().length, total = Store.get().vocab.length; return `${total} Vokabeln, davon ${due} faellig.`; }
    case "add_money": { const e = Store.addBudgetEntry({ amount: args.amount, label: args.label, type: args.type }); const c = CONST.CURRENCY; return `${e.amount >= 0 ? "Einnahme" : "Ausgabe"} ${Math.abs(e.amount)} ${c}${e.label ? " (" + e.label + ")" : ""} gebucht. Kontostand: ${Store.balance()} ${c}.`; }

    case "get_overview": return Store.snapshot();
    case "set_timer": { const secs = Math.max(1, parseInt(args.seconds) || 0); ctx.scheduleTimer(secs, args.label || ""); return `Timer fuer ${secs < 90 ? secs + " Sekunden" : Math.round(secs / 60) + " Minuten"} gestellt.`; }

    default: return "Unbekanntes Werkzeug: " + name;
  }
}
