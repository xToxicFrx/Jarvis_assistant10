// ============================================================
// TOOLS — die "Werkzeuge", die JARVIS benutzen darf.
//
// Zwei Teile:
//  1) TOOL_SCHEMAS  → Beschreibung für das KI-Modell (was kann was?)
//  2) runTool(...)  → führt das Werkzeug im Browser wirklich aus
//
// "ctx" ist ein Helfer-Objekt aus app.js mit Standort, Websuche,
// Timer-Funktion usw.
// ============================================================

// ---------- Wetter-Codes (Open-Meteo) in Text ----------
const WMO = {
  0: "klar", 1: "meist klar", 2: "teilweise bewölkt", 3: "bedeckt",
  45: "Nebel", 48: "Reifnebel", 51: "leichter Nieselregen", 53: "Nieselregen",
  61: "leichter Regen", 63: "Regen", 65: "starker Regen",
  71: "leichter Schnee", 73: "Schnee", 75: "starker Schnee",
  80: "Regenschauer", 81: "Schauer", 82: "heftige Schauer", 95: "Gewitter",
};

// ============================================================
// 1) SCHEMAS — Beschreibung für das KI-Modell
// ============================================================
const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "get_time",
      description: "Gibt das aktuelle Datum und die genaue Uhrzeit zurück.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Aktuelles Wetter und Vorhersage für die nächsten Tage am Standort des Nutzers.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "integer", description: "Wie viele Tage Vorhersage (1-5). Standard 3." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Sucht aktuelle Informationen im Internet (z.B. Fakten, Personen, Ereignisse).",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Die Suchanfrage." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_notes",
      description: "Durchsucht die Obsidian-Notizen (das zweite Gehirn) des Nutzers nach einem Stichwort.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Wonach gesucht werden soll." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_to_daily_note",
      description: "Hängt einen Eintrag (mit Uhrzeit) an die heutige Daily Note im Obsidian-Vault an.",
      parameters: {
        type: "object",
        properties: { text: { type: "string", description: "Der zu speichernde Text." } },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description: "Legt eine neue Notiz (Markdown-Datei) im Obsidian-Vault an.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titel/Dateiname der Notiz." },
          content: { type: "string", description: "Inhalt der Notiz." },
        },
        required: ["title", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_note",
      description: "Liest eine ganze Obsidian-Notiz vollständig (für Details, Zusammenfassen, Weiterdenken).",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Name oder Stichwort der gesuchten Notiz." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recent_notes",
      description: "Listet die zuletzt bearbeiteten Notizen aus dem Vault.",
      parameters: {
        type: "object",
        properties: { count: { type: "integer", description: "Wie viele (Standard 5)." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "vault_stats",
      description: "Überblick über den Vault: Anzahl Notizen, Ordner, häufige Tags.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "append_to_note",
      description: "Hängt Text an eine bestimmte, bereits vorhandene Notiz an (oder legt sie an).",
      parameters: {
        type: "object",
        properties: {
          note: { type: "string", description: "Name/Stichwort der Notiz." },
          text: { type: "string", description: "Der anzuhängende Text (Markdown erlaubt)." },
        },
        required: ["note", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_timer",
      description: "Stellt einen Timer/eine Erinnerung. JARVIS sagt dann Bescheid.",
      parameters: {
        type: "object",
        properties: {
          seconds: { type: "integer", description: "Dauer in Sekunden." },
          label: { type: "string", description: "Wofür die Erinnerung ist." },
        },
        required: ["seconds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "decide_what_to_do",
      description: "Startet die Decision Engine und empfiehlt, was Luca GERADE JETZT am sinnvollsten tun sollte. "
        + "Nutze das, wenn er fragt 'Was soll ich jetzt tun/machen?', sich unentschlossen, gelangweilt oder überfordert fühlt. "
        + "Bezieht Energie, freie Zeit, Stimmung, Tageszeit, Wetter und offene Vault-Aufgaben ein.",
      parameters: {
        type: "object",
        properties: {
          minutes: { type: "integer", description: "Wie viel Zeit Luca gerade hat (Minuten), falls genannt." },
          energy: { type: "integer", description: "Energielevel 1 (erschöpft) bis 5 (voll aufgeladen), falls erkennbar." },
          mood: { type: "string", enum: ["focused", "creative", "social", "relaxed", "any"], description: "Stimmung/Fokus, falls erkennbar." },
          note: { type: "string", description: "Optionaler Hinweis, worauf er Lust hat oder was ansteht." },
        },
      },
    },
  },
];

// ============================================================
// 2) AUSFÜHRUNG — was jedes Werkzeug wirklich tut
// ============================================================
async function runTool(name, args, ctx) {
  switch (name) {

    case "get_time": {
      const d = new Date();
      return d.toLocaleString("de-DE", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
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
      let out = `Jetzt: ${Math.round(c.temperature_2m)}°C, ${WMO[c.weather_code] || "?"}, `
        + `Wind ${Math.round(c.wind_speed_10m)} km/h, Luftfeuchte ${c.relative_humidity_2m}%. `;
      for (let i = 0; i < d.daily.time.length; i++) {
        out += `${d.daily.time[i]}: ${Math.round(d.daily.temperature_2m_min[i])}–${Math.round(d.daily.temperature_2m_max[i])}°C, `
          + `${WMO[d.daily.weather_code[i]] || "?"}, Niederschlag ${d.daily.precipitation_sum[i]} mm. `;
      }
      return out;
    }

    case "web_search": {
      const d = await ctx.webSearch(args.query);
      return d.result + (d.source ? ` (Quelle: ${d.source})` : "");
    }

    case "search_notes": {
      if (!(await ctx.ensureVault())) return "Kein Obsidian-Vault verbunden. Bitte unten auf 📂 klicken.";
      const hits = await Obsidian.search(args.query, 5);
      if (!hits.length) return `Keine Notizen gefunden zu "${args.query}".`;
      return hits.map(h => `📄 ${h.name}: ${h.snippet}`).join("\n");
    }

    case "save_to_daily_note": {
      if (!(await ctx.ensureVault())) return "Kein Obsidian-Vault verbunden. Bitte unten auf 📂 klicken.";
      const file = await Obsidian.appendToDaily(args.text);
      return `Gespeichert in ${file}.`;
    }

    case "create_note": {
      if (!(await ctx.ensureVault())) return "Kein Obsidian-Vault verbunden. Bitte unten auf 📂 klicken.";
      const file = await Obsidian.createNote(args.title, args.content);
      return `Notiz "${file}" angelegt.`;
    }

    case "read_note": {
      if (!(await ctx.ensureVault())) return "Kein Obsidian-Vault verbunden. Bitte unten auf 📂 klicken.";
      const note = await Obsidian.readNote(args.query);
      if (!note) return `Keine Notiz gefunden zu "${args.query}".`;
      return `📄 ${note.name}\n\n${note.content}`;
    }

    case "recent_notes": {
      if (!(await ctx.ensureVault())) return "Kein Obsidian-Vault verbunden. Bitte unten auf 📂 klicken.";
      const list = await Obsidian.recent(args.count || 5);
      if (!list.length) return "Keine Notizen gefunden.";
      return "Zuletzt bearbeitet:\n" + list.map(n => `• ${n.path}`).join("\n");
    }

    case "vault_stats": {
      if (!(await ctx.ensureVault())) return "Kein Obsidian-Vault verbunden. Bitte unten auf 📂 klicken.";
      const s = await Obsidian.stats();
      ctx.onStats && ctx.onStats(s);
      return `Dein zweites Gehirn: ${s.notes} Notizen in ${s.folders} Ordnern.`
        + (s.tags.length ? ` Häufige Tags: ${s.tags.map(t => "#" + t).join(", ")}.` : "");
    }

    case "append_to_note": {
      if (!(await ctx.ensureVault())) return "Kein Obsidian-Vault verbunden. Bitte unten auf 📂 klicken.";
      const file = await Obsidian.appendToNote(args.note, args.text);
      return `An "${file}" angehängt.`;
    }

    case "set_timer": {
      const secs = Math.max(1, parseInt(args.seconds) || 0);
      ctx.scheduleTimer(secs, args.label || "");
      const mins = Math.round(secs / 60);
      return `Timer gestellt für ${secs < 90 ? secs + " Sekunden" : mins + " Minuten"}${args.label ? " (" + args.label + ")" : ""}.`;
    }

    case "decide_what_to_do": {
      if (!ctx.decide) return "Die Decision Engine ist gerade nicht verfügbar.";
      const opts = {};
      if (args.minutes) opts.minutes = Math.max(5, parseInt(args.minutes) || 30);
      if (args.energy) opts.energy = Math.min(5, Math.max(1, parseInt(args.energy)));
      if (args.mood) opts.mood = args.mood;
      if (args.note) opts.note = args.note;
      return await ctx.decide(opts);
    }

    default:
      return "Unbekanntes Werkzeug: " + name;
  }
}
