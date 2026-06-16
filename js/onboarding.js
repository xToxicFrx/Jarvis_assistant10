// ============================================================
// onboarding.js — kurze Begruessung beim allerersten Start.
// Zeigt nur, wenn noch keine Daten da sind und es noch nicht
// gesehen wurde. Erklaert das Wichtigste und kann Beispiele anlegen.
// ============================================================
window.Onboarding = (function () {
  function seen() { try { return localStorage.getItem("jarvis_onboarded") === "1"; } catch (e) { return false; } }
  function markSeen() { try { localStorage.setItem("jarvis_onboarded", "1"); } catch (e) {} }

  function maybeRun() {
    if (seen()) return;
    const s = Store.get();
    const empty = !s.tasks.length && !s.grades.length && !s.exams.length && !s.habits.length;
    if (!empty) { markSeen(); return; }
    if (window.UI && UI.openOnboarding) UI.openOnboarding(markSeen);
  }

  // Beispiel-Daten, damit man sofort sieht, wie es aussieht.
  function addExamples() {
    const U = window.Utils;
    Store.addTask({ title: "Mathe-Arbeitsblatt S. 12", type: "homework", subject: "Mathe", due: U.ymd(U.addDays(new Date(), 2)), priority: "high" });
    Store.addTask({ title: "Zimmer aufraeumen", type: "todo", due: U.todayYMD(), priority: "low" });
    Store.addHabit("Vokabeln lernen");
    Store.addExam({ subject: "Biologie", title: "Klassenarbeit", date: U.ymd(U.addDays(new Date(), 7)) });
    markSeen();
  }

  return { maybeRun, seen, markSeen, addExamples };
})();
