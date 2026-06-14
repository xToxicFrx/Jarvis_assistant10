// ============================================================
// MAIN — startet JARVIS. Hier wird später alles verbunden:
// Stimme rein -> Gehirn -> Stimme raus.
// Aktuell (Schritt 1): nur das HUD läuft im Idle-Zustand.
// ============================================================

window.addEventListener("DOMContentLoaded", () => {
  console.log("JARVIS startet…");
  HUD.init();          // Uhr, System, Wetter starten
  HUD.setStatus("idle"); // Status in der Mitte
  Viz.setLevel(0);     // Visualizer ruhig (Idle-Atmen läuft automatisch)
  console.log("JARVIS bereit. (Schritt 1: HUD aktiv)");
});
