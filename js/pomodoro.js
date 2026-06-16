// ============================================================
// pomodoro.js — Lern-Timer, der tab-uebergreifend weiterlaeuft.
//
// Trick: Im Store steht ein ABSOLUTER Ziel-Zeitstempel (endsAt).
// So ist die Restzeit immer korrekt berechenbar — auch wenn der
// Tab im Hintergrund gedrosselt wird oder man in anderen Tabs
// arbeitet. Der Tab-Titel zeigt die Restzeit, ein Wecker
// (setTimeout) feuert den Phasenwechsel, beim Zurueckkehren wird
// nachgeholt (visibilitychange/focus).
//
// Grenze: Der Jarvis-Tab muss offen bleiben (auch im Hintergrund).
// Bei ganz geschlossenem Tab gibt es keine Benachrichtigung; beim
// naechsten Oeffnen wird der Stand per Zeitstempel nachgeholt.
// ============================================================
window.Pomodoro = (function () {
  let hooks = {};
  let tickTimer = null;
  let endTimer = null;

  function P() { return Store.get().pomodoro; }
  function remainingMs() { const x = P(); return x.running ? Math.max(0, x.endsAt - Date.now()) : (x.remainingMs || 0); }
  function phaseLabel(ph) { return ph === "work" ? "Lernen" : ph === "break" ? "Pause" : ph === "longbreak" ? "Lange Pause" : "Bereit"; }

  function clearTimers() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } if (endTimer) { clearTimeout(endTimer); endTimer = null; } }

  function setTitle() {
    const x = P();
    document.title = x.running ? `${Utils.fmtDuration(remainingMs() / 1000)} ${phaseLabel(x.phase)} · Jarvis` : "Jarvis";
  }

  function fireEndIfDue() {
    const x = P();
    if (!x.running) return;
    if (Date.now() < x.endsAt) return;
    const r = Store.pomodoroAdvance(); // wechselt Phase im Store -> loest reschedule aus
    if (hooks.onPhaseEnd) { try { hooks.onPhaseEnd(r.prev, r.next, P()); } catch (e) {} }
  }

  function schedule() {
    clearTimers();
    setTitle();
    const x = P();
    if (!x.running) return;
    const ms = Math.max(0, x.endsAt - Date.now());
    endTimer = setTimeout(fireEndIfDue, ms + 60);
    tickTimer = setInterval(() => {
      setTitle();
      if (hooks.onTick) { try { hooks.onTick(remainingMs(), x.phase, x.running); } catch (e) {} }
      if (Date.now() >= x.endsAt) fireEndIfDue();
    }, 1000);
  }

  function recheck() { fireEndIfDue(); setTitle(); if (hooks.onTick) { try { hooks.onTick(remainingMs(), P().phase, P().running); } catch (e) {} } }

  function init(h) {
    hooks = h || {};
    Store.subscribe(() => schedule());
    document.addEventListener("visibilitychange", () => { if (!document.hidden) recheck(); });
    window.addEventListener("focus", recheck);
    schedule();
    return window.Pomodoro;
  }

  return { init, remainingMs, phaseLabel, schedule };
})();
