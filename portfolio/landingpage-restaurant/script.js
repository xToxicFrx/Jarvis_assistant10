// ===== Bella Notte — Demo-Landingpage =====
// Kleines, abhängigkeitsfreies Script: Mobil-Menü, Scroll-Reveal,
// Formular-Validierung (Demo) und Jahr im Footer.

(function () {
  "use strict";

  // --- Mobiles Menü ---
  const toggle = document.getElementById("navToggle");
  const links = document.getElementById("navLinks");

  if (toggle && links) {
    toggle.addEventListener("click", function () {
      const open = links.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
    });

    // Menü schließen, wenn ein Link angeklickt wird
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        links.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // --- Scroll-Reveal für Sektionen ---
  const revealTargets = document.querySelectorAll(
    ".section, .about, .hours, .strip, .reserve"
  );
  revealTargets.forEach(function (el) { el.setAttribute("data-reveal", ""); });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealTargets.forEach(function (el) { io.observe(el); });
  } else {
    revealTargets.forEach(function (el) { el.classList.add("is-visible"); });
  }

  // --- Reservierungs-Formular (Demo: kein echter Versand) ---
  const form = document.getElementById("reserveForm");
  const hint = document.getElementById("formHint");

  if (form && hint) {
    // Datum: heute als Minimum vorbelegen
    const dateInput = form.querySelector('input[name="date"]');
    if (dateInput) dateInput.min = new Date().toISOString().split("T")[0];

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      hint.className = "form__hint";

      const data = new FormData(form);
      const name = (data.get("name") || "").toString().trim();
      const phone = (data.get("phone") || "").toString().trim();
      const date = data.get("date");
      const time = data.get("time");

      if (!name || !phone || !date || !time) {
        hint.textContent = "Bitte Name, Telefon, Datum und Uhrzeit ausfüllen.";
        hint.classList.add("err");
        return;
      }

      // In einer echten Seite würde hier ein Request an ein Backend / eine
      // Reservierungs-API gehen. Für die Demo zeigen wir eine Bestätigung.
      const guests = data.get("guests");
      hint.textContent =
        "Grazie, " + name + "! Anfrage für " + guests + " Pers. am " +
        formatDate(date) + " um " + time + " Uhr eingegangen. Wir melden uns telefonisch.";
      hint.classList.add("ok");
      form.reset();
    });
  }

  function formatDate(iso) {
    const parts = iso.split("-");
    if (parts.length !== 3) return iso;
    return parts[2] + "." + parts[1] + "." + parts[0];
  }

  // --- Jahr im Footer ---
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
