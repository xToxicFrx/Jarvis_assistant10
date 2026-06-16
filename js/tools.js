// ============================================================
// tools.js — die Werkzeuge, die JARVIS benutzen darf.
//
//  1) TOOL_SCHEMAS  -> Beschreibung fuer das KI-Modell
//  2) runTool(...)  -> fuehrt das Werkzeug im Browser aus
//
// Aufgaben/Hausaufgaben/Stundenplan/Erinnerungen laufen ueber den
// globalen Store; "ctx" liefert Standort, Websuche und Timer.
// ============================================================

// Wetter-Codes (Open-Meteo) in Text
const WMO = {
  0: "klar", 1: "meist klar", 2: "teilweise bewoelkt", 3: "bedeckt",
  45: "Nebel", 48: "Reifnebel", 51: "leichter Nieselregen", 53: "Nieselregen", 55: "starker Nieselregen",
  61: "leichter Regen", 63: "Regen", 65: "starker Regen",
  71: "leichter Schnee", 73: "Schnee", 75: "starker Schnee",
  80: "Regenschauer", 81: "Schauer", 82: "heftige Schauer", 95: "Gewitter", 96: "Gewitter", 99: "Gewitter",
};

// ---- kleiner Zeitpunkt-Parser fuer Erinnerungen ----
function parseWhen(input) {
  if (!input) return null;
  const raw = String(input).trim();
  const s = raw.toLowerCase();

  // ISO-Datum/-Zeit
  if (/\d{4}-\d{2}-\d{2}/.test(raw)) { const iso = Date.parse(raw); if (!isNaN(iso)) return iso; }

  const now = new Date();
  let m;
  if ((m = s.match(/in\s+(\d+)\s*(min|minuten|m)\b/))) return now.getTime() + parseInt(m[1]) * 60000;
  if ((m = s.match(/in\s+(\d+)\s*(std|stunde|stunden|h)\b/))) return now.getTime() + parseInt(m[1]) * 3600000;
  if ((m = s.match(/in\s+(\d+)\s*(tag|tage|tagen|d)\b/))) return now.getTime() + parseInt(m[1]) * 86400000;

  let hh = null, mm = 0;
  const hhmm = s.match(/(\d{1,2}):(\d{2})/);
  const hUhr = s.match(/(\d{1,2})\s*uhr/);
  if (hhmm) { hh = parseInt(hhmm[1]); mm = parseInt(hhmm[2]); }
  else if (hUhr) { hh = parseInt(hUhr[1]); mm = 0; }
  if (hh != null && hh >= 0 && hh <= 23) {
    const base = new Date(now);
    const tomorrow = s.includes("morgen") && !s.includes("uebermorgen") && !s.includes("übermorgen");
    const dayAfter = s.includes("uebermorgen") || s.includes("übermorgen");
    if (tomorrow) base.setDate(base.getDate() + 1);
    else if (dayAfter) base.setDate(base.getDate() + 2);
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
  list.sort((a, b) => {
    const da = Store.daysUntil(a.due), db = Store.daysUntil(b.due);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
  return list.slice(0, 30);
}

function timetableText(day) {
  const names = { mon: "Montag", tue: "Dienstag", wed: "Mittwoch", thu: "Donnerstag", fri: "Freitag", sat: "Samstag", sun: "Sonntag" };
  const tt = Store.get().timetable;
  const fmt = (k) => (tt[k] || []).map((e) => `${e.period ? e.period + ". " : ""}${e.subject}${e.room ? " (" + e.room + ")" : ""}${e.start ? " " + e.start + (e.end ? "-" + e.end : "") : ""}`).join("\n  ");
  const dk = day ? Store.dayKey(day) : null;
  if (dk) { const t = fmt(dk); return t ? `${names[dk]}:\n  ${t}` : `${names[dk]}: keine Stunden eingetragen.`; }
  const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const out = order.filter((k) => (tt[k] || []).length).map((k) => `${names[k]}:\n  ${fmt(k)}`).join("\n");
  return out || "Stundenplan ist noch leer.";
}

// ============================================================
// 1) SCHEMAS
// ============================================================
const TOOL_SCHEMAS = [
  { type: "function", function: { name: "get_time", description: "Gibt das aktuelle Datum und die Uhrzeit zurueck.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_weather", description: "Aktuelles Wetter und Vorhersage am Standort des Nutzers.", parameters: { type: "object", properties: { days: { type: "integer", description: "Tage Vorhersage (1-5). Standard 3." } } } } },
  { type: "function", function: { name: "web_search", description: "Sucht aktuelle Informationen im Internet.", parameters: { type: "object", properties: { query: { type: "string", description: "Die Suchanfrage." } }, required: ["query"] } } },

  { type: "function", function: { name: "add_task", description: "Legt eine neue Aufgabe/ein Todo an (mit optionalem Faelligkeitsdatum, Fach und Prioritaet).", parameters: { type: "object", properties: {
    title: { type: "string", description: "Worum geht es?" },
    type: { type: "string", enum: ["todo", "homework"], description: "todo (Standard) oder homework." },
    subject: { type: "string", description: "Schulfach, falls relevant." },
    due: { type: "string", description: "Faelligkeit als YYYY-MM-DD." },
    priority: { type: "string", enum: ["low", "med", "high"], description: "Prioritaet." },
  }, required: ["title"] } } },

  { type: "function", function: { name: "add_homework", description: "Legt eine Hausaufgabe fuer ein Schulfach an.", parameters: { type: "object", properties: {
    subject: { type: "string", description: "Schulfach (z.B. Mathe, Englisch)." },
    title: { type: "string", description: "Was ist zu tun?" },
    due: { type: "string", description: "Bis wann (YYYY-MM-DD)." },
    priority: { type: "string", enum: ["low", "med", "high"] },
  }, required: ["subject", "title"] } } },

  { type: "function", function: { name: "complete_task", description: "Hakt eine Aufgabe als erledigt ab.", parameters: { type: "object", properties: {
    id: { type: "string", description: "ID der Aufgabe, falls bekannt." },
    title: { type: "string", description: "Sonst Stichwort aus dem Titel." },
  } } } },

  { type: "function", function: { name: "update_task", description: "Aendert eine Aufgabe (Datum, Prioritaet, Fach, Titel).", parameters: { type: "object", properties: {
    id: { type: "string" }, title: { type: "string", description: "Stichwort zum Finden ODER neuer Titel (mit id)." },
    due: { type: "string", description: "Neues Datum YYYY-MM-DD." },
    priority: { type: "string", enum: ["low", "med", "high"] },
    subject: { type: "string" },
  } } } },

  { type: "function", function: { name: "list_tasks", description: "Listet Aufgaben (gefiltert).", parameters: { type: "object", properties: {
    filter: { type: "string", enum: ["today", "overdue", "open", "all"], description: "Standard: open." },
    subject: { type: "string" }, type: { type: "string", enum: ["todo", "homework"] },
  } } } },

  { type: "function", function: { name: "add_reminder", description: "Setzt eine Erinnerung zu einem Zeitpunkt. JARVIS meldet sich dann (wenn die App offen ist).", parameters: { type: "object", properties: {
    text: { type: "string", description: "Woran erinnern?" },
    at: { type: "string", description: "Zeitpunkt: ISO (2026-06-17T17:00) oder umgangssprachlich ('in 30 min', 'morgen 17:00', '18 Uhr')." },
  }, required: ["text", "at"] } } },

  { type: "function", function: { name: "set_timetable_entry", description: "Traegt eine Schulstunde in den Stundenplan ein.", parameters: { type: "object", properties: {
    day: { type: "string", description: "Wochentag (Montag.. / mon..)." },
    subject: { type: "string", description: "Fach." },
    period: { type: "integer", description: "Stunde (1,2,3...)." },
    start: { type: "string", description: "Beginn HH:MM." }, end: { type: "string", description: "Ende HH:MM." },
    room: { type: "string", description: "Raum." },
  }, required: ["day", "subject"] } } },

  { type: "function", function: { name: "get_timetable", description: "Gibt den Stundenplan (ganze Woche oder ein Tag) zurueck.", parameters: { type: "object", properties: { day: { type: "string", description: "Optional ein Wochentag." } } } } },

  { type: "function", function: { name: "get_overview", description: "Kompakter Ueberblick ueber Aufgaben, Hausaufgaben, Stundenplan und Erinnerungen — fuer Analyse und Tipps.", parameters: { type: "object", properties: {} } } },

  { type: "function", function: { name: "set_timer", description: "Stellt einen kurzen Timer (in Sekunden). JARVIS sagt dann Bescheid.", parameters: { type: "object", properties: {
    seconds: { type: "integer", description: "Dauer in Sekunden." }, label: { type: "string", description: "Wofuer." },
  }, required: ["seconds"] } } },
];

// ============================================================
// 2) AUSFUEHRUNG
// ============================================================
async function runTool(name, args, ctx) {
  switch (name) {
    case "get_time": {
      return new Date().toLocaleString("de-DE", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }

    case "get_weather": {
      const { lat, lon } = ctx.location();
      const days = Math.min(Math.max(args.days || 3, 1), 5);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
        + `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m`
        + `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum`
        + `&timezone=auto&forecast_days=${days}`;
      const d = await (await fetch(url)).json();
      const c = d.current;
      let out = `Jetzt: ${Math.round(c.temperature_2m)} Grad, ${WMO[c.weather_code] || "?"}, Wind ${Math.round(c.wind_speed_10m)} km/h, Luftfeuchte ${c.relative_humidity_2m}%. `;
      for (let i = 0; i < d.daily.time.length; i++) {
        out += `${d.daily.time[i]}: ${Math.round(d.daily.temperature_2m_min[i])}-${Math.round(d.daily.temperature_2m_max[i])} Grad, ${WMO[d.daily.weather_code[i]] || "?"}, Niederschlag ${d.daily.precipitation_sum[i]} mm. `;
      }
      return out;
    }

    case "web_search": {
      const d = await ctx.webSearch(args.query);
      return d.result + (d.source ? ` (Quelle: ${d.source})` : "");
    }

    case "add_task": {
      const t = Store.addTask({ title: args.title, type: args.type, subject: args.subject, due: args.due, priority: args.priority });
      return `Aufgabe angelegt: "${t.title}"${t.due ? ` (faellig ${t.due})` : ""}.`;
    }
    case "add_homework": {
      const t = Store.addTask({ title: args.title, type: "homework", subject: args.subject, due: args.due, priority: args.priority });
      return `Hausaufgabe angelegt: ${t.subject || "?"} - "${t.title}"${t.due ? ` (bis ${t.due})` : ""}.`;
    }
    case "complete_task": {
      const t = Store.completeTask(args.id || args.title);
      return t ? `Erledigt: "${t.title}".` : "Keine passende Aufgabe gefunden.";
    }
    case "update_task": {
      const t = Store.updateTask(args.id || args.title, args);
      return t ? `Aktualisiert: "${t.title}".` : "Keine passende Aufgabe gefunden.";
    }
    case "list_tasks": {
      const list = filterTasks(args);
      if (!list.length) return "Keine passenden Aufgaben.";
      return list.map((t) => `- ${t.title}${t.subject ? ` [${t.subject}]` : ""}${t.due ? ` (${Store.dueLabel(t.due)})` : ""}${t.done ? " [erledigt]" : ""}`).join("\n");
    }
    case "add_reminder": {
      const at = parseWhen(args.at);
      if (!at) return "Zeitpunkt unklar. Bitte konkret nennen, z.B. 'morgen 17:00' oder ein Datum.";
      const r = Store.addReminder(args.text, at);
      Reminders.scheduleAll();
      return `Erinnerung gesetzt: "${r.text}" am ${new Date(at).toLocaleString("de-DE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.`;
    }
    case "set_timetable_entry": {
      const r = Store.setTimetableEntry(args);
      return r ? `Stundenplan: ${args.subject} am ${args.day}${args.period ? ` (${args.period}. Stunde)` : ""} eingetragen.` : "Wochentag nicht erkannt.";
    }
    case "get_timetable": {
      return timetableText(args.day);
    }
    case "get_overview": {
      return Store.snapshot();
    }

    case "set_timer": {
      const secs = Math.max(1, parseInt(args.seconds) || 0);
      ctx.scheduleTimer(secs, args.label || "");
      const mins = Math.round(secs / 60);
      return `Timer gestellt fuer ${secs < 90 ? secs + " Sekunden" : mins + " Minuten"}${args.label ? " (" + args.label + ")" : ""}.`;
    }

    default:
      return "Unbekanntes Werkzeug: " + name;
  }
}
