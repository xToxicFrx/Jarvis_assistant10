// ============================================================
// search.js — durchsucht ALLES (Aufgaben, Notizen, Tests, Termine,
// Noten, Gewohnheiten, Ziele). Genutzt von der Befehlspalette
// (Strg/Cmd+K) und der Suche.
// ============================================================
window.Search = (function () {
  const U = window.Utils;

  function query(term) {
    term = (term || "").trim().toLowerCase();
    if (!term) return [];
    const s = Store.get();
    const out = [];
    const has = (txt) => String(txt || "").toLowerCase().includes(term);

    s.tasks.forEach((t) => { if (has(t.title) || has(t.subject)) out.push({ type: t.type === "homework" ? "Hausaufgabe" : "Aufgabe", label: t.title, sub: t.subject || U.dueLabel(t.due), run: () => UI.editTask(t) }); });
    s.notes.forEach((n) => { if (has(n.title) || has(n.body)) out.push({ type: "Notiz", label: n.title || n.body.slice(0, 40), sub: "", run: () => UI.openNote(n) }); });
    s.exams.forEach((e) => { if (has(e.subject) || has(e.title)) out.push({ type: "Test", label: e.subject + (e.title ? " — " + e.title : ""), sub: U.dueLabel(e.date) }); });
    s.events.forEach((e) => { if (has(e.title) || has(e.location)) out.push({ type: "Termin", label: e.title, sub: U.dueLabel(e.date) }); });
    s.grades.forEach((g) => { if (has(g.subject) || has(g.label)) out.push({ type: "Note", label: `${g.subject}: ${g.value}`, sub: g.label || "" }); });
    s.goals.forEach((g) => { if (has(g.title)) out.push({ type: "Ziel", label: g.title, sub: `${g.progress}/${g.target}` }); });
    s.habits.forEach((h) => { if (has(h.name)) out.push({ type: "Gewohnheit", label: h.name, sub: Store.habitStreak(h.id) + " Tage" }); });

    return out.slice(0, 40);
  }

  return { query };
})();
