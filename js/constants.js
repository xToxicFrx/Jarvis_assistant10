// ============================================================
// constants.js — feste Werte und Standard-Einstellungen.
// Wird als erstes geladen; alle anderen Module duerfen CONST nutzen.
// ============================================================
window.CONST = {
  APP_VERSION: "2.0",

  // Vorschlaege fuer Fach-Felder (datalist). Frei erweiterbar durch Tippen.
  SUBJECT_SUGGESTIONS: [
    "Mathe", "Deutsch", "Englisch", "Franzoesisch", "Latein", "Spanisch",
    "Biologie", "Chemie", "Physik", "Informatik", "Geschichte", "Geografie",
    "Politik", "Religion", "Ethik", "Kunst", "Musik", "Sport", "WAT", "NWT",
  ],

  PRIORITIES: ["low", "med", "high"],
  PRIORITY_LABELS: { low: "Niedrig", med: "Mittel", high: "Hoch" },

  // Deutsche Schulnoten 1 (sehr gut) bis 6 (ungenuegend). Dezimal erlaubt (z.B. 2.5).
  GRADE_MIN: 1,
  GRADE_MAX: 6,

  REPEAT_OPTIONS: [
    { id: "none", label: "Nie" },
    { id: "daily", label: "Taeglich" },
    { id: "weekly", label: "Woechentlich" },
  ],

  WEEKDAYS: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  WEEKDAY_LABELS: { mon: "Montag", tue: "Dienstag", wed: "Mittwoch", thu: "Donnerstag", fri: "Freitag", sat: "Samstag", sun: "Sonntag" },
  WEEKDAY_SHORT: { mon: "Mo", tue: "Di", wed: "Mi", thu: "Do", fri: "Fr", sat: "Sa", sun: "So" },

  // Auswaehlbare Akzentfarben (modernes, ruhiges Design).
  ACCENTS: {
    blue: { name: "Blau", color: "#3b6df6", weak: "#eaf0ff", weakDark: "#1c2740" },
    violet: { name: "Violett", color: "#7c5cff", weak: "#efeaff", weakDark: "#241d40" },
    green: { name: "Gruen", color: "#1f9d57", weak: "#e6f6ec", weakDark: "#16301f" },
    rose: { name: "Rosa", color: "#e5447d", weak: "#fce8f0", weakDark: "#3a1d2a" },
    amber: { name: "Amber", color: "#d98324", weak: "#fdf0df", weakDark: "#3a2a16" },
    teal: { name: "Tuerkis", color: "#0d9aa6", weak: "#e0f5f6", weakDark: "#163032" },
  },

  POMODORO_DEFAULTS: { workMin: 25, breakMin: 5, longBreakMin: 15, longEvery: 4, autostart: true },

  // Default-Einstellungen fuer einen neuen Datensatz.
  DEFAULT_SETTINGS: {
    theme: "system",        // light | dark | system
    accent: "blue",
    wakeOnStart: false,
    encryptCloud: true,     // Zero-Knowledge: Cloud-Daten verschluesseln
    notifications: true,
    briefingEnabled: true,
    briefingSpeak: true,
    lastBriefing: null,     // "YYYY-MM-DD"
  },

  // Limits (auch serverseitig grob abgesichert)
  LIMITS: { maxTasks: 2000, maxNotesLen: 20000, maxTitle: 300 },
};
