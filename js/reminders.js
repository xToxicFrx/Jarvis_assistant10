// ============================================================
// reminders.js — plant Erinnerungen und meldet sie.
//
// Solange die App offen ist, feuert sie per setTimeout und zeigt
// (falls erlaubt) eine Browser-Benachrichtigung. Verpasste
// Erinnerungen (App war zu) werden beim Start nachgeholt.
//
// Grenze: Echte Benachrichtigungen bei GESCHLOSSENER App brauchen
// Web-Push (Service-Worker + Push-Server) — bewusst nicht in v1.
// ============================================================
(function () {
  let timers = [];
  let cfg = { onFire: null };
  const HORIZON = 24 * 3600 * 1000; // nur Erinnerungen der naechsten 24h vormerken

  function clearAll() { timers.forEach((t) => clearTimeout(t)); timers = []; }

  function scheduleAll() {
    clearAll();
    const now = Date.now();
    (Store.get().reminders || []).forEach((r) => {
      if (r.fired) return;
      const delay = r.at - now;
      if (delay <= 0) return; // Vergangenes erledigt catchUp()
      if (delay <= HORIZON) timers.push(setTimeout(() => fire(r.id), delay));
    });
  }

  function fire(id) {
    const r = (Store.get().reminders || []).find((x) => x.id === id);
    if (!r || r.fired) return;
    Store.markReminderFired(id);
    notify(r, false);
  }

  function catchUp() {
    const now = Date.now();
    (Store.get().reminders || []).filter((r) => !r.fired && r.at <= now)
      .forEach((r) => { Store.markReminderFired(r.id); notify(r, true); });
  }

  function notify(r, missed) {
    const title = missed ? "Verpasste Erinnerung" : "Erinnerung";
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification(title, { body: r.text }); } catch (e) {}
    }
    if (cfg.onFire) try { cfg.onFire(r, missed); } catch (e) {}
  }

  async function requestPermission() {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    try { return await Notification.requestPermission(); } catch (e) { return "denied"; }
  }

  function permission() { return ("Notification" in window) ? Notification.permission : "unsupported"; }

  function init(options) {
    cfg = Object.assign(cfg, options || {});
    catchUp();
    scheduleAll();
    Store.subscribe(() => scheduleAll());
    setInterval(scheduleAll, 60 * 1000);
    return window.Reminders;
  }

  window.Reminders = { init, scheduleAll, requestPermission, permission };
})();
