// ============================================================
// HUD-FX — die "lebendige" Umgebung:
//   • animierter Hintergrund: Gitter, Radar-Sweep, Partikel
//   • kreisförmige Mess-Anzeigen (Gauges) für den linken Bereich
// Rein dekorativ + teils echte Browser-Daten (Speicher).
// ============================================================

const HUDFX = (() => {

  // ---------- 1) HINTERGRUND ----------
  function initBackground() {
    const c = document.getElementById("bg");
    if (!c) return;
    const ctx = c.getContext("2d");
    let w, h, sweep = 0;
    const stars = [];

    function resize() {
      w = c.width = window.innerWidth;
      h = c.height = window.innerHeight;
      stars.length = 0;
      for (let i = 0; i < 70; i++) {
        stars.push({ x: Math.random() * w, y: Math.random() * h, s: Math.random() * 1.4, v: 0.1 + Math.random() * 0.3 });
      }
    }
    window.addEventListener("resize", resize);
    resize();

    function frame() {
      ctx.clearRect(0, 0, w, h);

      // Gitter
      ctx.strokeStyle = "rgba(47,243,255,0.04)";
      ctx.lineWidth = 1;
      const gap = 46;
      for (let x = 0; x < w; x += gap) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += gap) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      // driftende Partikel
      stars.forEach((s) => {
        s.y += s.v; if (s.y > h) { s.y = 0; s.x = Math.random() * w; }
        ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(47,243,255,0.25)"; ctx.fill();
      });

      // Radar-Sweep unten links
      const rx = w * 0.13, ry = h * 0.7, rr = Math.min(w, h) * 0.28;
      sweep += 0.012;
      const grad = ctx.createConicGradient ? null : null;
      ctx.save();
      ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(47,243,255,0.05)"; ctx.stroke();
      for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(rx, ry, rr * i / 3, 0, Math.PI * 2); ctx.strokeStyle = "rgba(47,243,255,0.04)"; ctx.stroke(); }
      // Sweep-Strahl
      const a = sweep % (Math.PI * 2);
      const g2 = ctx.createLinearGradient(rx, ry, rx + Math.cos(a) * rr, ry + Math.sin(a) * rr);
      g2.addColorStop(0, "rgba(47,243,255,0.25)");
      g2.addColorStop(1, "rgba(47,243,255,0)");
      ctx.beginPath(); ctx.moveTo(rx, ry);
      ctx.arc(rx, ry, rr, a - 0.5, a);
      ctx.closePath(); ctx.fillStyle = g2; ctx.fill();
      ctx.restore();

      requestAnimationFrame(frame);
    }
    frame();
  }

  // ---------- 2) KREIS-GAUGE ----------
  // Zeichnet einen Fortschrittsring 0..1 mit Beschriftung in der Mitte.
  function makeGauge(canvasId) {
    const c = document.getElementById(canvasId);
    if (!c) return { set: () => {} };
    const ctx = c.getContext("2d");
    const cx = c.width / 2, cy = c.height / 2, r = Math.min(cx, cy) - 6;
    let val = 0, shown = 0, label = "";

    (function loop() {
      shown += (val - shown) * 0.1;
      ctx.clearRect(0, 0, c.width, c.height);
      // Hintergrundring
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(47,243,255,0.12)"; ctx.lineWidth = 5; ctx.stroke();
      // Fortschritt
      const start = -Math.PI / 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, start, start + shown * Math.PI * 2);
      ctx.strokeStyle = "#2ff3ff"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.shadowBlur = 10; ctx.shadowColor = "#2ff3ff"; ctx.stroke(); ctx.shadowBlur = 0;
      // Text
      ctx.fillStyle = "#2ff3ff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "bold 15px monospace";
      ctx.fillText(Math.round(shown * 100) + "%", cx, cy - 4);
      ctx.font = "8px monospace"; ctx.fillStyle = "rgba(47,243,255,0.6)";
      ctx.fillText(label, cx, cy + 12);
      requestAnimationFrame(loop);
    })();

    return { set: (v, l) => { val = Math.max(0, Math.min(1, v)); if (l !== undefined) label = l; } };
  }

  return { initBackground, makeGauge };
})();
