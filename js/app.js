// ============================================================
// app.js — Steuerung (Login, Agenten-Loop, Stimme, Wake-Word).
//
// Daten kommen aus dem Store, gezeichnet wird von der UI. Hier
// liegt die Logik: mit ChatGPT reden, Werkzeuge ausfuehren,
// zuhoeren (STT) und antworten (TTS).
// ============================================================

const $ = (id) => document.getElementById(id);
let appPassword = sessionStorage.getItem("jarvis_pw") || "";

async function api(path, body, wantAudio = false) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-app-password": appPassword },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    sessionStorage.removeItem("jarvis_pw");
    showLogin("Passwort abgelehnt. Bitte erneut eingeben.");
    throw new Error("Nicht autorisiert");
  }
  if (!res.ok) {
    let msg = "Fehler " + res.status;
    try { const j = await res.json(); msg = j.error || msg; } catch (e) {}
    throw new Error(msg);
  }
  return wantAudio ? res.blob() : res.json();
}

function showLogin(msg) {
  $("app").classList.add("hidden");
  $("login").classList.remove("hidden");
  $("loginErr").textContent = msg || "";
  $("pw").value = "";
  $("pw").focus();
}

async function tryLogin() {
  const pw = $("pw").value.trim();
  if (!pw) return;
  appPassword = pw;
  $("loginErr").textContent = "Pruefe...";
  try {
    await api("/api/chat", { messages: [{ role: "user", content: "ping" }] });
    sessionStorage.setItem("jarvis_pw", pw);
    $("login").classList.add("hidden");
    $("app").classList.remove("hidden");
    startJarvis();
  } catch (e) {
    if (e.message !== "Nicht autorisiert") $("loginErr").textContent = "Fehler: " + e.message;
  }
}

$("loginBtn").addEventListener("click", tryLogin);
$("pw").addEventListener("keydown", (e) => { if (e.key === "Enter") tryLogin(); });

if (appPassword) {
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  startJarvis();
}

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

PERSOENLICHKEIT: Du sprichst Deutsch, duzt Luca, bist freundlich, knapp und motivierend. Keine Emojis.

DEINE AUFGABE: Hilf Luca, den Ueberblick ueber sein Leben zu behalten und gut zu planen.
- Wenn er etwas nennt (Aufgabe, Hausaufgabe, Stunde, Termin), lege es selbst mit dem passenden Werkzeug an und bestaetige kurz.
- Hausaufgaben immer mit Fach (add_homework). Aufgaben mit Datum/Prioritaet, wenn sinnvoll.
- Du bekommst bei jeder Nachricht den AKTUELLEN STAND. Nutze ihn, um Fragen zu beantworten und vorauszudenken.
- Analysiere seine Woche: erkenne Stress (viele Fristen an einem Tag), schlage eine sinnvolle Reihenfolge vor, weise auf Ueberfaelliges hin und gib konkrete, machbare Lerntipps.
- Bei Bitten wie "analysiere meine Woche" oder "was zuerst" antworte direkt aus dem Stand heraus, ohne jedes Mal Werkzeuge aufzurufen.

