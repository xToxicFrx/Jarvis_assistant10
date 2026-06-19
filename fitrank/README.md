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
├── db/
│   ├── schema.sql        ⭐ Tabellen + RLS + Anti-Cheat-Trigger (Phase 0/1)
│   ├── migration_phase3.sql      Trainingspläne (Phase 3)
│   └── migration_phase_ai.sql    KI-Coach-Protokoll/Tageslimit
├── supabase/functions/coach/index.ts   KI-Coach (Edge Function, OpenAI)
└── js/
    ├── config.js         ⭐ hier Supabase-URL + anon-Key eintragen
    ├── db.js             Supabase-Client + Datenzugriff
    ├── tracker.js        Live-Verifizierung (GPS/Bewegung/Timer)
    ├── avatar.js         SVG-RPG-Avatar + Gear-System
    ├── leveling.js       XP/Level-Kurve (Client, = Server-SQL)
    ├── quests.js         tägliche/wöchentliche Ziele aus echten Daten
    ├── streaks.js        Habit-Streak-Berechnung
    ├── charts.js         SVG-Charts (Gewicht, Wochen-Volumen)
    ├── ui.js             Oberfläche (Nav + alle Views + Live-Workout)
    └── app.js            Einstiegspunkt
```

## Einrichtung (Schritt für Schritt)
1. **Supabase-Projekt** kostenlos anlegen: https://supabase.com → „New project".
2. **Schema laden:** Im Supabase-Dashboard → *SQL Editor* → zuerst Inhalt von
   `db/schema.sql` einfügen → **Run**, dann `db/migration_phase3.sql` → **Run**.
   (Legt Tabellen, RLS-Regeln und Trigger an.)
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

## KI-Coach (OpenAI) einrichten — optional
Der Coach analysiert deine verifizierten Workouts und gibt Tipps. Der OpenAI-Key
bleibt dabei **serverseitig** in einer Supabase Edge Function.

1. **Tabelle anlegen:** `db/migration_phase_ai.sql` im SQL-Editor ausführen.
2. **Supabase CLI** installieren und einloggen (`npm i -g supabase`, `supabase login`,
   `supabase link --project-ref DEIN_REF`).
3. **OpenAI-Key als Secret setzen** (kommt NICHT ins Repo):
   ```bash
   supabase secrets set OPENAI_API_KEY=sk-...
   # optional:
   supabase secrets set OPENAI_MODEL=gpt-4o-mini AI_DAILY_CAP=5
   ```
4. **Funktion deployen:**
   ```bash
   supabase functions deploy coach
   ```
5. Im Dashboard erscheint der Coach unter „Home → Dein KI-Coach". Ohne diese Schritte
   zeigt der Button einfach eine Hinweis-Meldung — die App funktioniert trotzdem.

> 💸 OpenAI kostet pro Anfrage. Das Tageslimit (`AI_DAILY_CAP`) schützt vor Überraschungen.
> Ideal als späteres **Premium-Feature**.

## So testest du, dass es funktioniert
1. **Zwei Konten** anlegen → mit Konto A versuchen, Daten von B zu sehen → unmöglich (RLS).
2. **Live-Workout** starten (Lauf mit GPS oder Kraft mit Bewegung) → beenden →
   Workout ist **„✓ verifiziert"**, XP/Level/Avatar verändern sich.
3. **Manuell** (ohne Bewegung) → bleibt „manuell" und gibt nur ~10 % XP (Anti-Cheat).
4. **Satz mit neuem Höchstgewicht** eintragen → wird automatisch als **🏆 PR** markiert.

## Status & nächste Phasen
- [x] Phase 0: Setup, Schema + RLS + Anti-Cheat-Trigger, App-Hülle
- [x] Phase 1: Auth, verifiziertes Live-Workout, Logbuch/Sätze, PR-Erkennung
- [x] Phase 2: Avatar-Gear (level-freigeschaltet, an-/ablegbar) + Quests
- [x] Phase 3: Trainingspläne, Wochen-Volumen, Körpergewicht-Chart, Habits/Streaks
- [x] KI-Coach (OpenAI) via sicherer Edge Function + Tageslimit
- [ ] Phase 4: Freunde, verifizierte Bestenliste, Wochen-Challenges
- [ ] Phase 5: Web-Bluetooth-Pulsmessung
- [ ] Strava-/Garmin-Import (OAuth) für echte Geräte-Daten
- [ ] Später: native Hülle (Apple Health / Health Connect), Ranked-Seasons, Premium-Kosmetik

## Wichtige Hinweise
- **Gesundheitsdaten** sind sensibel: Vor einem öffentlichen Launch Datenschutzerklärung,
  Einwilligung, Mindestalter und Lösch-Funktion ergänzen (DSGVO).
- Den **`service_role`-Key** von Supabase NIE ins Frontend oder Repo legen.
