// ============================================================
// DECISION ENGINE — "Was soll ich jetzt tun?"
//
// Eine kleine, ERKLÄRBARE Entscheidungs-Maschine. Sie nimmt deinen
// aktuellen Kontext (Energie, freie Zeit, Stimmung, Tageszeit, Wetter)
// und eine Liste möglicher Aktivitäten – darunter echte offene Aufgaben
// aus deinem Obsidian-Vault – und berechnet, was sich GERADE JETZT am
// meisten lohnt.
//
// Wichtig: Die Engine "rät" nicht zufällig. Jede Empfehlung kommt mit
// einem nachvollziehbaren Score und einer Aufschlüsselung, WARUM. Das
// ist das Herz des Ganzen – die Oberfläche (decision-ui.js) macht es nur
// schön sichtbar.
//
// Keine Abhängigkeiten, kein DOM – rein logisch und dadurch testbar.
// ============================================================

const DecisionEngine = (() => {

  // ----------------------------------------------------------
  // Auswahl-Optionen (eine einzige Quelle der Wahrheit; die UI
  // baut ihre Segment-Schalter direkt aus diesen Listen).
  // ----------------------------------------------------------
  const ENERGY = [
    { v: 1, label: "Erschöpft",      icon: "🪫" },
    { v: 2, label: "Müde",           icon: "🔋" },
    { v: 3, label: "OK",             icon: "🔋" },
    { v: 4, label: "Wach",           icon: "⚡" },
    { v: 5, label: "Voll aufgeladen", icon: "⚡" },
  ];

  const TIME = [
    { minutes: 15,  label: "15 Min" },
    { minutes: 30,  label: "30 Min" },
    { minutes: 60,  label: "1 Std" },
    { minutes: 150, label: "2+ Std" },
  ];

  const MOOD = [
    { v: "focused",  label: "Konzentriert", icon: "🎯" },
    { v: "creative", label: "Kreativ",      icon: "🎨" },
    { v: "social",   label: "Sozial",       icon: "💬" },
    { v: "relaxed",  label: "Entspannt",    icon: "🌙" },
    { v: "any",      label: "Egal",         icon: "🎲" },
  ];

  // Gewichte der einzelnen Faktoren – ergeben zusammen 1.0.
  const WEIGHTS = {
    energy:   0.26,
    time:     0.24,
    daypart:  0.16,
    mood:     0.14,
    priority: 0.12,
    weather:  0.08,
  };

  // Reihenfolge + deutsche Namen der Faktoren für die "WARUM"-Balken.
  const FACTOR_META = [
    { key: "energy",   label: "Energie-Match" },
    { key: "time",     label: "Zeit-Fit" },
    { key: "daypart",  label: "Tageszeit" },
    { key: "mood",     label: "Stimmung" },
    { key: "priority", label: "Priorität" },
    { key: "weather",  label: "Wetter" },
  ];

  const DAYPARTS = ["morning", "afternoon", "evening", "night"];
  const DAYPART_DE = {
    morning: "den Morgen", afternoon: "den Nachmittag",
    evening: "den Abend", night: "die Nacht",
  };

  // ----------------------------------------------------------
  // Kuratierter Standard-Pool an Aktivitäten.
  // Felder:
  //   idealEnergy  1..5  – wie viel Energie das ideal verlangt
  //   minMinutes         – Mindestzeit, damit es sich lohnt
  //   idealMinutes       – schöne Standard-Dauer
  //   dayparts     []    – wann es besonders gut passt ("any" = immer)
  //   moods        []    – zu welcher Stimmung es passt ("any" = immer)
  //   outdoor      bool  – findet draußen statt (wetterabhängig)
  //   priority     0..1  – Grund-Wichtigkeit
  // ----------------------------------------------------------
  const ACTIVITIES = [
    { id: "code",     icon: "💻", label: "An deinem Projekt coden",            category: "Deep Work", idealEnergy: 4, minMinutes: 30, idealMinutes: 60, dayparts: ["morning","afternoon","evening"], moods: ["focused","creative"], outdoor: false, priority: 0.62, blurb: "Bau weiter an etwas Eigenem – am meisten lernst du beim Selbermachen." },
    { id: "learn",    icon: "📚", label: "Neues Konzept lernen",               category: "Deep Work", idealEnergy: 4, minMinutes: 20, idealMinutes: 45, dayparts: ["morning","afternoon"],          moods: ["focused"],            outdoor: false, priority: 0.6,  blurb: "Tutorial oder Doku durcharbeiten, solange der Kopf frisch ist." },
    { id: "kata",     icon: "🧩", label: "Mini-Coding-Übung (Kata)",           category: "Deep Work", idealEnergy: 3, minMinutes: 15, idealMinutes: 25, dayparts: ["any"],                          moods: ["focused","creative"], outdoor: false, priority: 0.5,  blurb: "Eine kleine Aufgabe lösen – schnelle Erfolge halten dich im Flow." },
    { id: "plan",     icon: "🗺️", label: "Projekt planen & Ideen sortieren",   category: "Planung",   idealEnergy: 3, minMinutes: 15, idealMinutes: 30, dayparts: ["morning","evening"],            moods: ["focused","creative"], outdoor: false, priority: 0.52, blurb: "Nächste Schritte festlegen, damit du nie vor dem Nichts sitzt." },
    { id: "secondbrain", icon: "🗂️", label: "Zweites Gehirn pflegen",          category: "Planung",   idealEnergy: 2, minMinutes: 10, idealMinutes: 30, dayparts: ["any"],                          moods: ["focused"],            outdoor: false, priority: 0.5,  blurb: "Notizen aufräumen, verlinken und Gedanken festhalten." },
    { id: "walk",     icon: "🚶", label: "Spazieren / kurz raus",              category: "Bewegung",  idealEnergy: 2, minMinutes: 15, idealMinutes: 30, dayparts: ["morning","afternoon","evening"],moods: ["relaxed","social","any"], outdoor: true, priority: 0.5,  blurb: "Frische Luft sortiert den Kopf besser als jede To-do-Liste." },
    { id: "workout",  icon: "🏋️", label: "Sport / Workout",                    category: "Bewegung",  idealEnergy: 4, minMinutes: 20, idealMinutes: 45, dayparts: ["morning","afternoon","evening"],moods: ["any"],                outdoor: false, priority: 0.52, blurb: "Körper bewegen lädt das Gehirn fürs Lernen wieder auf." },
    { id: "break",    icon: "☕", label: "Kurze Pause / Augen ausruhen",        category: "Erholung",  idealEnergy: 1, minMinutes: 5,  idealMinutes: 15, dayparts: ["any"],                          moods: ["relaxed","any"],      outdoor: false, priority: 0.45, blurb: "Bildschirm weg, durchatmen – Pausen sind Teil der Arbeit." },
    { id: "nap",      icon: "😴", label: "Power-Nap",                          category: "Erholung",  idealEnergy: 1, minMinutes: 15, idealMinutes: 25, dayparts: ["afternoon"],                    moods: ["relaxed"],            outdoor: false, priority: 0.42, blurb: "20 Minuten Augen zu – danach denkst du wieder klar." },
    { id: "create",   icon: "🎨", label: "Etwas Kreatives machen",             category: "Kreativ",   idealEnergy: 3, minMinutes: 20, idealMinutes: 40, dayparts: ["afternoon","evening"],          moods: ["creative","relaxed"], outdoor: false, priority: 0.5,  blurb: "Zeichnen, Musik, Schreiben – Kreativität füttert dein Coden." },
    { id: "social",   icon: "💬", label: "Zeit mit Freunden / Familie",        category: "Sozial",    idealEnergy: 3, minMinutes: 20, idealMinutes: 60, dayparts: ["afternoon","evening"],          moods: ["social","relaxed"],   outdoor: false, priority: 0.5,  blurb: "Echte Gespräche sind die beste Energiequelle." },
    { id: "tidy",     icon: "🧹", label: "Schreibtisch / Zimmer aufräumen",    category: "Ordnung",   idealEnergy: 2, minMinutes: 10, idealMinutes: 25, dayparts: ["any"],                          moods: ["any"],                outdoor: false, priority: 0.45, blurb: "Aufgeräumter Platz, aufgeräumter Kopf – schnell erledigt." },
    { id: "read",     icon: "📖", label: "Lesen (Buch / Artikel)",             category: "Erholung",  idealEnergy: 2, minMinutes: 15, idealMinutes: 40, dayparts: ["morning","evening","night"],     moods: ["relaxed","focused"],  outdoor: false, priority: 0.48, blurb: "Ruhig lesen – Wissen, das nicht von einem Bildschirm kommt." },
    { id: "reflect",  icon: "📓", label: "Tag reflektieren / Journal",         category: "Planung",   idealEnergy: 2, minMinutes: 10, idealMinutes: 20, dayparts: ["evening","night"],              moods: ["relaxed"],            outdoor: false, priority: 0.46, blurb: "Kurz festhalten, was lief – das macht morgen leichter." },
    { id: "reset",    icon: "🎧", label: "Musik + frische Luft (Reset)",       category: "Erholung",  idealEnergy: 1, minMinutes: 10, idealMinutes: 20, dayparts: ["any"],                          moods: ["relaxed","any"],      outdoor: true,  priority: 0.44, blurb: "Lieblingssong an, kurz nach draußen, Kopf durchlüften." },
  ];

  // ----------------------------------------------------------
  // Hilfen
  // ----------------------------------------------------------
  const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

  function daypartOf(date = new Date()) {
    const h = date.getHours();
    if (h < 6)  return "night";
    if (h < 12) return "morning";
    if (h < 17) return "afternoon";
    if (h < 22) return "evening";
    return "night";
  }

  // Wetter (Open-Meteo-Code + Temperatur) → "Güte" 0..1 für Draußen-Sein.
  function weatherGoodness(weather) {
    if (!weather || typeof weather.code !== "number") return null;
    const c = weather.code;
    let base;
    if (c <= 1)        base = 0.95;  // klar / meist klar
    else if (c <= 3)   base = 0.8;   // bewölkt
    else if (c <= 48)  base = 0.55;  // Nebel
    else if (c <= 57)  base = 0.45;  // Nieselregen
    else if (c <= 67)  base = 0.3;   // Regen
    else if (c <= 77)  base = 0.4;   // Schnee
    else if (c <= 82)  base = 0.32;  // Schauer
    else               base = 0.2;   // Gewitter
    // Temperatur-Komfort (mild ist am besten)
    const t = typeof weather.temp === "number" ? weather.temp : 16;
    const tempFactor = t >= 10 && t <= 24 ? 1 : t >= 4 && t <= 30 ? 0.8 : 0.6;
    return clamp(base * tempFactor);
  }

  // ----------------------------------------------------------
  // Einzelne Faktoren (jeweils 0..1)
  // ----------------------------------------------------------
  function fEnergy(act, ctx) {
    const d = Math.abs(act.idealEnergy - ctx.energy);
    return clamp(1 - d / 3, 0.1, 1);
  }

  function fTime(act, ctx) {
    const avail = ctx.minutes;
    if (avail < act.minMinutes) return clamp(0.15 + 0.1 * (avail / act.minMinutes), 0, 0.3);
    if (avail >= act.idealMinutes) return 1;
    return clamp(0.6 + 0.4 * ((avail - act.minMinutes) / Math.max(1, act.idealMinutes - act.minMinutes)));
  }

  function fDaypart(act, ctx) {
    const dp = act.dayparts || ["any"];
    if (dp.includes(ctx.daypart)) return 1;
    if (dp.includes("any")) return 0.85;
    // Nachbar-Tageszeiten zählen halb (Vormittag ↔ Nachmittag …)
    const i = DAYPARTS.indexOf(ctx.daypart);
    const neighbours = [DAYPARTS[(i + 3) % 4], DAYPARTS[(i + 1) % 4]];
    if (dp.some(d => neighbours.includes(d))) return 0.6;
    return 0.35;
  }

  function fMood(act, ctx) {
    const m = act.moods || ["any"];
    if (m.includes(ctx.mood)) return 1;
    if (m.includes("any") || ctx.mood === "any") return 0.8;
    return 0.45;
  }

  function fWeather(act, ctx) {
    const good = weatherGoodness(ctx.weather);
    if (good === null) return 0.7;                 // kein Wetter bekannt → neutral
    if (act.outdoor) return good;                  // draußen: direkt das Wetter
    return clamp(0.65 + 0.25 * (1 - good));         // drinnen: bei schlechtem Wetter attraktiver
  }

  function fPriority(act) {
    return clamp(typeof act.priority === "number" ? act.priority : 0.5);
  }

  // ----------------------------------------------------------
  // Offene Vault-Aufgabe → bewertbare Aktivität
  // ----------------------------------------------------------
  const URGENT = /\b(heute|morgen|deadline|frist|abgabe|prüfung|klausur|hausaufgabe|wichtig|asap|dringend|due)\b|!!|⚠/i;
  const FOCUS_WORDS = /\b(lern|code|coden|program|mathe|vokab|üben|lesen|schreib|projekt|aufsatz|referat)\b/i;
  const QUICK_WORDS = /\b(kurz|schnell|mail|antwort|anruf|nachricht|bestell)\b/i;
  const OUT_WORDS   = /\b(einkauf|besorg|draußen|spazier|abholen|post|müll)\b/i;

  function slug(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9äöü]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
  }

  function taskToActivity(task) {
    const text = (task.text || "").replace(/\s+/g, " ").trim();
    const urgent = URGENT.test(text);
    const focus = FOCUS_WORDS.test(text);
    const quick = QUICK_WORDS.test(text);
    return {
      id: "task:" + (slug(text) || Math.random().toString(36).slice(2, 8)),
      icon: urgent ? "🔥" : "✅",
      label: text.length > 70 ? text.slice(0, 67) + "…" : text,
      category: "Deine Aufgabe",
      idealEnergy: focus ? 4 : quick ? 2 : 3,
      minMinutes: quick ? 5 : 15,
      idealMinutes: quick ? 15 : focus ? 40 : 25,
      dayparts: ["any"],
      moods: focus ? ["focused"] : ["any"],
      outdoor: OUT_WORDS.test(text),
      priority: urgent ? 0.95 : 0.72,
      isTask: true,
      urgent,
      source: task.file || "",
      blurb: urgent
        ? "Steht offen auf deiner Liste – und sieht zeitkritisch aus."
        : "Eine offene Aufgabe aus deinem zweiten Gehirn.",
    };
  }

  // ----------------------------------------------------------
  // Kontext zusammenbauen (füllt fehlende Felder mit Defaults)
  // ----------------------------------------------------------
  function buildContext(input = {}) {
    const now = input.now || new Date();
    return {
      energy: clamp(input.energy || 3, 1, 5),
      minutes: input.minutes || 30,
      mood: input.mood || "any",
      daypart: input.daypart || daypartOf(now),
      weather: input.weather || null,
      note: (input.note || "").trim(),
      tasks: Array.isArray(input.tasks) ? input.tasks : [],
      recent: Array.isArray(input.recent) ? input.recent : [],
      now,
    };
  }

  // Freitext-Notiz des Nutzers leicht einfließen lassen: passende
  // Aktivitäten bekommen einen kleinen Bonus (Stichwort-Treffer).
  function noteBoost(act, note) {
    if (!note) return 0;
    const n = note.toLowerCase();
    const hay = (act.label + " " + (act.category || "")).toLowerCase();
    const words = n.split(/[^a-z0-9äöü]+/).filter(w => w.length >= 4);
    let hits = 0;
    for (const w of words) if (hay.includes(w)) hits++;
    if (act.isTask && hits) hits++; // eigene Aufgaben zählen stärker
    return clamp(hits * 0.06, 0, 0.18);
  }

  // ----------------------------------------------------------
  // Ein Kandidat → vollständige Bewertung
  // ----------------------------------------------------------
  function score(act, ctx) {
    const f = {
      energy:   fEnergy(act, ctx),
      time:     fTime(act, ctx),
      daypart:  fDaypart(act, ctx),
      mood:     fMood(act, ctx),
      priority: fPriority(act),
      weather:  fWeather(act, ctx),
    };
    let total = 0;
    for (const k in WEIGHTS) total += f[k] * WEIGHTS[k];

    // Deadline-Bonus: zeitkritische Aufgaben nach oben holen, auch wenn
    // Energie/Zeit nicht perfekt passen (eine Frist ist eine harte Grenze).
    if (act.urgent) total += 0.12;

    // Notiz-Bonus + Abwechslung (kürzlich Gezeigtes leicht dämpfen)
    total += noteBoost(act, ctx.note);
    const fresh = ctx.recent.includes(act.id) ? 0.78 : 1;
    total = clamp(total * fresh);

    const factors = FACTOR_META.map(m => ({ key: m.key, label: m.label, val: f[m.key] }));
    return { activity: act, score: total, percent: Math.round(total * 100), factors, why: explain(act, ctx, f) };
  }

  // Kurzen, natürlichen Begründungssatz aus den stärksten Faktoren bauen.
  function explain(act, ctx, f) {
    const phrases = {
      energy:   "es zu deiner Energie passt",
      time:     `es sich gut in ${ctx.minutes} Minuten machen lässt`,
      daypart:  `es ideal für ${DAYPART_DE[ctx.daypart] || "diese Tageszeit"} ist`,
      mood:     "es zu deiner Stimmung passt",
      priority: act.urgent ? "es bald fällig ist" : act.isTask ? "es offen auf deiner Liste steht" : "es dich wirklich weiterbringt",
      weather:  act.outdoor ? "das Wetter mitspielt" : "drinnen gerade angenehmer ist",
    };
    const ranked = FACTOR_META
      .map(m => ({ key: m.key, w: f[m.key] * WEIGHTS[m.key], v: f[m.key] }))
      .filter(x => x.v >= 0.6)
      .sort((a, b) => b.w - a.w);
    if (!ranked.length) return "Gerade ein guter Mix aus überschaubarem Aufwand und echtem Nutzen.";
    const a = phrases[ranked[0].key];
    const b = ranked[1] ? phrases[ranked[1].key] : null;
    return "Empfohlen, weil " + a + (b ? " und " + b : "") + ".";
  }

  // ----------------------------------------------------------
  // Öffentliche Haupt-Funktion: Kontext rein → Rangliste raus
  // ----------------------------------------------------------
  function decide(input = {}) {
    const ctx = buildContext(input);
    const candidates = ACTIVITIES.concat(ctx.tasks.map(taskToActivity));
    const ranked = candidates
      .map(a => score(a, ctx))
      .sort((a, b) => b.score - a.score || a.activity.label.localeCompare(b.activity.label));
    return { ranked, context: ctx };
  }

  return {
    ENERGY, TIME, MOOD, FACTOR_META, ACTIVITIES,
    daypartOf, weatherGoodness, buildContext, taskToActivity, decide,
  };
})();

// Für eventuelle Tests in Node:
if (typeof module !== "undefined" && module.exports) module.exports = DecisionEngine;
