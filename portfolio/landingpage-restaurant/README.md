# Bella Notte — Demo-Landingpage (Portfolio)

Eine moderne, vollständig responsive Landingpage für ein (fiktives) italienisches
Restaurant. Gebaut als **Portfolio-Beispiel** für das Angebot „Landingpage für
lokale Firmen" — und als Vorlage, die du für echte Kunden nur noch anpassen musst.

## Was die Seite zeigt
- **Sticky-Navigation** mit funktionierendem Mobil-Menü (Hamburger)
- **Hero** mit Call-to-Action „Tisch reservieren"
- **Speisekarte** in zwei Spalten
- **Über-uns**-Bereich mit Bild
- **Galerie** (responsives Grid)
- **Öffnungszeiten + Kontakt**
- **Reservierungsformular** mit Validierung (Demo, kein echter Versand)
- **Scroll-Animationen**, sauberes responsives Layout bis hinunter zum Handy
- SEO-Grundlagen: `<title>`, `meta description`, Open-Graph-Tags

## Technik
- Reines **HTML, CSS, JavaScript** — kein Build-Schritt, keine Frameworks
- Eine externe Abhängigkeit: Google Fonts (über `<link>`)
- Bilder von [Unsplash](https://unsplash.com) (kostenlos nutzbar) — für echte Kunden
  durch deren eigene Fotos ersetzen

## Lokal ansehen
Einfach `index.html` im Browser öffnen. Oder mit einem kleinen Server:

```bash
# Falls Python installiert ist:
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Kostenlos deployen (so wie du es Kunden anbietest)
1. Ordner in ein eigenes Git-Repo legen.
2. Auf [Vercel](https://vercel.com) importieren → „Deploy".
3. Fertig — die Seite ist live unter einer `*.vercel.app`-URL (eigene Domain optional).

> Genau dieser Ablauf ist dein Verkaufsargument: schnelle, professionelle Seite,
> kostenlos gehostet, in wenigen Tagen online.

## Für einen echten Kunden anpassen
Suche im Code nach `[Stadt]` und ersetze außerdem:
- Restaurantname & Logo-Text (`Bella Notte`)
- Texte, Speisekarte und Preise
- Bilder (eigene Fotos statt Unsplash)
- Adresse, Telefon, E-Mail, Öffnungszeiten
- Farben in `styles.css` ganz oben (`:root`-Variablen `--accent`, `--accent-2`)
