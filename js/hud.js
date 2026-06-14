// ============================================================
// HUD — füllt die Anzeigen: Uhr, Systeminfo, Wetter, Status.
// (Alles was der Browser ohne API-Keys kann.)
// ============================================================

const HUD = (() => {

  // ---- Uhr (jede Sekunde aktualisieren) ----
  function tickClock() {
    const now = new Date();
    const p = (n) => String(n).padStart(2, "0");
    document.getElementById("time").textContent =
      `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
    document.getElementById("date").textContent =
      `${p(now.getDate())}.${p(now.getMonth() + 1)}.${now.getFullYear()}`;
  }

  // ---- Status-Text in der Mitte setzen (IDLE/LISTENING/...) ----
  function setStatus(text) {
    document.getElementById("status").textContent = text.toUpperCase();
  }

  // ---- Systeminfo (Browser kann KEIN echtes CPU/RAM des PCs lesen,
  //      darum zeigen wir den verfügbaren Browser-Speicher & Infos) ----
  function updateSystem() {
    // Speicher: performance.memory gibt es nur in Chrome/Edge
    const mem = performance.memory;
    if (mem) {
      const used = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
      document.getElementById("mem-bar").style.width = (used * 100).toFixed(0) + "%";
      document.getElementById("mem-val").textContent = (used * 100).toFixed(0) + "%";
    } else {
      document.getElementById("mem-bar").style.width = "40%";
      document.getElementById("mem-val").textContent = "n/a";
    }
    document.getElementById("net-val").textContent =
      navigator.onLine ? "ONLINE" : "OFFLINE";
    document.getElementById("browser-val").textContent =
      navigator.userAgent.includes("Chrome") ? "CHROME" :
      navigator.userAgent.includes("Firefox") ? "FIREFOX" : "ANDERER";
  }

  // ---- Wetter über Open-Meteo (kostenlos, kein Key nötig) ----
  async function loadWeather(lat, lon, locName) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`;
      const res = await fetch(url);
      const data = await res.json();
      const temp = Math.round(data.current.temperature_2m);
      document.getElementById("weather-temp").textContent = temp + "°";
      document.getElementById("weather-desc").textContent =
        weatherText(data.current.weather_code);
      document.getElementById("weather-loc").textContent = locName || "";
    } catch (e) {
      document.getElementById("weather-desc").textContent = "kein Wetter";
      console.error("Wetter-Fehler:", e);
    }
  }

  // WMO-Wettercodes in einfache deutsche Texte übersetzen
  function weatherText(code) {
    if (code === 0) return "Klar";
    if (code <= 3) return "Bewölkt";
    if (code <= 48) return "Nebel";
    if (code <= 67) return "Regen";
    if (code <= 77) return "Schnee";
    if (code <= 82) return "Schauer";
    return "Gewitter";
  }

  // ---- Standort holen (Browser fragt um Erlaubnis), sonst Fallback ----
  function initWeather() {
    const fallback = () => loadWeather(47.37, 8.54, "Zürich"); // Standard
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => loadWeather(pos.coords.latitude, pos.coords.longitude, "Dein Ort"),
        fallback,
        { timeout: 5000 }
      );
    } else {
      fallback();
    }
  }

  // ---- Alles starten ----
  function init() {
    tickClock();
    setInterval(tickClock, 1000);
    updateSystem();
    setInterval(updateSystem, 3000);
    initWeather();
    setInterval(() => initWeather(), 600000); // alle 10 Min Wetter neu
  }

  return { init, setStatus };
})();
