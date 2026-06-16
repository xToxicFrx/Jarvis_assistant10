// ============================================================
// app.js — Steuerung (Login, Agenten-Loop, Stimme, Wake-Word,
// Pomodoro, Erinnerungen, Tagesbriefing).
//
// Daten: Store. Anzeige: UI. Anmeldung/Token/Schluessel: Auth.
// ============================================================
const $ = (id) => document.getElementById(id);

function showLogin(msg) {
  $("app").classList.add("hidden");
  $("login").classList.remove("hidden");
  $("loginErr").textContent = msg || "";
  $("pw").value = "";
  $("pw").focus();
}

async function tryLogin() {
  const pw = $("pw").value;
  if (!pw) return;
  $("loginErr").textContent = "Pruefe...";
  try {
    await Auth.login(pw);
    $("pw").value = "";
    $("login").classList.add("hidden");
    $("app").classList.remove("hidden");
    startJarvis();
  } catch (e) {
    $("loginErr").textContent = e.retryAfter ? `${e.message} (in ~${Math.ceil(e.retryAfter / 60)} min erneut)` : e.message;
  }
}

Auth.onUnauthorized = () => showLogin("Sitzung abgelaufen. Bitte neu anmelden.");
$("loginBtn").addEventListener("click", tryLogin);
$("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") tryLogin(); });

// Sitzung aus diesem Tab fortsetzen (Token + Schluessel im sessionStorage)?
(async function boot() {
  if (Auth.isValid()) { await Auth.restoreKey(); $("login").classList.add("hidden"); $("app").classList.remove("hidden"); startJarvis(); }
  else showLogin();
})();

