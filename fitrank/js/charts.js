// ============================================================
// charts.js — minimalistische SVG-Charts (kein Framework).
// ============================================================
const SVGNS = "http://www.w3.org/2000/svg";
function s(tag, attrs, text) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}

// Liniendiagramm, z.B. Körpergewicht über die Zeit.
// points: [{ label, value }] in chronologischer Reihenfolge.
export function lineChart(points, opts = {}) {
  const W = opts.width || 320, H = opts.height || 140, pad = 24;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "chart" });
  if (!points || points.length === 0) {
    svg.appendChild(s("text", { x: W / 2, y: H / 2, "text-anchor": "middle", class: "chart__empty" }, "Noch keine Daten"));
    return svg;
  }
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const x = (i) => pad + (i / Math.max(1, points.length - 1)) * (W - 2 * pad);
  const y = (v) => H - pad - ((v - min) / (max - min)) * (H - 2 * pad);

  // Achsenlinie
  svg.appendChild(s("line", { x1: pad, y1: H - pad, x2: W - pad, y2: H - pad, class: "chart__axis" }));

  // Pfad
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  svg.appendChild(s("path", { d, fill: "none", class: "chart__line" }));

  // Punkte + Min/Max-Labels
  points.forEach((p, i) => svg.appendChild(s("circle", { cx: x(i).toFixed(1), cy: y(p.value).toFixed(1), r: 3, class: "chart__dot" })));
  svg.appendChild(s("text", { x: pad, y: 12, class: "chart__lbl" }, String(max)));
  svg.appendChild(s("text", { x: pad, y: H - pad + 14, class: "chart__lbl" }, String(min)));
  return svg;
}

// Balkendiagramm, z.B. Trainingsminuten pro Wochentag.
// bars: [{ label, value }]
export function barChart(bars, opts = {}) {
  const W = opts.width || 320, H = opts.height || 140, pad = 24;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "chart" });
  if (!bars || bars.length === 0) {
    svg.appendChild(s("text", { x: W / 2, y: H / 2, "text-anchor": "middle", class: "chart__empty" }, "Noch keine Daten"));
    return svg;
  }
  const max = Math.max(1, ...bars.map((b) => b.value));
  const bw = (W - 2 * pad) / bars.length;
  svg.appendChild(s("line", { x1: pad, y1: H - pad, x2: W - pad, y2: H - pad, class: "chart__axis" }));
  bars.forEach((b, i) => {
    const h = (b.value / max) * (H - 2 * pad);
    const bx = pad + i * bw + bw * 0.15, by = H - pad - h;
    svg.appendChild(s("rect", { x: bx.toFixed(1), y: by.toFixed(1), width: (bw * 0.7).toFixed(1), height: h.toFixed(1), rx: 3, class: "chart__bar" }));
    svg.appendChild(s("text", { x: (bx + bw * 0.35).toFixed(1), y: H - pad + 14, "text-anchor": "middle", class: "chart__lbl" }, b.label));
  });
  return svg;
}
