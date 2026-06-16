// ============================================================
// DECISION UI — die Oberfläche der Decision Engine.
//
// Drei Schritte, wie ein JARVIS-Subroutine-Boot:
//   1) ERFASSEN   – Energie, Zeit, Stimmung (+ optionaler Hinweis)
//   2) ANALYSIEREN – kurze, cineastische Rechen-Animation
//   3) ERGEBNIS    – Top-Empfehlung mit Confidence-Ring, Faktor-Balken
//                    und anklickbaren Alternativen
//
// Bindet an das #decisionOverlay-Markup in index.html. Spricht über
// "Hooks" mit app.js (Stimme, Log, Timer, Standort, Vault-Aufgaben),
// bleibt dadurch entkoppelt und auch ohne Vault voll funktionsfähig.
// ============================================================

const DecisionUI = (() => {
  const $ = (id) => document.getElementById(id);

  // Von app.js eingehängte Funktionen (mit harmlosen Defaults).
  let hooks = {
    speak: async () => {},
    log: () => {},
    scheduleTimer: () => {},
    location: () => ({ lat: 47.37, lon: 8.54 }),
    getTasks: async () => [],
    onDecision: () => {},
  };

  // Laufender Zustand
  let state = {
    energy: 4, minutes: 30, mood: "any",
    ranked: [], idx: 0, context: null,
    weather: null, weatherAt: 0, tasks: [],
  };
  let ringRAF = 0, scanRAF = 0, bound = false;

  const WMO_ICON = { 0:"☀️",1:"🌤",2:"⛅",3:"☁️",45:"🌫",48:"🌫",51:"🌦",53:"🌦",55:"🌦",61:"🌧",63:"🌧",65:"🌧",71:"❄️",73:"❄️",75:"❄️",80:"🌧",81:"🌧",82:"⛈",95:"⛈",96:"⛈",99:"⛈" };
  const DAYPART_LABEL = { morning:"Morgen", afternoon:"Nachmittag", evening:"Abend", night:"Nacht" };

  // ----------------------------------------------------------
  // Kleiner localStorage-Speicher für Abwechslung & Verlauf
  // ----------------------------------------------------------
  const loadJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  function rememberShown(id) {
    const recent = loadJSON("dz_recent", []).filter(x => x !== id);
    recent.unshift(id);
    saveJSON("dz_recent", recent.slice(0, 5));
  }

  // ----------------------------------------------------------
  // Segment-Schalter aus den Engine-Optionen bauen
  // ----------------------------------------------------------
  function buildSegments() {
    const energyEl = $("dzEnergy");
    energyEl.innerHTML = "";
    DecisionEngine.ENERGY.forEach(o => {
      energyEl.appendChild(seg(o.icon + " " + o.label, o.v, () => { state.energy = o.v; mark(energyEl, o.v); }));
    });
    const timeEl = $("dzTime");
    timeEl.innerHTML = "";
    DecisionEngine.TIME.forEach(o => {
      timeEl.appendChild(seg(o.label, o.minutes, () => { state.minutes = o.minutes; mark(timeEl, o.minutes); }));
    });
    const moodEl = $("dzMood");
    moodEl.innerHTML = "";
    DecisionEngine.MOOD.forEach(o => {
      moodEl.appendChild(seg(o.icon + " " + o.label, o.v, () => { state.mood = o.v; mark(moodEl, o.v); }));
    });
  }

  function seg(text, val, onClick) {
    const b = document.createElement("button");
    b.className = "dz-chip";
    b.type = "button";
    b.textContent = text;
    b.dataset.val = String(val);
    b.addEventListener("click", onClick);
    return b;
  }
  function mark(container, val) {
    container.querySelectorAll(".dz-chip").forEach(c =>
      c.classList.toggle("on", c.dataset.val === String(val)));
  }

  // Sinnvolle Vorauswahl, abhängig von der Tageszeit.
  function presetDefaults() {
    const dp = DecisionEngine.daypartOf();
    state.energy = dp === "night" ? 2 : dp === "evening" ? 3 : 4;
    state.minutes = 30;
    state.mood = "any";
    mark($("dzEnergy"), state.energy);
    mark($("dzTime"), state.minutes);
    mark($("dzMood"), state.mood);
  }

  // ----------------------------------------------------------
  // Wetter holen (für den Wetter-Faktor + Kontext-Chip)
  // ----------------------------------------------------------
  async function refreshWeather() {
    if (state.weather && Date.now() - state.weatherAt < 600000) return state.weather;
    try {
      const { lat, lon } = hooks.location();
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
      const d = await (await fetch(url)).json();
      state.weather = { code: d.current.weather_code, temp: d.current.temperature_2m };
      state.weatherAt = Date.now();
    } catch (e) { state.weather = null; }
    return state.weather;
  }

  // Kontext-Chips oben (Tageszeit · Wetter · Aufgaben)
  function renderContextChips() {
    const dp = DecisionEngine.daypartOf();
    const t = new Date();
    const clock = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
    const w = state.weather
      ? `${WMO_ICON[state.weather.code] || "🌡"} ${Math.round(state.weather.temp)}°`
      : "🌡 –";
    const tasks = state.tasks.length
      ? `📂 ${state.tasks.length} offene Aufgabe${state.tasks.length === 1 ? "" : "n"}`
      : "📂 keine offenen Aufgaben";
    $("dzContext").innerHTML =
      `<span class="dz-ctx">🕐 ${DAYPART_LABEL[dp]} · ${clock}</span>` +
      `<span class="dz-ctx">${w}</span>` +
      `<span class="dz-ctx">${tasks}</span>`;
  }

  // ----------------------------------------------------------
  // Schritte ein-/ausblenden
  // ----------------------------------------------------------
  function show(step) {
    ["dzIntake", "dzAnalyzing", "dzResult"].forEach(id =>
      $(id).classList.toggle("hidden", id !== step));
  }

  function open() {
    if (!bound) mount();
    $("decisionOverlay").classList.remove("hidden");
    show("dzIntake");
    presetDefaults();
    renderContextChips();
    // Aufgaben + Wetter im Hintergrund nachladen, dann Chips updaten.
    Promise.resolve(hooks.getTasks()).then(ts => { state.tasks = ts || []; renderContextChips(); }).catch(() => {});
    refreshWeather().then(renderContextChips);
  }
  function close() {
    $("decisionOverlay").classList.add("hidden");
    cancelAnimationFrame(ringRAF);
    cancelAnimationFrame(scanRAF);
  }

  // ----------------------------------------------------------
  // SCHRITT 2: Analyse-Animation, dann Ergebnis
  // ----------------------------------------------------------
  async function analyze() {
    show("dzAnalyzing");
    runScanner(true);
    // Daten besorgen
    state.tasks = (await Promise.resolve(hooks.getTasks()).catch(() => [])) || [];
    await refreshWeather();
    const { ranked, context } = DecisionEngine.decide({
      energy: state.energy, minutes: state.minutes, mood: state.mood,
      weather: state.weather, note: $("dzNote").value, tasks: state.tasks,
      recent: loadJSON("dz_recent", []),
    });
    state.ranked = ranked;
    state.idx = 0;
    state.context = context;

    // "Auswertungs"-Feed streamen (rein visuell – fühlt sich an wie Rechnen).
    const feed = $("dzFeed");
    feed.innerHTML = "";
    const preview = ranked.slice(0, 6);
    for (let i = 0; i < preview.length; i++) {
      await wait(150 + Math.random() * 90);
      const r = preview[i];
      const line = document.createElement("div");
      line.className = "dz-feed-line";
      line.innerHTML = `<span>${r.activity.icon} ${esc(r.activity.label)}</span><span class="dz-feed-pct">${r.percent}%</span>`;
      feed.appendChild(line);
      requestAnimationFrame(() => line.classList.add("in"));
    }
    await wait(420);
    runScanner(false);
    show("dzResult");      // erst einblenden …
    renderResult(true);    // … dann rendern, damit die Balken animieren
  }

  // Rotierender Radar-Scanner im Analyse-Schritt
  function runScanner(on) {
    cancelAnimationFrame(scanRAF);
    const c = $("dzScanner");
    if (!c) return;
    const ctx = c.getContext("2d");
    const cx = c.width / 2, cy = c.height / 2, R = cx - 6;
    let a = 0;
    if (!on) { ctx.clearRect(0, 0, c.width, c.height); return; }
    (function frame() {
      ctx.clearRect(0, 0, c.width, c.height);
      // Ringe
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath(); ctx.arc(cx, cy, R * i / 3, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(47,243,255,0.12)"; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(47,243,255,0.3)"; ctx.lineWidth = 1.5; ctx.stroke();
      // Kreuz
      ctx.strokeStyle = "rgba(47,243,255,0.1)";
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
      // Sweep
      a += 0.09;
      const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      g.addColorStop(0, "rgba(47,243,255,0.45)");
      g.addColorStop(1, "rgba(47,243,255,0)");
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a - 0.6, a); ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
      // Leuchtpunkt
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.7, cy + Math.sin(a) * R * 0.7, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#80faff"; ctx.shadowBlur = 8; ctx.shadowColor = "#2ff3ff"; ctx.fill(); ctx.shadowBlur = 0;
      scanRAF = requestAnimationFrame(frame);
    })();
  }

  // ----------------------------------------------------------
  // SCHRITT 3: Ergebnis rendern
  // ----------------------------------------------------------
  function current() { return state.ranked[state.idx]; }

  function renderResult(animateRing) {
    const r = current();
    if (!r) return;
    const a = r.activity;
    $("dzRecIcon").textContent = a.icon;
    $("dzRecLabel").textContent = a.label;
    const mins = Math.min(a.idealMinutes, state.context.minutes);
    $("dzRecMeta").innerHTML =
      `<span class="dz-pill">${esc(a.category)}</span>` +
      `<span class="dz-pill">⏱ ~${mins} Min</span>` +
      (a.isTask ? `<span class="dz-pill dz-pill-amber">aus deinem Vault</span>` : "");
    $("dzRecWhy").textContent = r.why + (a.blurb ? " " + a.blurb : "");

    // Faktor-Balken
    const fEl = $("dzFactors");
    fEl.innerHTML = "";
    r.factors.forEach(f => {
      const row = document.createElement("div");
      row.className = "dz-factor";
      row.innerHTML =
        `<span class="dz-factor-label">${f.label}</span>` +
        `<span class="dz-factor-track"><span class="dz-factor-fill"></span></span>` +
        `<span class="dz-factor-val">${Math.round(f.val * 100)}</span>`;
      fEl.appendChild(row);
      const fill = row.querySelector(".dz-factor-fill");
      if (f.val < 0.45) fill.classList.add("low");
      else if (f.val >= 0.8) fill.classList.add("high");
      requestAnimationFrame(() => { fill.style.width = Math.round(f.val * 100) + "%"; });
    });

    // Alternativen (die nächstbesten, ohne den aktuellen)
    const alts = $("dzAlts");
    alts.innerHTML = "";
    const others = state.ranked.filter((_, i) => i !== state.idx).slice(0, 3);
    others.forEach(o => {
      const card = document.createElement("button");
      card.className = "dz-alt";
      card.type = "button";
      card.innerHTML =
        `<span class="dz-alt-icon">${o.activity.icon}</span>` +
        `<span class="dz-alt-label">${esc(o.activity.label)}</span>` +
        `<span class="dz-alt-pct">${o.percent}%</span>`;
      card.addEventListener("click", () => {
        state.idx = state.ranked.indexOf(o);
        renderResult(true);
      });
      alts.appendChild(card);
    });

    drawRing($("dzConf"), r.percent, animateRing);
  }

  // Confidence-Ring (Canvas) – animiert von 0 auf den Match-Wert.
  function drawRing(canvas, pct, animate) {
    cancelAnimationFrame(ringRAF);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const cx = canvas.width / 2, cy = canvas.height / 2, R = Math.min(cx, cy) - 8;
    const target = pct / 100;
    const col = pct >= 75 ? "#39ff87" : pct >= 55 ? "#2ff3ff" : "#ffb830";
    let shown = animate ? 0 : target;
    (function frame() {
      shown += (target - shown) * 0.12;
      if (Math.abs(target - shown) < 0.003) shown = target;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(47,243,255,0.12)"; ctx.lineWidth = 6; ctx.stroke();
      const start = -Math.PI / 2;
      ctx.beginPath(); ctx.arc(cx, cy, R, start, start + shown * Math.PI * 2);
      ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.shadowBlur = 12; ctx.shadowColor = col; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = col; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "bold 22px 'Segoe UI', monospace";
      ctx.fillText(Math.round(shown * 100) + "%", cx, cy);
      if (shown !== target) ringRAF = requestAnimationFrame(frame);
    })();
  }

  // ----------------------------------------------------------
  // Aktionen
  // ----------------------------------------------------------
  function go() {
    const r = current();
    if (!r) return;
    const a = r.activity;
    const mins = Math.min(a.idealMinutes, state.context.minutes);
    rememberShown(a.id);
    hooks.scheduleTimer(mins * 60, a.label);
    hooks.log(`🧭 Entschieden: ${a.label} (${mins} Min)`, "ok");
    hooks.onDecision(r, state.context);
    // Bestätigungs-Zustand zeigen, dann schließen.
    const actions = $("dzActions");
    actions.innerHTML = `<div class="dz-go-confirm">✓ FOKUS GESTARTET · ${mins} MIN — viel Erfolg!</div>`;
    setTimeout(() => { close(); restoreActions(); }, 1500);
  }

  function reroll() {
    if (!state.ranked.length) return;
    state.idx = (state.idx + 1) % state.ranked.length;
    renderResult(true);
  }

  async function saveDecision() {
    const r = current();
    if (!r) return;
    const a = r.activity;
    const mins = Math.min(a.idealMinutes, state.context.minutes);
    const ok = await hooks.onSave?.(`🧭 Entscheidung: ${a.label} (${mins} Min, Match ${r.percent}%)`);
    const btn = $("dzSave");
    if (btn) {
      btn.textContent = ok ? "✓ NOTIERT" : "⚠ KEIN VAULT";
      setTimeout(() => { btn.textContent = "💾 NOTIEREN"; }, 1600);
    }
  }

  function restoreActions() {
    const actions = $("dzActions");
    if (!actions) return;
    actions.innerHTML =
      `<button id="dzGo" class="dz-go">▶ LOS GEHT'S</button>` +
      `<button id="dzReroll" class="dz-btn">↻ ANDERER VORSCHLAG</button>` +
      `<button id="dzSave" class="dz-btn">💾 NOTIEREN</button>` +
      `<button id="dzBack" class="dz-btn">↩ NEU</button>`;
    $("dzGo").addEventListener("click", go);
    $("dzReroll").addEventListener("click", reroll);
    $("dzSave").addEventListener("click", saveDecision);
    $("dzBack").addEventListener("click", () => { show("dzIntake"); renderContextChips(); });
  }

  // ----------------------------------------------------------
  // Sprach-/Tool-Pfad: ohne Erfassungs-Schritt direkt entscheiden.
  // Gibt einen kurzen Text zurück, den JARVIS dann selbst ausspricht.
  // ----------------------------------------------------------
  async function runAuto(opts = {}) {
    if (!bound) mount();
    const dp = DecisionEngine.daypartOf();
    state.energy = opts.energy || (dp === "night" ? 2 : dp === "evening" ? 3 : 4);
    state.minutes = opts.minutes || 30;
    state.mood = opts.mood || "any";
    state.tasks = (await Promise.resolve(hooks.getTasks()).catch(() => [])) || [];
    await refreshWeather();
    const { ranked, context } = DecisionEngine.decide({
      energy: state.energy, minutes: state.minutes, mood: state.mood,
      weather: state.weather, note: opts.note || "", tasks: state.tasks,
      recent: loadJSON("dz_recent", []),
    });
    state.ranked = ranked; state.idx = 0; state.context = context;
    $("decisionOverlay").classList.remove("hidden");
    // Segment-Anzeige auf die tatsächlich genutzten Werte setzen.
    mark($("dzEnergy"), state.energy); mark($("dzTime"), state.minutes); mark($("dzMood"), state.mood);
    renderContextChips();
    show("dzResult");
    renderResult(true);
    const r = ranked[0];
    const mins = Math.min(r.activity.idealMinutes, context.minutes);
    return `Mein Vorschlag: ${r.activity.label} (ca. ${mins} Minuten, Match ${r.percent}%). ${r.why}`;
  }

  // ----------------------------------------------------------
  // Einmaliges Verdrahten
  // ----------------------------------------------------------
  function mount() {
    if (bound) return;
    bound = true;
    buildSegments();
    $("dzClose").addEventListener("click", close);
    $("decisionOverlay").addEventListener("click", (e) => { if (e.target.id === "decisionOverlay") close(); });
    $("dzAnalyze").addEventListener("click", analyze);
    restoreActions();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("decisionOverlay").classList.contains("hidden")) close();
    });
  }

  function setHooks(h) { hooks = Object.assign(hooks, h); }

  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));

  return { mount, open, close, setHooks, runAuto };
})();