// ============================================================
let started = false;
async function startJarvis() {
  if (started) return;
  started = true;

  await Store.init();
  UI.init();

  const today = new Date();
  const systemPrompt = {
    role: "system",
    content: `Du bist Jarvis, der persoenliche Planungs-Assistent von Luca (14 Jahre, Schueler, lernt programmieren).

PERSOENLICHKEIT: Deutsch, du-Form, freundlich, knapp, motivierend. Keine Emojis.

AUFGABE: Hilf Luca, den Ueberblick zu behalten und gut zu planen. Du kannst Aufgaben,
Hausaufgaben (nach Fach), Stundenplan, Erinnerungen, Noten, Tests, Gewohnheiten,
Notizen, Termine und Ziele anlegen/aendern und einen Lern-Timer (Pomodoro) starten.
- Nennt er etwas Konkretes, lege es mit dem passenden Werkzeug an und bestaetige kurz.
- Du bekommst jede Runde den AKTUELLEN STAND. Nutze ihn fuer Antworten und denke voraus.
- Analysiere seine Woche (viele Fristen an einem Tag, ueberfaellige Sachen, Notenschnitt)
  und gib konkrete, machbare Tipps und eine sinnvolle Reihenfolge.
- Bei "analysiere meine Woche" o.ae. antworte aus dem Stand heraus, ohne unnoetige Werkzeuge.

Heute ist ${today.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}. Halte gesprochene Antworten kurz und natuerlich.`,
  };

  // ---- Verlauf (ohne System-Prompt; wird je Runde frisch gesetzt) ----
  let history = [];
  try { const saved = JSON.parse(localStorage.getItem("jarvis_history") || "[]"); if (Array.isArray(saved)) history = saved; } catch (e) {}
  while (history.length && history[0].role === "tool") history.shift();
  function persist() { try { localStorage.setItem("jarvis_history", JSON.stringify(history)); } catch (e) {} }
  function trimHistory() { while (history.length > 24) history.shift(); while (history.length && history[0].role === "tool") history.shift(); persist(); }

  // ---- Wetter + Uhr ----
  let myLat = 47.37, myLon = 8.54;
  async function loadWeather() { try { const d = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${myLat}&longitude=${myLon}&current=temperature_2m,weather_code&timezone=auto`)).json(); UI.setWeather(d.current.temperature_2m, d.current.weather_code); } catch (e) {} }
  if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => { myLat = p.coords.latitude; myLon = p.coords.longitude; loadWeather(); }, () => loadWeather(), { timeout: 5000 }); else loadWeather();
  setInterval(loadWeather, 600000);
  const tick = () => { const n = new Date(); UI.setClock(Utils.fmtClock(n), Utils.fmtDateShort(n)); };
  tick(); setInterval(tick, 1000);

  // ---- Werkzeug-Kontext ----
  const ctx = {
    location: () => ({ lat: myLat, lon: myLon }),
    webSearch: (q) => Auth.apiFetch("/api/search", { json: { query: q } }),
    scheduleTimer: (secs, label) => { UI.toast(`Timer laeuft (${secs < 90 ? secs + "s" : Math.round(secs / 60) + " min"})`); setTimeout(() => { UI.toast("Timer abgelaufen" + (label ? ": " + label : ""), "success"); notify("Timer", "Die Zeit ist um" + (label ? ": " + label : "") + "."); if (!micActive) speak(`Erinnerung${label ? ": " + label : ""}! Die Zeit ist um.`); }, secs * 1000); },
  };

  // ---- Agenten-Loop ----
  async function converse(userText) {
    history.push({ role: "user", content: userText }); trimHistory();
    let rounds = 0;
    while (rounds++ < 6) {
      const messages = [systemPrompt, { role: "system", content: "AKTUELLER STAND:\n" + Store.snapshot() }, ...history];
      const { message } = await Auth.apiFetch("/api/chat", { json: { messages, tools: TOOL_SCHEMAS } });
      history.push(message); trimHistory();
      if (message.tool_calls && message.tool_calls.length) {
        for (const call of message.tool_calls) {
          let args = {}; try { args = JSON.parse(call.function.arguments || "{}"); } catch (e) {}
          let result; try { result = await runTool(call.function.name, args, ctx); } catch (e) { result = "Fehler im Werkzeug: " + e.message; }
          history.push({ role: "tool", tool_call_id: call.id, content: String(result) });
        }
        trimHistory(); continue;
      }
      return message.content || "";
    }
    return "Das hat zu viele Schritte gebraucht. Frag mich gern nochmal anders.";
  }

  // ---- TTS ----
  // Kostenlose Notfall-Stimme: eingebaute Browser-Sprachausgabe (wenn ElevenLabs
  // nicht geht, z.B. Kontingent leer). Unbegrenzt, dafuer etwas einfacher.
  let ttsWarned = false;
  function browserSpeak(text) {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) { resolve(); return; }
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "de-DE";
        const vs = window.speechSynthesis.getVoices();
        const de = vs.find((v) => /de(-|_)/i.test(v.lang));
        if (de) u.voice = de;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        UI.setLevel(0.5);
        window.speechSynthesis.speak(u);
      } catch (e) { resolve(); }
    });
  }

  async function speak(text) {
    if (!text) { UI.setVoiceState("idle"); return; }
    UI.setVoiceState("speaking"); UI.setLevel(0.4);
    try {
      const blob = await Auth.apiFetch("/api/tts", { json: { text }, audio: true });
      const url = URL.createObjectURL(blob); const audio = new Audio(url);
      try {
        const ac = new AudioContext(); const src = ac.createMediaElementSource(audio); const an = ac.createAnalyser(); an.fftSize = 128; src.connect(an); an.connect(ac.destination);
        const buf = new Uint8Array(an.frequencyBinCount);
        (function loop() { if (audio.ended || audio.paused) { UI.setLevel(0); return; } an.getByteFrequencyData(buf); UI.setLevel(buf.reduce((a, b) => a + b, 0) / buf.length / 128); requestAnimationFrame(loop); })();
        await audio.play();
      } catch (e) { await audio.play(); }
      await new Promise((r) => audio.addEventListener("ended", r));
      URL.revokeObjectURL(url);
    } catch (e) {
      if (/quota/i.test(e.message) && !ttsWarned) { ttsWarned = true; UI.toast("ElevenLabs-Kontingent leer - nutze Browser-Stimme.", "error"); }
      await browserSpeak(text);
    }
    finally { UI.setLevel(0); UI.setVoiceState("idle"); relistenWake(); }
  }

  async function run(text) {
    if (!text || !text.trim()) return;
    UI.setTranscript("Du", text); UI.setVoiceState("thinking");
    try { const reply = await converse(text.trim()); UI.setTranscript("Jarvis", reply); await speak(reply); }
    catch (e) { console.error(e); UI.setTranscript("Fehler", e.message); UI.setVoiceState("idle"); UI.toast(e.message, "error"); }
  }

  $("sendBtn").addEventListener("click", () => { const v = $("textInput").value; $("textInput").value = ""; run(v); });
  $("textInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("sendBtn").click(); });
  $("resetBtn").addEventListener("click", () => { history = []; persist(); UI.setTranscript("Jarvis", "Gespraech zurueckgesetzt."); UI.toast("Gespraech zurueckgesetzt"); });

  // ---- Mikrofon (Push-to-talk) ----
  let mediaRec = null, chunks = [], micActive = false, currentMime = "audio/webm", recStart = 0;
  function pickMime() { const c = ["audio/webm", "audio/mp4", "audio/ogg"]; for (const m of c) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m; return ""; }
  async function startMic() {
    if (micActive) return; micActive = true; chunks = [];
    $("micBtn").classList.add("recording"); UI.setVoiceState("listening");
    try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const mime = pickMime(); mediaRec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); currentMime = mediaRec.mimeType || mime || "audio/webm"; mediaRec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); }; recStart = Date.now(); mediaRec.start(200); }
    catch (e) { micActive = false; $("micBtn").classList.remove("recording"); UI.setVoiceState("idle"); UI.toast("Kein Mikrofon-Zugriff", "error"); }
  }
  async function stopMic() {
    if (!micActive || !mediaRec) return; micActive = false;
    $("micBtn").classList.remove("recording"); UI.setVoiceState("thinking");
    await new Promise((r) => { mediaRec.onstop = r; mediaRec.stop(); });
    mediaRec.stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: currentMime });
    const dur = Date.now() - recStart;
    if (blob.size < 1200 || dur < 400) { UI.setVoiceState("idle"); UI.toast("Aufnahme zu kurz - Knopf gedrueckt halten und sprechen."); relistenWake(); return; }
    try { const b64 = await blobToBase64(blob); const d = await Auth.apiFetch("/api/stt", { json: { audio: b64, mime: currentMime } }); if (d.text && d.text.trim()) run(d.text); else { UI.setVoiceState("idle"); UI.toast("Nichts verstanden - bitte nochmal."); relistenWake(); } }
    catch (e) { console.error(e); UI.setVoiceState("idle"); UI.toast(e.message, "error"); relistenWake(); }
  }
  function blobToBase64(blob) { return new Promise((resolve) => { const r = new FileReader(); r.onloadend = () => resolve(r.result.split(",")[1]); r.readAsDataURL(blob); }); }
  const micBtn = $("micBtn");
  micBtn.addEventListener("mousedown", startMic);
  micBtn.addEventListener("mouseup", stopMic);
  micBtn.addEventListener("mouseleave", () => { if (micActive) stopMic(); });
  micBtn.addEventListener("touchstart", (e) => { e.preventDefault(); startMic(); });
  micBtn.addEventListener("touchend", (e) => { e.preventDefault(); stopMic(); });
  function isTyping() { const a = document.activeElement; return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable); }
  document.addEventListener("keydown", (e) => { if (e.code === "Space" && !isTyping() && !document.querySelector(".modal-back")) { e.preventDefault(); startMic(); } });
  document.addEventListener("keyup", (e) => { if (e.code === "Space" && !isTyping()) stopMic(); });

  // ---- Wake-Word ("Jarvis") ----
  let recognition = null, wakeOn = false;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  function relistenWake() { if (wakeOn && recognition && !micActive) { try { recognition.start(); } catch (e) {} } }
  (function initWake() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { const b = $("wakeBtn"); if (b) { b.disabled = true; b.title = "Wake-Word braucht Chrome/Edge"; } return; }
    recognition = new SR(); recognition.lang = "de-DE"; recognition.continuous = true; recognition.interimResults = true;
    recognition.onresult = (e) => { if (micActive) return; const txt = Array.from(e.results).map((r) => r[0].transcript).join(" ").toLowerCase(); if (/(jarvis|jervis|dscharvis|service)/.test(txt)) { try { recognition.stop(); } catch (er) {} UI.toast("Wake-Word erkannt"); startMic(); setTimeout(() => { if (micActive) stopMic(); }, 4500); } };
    recognition.onend = () => relistenWake();
    recognition.onerror = () => {};
  })();
  function setWake(on) { if (!recognition) return; wakeOn = !!on; UI.setWakeActive(wakeOn); if (wakeOn) { try { recognition.start(); } catch (e) {} UI.toast("Wake-Word an"); } else { try { recognition.stop(); } catch (e) {} UI.toast("Wake-Word aus"); } }
  $("wakeBtn").addEventListener("click", () => setWake(!wakeOn));
  if (recognition && Store.get().settings.wakeOnStart && !isMobile) setWake(true);

  // ---- Benachrichtigungen-Helfer ----
  function notify(title, body) { if ("Notification" in window && Notification.permission === "granted") { try { new Notification(title, { body }); } catch (e) {} } }

  // ---- Pomodoro + Erinnerungen (nach mic/wake initialisieren) ----
  if (window.Pomodoro) Pomodoro.init({
    onTick: (ms, phase) => UI.setPomodoroTime(ms, phase),
    onPhaseEnd: (prev, next) => { const msg = next === "work" ? "Pause vorbei. Weiter geht's!" : (next === "longbreak" ? "Stark gemacht! Lange Pause." : "Gut gemacht! Kurze Pause."); UI.toast(msg, "success"); notify("Lern-Timer", msg); if (!micActive) speak(msg); },
  });
  if (window.Reminders) Reminders.init({ onFire: (r, missed) => { UI.toast((missed ? "Verpasst: " : "Erinnerung: ") + r.text, missed ? "" : "success"); notify(missed ? "Verpasste Erinnerung" : "Erinnerung", r.text); if (!missed && !micActive) speak("Erinnerung: " + r.text); } });
  if (window.Shortcuts) Shortcuts.init();

  // ---- Tagesbriefing ----
  function composeBriefing() {
    const s = Store.get(); const todayKey = Utils.weekdayKey(new Date());
    const lessons = (s.timetable[todayKey] || []).map((e) => e.subject);
    const dueToday = s.tasks.filter((t) => !t.done && Store.daysUntil(t.due) === 0);
    const overdue = s.tasks.filter((t) => !t.done && Store.daysUntil(t.due) !== null && Store.daysUntil(t.due) < 0);
    const nextExam = Store.upcomingExams(1)[0];
    const parts = [];
    parts.push(new Date().getHours() < 11 ? "Guten Morgen, Luca." : "Hallo Luca.");
    if (lessons.length) parts.push(`Heute hast du ${lessons.length} Stunden: ${lessons.join(", ")}.`);
    if (overdue.length) parts.push(`${overdue.length} Aufgabe(n) sind ueberfaellig.`);
    if (dueToday.length) parts.push(`Heute faellig: ${dueToday.map((t) => t.title).join(", ")}.`);
    if (nextExam) parts.push(`Naechster Test: ${nextExam.subject} ${Utils.dueLabel(nextExam.date)}.`);
    if (!lessons.length && !dueToday.length && !overdue.length && !nextExam) parts.push("Heute steht nichts an. Gute Gelegenheit, etwas vorzuarbeiten.");
    else parts.push("Viel Erfolg heute!");
    return parts.join(" ");
  }
  function runBriefing(force) {
    const s = Store.get();
    if (!force && !s.settings.briefingEnabled) return;
    const text = composeBriefing();
    UI.setBriefing(text);
    if (force || s.settings.briefingSpeak) { if (!micActive) speak(text); }
  }
  if (Store.get().settings.briefingEnabled && Store.get().settings.lastBriefing !== Utils.todayYMD()) { Store.setSetting("lastBriefing", Utils.todayYMD()); setTimeout(() => runBriefing(false), 1500); }

  if (window.Onboarding) Onboarding.maybeRun();

  // ---- Globale App-Schnittstelle (fuer UI-Befehle) ----
  window.App = { runBriefing, setWake, speak, logout: () => { Auth.clearSession(); location.reload(); } };

  UI.setVoiceState("idle");
  UI.setTranscript("Jarvis", "Bereit. Sag 'Jarvis' oder tippe etwas.");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/js/sw.js").catch(() => {});
}
