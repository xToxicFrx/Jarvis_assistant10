// ============================================================
// app.js — Einstiegspunkt: Auth-Status prüfen und passende Ansicht zeigen.
// ============================================================
import { isConfigured, onAuthChange, getSession } from "./db.js";
import * as UI from "./ui.js";

async function route() {
  if (!isConfigured) { UI.renderNotConfigured(); return; }
  const session = await getSession();
  if (session) UI.renderDashboard(session);
  else UI.renderAuth();
}

if (isConfigured) {
  // Bei Login/Logout automatisch neu rendern.
  onAuthChange((session) => {
    if (session) UI.renderDashboard(session);
    else UI.renderAuth();
  });
}

route();

// Service-Worker registrieren (PWA / Offline-Hülle).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
