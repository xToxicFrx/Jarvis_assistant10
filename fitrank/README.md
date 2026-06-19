# FitRank — Das verifizierte Fitness-RPG

> **Trainiere echt. Level up. Nichts ist erschummelt.**
> Dein RPG-Charakter wächst **ausschließlich durch echtes, live-verifiziertes Training**.
> Das ist der Unterschied zu jedem anderen Tracker: Hier bedeutet jedes Level etwas.

Dies ist der **Phase-0/1-Stand** (Fundament): Login, verifiziertes Live-Workout
(Timer + GPS + Bewegungssensor), Trainings-Logbuch mit automatischer Rekord-Erkennung,
serverseitige XP/Level/Stats (Anti-Cheat) und ein sichtbar wachsender SVG-Avatar.

---

## Architektur (kurz)
- **Frontend:** Vanilla-JS-PWA, kein Build-Schritt. Dateien in `js/`.
- **Backend/DB/Auth:** [Supabase](https://supabase.com) (Postgres + Auth + Row Level Security).
- **Sicherheit:** RLS schottet Nutzerdaten auf DB-Ebene ab; XP/Level/Stats werden NUR
  serverseitig per Trigger berechnet (`db/schema.sql`). Der Browser nutzt nur den
  öffentlichen `anon`-Key.
- **Verifizierung:** Live-Sensoren (`js/tracker.js`) — GPS für Lauf/Rad, Bewegungssensor
  für Kraft. Nur Live-Sessions zählen als „verifiziert" und geben volle XP.

## Dateien
```
fitrank/
├── index.html            App-Hülle
├── styles.css            dunkles Gaming-Design
├── manifest.webmanifest  PWA
├── sw.js                 Service-Worker
├── vercel.json           Security-Header (CSP, Permissions-Policy)
├── icons/icon.svg
├── db/schema.sql         ⭐ Tabellen + RLS + Anti-Cheat-Trigger
└── js/
    ├── config.js         ⭐ hier Supabase-URL + anon-Key eintragen
    ├── db.js             Supabase-Client + Datenzugriff
    ├── tracker.js        Live-Verifizierung (GPS/Bewegung/Timer)
    ├── avatar.js         geschichteter SVG-RPG-Avatar
    ├── ui.js             Oberfläche (Login, Dashboard, Live-Workout)
    └── app.js            Einstiegspunkt
```

## Einrichtung (Schritt für Schritt)
1. **Supabase-Projekt** kostenlos anlegen: https://supabase.com → „New project".
2. **Schema laden:** Im Supabase-Dashboard → *SQL Editor* → Inhalt von
   `db/schema.sql` einfügen → **Run**. (Legt Tabellen, RLS-Regeln und Trigger an.)
3. **Keys eintragen:** Supabase → *Project Settings → API*. Kopiere „Project URL" und
   „anon public" Key in `js/config.js`. (Beide sind öffentlich/ungefährlich dank RLS.)
4. **Google-Login (optional):** Supabase → *Authentication → Providers → Google* aktivieren.
   Sonst funktioniert E-Mail/Passwort sofort.
5. **Lokal testen:** Wegen ES-Modulen über einen kleinen Server starten (nicht per
   Doppelklick auf die Datei):
   ```bash
   python3 -m http.server 8000
   # dann http://localhost:8000 öffnen
   ```
   > Sensoren (GPS/Bewegung) brauchen **HTTPS** bzw. `localhost`. Auf dem Handy am besten
   > nach dem Deploy testen.

## Deployen (kostenlos)
- Auf [Vercel](https://vercel.com) importieren und als **Root-Verzeichnis** `fitrank`
  wählen → „Deploy". Die `vercel.json` setzt die Security-Header automatisch.

## So testest du, dass es funktioniert
1. **Zwei Konten** anlegen → mit Konto A versuchen, Daten von B zu sehen → unmöglich (RLS).
2. **Live-Workout** starten (Lauf mit GPS oder Kraft mit Bewegung) → beenden →
   Workout ist **„✓ verifiziert"**, XP/Level/Avatar verändern sich.
3. **Manuell** (ohne Bewegung) → bleibt „manuell" und gibt nur ~10 % XP (Anti-Cheat).
4. **Satz mit neuem Höchstgewicht** eintragen → wird automatisch als **🏆 PR** markiert.

## Status & nächste Phasen
- [x] Phase 0: Setup, Schema + RLS + Anti-Cheat-Trigger, App-Hülle
- [x] Phase 1: Auth, verifiziertes Live-Workout, Logbuch/Sätze, PR-Erkennung
- [ ] Phase 2: Avatar-Ausbau (Gear-Unlocks, Quests)
- [ ] Phase 3: Trainingspläne, Kalender, Körperdaten/Charts, Habits/Streaks
- [ ] Phase 4: Freunde, verifizierte Bestenliste, Wochen-Challenges
- [ ] Phase 5: Web-Bluetooth-Pulsmessung
- [ ] Später: native Hülle (Apple Health / Health Connect), Ranked-Seasons, Premium-Kosmetik

## Wichtige Hinweise
- **Gesundheitsdaten** sind sensibel: Vor einem öffentlichen Launch Datenschutzerklärung,
  Einwilligung, Mindestalter und Lösch-Funktion ergänzen (DSGVO).
- Den **`service_role`-Key** von Supabase NIE ins Frontend oder Repo legen.
