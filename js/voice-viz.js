// ============================================================
// VOICE-VISUALIZER — der "Arc-Reaktor" in der Mitte.
// Mehrere Schichten: rotierende Skalen, gestrichelte Bögen,
// Hexagon-Kern, Frequenz-Balken, Glühen. Reagiert auf "level".
// ============================================================

const Viz = (() => {
  const canvas = document.getElementById("viz");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2;

  let level = 0, target = 0, t = 0;
  const setLevel = (v) => { target = Math.max(0, Math.min(1, v)); };

  // kleine Sterne/Partikel, die nach außen treiben
  const particles = Array.from({ length: 40 }, () => ({
    a: Math.random() * Math.PI * 2,
    r: 60 + Math.random() * 120,
    s: 0.2 + Math.random() * 0.6,
  }));

  function polygon(r, sides, rot) {
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function dashedArc(r, start, len, width, alpha) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + len);
    ctx.strokeStyle = `rgba(47,243,255,${alpha})`;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function draw() {
    t += 0.016;
    level += (target - level) * 0.12;
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.2);
    const energy = level + breathe * 0.1;

    ctx.clearRect(0, 0, W, H);

    // --- äußerer Skalenring mit Tick-Marken ---
    ctx.save();
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 + t * 0.05;
      const big = i % 5 === 0;
      const r1 = 178, r2 = r1 - (big ? 12 : 6);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.strokeStyle = `rgba(47,243,255,${big ? 0.6 : 0.25})`;
      ctx.lineWidth = big ? 2 : 1;
      ctx.stroke();
    }
    ctx.restore();

    // --- rotierende gestrichelte Bögen (mehrere Geschwindigkeiten) ---
    dashedArc(158, t * 0.7, 1.4, 2, 0.5);
    dashedArc(158, t * 0.7 + Math.PI, 1.0, 2, 0.35);
    dashedArc(142, -t * 0.9, 0.9, 3, 0.5);
    dashedArc(142, -t * 0.9 + Math.PI * 0.8, 0.6, 3, 0.3);
    dashedArc(120, t * 1.3, 2.2, 1.5, 0.4);

    // --- Hexagon-Kern, leicht rotierend ---
    ctx.strokeStyle = `rgba(47,243,255,${0.4 + energy * 0.4})`;
    ctx.lineWidth = 1.5;
    polygon(58, 6, t * 0.3);
    polygon(46, 6, -t * 0.5);

    // --- treibende Partikel ---
    particles.forEach((p) => {
      p.r += p.s * (0.4 + energy);
      if (p.r > 175) { p.r = 60; p.a = Math.random() * Math.PI * 2; }
      const x = cx + Math.cos(p.a) * p.r, y = cy + Math.sin(p.a) * p.r;
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(47,243,255,${0.5 * (1 - p.r / 175)})`;
      ctx.fill();
    });

    // --- pulsierender Glüh-Kern ---
    const r = 60 + energy * 34;
    const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, r);
    g.addColorStop(0, `rgba(120,250,255,${0.5 + energy * 0.4})`);
    g.addColorStop(0.6, "rgba(47,243,255,0.18)");
    g.addColorStop(1, "rgba(47,243,255,0)");
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();

    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(120,250,255,0.95)";
    ctx.lineWidth = 2; ctx.shadowBlur = 22; ctx.shadowColor = "#2ff3ff";
    ctx.stroke(); ctx.shadowBlur = 0;

    // --- Frequenz-Balken rund um den Kern ---
    const bars = 72;
    for (let i = 0; i < bars; i++) {
      const a = (i / bars) * Math.PI * 2;
      const h = (Math.sin(t * 2.4 + i * 0.5) * 0.5 + 0.5) * (6 + energy * 34);
      const r1 = r + 5, r2 = r1 + h;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.strokeStyle = `rgba(47,243,255,${0.25 + energy * 0.55})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    requestAnimationFrame(draw);
  }
  draw();

  return { setLevel };
})();
