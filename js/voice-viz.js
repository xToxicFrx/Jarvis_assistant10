// ============================================================
// VOICE-VISUALIZER — der leuchtende Kreis in der Mitte.
// Zeichnet eine ruhige Idle-Animation. Später kann "level"
// (0..1) von echtem Audio gesetzt werden, dann pulsiert er.
// ============================================================

const Viz = (() => {
  const canvas = document.getElementById("viz");
  const ctx = canvas.getContext("2d");
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  let level = 0;        // aktuelle Lautstärke 0..1 (für später)
  let targetLevel = 0;  // wohin sich level bewegen soll
  let t = 0;            // Zeit-Zähler für Animation

  // Von außen aufrufbar: setzt die "Lautstärke" (sanfter Übergang)
  function setLevel(v) { targetLevel = Math.max(0, Math.min(1, v)); }

  function draw() {
    t += 0.02;
    // level bewegt sich sanft Richtung targetLevel
    level += (targetLevel - level) * 0.1;
    // Im Idle ein leichtes "Atmen" hinzufügen
    const breathe = 0.5 + 0.5 * Math.sin(t);
    const energy = level + breathe * 0.15;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- äußere dünne Ringe ---
    for (let i = 0; i < 3; i++) {
      const r = 150 + i * 18;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(47,243,255,${0.08 + i * 0.03})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // --- rotierende Bogen-Segmente (geben das "Tech"-Gefühl) ---
    for (let i = 0; i < 6; i++) {
      const start = t * 0.5 + (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 130, start, start + 0.4);
      ctx.strokeStyle = "rgba(47,243,255,0.5)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // --- Haupt-Kreis, der mit "energy" pulsiert ---
    const baseR = 80;
    const r = baseR + energy * 40;
    const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
    grad.addColorStop(0, "rgba(47,243,255,0.35)");
    grad.addColorStop(1, "rgba(47,243,255,0)");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(47,243,255,0.9)";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#2ff3ff";
    ctx.stroke();
    ctx.shadowBlur = 0;

    // --- "Audio-Wellen" als Striche rund um den Kreis ---
    const bars = 64;
    for (let i = 0; i < bars; i++) {
      const ang = (i / bars) * Math.PI * 2;
      // Pseudo-zufällige Höhe, animiert
      const h = (Math.sin(t * 2 + i * 0.5) * 0.5 + 0.5) * (8 + energy * 30);
      const r1 = r + 6;
      const r2 = r1 + h;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
      ctx.strokeStyle = `rgba(47,243,255,${0.3 + energy * 0.5})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    requestAnimationFrame(draw);
  }

  draw(); // Animation starten

  return { setLevel };
})();