Heute ist ${today.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}. Halte gesprochene Antworten kurz und natuerlich.`,
  };

  // ---- Gespraechsverlauf (ohne System-Prompt; der wird je Runde frisch gesetzt) ----
  let history = [];
  try {
    const saved = JSON.parse(localStorage.getItem("jarvis_history") || "[]");
    if (Array.isArray(saved)) history = saved;
  } catch (e) {}
  while (history.length && history[0].role === "tool") history.shift();

  function persist() { try { localStorage.setItem("jarvis_history", JSON.stringify(history)); } catch (e) {} }
  function trimHistory() {
    while (history.length > 24) history.shift();
    while (history.length && history[0].role === "tool") history.shift();
    persist();
  }

  // ---- Wetter ----
  let myLat = 47.37, myLon = 8.54;
  async function loadWeather() {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${myLat}&longitude=${myLon}&current=temperature_2m,weather_code&timezone=auto`;
      const d = await (await fetch(url)).json();
      UI.setWeather(d.current.temperature_2m, d.current.weather_code);
    } catch (e) { /* still */ }
  }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (p) => { myLat = p.coords.latitude; myLon = p.coords.longitude; loadWeather(); },
      () => loadWeather(), { timeout: 5000 }
    );
  } else loadWeather();
  setInterval(loadWeather, 600000);

  // ---- Uhr ----
  const tick = () => {
    const n = new Date(), p = (x) => String(x).padStart(2, "0");
    UI.setClock(`${p(n.getHours())}:${p(n.getMinutes())}`, n.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" }));
  };
  tick(); setInterval(tick, 1000);

  // ---- Werkzeug-Kontext ----
  const ctx = {
    location: () => ({ lat: myLat, lon: myLon }),
    webSearch: (q) => api("/api/search", { query: q }),
    scheduleTimer: (secs, label) => {
      UI.toast(`Timer laeuft (${secs < 90 ? secs + "s" : Math.round(secs / 60) + " min"})`);
      setTimeout(() => { UI.toast("Timer abgelaufen" + (label ? ": " + label : ""), "success"); speak(`Erinnerung${label ? ": " + label : ""}! Die Zeit ist um.`); }, secs * 1000);
    },
  };

  // ---- Agenten-Loop ----
  async function converse(userText) {
    history.push({ role: "user", content: userText });
    trimHistory();
    let rounds = 0;
    while (rounds++ < 6) {
      const messages = [systemPrompt, { role: "system", content: "AKTUELLER STAND:\n" + Store.snapshot() }, ...history];
      const { message } = await api("/api/chat", { messages, tools: TOOL_SCHEMAS });
      history.push(message); trimHistory();
      if (message.tool_calls && message.tool_calls.length) {
        for (const call of message.tool_calls) {
          let args = {};
          try { args = JSON.parse(call.function.arguments || "{}"); } catch (e) {}
          let result;
          try { result = await runTool(call.function.name, args, ctx); }
          catch (e) { result = "Fehler im Werkzeug: " + e.message; }
          history.push({ role: "tool", tool_call_id: call.id, content: String(result) });
        }
        trimHistory();
        continue;
      }
      return message.content || "";
    }
    return "Das hat zu viele Schritte gebraucht. Frag mich gern nochmal anders.";
  }

  // ---- TTS ----
  async function speak(text) {
    if (!text) { UI.setVoiceState("idle"); return; }
    UI.setVoiceState("speaking"); UI.setLevel(0.4);
    try {
      const blob = await api("/api/tts", { text }, true);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      try {
        const ac = new AudioContext();
        const src = ac.createMediaElementSource(audio);
        const an = ac.createAnalyser();
        an.fftSize = 128;
        src.connect(an); an.connect(ac.destination);
        const buf = new Uint8Array(an.frequencyBinCount);
        (function loop() {
          if (audio.ended || audio.paused) { UI.setLevel(0); return; }
          an.getByteFrequencyData(buf);
          UI.setLevel(buf.reduce((a, b) => a + b, 0) / buf.length / 128);
          requestAnimationFrame(loop);
        })();
        await audio.play();
      } catch (e) { await audio.play(); }
      await new Promise((r) => audio.addEventListener("ended", r));
      URL.revokeObjectURL(url);
    } catch (e) {
      UI.toast("Stimme-Fehler: " + e.message, "error");
    } finally {
      UI.setLevel(0); UI.setVoiceState("idle"); relistenWake();
    }
  }

  // ---- Haupt-Ablauf ----
  async function run(text) {
    if (!text || !text.trim()) return;
    UI.setTranscript("Du", text);
    UI.setVoiceState("thinking");
    try {
      const reply = await converse(text.trim());
      UI.setTranscript("Jarvis", reply);
      UI.setTip(reply.length < 220 ? reply : reply.slice(0, 200) + "...");
      await speak(reply);
    } catch (e) {
      console.error(e);
      UI.setTranscript("Fehler", e.message);
      UI.setVoiceState("idle");
      UI.toast("Fehler: " + e.message, "error");
    }
  }

  $("sendBtn").addEventListener("click", () => { const v = $("textInput").value; $("textInput").value = ""; run(v); });
  $("textInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("sendBtn").click(); });
  $("resetBtn").addEventListener("click", () => {
    history = []; persist();
    UI.setTranscript("Jarvis", "Gespraech zurueckgesetzt. Neuer Start.");
    UI.toast("Gespraech zurueckgesetzt");
  });

  // ---- Mikrofon (Push-to-talk) ----
  let mediaRec = null, chunks = [], micActive = false, currentMime = "audio/webm";

  function pickMime() {
    const cands = ["audio/webm", "audio/mp4", "audio/ogg"];
    for (const m of cands) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
    return "";
  }

  async function startMic() {
    if (micActive) return;
    micActive = true; chunks = [];
    $("micBtn").classList.add("recording");
    UI.setVoiceState("listening");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      mediaRec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      currentMime = mediaRec.mimeType || mime || "audio/webm";
      mediaRec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRec.start();
    } catch (e) {
      micActive = false;
      $("micBtn").classList.remove("recording");
      UI.setVoiceState("idle");
      UI.toast("Kein Mikrofon-Zugriff", "error");
    }
  }

  async function stopMic() {
    if (!micActive || !mediaRec) return;
    micActive = false;
    $("micBtn").classList.remove("recording");
    UI.setVoiceState("thinking");
    await new Promise((r) => { mediaRec.onstop = r; mediaRec.stop(); });
    mediaRec.stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: currentMime });
    try {
      const b64 = await blobToBase64(blob);
      const d = await api("/api/stt", { audio: b64, mime: currentMime });
      if (d.text && d.text.trim()) run(d.text);
      else { UI.setVoiceState("idle"); relistenWake(); }
    } catch (e) {
      console.error(e);
      UI.setVoiceState("idle");
      UI.toast("Fehler: " + e.message, "error");
      relistenWake();
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(blob);
    });
  }

  const micBtn = $("micBtn");
  micBtn.addEventListener("mousedown", startMic);
  micBtn.addEventListener("mouseup", stopMic);
  micBtn.addEventListener("mouseleave", () => { if (micActive) stopMic(); });
  micBtn.addEventListener("touchstart", (e) => { e.preventDefault(); startMic(); });
  micBtn.addEventListener("touchend", (e) => { e.preventDefault(); stopMic(); });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !isTyping()) { e.preventDefault(); startMic(); }
  });
  document.addEventListener("keyup", (e) => {
    if (e.code === "Space" && !isTyping()) stopMic();
  });
  function isTyping() {
    const a = document.activeElement;
    return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT");
  }

  // ---- Wake-Word ("Jarvis") ----
  let recognition = null, wakeOn = false;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  function relistenWake() { if (wakeOn && recognition && !micActive) { try { recognition.start(); } catch (e) {} } }

  (function initWake() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { $("wakeBtn").disabled = true; $("wakeBtn").title = "Wake-Word braucht Chrome/Edge"; return; }
    recognition = new SR();
    recognition.lang = "de-DE";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (e) => {
      if (micActive) return;
      const txt = Array.from(e.results).map((r) => r[0].transcript).join(" ").toLowerCase();
      if (/(jarvis|jervis|dscharvis|service)/.test(txt)) {
        try { recognition.stop(); } catch (er) {}
        UI.toast("Wake-Word erkannt");
        startMic();
        setTimeout(() => { if (micActive) stopMic(); }, 4500);
      }
    };
    recognition.onend = () => relistenWake();
    recognition.onerror = () => {};
  })();

  function setWake(on) {
    if (!recognition) return;
    wakeOn = !!on;
    UI.setWakeActive(wakeOn);
    if (wakeOn) { try { recognition.start(); } catch (e) {} UI.toast("Wake-Word an"); }
    else { try { recognition.stop(); } catch (e) {} UI.toast("Wake-Word aus"); }
  }

  $("wakeBtn").addEventListener("click", () => setWake(!wakeOn));
  window.Jarvis = { setWake, wakeSupported: () => !!recognition };

  // Wake automatisch starten, wenn gewuenscht (nur Desktop)
  if (recognition && Store.get().settings.wakeOnStart && !isMobile) setWake(true);

  // ---- Erinnerungen (nach den Mikro-/Wake-Variablen, damit onFire sicher ist) ----
  Reminders.init({
    onFire: (r, missed) => {
      UI.toast((missed ? "Verpasst: " : "Erinnerung: ") + r.text, missed ? "" : "success");
      if (!missed && !micActive) speak("Erinnerung: " + r.text);
    },
  });

  UI.setVoiceState("idle");
  UI.setTranscript("Jarvis", "Bereit. Sag 'Jarvis' oder tippe etwas.");

  // ---- PWA: Service-Worker registrieren ----
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/js/sw.js").catch(() => {});
  }
}
