// ============================================================
// crypto.js — Zero-Knowledge-Verschluesselung fuer die Cloud.
//
// Wenn aktiviert, werden deine Daten IM BROWSER verschluesselt
// (AES-256-GCM), bevor sie in die Cloud gehen. Der Schluessel wird
// aus deinem Passwort abgeleitet (PBKDF2, 150.000 Runden) und
// verlaesst den Browser nie. Der Server (und Upstash) sehen also
// nur unleserlichen Salat — selbst wir koennten ihn nicht lesen.
//
// Heisst global "Enc", um das eingebaute window.Crypto nicht zu
// ueberschreiben.
// ============================================================
window.Enc = (function () {
  const subtle = window.crypto && window.crypto.subtle ? window.crypto.subtle : null;
  const available = !!subtle;
  const ITER = 150000;

  function abToB64(buf) {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function b64ToAb(b64) {
    const s = atob(b64);
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  }

  function genSaltB64() { return abToB64(crypto.getRandomValues(new Uint8Array(16)).buffer); }

  async function deriveKey(password, saltB64) {
    if (!available) throw new Error("Web Crypto nicht verfuegbar.");
    const baseKey = await subtle.importKey("raw", new TextEncoder().encode(String(password)), "PBKDF2", false, ["deriveKey"]);
    return subtle.deriveKey(
      { name: "PBKDF2", salt: b64ToAb(saltB64), iterations: ITER, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      true, // extractable: damit der Schluessel in sessionStorage zwischengespeichert werden kann
      ["encrypt", "decrypt"]
    );
  }

  async function exportKeyB64(key) { return abToB64(await subtle.exportKey("raw", key)); }
  async function importKeyB64(b64) { return subtle.importKey("raw", b64ToAb(b64), { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]); }

  function isEnvelope(x) { return x && typeof x === "object" && x.alg === "A256GCM" && x.iv && x.ct; }

  async function encrypt(obj, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, data);
    return { v: 1, alg: "A256GCM", iv: abToB64(iv.buffer), ct: abToB64(ct) };
  }

  async function decrypt(env, key) {
    if (!isEnvelope(env)) return null;
    const iv = new Uint8Array(b64ToAb(env.iv));
    const pt = await subtle.decrypt({ name: "AES-GCM", iv }, key, b64ToAb(env.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  return { available, genSaltB64, deriveKey, exportKeyB64, importKeyB64, isEnvelope, encrypt, decrypt };
})();
