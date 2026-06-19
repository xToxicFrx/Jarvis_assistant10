// ============================================================
// avatar.js — geschichteter SVG-Charakter (RPG-Herzstück).
// ============================================================
// Der Avatar verändert sich SICHTBAR mit Level und Stats:
//   * Aura/Rahmen-Farbe steigt mit dem Level ("Liga").
//   * Körper wird muskulöser mit der Kraft-Stat.
//   * Ausrüstung (Stirnband, Umhang) schaltet sich an Level-Schwellen frei.
// Alles prozedural aus SVG — später durch echte Artwork-Layer ersetzbar.
// ============================================================

const SVGNS = "http://www.w3.org/2000/svg";

// Liga-Farben nach Level (Bronze -> Radiant), inspiriert von Ranked-Spielen.
const TIERS = [
  { min: 1,  name: "Bronze",  color: "#a8703c" },
  { min: 5,  name: "Silber",  color: "#9aa4b2" },
  { min: 10, name: "Gold",    color: "#e3b341" },
  { min: 16, name: "Platin",  color: "#3fc7c2" },
  { min: 24, name: "Diamant", color: "#6aa3ff" },
  { min: 34, name: "Radiant", color: "#ff5b7f" },
];

export function tierForLevel(level) {
  let t = TIERS[0];
  for (const x of TIERS) if (level >= x.min) t = x;
  return t;
}

function s(tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

// Baut das Avatar-SVG. profile: { level, stats:{strength,...}, equipped }
export function renderAvatar(profile, size = 220) {
  const level = profile?.level || 1;
  const stats = profile?.stats || {};
  const strength = stats.strength || 0;
  const tier = tierForLevel(level);

  // Körperbreite wächst (gedeckelt) mit der Kraft-Stat.
  const bulk = Math.min(1, strength / 600); // 0..1
  const shoulder = 38 + bulk * 26;
  const armW = 10 + bulk * 8;

  const svg = s("svg", {
    viewBox: "0 0 200 240", width: size, height: size * 240 / 200,
    class: "avatar", role: "img", "aria-label": `${tier.name}-Athlet, Level ${level}`,
  });

  // Aura (Liga-Ring)
  const aura = s("circle", { cx: 100, cy: 120, r: 92, fill: "none", stroke: tier.color, "stroke-width": 4, opacity: 0.55 });
  svg.appendChild(aura);
  if (level >= 10) {
    svg.appendChild(s("circle", { cx: 100, cy: 120, r: 84, fill: "none", stroke: tier.color, "stroke-width": 1.5, opacity: 0.3 }));
  }

  // Beine
  svg.appendChild(s("rect", { x: 86, y: 168, width: 12, height: 46, rx: 6, fill: "#2b3550" }));
  svg.appendChild(s("rect", { x: 102, y: 168, width: 12, height: 46, rx: 6, fill: "#2b3550" }));

  // Umhang ab Diamant (Level 24)
  if (level >= 24) {
    const cape = s("path", { d: `M ${100 - shoulder} 96 Q 100 230 ${100 + shoulder} 96 Z`, fill: tier.color, opacity: 0.35 });
    svg.appendChild(cape);
  }

  // Arme (Breite wächst mit Kraft)
  svg.appendChild(s("rect", { x: 100 - shoulder - armW, y: 96, width: armW, height: 64, rx: armW / 2, fill: "#3a4766" }));
  svg.appendChild(s("rect", { x: 100 + shoulder, y: 96, width: armW, height: 64, rx: armW / 2, fill: "#3a4766" }));

  // Torso (Schulterbreite wächst mit Kraft)
  svg.appendChild(s("path", {
    d: `M ${100 - shoulder} 96 Q 100 86 ${100 + shoulder} 96 L ${100 + shoulder * 0.7} 170 L ${100 - shoulder * 0.7} 170 Z`,
    fill: "#46557d",
  }));

  // Kopf
  svg.appendChild(s("circle", { cx: 100, cy: 70, r: 22, fill: "#e8c39e" }));

  // Stirnband ab Gold (Level 10)
  if (level >= 10) {
    svg.appendChild(s("rect", { x: 78, y: 56, width: 44, height: 7, rx: 3, fill: tier.color }));
  }

  return svg;
}
