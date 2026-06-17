// ============================================================
// voiceorb.js — lebendiger "Energie-Orb".
//
// Punkte sitzen auf einer Fibonacci-Kugel, deren Oberflaeche organisch
// wabert (mehrere ueberlagerte Sinus-Wellen ~ Pseudo-Noise). Der Orb
// atmet im Ruhezustand, funkelt, hat einen leuchtenden Kern + Halo
// (additives Blending) und reagiert auf den Stimm-Pegel:
//   listening -> sanfte Wellen wachsen mit dem Mikro-Pegel
//   thinking  -> schnelleres, turbulentes Wirbeln
//   speaking  -> die Kugel "spricht" (Amplitude folgt der Lautstaerke)
// Laeuft nur sichtbar (idle -> aus) = akkuschonend.
// ============================================================
window.VoiceOrb = (function () {
  let canvas, ctx, pts = [], raf = 0, running = false;
  let level = 0, target = 0, rot = 0, state = "idle", DPR = 1;
  let amp = 0.07, glow = 0.4, spinV = 0.006, frame = 0, t0 = 0;
  let rgb = { r: 59, g: 109, b: 246 }, accentRaw = "";

  function parseAccent() {
    const c = (getComputedStyle(document.documentElement).getPropertyValue("--accent") || "#3b6df6").trim();
    if (!c || c === accentRaw) return; accentRaw = c;
    let r = 59, g = 109, b = 246;
    if (c[0] === "#") {
      const h = c.slice(1);
      if (h.length === 3) { r = parseInt(h[0] + h[0], 16); g = parseInt(h[1] + h[1], 16); b = parseInt(h[2] + h[2], 16); }
      else if (h.length >= 6) { r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16); }
    } else { const m = c.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/); if (m) { r = +m[1]; g = +m[2]; b = +m[3]; } }
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) rgb = { r, g, b };
  }

  function build(n) {
    pts = []; const off = 2 / n, inc = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = i * off - 1 + off / 2; const r = Math.sqrt(Math.max(0, 1 - y * y)); const phi = i * inc;
      pts.push([Math.cos(phi) * r, y, Math.sin(phi) * r, Math.random() * Math.PI * 2]); // x,y,z,funkel-phase
    }
  }
  function resize() { if (!canvas) return; DPR = Math.min(2, window.devicePixelRatio || 1); canvas.width = (canvas.clientWidth || 150) * DPR; canvas.height = (canvas.clientHeight || 150) * DPR; }

  function init(c) { canvas = c; ctx = c.getContext("2d"); build(180); parseAccent(); resize(); window.addEventListener("resize", resize); }
  function setLevel(x) { target = Math.max(0, Math.min(1, x || 0)); }
  function setState(s) {
    state = s;
    if (s === "idle") { stop(); if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    parseAccent(); resize(); start();
  }
  function start() { if (running) return; running = true; t0 = performance.now(); loop(); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  function loop() {
    if (!running || !ctx) return;
    raf = requestAnimationFrame(loop);
    frame++; if ((frame & 31) === 0) parseAccent();
    const t = (performance.now() - t0) / 1000;
    level += (target - level) * 0.16;

    // weiche Zielwerte je Zustand -> lebendig nachgefuehrt
    let aT, gT, spin;
    if (state === "speaking") { aT = 0.08 + level * 1.0; gT = 0.45 + level * 0.6; spin = 0.011; }
    else if (state === "thinking") { aT = 0.22 + 0.07 * Math.sin(t * 4); gT = 0.55; spin = 0.028; }
    else { aT = 0.08 + level * 0.65; gT = 0.4 + level * 0.45; spin = 0.009; } // listening
    amp += (aT - amp) * 0.12; glow += (gT - glow) * 0.12; spinV += (spin - spinV) * 0.1;
    rot += spinV + level * 0.04;

    const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2, mind = Math.min(w, h);
    ctx.clearRect(0, 0, w, h);
    const breath = 1 + 0.06 * Math.sin(t * 1.4);
    const baseR = mind * 0.25 * breath * (1 + level * 0.12);
    const { r, g, b } = rgb;
    const rgba = (a) => "rgba(" + r + "," + g + "," + b + "," + a + ")";

    // ---- Halo + gluehender Kern (additiv = leuchtend) ----
    ctx.globalCompositeOperation = "lighter";
    const haloR = Math.min(mind * 0.49, baseR * (1.7 + glow * 0.25));
    let grd = ctx.createRadialGradient(cx, cy, baseR * 0.15, cx, cy, haloR);
    grd.addColorStop(0, rgba(0.28 + glow * 0.22)); grd.addColorStop(0.5, rgba(0.08 + glow * 0.10)); grd.addColorStop(1, rgba(0));
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx, cy, haloR, 0, Math.PI * 2); ctx.fill();

    const coreR = baseR * (0.65 + level * 0.25);
    grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    grd.addColorStop(0, "rgba(255,255,255," + (0.45 + glow * 0.3) + ")"); grd.addColorStop(0.4, rgba(0.5 + glow * 0.2)); grd.addColorStop(1, rgba(0));
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.fill();

    // ---- Punkte auf der wabernden Kugel ----
    ctx.globalCompositeOperation = "source-over";
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const tilt = 0.42 + 0.16 * Math.sin(t * 0.5), ct = Math.cos(tilt), st = Math.sin(tilt);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      let n = Math.sin(p[0] * 2.3 + t * 0.9) + Math.sin(p[1] * 2.9 - t * 1.1) + Math.sin(p[2] * 3.1 + t * 0.7) + 0.6 * Math.sin((p[0] + p[1] + p[2]) * 4 + t * 1.7);
      n /= 3.2; // ~[-1,1]
      const rr = 1 + amp * n;
      const ox = p[0] * rr, oy = p[1] * rr, oz = p[2] * rr;
      const x1 = ox * cosR - oz * sinR, z1 = ox * sinR + oz * cosR;
      const y1 = oy * ct - z1 * st, z2 = oy * st + z1 * ct;
      const depth = (z2 + 1) / 2; // 0 hinten .. 1 vorne
      const px = cx + x1 * baseR, py = cy + y1 * baseR;
      const tw = 0.72 + 0.28 * Math.sin(t * 3 + p[3]); // Funkeln
      const size = (0.5 + depth * 2.4) * DPR * (1 + level * 0.7 + Math.max(0, n) * amp * 2) * tw;
      const k = Math.min(1, depth * 0.55 + Math.max(0, n) * 0.5); // Highlight -> Richtung weiss
      const cr = (r + (255 - r) * k) | 0, cg = (g + (255 - g) * k) | 0, cb = (b + (255 - b) * k) | 0;
      ctx.globalAlpha = (0.16 + depth * 0.84) * tw;
      ctx.beginPath(); ctx.arc(px, py, size > 0.3 ? size : 0.3, 0, Math.PI * 2);
      ctx.fillStyle = "rgb(" + cr + "," + cg + "," + cb + ")"; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  return { init, setState, setLevel };
})();
