// ============================================================
// shortcuts.js — Tastenkuerzel + Befehlspalette (Strg/Cmd+K).
// Andere Module melden Befehle an (register); die Palette zeigt sie
// und fuehrt sie aus. Schnelltasten gelten nur, wenn man nicht in
// einem Eingabefeld tippt.
// ============================================================
window.Shortcuts = (function () {
  let commands = [];

  function register(list) { commands = commands.concat(list); }
  function all() { return commands; }

  function init() {
    document.addEventListener("keydown", (e) => {
      const a = document.activeElement;
      const typing = a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (window.UI) UI.openCommandPalette(commands); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;

      const map = { t: "add-task", h: "add-homework", n: "add-note", g: "add-grade", e: "add-exam", p: "toggle-pomodoro", b: "briefing", "/": "command", "?": "help" };
      const id = map[e.key];
      if (id) {
        const c = commands.find((x) => x.id === id) || (id === "command" ? { run: () => UI.openCommandPalette(commands) } : null);
        if (c) { e.preventDefault(); c.run(); }
      }
    });
  }

  return { init, register, all };
})();
