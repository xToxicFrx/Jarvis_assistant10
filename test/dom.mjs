// ============================================================
// test/dom.mjs — DOM-Rauchtest (braucht jsdom als Dev-Abhaengigkeit).
// Start:  npm i -D jsdom && node test/dom.mjs
// Bootet die App in einer simulierten Seite, prueft, dass alle
// Karten rendern, Dialoge oeffnen und dass ein kaputter (verwaister
// tool_calls) Verlauf automatisch repariert wird.
// Ohne jsdom wird der Test uebersprungen.
// ============================================================
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = await import("jsdom")); }
catch (e) { console.log("jsdom nicht installiert - DOM-Test uebersprungen (npm i -D jsdom)."); process.exit(0); }

import fs from "node:fs";
const html = fs.readFileSync("index.html", "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
const errors = [];
const vc = new VirtualConsole(); vc.on("jsdomError", (e) => { const msg = String((e && (e.detail || e.message)) || ""); if (/getContext/.test(msg)) return; /* jsdom hat kein Canvas; Orb no-opt im Browser ok */ errors.push("jsdomError: " + msg); });
const dom = new JSDOM(html, { url: "https://localhost/", pretendToBeVisual: true, runScripts: "outside-only", virtualConsole: vc });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
window.AudioContext = class { createMediaElementSource() { return { connect() {} }; } createAnalyser() { return { connect() {}, fftSize: 0, frequencyBinCount: 0, getByteFrequencyData() {} }; } get destination() { return {}; } };

let lastChatMessages = null;
const ok200 = (obj) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => obj, blob: async () => ({}) });
const fail502 = () => ({ ok: false, status: 502, headers: { get: () => null }, json: async () => ({ error: "tts aus (Test)" }) });
window.fetch = async (u, init) => {
  u = String(u);
  if (u.includes("/api/state")) return ok200({ cloud: false });
  if (u.includes("/api/chat")) { try { lastChatMessages = JSON.parse(init.body).messages; } catch (e) {} return ok200({ message: { role: "assistant", content: "ok" } }); }
  if (u.includes("/api/tts")) return fail502();
  return ok200({});
};
window.sessionStorage.setItem("jarvis_tok", "t");
window.sessionStorage.setItem("jarvis_exp", String(Math.floor(Date.now() / 1000) + 9999));
// Kaputten Verlauf einschleusen: assistant(tool_calls) OHNE Tool-Antwort + danach user.
window.localStorage.setItem("jarvis_history", JSON.stringify([
  { role: "user", content: "hi" },
  { role: "assistant", tool_calls: [{ id: "call_X", type: "function", function: { name: "get_time", arguments: "{}" } }] },
  { role: "user", content: "noch da?" },
]));

const files = ["constants", "utils", "crypto", "auth", "store", "reminders", "pomodoro", "charts", "calendar", "voiceorb", "search", "tools", "ui", "shortcuts", "onboarding", "app"];
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS" : "FAIL") + " " + m); if (!c) fail++; };
try { window.eval(files.map((f) => fs.readFileSync("js/" + f + ".js", "utf8")).join("\n;\n")); } catch (e) { errors.push("eval: " + e.message); }
await new Promise((r) => setTimeout(r, 150));

ok(errors.length === 0, "keine Laufzeitfehler beim Start" + (errors.length ? ":\n" + errors.join("\n") : ""));
const dash = window.document.getElementById("dashboard");
ok(dash && dash.children.length === 16, "Dashboard rendert 16 Karten (got " + (dash ? dash.children.length : 0) + ")");

// Nachricht senden -> /api/chat darf KEINE verwaiste tool_calls-Nachricht enthalten.
window.document.getElementById("textInput").value = "test";
window.document.getElementById("sendBtn").click();
await new Promise((r) => setTimeout(r, 80));
ok(Array.isArray(lastChatMessages), "Chat-Anfrage wurde gesendet");
ok(lastChatMessages && !lastChatMessages.some((m) => m.role === "assistant" && m.tool_calls && m.tool_calls.length), "verwaiste tool_calls aus Verlauf entfernt (kein 502 mehr)");
ok(lastChatMessages && !lastChatMessages.some((m) => m.role === "tool"), "keine verwaisten Tool-Antworten");

try { window.UI.openSettings(); ok(!!window.document.querySelector(".modal"), "Einstellungen oeffnen"); window.document.getElementById("modalRoot").replaceChildren(); } catch (e) { ok(false, "settings: " + e.message); }

console.log(fail === 0 ? "\nALL GREEN" : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
