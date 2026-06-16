// ============================================================
// charts.js — kleine, leichte SVG-Diagramme (ohne Bibliothek).
//   - weekFocus(): Fokuszeit (Pomodoro) der letzten 7 Tage
//   - gradeBars(): Notenschnitt je Fach (kleiner = besser = hoeher)
//   - habitStrip(habit): letzte 14 Tage als Punkte (erledigt/offen)
// Alle nutzen currentColor, damit sie zum Theme passen.
// ============================================================
window.Charts = (function () {
  const NS = "http://www.w3.org/2000/svg";
  const U = window.Utils;

  function s(tag, attrs, children) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (children) (Array.isArray(children) ? children : [children]).forEach((c) => { if (c != null) n.appendChild((typeof c === "string" || typeof c === "number") ? document.createTextNode(String(c)) : c); });
    return n;
  }

  // Balkendiagramm. data: [{label, value, sub}], opts: {max, unit}
  function barChart(data, opts) {
    opts = opts || {};
    const W = 280, H = 120, pad = 22, bw = data.length ? (W - pad) / data.length : 0;
    const max = opts.max || Math.max(1, ...data.map((d) => d.value));
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", preserveAspectRatio: "none" });
    svg.appendChild(s("line", { x1: 0, y1: H - pad, x2: W, y2: H - pad, class: "chart-axis" }));
    data.forEach((d, i) => {
      const h = Math.round(((H - pad - 10) * Math.min(d.value, max)) / max);
      const x = i * bw + bw * 0.18, y = H - pad - h, w = bw * 0.64;
      svg.appendChild(s("rect", { x, y, width: w, height: Math.max(0, h), rx: 3, class: "chart-bar" + (d.highlight ? " on" : "") }));
      svg.appendChild(s("text", { x: x + w / 2, y: H - pad + 12, class: "chart-x", "text-anchor": "middle" }, d.label));
      if (d.value > 0) svg.appendChild(s("text", { x: x + w / 2, y: y - 3, class: "chart-val", "text-anchor": "middle" }, opts.fmt ? opts.fmt(d.value) : String(d.value)));
    });
    return svg;
  }

  function weekFocus() {
    const start = U.startOfWeek();
    const data = [];
    for (let i = 0; i < 7; i++) {
      const d = U.addDays(start, i);
      const ymd = U.ymd(d);
      data.push({ label: CONST.WEEKDAY_SHORT[U.weekdayKey(d)], value: Store.focusMinutes(ymd), highlight: ymd === U.todayYMD() });
    }
    return barChart(data, { fmt: (v) => v + "m" });
  }

  function gradeBars() {
    const avgs = Store.subjectAverages();
    const subjects = Object.keys(avgs);
    if (!subjects.length) return null;
    // Note 1 (best) -> hoher Balken; Note 6 -> niedrig. Wert = 6 - note.
    const data = subjects.map((sub) => ({ label: sub.slice(0, 4), value: U.round(6 - avgs[sub], 2), sub, raw: avgs[sub] }));
    return barChart(data, { max: 5, fmt: (v) => U.round(6 - v, 1) });
  }

  function habitStrip(habit, days) {
    days = days || 14;
    const set = new Set(habit.history);
    const wrap = U.el("div", { class: "habit-strip" });
    for (let i = days - 1; i >= 0; i--) {
      const d = U.addDays(new Date(), -i);
      const done = set.has(U.ymd(d));
      wrap.appendChild(U.el("span", { class: "habit-dot" + (done ? " on" : ""), title: U.ymd(d) }));
    }
    return wrap;
  }

  return { barChart, weekFocus, gradeBars, habitStrip };
})();
