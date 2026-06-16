// ============================================================
// calendar.js — Monatsansicht, die Aufgaben, Tests, Termine und
// Erinnerungen als Punkte auf den jeweiligen Tagen zeigt.
// Selbstverwaltend: die Pfeile blaettern den Monat (ohne die
// restlichen Daten zu beruehren).
// ============================================================
window.Calendar = (function () {
  const U = window.Utils;
  let view = (function () { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; })();

  function itemsForDay(state, ymd) {
    const out = [];
    state.tasks.forEach((t) => { if (t.due === ymd && !t.done) out.push({ type: "task", label: t.title }); });
    state.exams.forEach((e) => { if (e.date === ymd) out.push({ type: "exam", label: e.subject + (e.title ? " " + e.title : "") }); });
    state.events.forEach((e) => { if (e.date === ymd) out.push({ type: "event", label: e.title }); });
    state.reminders.forEach((r) => { if (!r.fired && U.ymd(new Date(r.at)) === ymd) out.push({ type: "rem", label: r.text }); });
    return out;
  }

  function build(state) {
    const wrap = U.el("div", { class: "cal" });
    function draw() {
      U.clear(wrap);
      const y = view.getFullYear(), m = view.getMonth();
      const head = U.el("div", { class: "cal-head" }, [
        U.iconBtn("i-chev-left", "Voriger Monat", () => { view.setMonth(m - 1); draw(); }),
        U.el("div", { class: "cal-title", text: view.toLocaleDateString("de-DE", { month: "long", year: "numeric" }) }),
        U.iconBtn("i-chev-right", "Naechster Monat", () => { view.setMonth(m + 1); draw(); }),
      ]);
      wrap.appendChild(head);

      const grid = U.el("div", { class: "cal-grid" });
      ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].forEach((d) => grid.appendChild(U.el("div", { class: "cal-dow", text: d })));
      const startPad = (new Date(y, m, 1).getDay() + 6) % 7;
      for (let i = 0; i < startPad; i++) grid.appendChild(U.el("div", { class: "cal-cell empty" }));
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const todayYmd = U.todayYMD();
      for (let day = 1; day <= daysInMonth; day++) {
        const dYmd = `${y}-${U.pad(m + 1)}-${U.pad(day)}`;
        const items = itemsForDay(state, dYmd);
        const cell = U.el("div", { class: "cal-cell" + (dYmd === todayYmd ? " today" : "") + (items.length ? " has" : "") }, U.el("div", { class: "cal-day", text: String(day) }));
        if (items.length) {
          const dots = U.el("div", { class: "cal-dots" });
          items.slice(0, 4).forEach((it) => dots.appendChild(U.el("span", { class: "cal-dot " + it.type, title: it.label })));
          cell.appendChild(dots);
          cell.addEventListener("click", () => { if (Calendar.onDay) Calendar.onDay(dYmd, items); });
        }
        grid.appendChild(cell);
      }
      wrap.appendChild(grid);
    }
    draw();
    return wrap;
  }

  return { build, onDay: null };
})();
