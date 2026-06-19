// ============================================================
// tracker.js — Live-Verifizierung einer Trainings-Session.
// ============================================================
// Zeichnet ein Workout LIVE auf (statt nachträglich eingetippter Zahlen):
//   * Timer (Dauer der Session)
//   * GPS-Strecke (für Läufe/Radfahren) via Geolocation API
//   * Bewegung/Schritte via DeviceMotion (grobe Aktivitäts-Erkennung)
// Diese Live-Daten sind die Grundlage dafür, dass ein Workout serverseitig
// als "verifiziert" gilt. (Puls per Web-Bluetooth folgt in einer späteren Phase.)
//
// Hinweis: Sensor-Zugriff erfordert HTTPS und Nutzer-Erlaubnis. iOS verlangt
// für DeviceMotion eine explizite Freigabe (requestPermission).
// ============================================================

export function createTracker() {
  let watchId = null;
  let motionHandler = null;
  let lastPos = null;
  const state = {
    running: false,
    startMs: 0,
    elapsedSec: 0,
    distanceM: 0,
    steps: 0,
    source: "manual",
    hasGps: false,
    hasMotion: false,
  };
  let tickTimer = null;
  const listeners = new Set();

  function emit() { listeners.forEach((cb) => cb(snapshot())); }
  function snapshot() { return { ...state }; }
  function subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); }

  // Haversine-Distanz zwischen zwei GPS-Punkten (Meter).
  function distance(a, b) {
    const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  async function start(type) {
    if (state.running) return;
    state.running = true;
    state.startMs = Date.now();
    state.elapsedSec = 0;
    state.distanceM = 0;
    state.steps = 0;
    state.hasGps = false;
    state.hasMotion = false;
    lastPos = null;
    state.source = type === "run" || type === "cycle" ? "gps" : "motion";

    tickTimer = setInterval(() => {
      state.elapsedSec = Math.round((Date.now() - state.startMs) / 1000);
      emit();
    }, 1000);

    // --- GPS (für Lauf/Rad) ---
    if ((type === "run" || type === "cycle") && "geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          state.hasGps = true;
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          // Sprünge durch Ungenauigkeit ignorieren (nur 1–200 m Schritte zählen).
          if (lastPos) {
            const d = distance(lastPos, p);
            if (d >= 1 && d <= 200) state.distanceM += d;
          }
          lastPos = p;
          emit();
        },
        () => { /* Erlaubnis verweigert -> bleibt unverifiziert */ },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
      );
    }

    // --- Bewegung/Schritte (für Kraft/Sonstiges) ---
    await enableMotion();
    emit();
  }

  async function enableMotion() {
    if (typeof DeviceMotionEvent === "undefined") return;
    try {
      // iOS verlangt eine explizite Freigabe (nur nach Nutzer-Geste möglich).
      if (typeof DeviceMotionEvent.requestPermission === "function") {
        const res = await DeviceMotionEvent.requestPermission();
        if (res !== "granted") return;
      }
    } catch { return; }

    let lastPeak = 0;
    motionHandler = (e) => {
      const a = e.accelerationIncludingGravity || e.acceleration;
      if (!a) return;
      state.hasMotion = true;
      const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
      const now = Date.now();
      // Sehr einfache Schritt-/Bewegungs-Heuristik (für MVP ausreichend).
      if (mag > 13 && now - lastPeak > 300) { state.steps++; lastPeak = now; }
    };
    window.addEventListener("devicemotion", motionHandler);
  }

  function stop() {
    state.running = false;
    if (tickTimer) clearInterval(tickTimer);
    if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    if (motionHandler) window.removeEventListener("devicemotion", motionHandler);
    tickTimer = null; watchId = null; motionHandler = null;
    state.elapsedSec = Math.round((Date.now() - state.startMs) / 1000);
    // Verifiziert nur, wenn echte Sensordaten ankamen UND mind. 1 Min Aktivität.
    const verified = (state.hasGps || state.hasMotion) && state.elapsedSec >= 60;
    if (!verified) state.source = "manual";
    emit();
    return { ...state, verified };
  }

  return { start, stop, subscribe, snapshot };
}
