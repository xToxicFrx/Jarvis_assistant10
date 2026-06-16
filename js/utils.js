// ============================================================
// utils.js — kleine Helfer fuer DOM, Datum, Format, Dateien.
// Wird von allen UI-Modulen (ui.js, charts, calendar ...) genutzt.
// Bewusst ohne Inline-Styles, damit eine strenge CSP greifen kann.
// ============================================================
window.Utils = (function () {
  const SVGNS = "http://www.w3.org/2000/svg";

  // ---- DOM ----
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v; // nur fuer vertrauenswuerdige, eigene Strings
      else if (k === "dataset") { for (const d in v) n.dataset[d] = v[d]; }
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, "");
      else n.setAttribute(k, v);
    }
    if (children != null) (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null || c === false) return;
      n.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return n;
  }
  function icon(name, cls) {
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "icon" + (cls ? " " + cls : ""));
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(SVGNS, "use");
    use.setAttribute("href", "#" + name);
    svg.appendChild(use);
    return svg;
  }
  function iconBtn(name, title, onClick, cls) {
    return el("button", { class: "icon-btn" + (cls ? " " + cls : ""), title, "aria-label": title, type: "button", onclick: onClick }, icon(name));
  }
  function field(label, input, hint) {
    const kids = [el("label", { text: label }), input];
    if (hint) kids.push(el("div", { class: "field-hint", text: hint }));
    return el("div", { class: "field" }, kids);
  }
  function clear(node) { if (node) node.replaceChildren(); return node; }

  // ---- IDs ----
  function uid() {
    return (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
      "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  // ---- Datum / Zeit ----
  function pad(n) { return String(n).padStart(2, "0"); }
  function ymd(date) { const d = date || new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function todayYMD() { return ymd(new Date()); }
  function parseYMD(s) { if (!s) return null; const d = new Date(s + "T00:00:00"); return isNaN(d) ? null : d; }
  function daysUntil(due) {
    if (!due) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = parseYMD(due); if (!d) return null;
    return Math.round((d - today) / 86400000);
  }
  function dueLabel(due) {
    const n = daysUntil(due);
    if (n === null) return "";
    if (n < 0) return `ueberfaellig ${-n} T`;
    if (n === 0) return "heute";
    if (n === 1) return "morgen";
    if (n <= 7) return `in ${n} T`;
    const d = parseYMD(due);
    return d ? d.toLocaleDateString("de-DE", { day: "numeric", month: "short" }) : "";
  }
  function weekdayKey(date) { return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][(date || new Date()).getDay()]; }
  function startOfWeek(date) { const d = new Date(date || new Date()); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0); return d; }
  function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
  function fmtClock(date) { const d = date || new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function fmtDateShort(date) { return (date || new Date()).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" }); }
  function fmtDateTime(ms) { return new Date(ms).toLocaleString("de-DE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  function fmtDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  // ---- Zahlen / Funktionen ----
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function round(x, dp = 2) { const f = Math.pow(10, dp); return Math.round(x * f) / f; }
  function debounce(fn, ms) { let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; }

  // Note 1-6 als Wort (zur Sprachausgabe / Anzeige)
  function gradeWord(v) {
    const map = { 1: "sehr gut", 2: "gut", 3: "befriedigend", 4: "ausreichend", 5: "mangelhaft", 6: "ungenuegend" };
    return map[Math.round(v)] || "";
  }

  // ---- Dateien (Export/Import) ----
  function downloadText(filename, text, mime = "application/json") {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
      r.readAsText(file);
    });
  }

  return {
    el, icon, iconBtn, field, clear, uid,
    pad, ymd, todayYMD, parseYMD, daysUntil, dueLabel, weekdayKey, startOfWeek, addDays,
    fmtClock, fmtDateShort, fmtDateTime, fmtDuration,
    clamp, round, debounce, gradeWord, downloadText, readFileText,
  };
})();
