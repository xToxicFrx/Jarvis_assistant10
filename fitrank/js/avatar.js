// ============================================================
// avatar.js — geschichteter SVG-Charakter + Gear-System (RPG-Herzstück).
// ============================================================
// Der Avatar verändert sich SICHTBAR:
//   * Körper wird muskulöser mit der Kraft-Stat.
//   * Liga-Aura-Farbe steigt mit dem Level (Bronze -> Radiant).
//   * Ausrüstung (Gear) wird per Level freigeschaltet und kann an-/abgelegt werden.
// Gear-Katalog ist statisch hier im Frontend; der freigeschaltete/getragene Stand
// liegt in profiles.equipped (jsonb). Freischaltung nur über das Level (kein Kauf).
// ============================================================

const SVGNS = "http://www.w3.org/2000/svg";

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
export function nextTier(level) {
  return TIERS.find((x) => x.min > level) || null;
}

function s(tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

// ---------- Gear-Katalog ----------
// slot: headband | cape | aura. render(tier) liefert SVG-Elemente.
export const GEAR = [
  { id: "headband_red", slot: "headband", name: "Stirnband", minLevel: 5,
    render: (t) => [s("rect", { x: 78, y: 56, width: 44, height: 7, rx: 3, fill: "#d8413f" })] },
  { id: "headband_gold", slot: "headband", name: "Goldband", minLevel: 10,
    render: (t) => [s("rect", { x: 78, y: 56, width: 44, height: 7, rx: 3, fill: "#e3b341" })] },
  { id: "crown", slot: "headband", name: "Krone", minLevel: 24,
    render: (t) => [s("path", { d: "M80 58 L86 46 L94 56 L100 44 L106 56 L114 46 L120 58 Z", fill: "#e3b341", stroke: "#b8860b", "stroke-width": 1 })] },

  { id: "cape_blue", slot: "cape", name: "Umhang", minLevel: 16,
    render: (t) => [s("path", { d: "M62 96 Q 100 230 138 96 Z", fill: "#3a6ad8", opacity: 0.4 })] },
  { id: "cape_radiant", slot: "cape", name: "Radiant-Umhang", minLevel: 34,
    render: (t) => [s("path", { d: "M58 96 Q 100 236 142 96 Z", fill: "#ff5b7f", opacity: 0.5 })] },

  { id: "aura_double", slot: "aura", name: "Doppel-Aura", minLevel: 10,
    render: (t) => [s("circle", { cx: 100, cy: 120, r: 84, fill: "none", stroke: t.color, "stroke-width": 1.5, opacity: 0.3 })] },
  { id: "aura_flames", slot: "aura", name: "Flammen-Aura", minLevel: 24,
    render: (t) => {
      const els = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const x = 100 + Math.cos(a) * 92, y = 120 + Math.sin(a) * 92;
        els.push(s("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 5, fill: t.color, opacity: 0.5 }));
      }
      return els;
    } },
];

export function isUnlocked(item, level) { return level >= item.minLevel; }
export function gearForSlot(slot) { return GEAR.filter((g) => g.slot === slot); }
export const GEAR_SLOTS = ["headband", "cape", "aura"];

// ---------- Avatar rendern ----------
export function renderAvatar(profile, size = 200) {
  const level = profile?.level || 1;
  const stats = profile?.stats || {};
  const equipped = profile?.equipped || {};
  const tier = tierForLevel(level);

  const bulk = Math.min(1, (stats.strength || 0) / 600);
  const shoulder = 38 + bulk * 26;
  const armW = 10 + bulk * 8;

  const svg = s("svg", {
    viewBox: "0 0 200 240", width: size, height: size * 240 / 200,
    class: "avatar", role: "img", "aria-label": `${tier.name}-Athlet, Level ${level}`,
  });

  // Basis-Aura (Liga-Ring) — immer sichtbar.
  svg.appendChild(s("circle", { cx: 100, cy: 120, r: 92, fill: "none", stroke: tier.color, "stroke-width": 4, opacity: 0.55 }));

  // Gear: aura (hinter dem Körper)
  appendGear(svg, "aura", equipped, level, tier);
  // Gear: cape (hinter dem Körper)
  appendGear(svg, "cape", equipped, level, tier);

  // Beine
  svg.appendChild(s("rect", { x: 86, y: 168, width: 12, height: 46, rx: 6, fill: "#2b3550" }));
  svg.appendChild(s("rect", { x: 102, y: 168, width: 12, height: 46, rx: 6, fill: "#2b3550" }));
  // Arme
  svg.appendChild(s("rect", { x: 100 - shoulder - armW, y: 96, width: armW, height: 64, rx: armW / 2, fill: "#3a4766" }));
  svg.appendChild(s("rect", { x: 100 + shoulder, y: 96, width: armW, height: 64, rx: armW / 2, fill: "#3a4766" }));
  // Torso
  svg.appendChild(s("path", {
    d: `M ${100 - shoulder} 96 Q 100 86 ${100 + shoulder} 96 L ${100 + shoulder * 0.7} 170 L ${100 - shoulder * 0.7} 170 Z`,
    fill: "#46557d",
  }));
  // Kopf
  svg.appendChild(s("circle", { cx: 100, cy: 70, r: 22, fill: "#e8c39e" }));

  // Gear: headband (vor dem Kopf)
  appendGear(svg, "headband", equipped, level, tier);

  return svg;
}

function appendGear(svg, slot, equipped, level, tier) {
  const id = equipped[slot];
  if (!id) return;
  const item = GEAR.find((g) => g.id === id && g.slot === slot);
  if (!item || !isUnlocked(item, level)) return;
  item.render(tier).forEach((node) => svg.appendChild(node));
}
