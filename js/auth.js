// ============================================================
// auth.js — Anmeldung, Sitzungs-Token und Schluesselverwaltung.
//
// Statt das Passwort dauerhaft zu speichern, holt sich der Browser
// bei der Anmeldung ein kurzlebiges Token (sessionStorage, pro Tab,
// wird beim Schliessen geloescht). Aus dem Passwort wird einmal der
// Verschluesselungs-Schluessel abgeleitet; das Passwort wird danach
// aus dem Speicher entfernt.
// ============================================================
window.Auth = (function () {
  const SS = window.sessionStorage;
  let _password = null; // nur kurz im RAM, bis der Schluessel abgeleitet ist
  let _key = null;      // CryptoKey (AES-GCM)
  let _onUnauthorized = null;

  function setSession(token, exp) { SS.setItem("jarvis_tok", token); SS.setItem("jarvis_exp", String(exp)); }
  function token() { return SS.getItem("jarvis_tok"); }
  function exp() { return parseInt(SS.getItem("jarvis_exp") || "0", 10); }
  function isValid() { return !!token() && exp() > Math.floor(Date.now() / 1000) + 5; }
  function clearSession() {
    ["jarvis_tok", "jarvis_exp", "jarvis_k", "jarvis_salt"].forEach((k) => SS.removeItem(k));
    _key = null; _password = null;
  }

  async function login(password) {
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (r.status === 429) { const j = await r.json().catch(() => ({})); const e = new Error(j.error || "Zu viele Versuche."); e.retryAfter = parseInt(r.headers.get("Retry-After") || "0", 10); throw e; }
    if (r.status === 401) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "Falsches Passwort."); }
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || ("Fehler " + r.status)); }
    const j = await r.json();
    setSession(j.token, j.exp);
    _password = password; // fuer deriveKey in Store.init
    return true;
  }

  function password() { return _password; }
  function clearPassword() { _password = null; }

  async function deriveAndStoreKey(saltB64) {
    if (!Enc.available || _password == null) return null;
    const key = await Enc.deriveKey(_password, saltB64);
    _key = key;
    SS.setItem("jarvis_salt", saltB64);
    try { SS.setItem("jarvis_k", await Enc.exportKeyB64(key)); } catch (e) {}
    return key;
  }
  async function restoreKey() {
    if (_key) return _key;
    const b = SS.getItem("jarvis_k");
    if (b && Enc.available) { try { _key = await Enc.importKeyB64(b); } catch (e) { _key = null; } }
    return _key;
  }
  function key() { return _key; }
  function saltB64() { return SS.getItem("jarvis_salt"); }

  // Zentrale, authentifizierte Anfrage. Bei 401 -> abmelden + Callback.
  async function apiFetch(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    const t = token(); if (t) headers["Authorization"] = "Bearer " + t;
    let body = opts.body;
    if (opts.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.json); }
    const r = await fetch(path, { method: opts.method || "POST", headers, body });
    if (r.status === 401) { clearSession(); if (_onUnauthorized) _onUnauthorized(); throw new Error("Nicht autorisiert"); }
    if (r.status === 429) { const e = new Error("Zu viele Anfragen. Bitte kurz warten."); e.retryAfter = parseInt(r.headers.get("Retry-After") || "0", 10); throw e; }
    if (!r.ok) { let m = "Fehler " + r.status; try { const j = await r.json(); m = j.error || m; } catch (e) {} throw new Error(m); }
    return opts.audio ? r.blob() : r.json();
  }

  return {
    login, token, exp, isValid, clearSession,
    password, clearPassword, deriveAndStoreKey, restoreKey, key, saltB64, apiFetch,
    get onUnauthorized() { return _onUnauthorized; },
    set onUnauthorized(v) { _onUnauthorized = v; },
  };
})();
