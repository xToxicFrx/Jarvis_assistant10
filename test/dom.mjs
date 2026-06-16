// ============================================================
// test/dom.mjs — DOM-Rauchtest (braucht jsdom als Dev-Abhaengigkeit).
// Start:  npm i -D jsdom && node test/dom.mjs
// Bootet die App in einer simulierten Seite, prueft, dass alle
// Karten rendern und zentrale Dialoge ohne Fehler oeffnen.
// Ohne jsdom wird der Test uebersprungen.
// ============================================================
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = await import("jsdom")); }
catch (e) { console.log("jsdom nicht installiert - DOM-Test uebersprungen (npm i -D jsdom)."); process.exit(0); }

import fs from "node:fs";
const html = fs.readFileSync("index.html", "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
const errors = [];
const vc = new VirtualConsole(); vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.detail || e.message)));
const dom = new JSDOM(html, { url: "https://localhost/", pretendToBeVisual: true, runScripts: "outside-only", virtualConsole: vc });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
window.AudioContext = class { createMediaElementSource() { return { connect() {} }; } createAnalyser() { return { connect() {}, fftSize: 0, frequencyBinCount: 0, getByteFrequencyData() {} }; } get destination() { return {}; } };
const resp = (obj) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => obj, blob: async () => ({}) });
window.fetch = async (u) => String(u).includes("/api/state") ? resp({ cloud: false }) : resp({});
window.sessionStorage.setItem("jarvis_tok", "t");
window.sessionStorage.setItem("jarvis_exp", String(Math.floor(Date.now() / 1000) + 9999));

const files = ["constants", "utils", "crypto", "auth", "store", "reminders", "pomodoro", "charts", "calendar", "search", "tools", "ui", "shortcuts", "onboarding", "app"];
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS" : "FAIL") + " " + m); if (!c) fail++; };
try { window.eval(files.map((f) => fs.readFileSync("js/" + f + ".js", "utf8")).join("\n;\n")); } catch (e) { errors.push("eval: " + e.message); }
await new Promise((r) => setTimeout(r, 150));

ok(errors.length === 0, "keine Laufzeitfehler beim Start" + (errors.length ? ":\n" + errors.join("\n") : ""));
const dash = window.document.getElementById("dashboard");
ok(dash && dash.children.length === 16, "Dashboard rendert 16 Karten (got " + (dash ? dash.children.length : 0) + ")");
window.Store.addGrade({ subject: "Mathe", value: 2 }); window.Store.addVocab({ front: "house", back: "Haus" }); window.Store.addBudgetEntry({ amount: 5, type: "income" });
await new Promise((r) => setTimeout(r, 30));
ok(dash.textContent.includes("Mathe"), "Noten rendern");
ok(dash.textContent.includes("Vokabeln"), "Vokabeln-Karte rendert");
ok(dash.textContent.includes("Taschengeld"), "Budget-Karte rendert");
try { window.UI.openSettings(); ok(!!window.document.querySelector(".modal"), "Einstellungen oeffnen"); window.document.getElementById("modalRoot").replaceChildren(); } catch (e) { ok(false, "settings: " + e.message); }
try { window.UI.openCommandPalette(window.Shortcuts.all()); ok(!!window.document.querySelector(".cmd-input"), "Befehlspalette oeffnet"); } catch (e) { ok(false, "palette: " + e.message); }

console.log(fail === 0 ? "\nALL GREEN" : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
