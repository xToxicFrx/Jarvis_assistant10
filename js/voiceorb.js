// ============================================================
// voiceorb.js — animierter "Ball aus Punkten", der sich im Rhythmus
// der Stimme bewegt. Punkte sitzen auf einer Kugel (Fibonacci-
// Verteilung), die rotiert und mit dem Lautstaerke-Pegel pulsiert.
// Laeuft nur, wenn aktiv (idle -> aus), spart so Akku.
// ============================================================
window.VoiceOrb = (function () {
  let canvas, ctx, pts = [], raf = 0, running = false;
  let level = 0, target = 0, rot = 0, state = "idle", DPR = 1;

  function accent() { return (getComputedStyle(document.documentElement).getPropertyValue("--accent") || "#3b6df6").trim() || "#3b6df6"; }

  function build(n) {
    pts = []; const off = 2 / n, inc = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) { const y = i * off - 1 + off / 2; const r = Math.sqrt(Math.max(0, 1 - y * y)); const phi = i * inc; pts.push([Math.cos(phi) * r, y, Math.sin(phi) * r]); }
  }
  function resize() { if (!canvas) return; DPR = Math.min(2, window.devicePixelRatio || 1); canvas.width = (canvas.clientWidth || 130) * DPR; canvas.height = (canvas.clientHeight || 130) * DPR; }

  function init(c) { canvas = c; ctx = c.getContext("2d"); build(150); resize(); window.addEventListener("resize", resize); }
  function setLevel(x) { target = Math.max(0, Math.min(1, x || 0)); }
  function setState(s) { state = s; if (s === "idle") { stop(); if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); } else { resize(); start(); } }
  function start() { if (running) return; running = true; loop(); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  function loop() {
    if (!running || !ctx) return;
    raf = requestAnimationFrame(loop);
    level += (target - level) * 0.18;
    const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    const spin = state === "thinking" ? 0.02 : state === "speaking" ? 0.008 : 0.005;
    rot += spin + level * 0.05;
    const baseR = Math.min(w, h) * 0.33;
    const pulse = state === "speaking" ? level * 0.55 : state === "listening" ? 0.08 + level * 0.25 : 0.05;
    const R = baseR * (1 + pulse);
    const col = accent();
    const cosR = Math.cos(rot), sinR = Math.sin(rot), tilt = 0.5, ct = Math.cos(tilt), st = Math.sin(tilt);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const x1 = p[0] * cosR - p[2] * sinR, z1 = p[0] * sinR + p[2] * cosR;
      const y1 = p[1] * ct - z1 * st, z2 = p[1] * st + z1 * ct;
      const depth = (z2 + 1) / 2; // 0 (hinten) .. 1 (vorne)
      const px = cx + x1 * R, py = cy + y1 * R;
      const size = (0.6 + depth * 1.9) * DPR * (1 + level * 0.7);
      ctx.globalAlpha = 0.22 + depth * 0.78;
      ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  return { init, setState, setLevel };
})();
