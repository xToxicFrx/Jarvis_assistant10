# Jarvis — persoenlicher Planungs-Assistent (Vercel + GitHub)

Ein moderner, sicherer Assistent fuer den Schulalltag. Du redest per Stimme oder
Text mit ChatGPT, und Jarvis haelt dein ganzes Schul- und Alltagsleben an einem
Ort fest — auf einem ruhigen, modernen Dashboard, synchron auf allen Geraeten und
(optional) Ende-zu-Ende verschluesselt.

Laeuft im Browser, gehostet ueber **Vercel**. Reines Vanilla-JavaScript, **keine
Build-Abhaengigkeiten**. API-Keys liegen **nur auf dem Server**.

---

## Was Jarvis kann
- **Mit ChatGPT reden** per Stimme (Whisper) oder Text, Antwort als Stimme (ElevenLabs).
- **Wake-Word "Jarvis"** (Desktop Chrome/Edge).
- **Aufgaben/Todos** mit Datum, Prioritaet und **Wiederholung** (taeglich/woechentlich).
- **Hausaufgaben nach Fach** gruppiert.
- **Stundenplan** fuer die Woche (heute hervorgehoben).
- **Tests/Klassenarbeiten** mit "noch X Tage"-Countdown.
- **Noten** je Fach mit automatischem Durchschnitt + Diagramm.
- **Gewohnheiten** mit Streak und Verlaufs-Punkten.
- **Lern-Timer (Pomodoro)**, der tab-uebergreifend weiterlaeuft, mit eigenen Zeiten.
- **Erinnerungen** mit Browser-Benachrichtigung.
- **Notizen, Termine, Ziele** (mit Fortschritt).
- **Vokabeltrainer** (Karteikarten mit Leitner-Wiederholung).
- **Taschengeld/Budget** (Einnahmen/Ausgaben, Saldo, Monatsuebersicht).
- **Kalender** (Monatsansicht mit allen Eintraegen) und **Statistik** (Fokuszeit/Woche).
- **Tagesbriefing**: Jarvis fasst dir morgens deinen Tag zusammen.
- **Befehlspalette/Suche** (Strg/Cmd+K), Tastenkuerzel, hell/dunkel, Akzentfarben.
- **Planungs-Coach:** Jarvis kennt deinen Stand, analysiert deine Woche und gibt Tipps.
- **Backup**: alle Daten exportieren/wiederherstellen. **PWA**: zum Startbildschirm hinzufuegen.

## Sicherheit (Kurzueberblick — Details in SECURITY.md)
- **Keys nur am Server** (Vercel Environment Variables), nie im Code/Browser.
- **Anmeldung mit Sitzungs-Token** (HMAC-signiert, kurzlebig) statt staendigem Passwortversand.
- **Brute-Force-Schutz** (Sperre nach zu vielen Fehlversuchen) + **Ratenbegrenzung** je Endpunkt.
- **Zeitkonstanter Passwortvergleich** (gegen Timing-Angriffe).
- **Optionale Ende-zu-Ende-Verschluesselung** der Cloud-Daten (AES-256-GCM, Schluessel aus deinem Passwort; der Server sieht nur unleserlichen Inhalt).
- **Strenge Sicherheits-Header** (Content-Security-Policy, HSTS, X-Frame-Options, no-referrer, Permissions-Policy ...).

---

## Einrichten

### 1. Keys besorgen
- **OpenAI:** platform.openai.com -> *API keys* -> Create new secret key (`sk-...`)
- **ElevenLabs:** elevenlabs.io -> Profil -> API Key; eine Voice-ID kopieren.

### 2. Vercel-Projekt
vercel.com -> mit GitHub anmelden -> *Add New -> Project* -> Repo importieren ->
Framework **Other** -> Variablen eintragen (unten) -> **Deploy**.

### 3. Environment Variables (in Vercel)
| Name | Zweck |
|------|------|
| `OPENAI_API_KEY` | Chat + Whisper |
| `ELEVENLABS_API_KEY` | Stimme |
| `ELEVENLABS_VOICE_ID` | gewuenschte Stimme |
| `APP_PASSWORD` | dein Zugangspasswort |
| `SESSION_SECRET` | (optional, empfohlen) zufaelliges Geheimnis fuer Tokens |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | (optional) Cloud-Sync ueber alle Geraete |
| `LLM_MODEL` | (optional) Standard `gpt-4o-mini` |

### 4. Cloud-Sync (optional, empfohlen)
Vercel -> *Storage* -> **KV (Upstash Redis)** anlegen und mit dem Projekt verbinden.
Das setzt `KV_REST_API_URL` und `KV_REST_API_TOKEN` automatisch. Danach neu deployen.
Ohne KV laeuft alles lokal pro Geraet (kein Sync); sobald die Variablen da sind,
schaltet Jarvis automatisch auf Synchronisierung um.

### 5. Benutzen
`…vercel.app` oeffnen (am besten Chrome) -> Passwort eingeben -> per Mikro
(halten) oder Text mit Jarvis reden. Auf dem Handy: *Zum Startbildschirm
hinzufuegen*. Pruefen: `…vercel.app/api/health` zeigt, welche Variablen gesetzt sind.

## Grenzen
- **Benachrichtigungen** und der **Pomodoro** laufen nur, solange der Jarvis-Tab
  offen ist (auch im Hintergrund). Echte Hinweise bei ganz geschlossener App
  braeuchten Web-Push — nicht in dieser Version. Beim naechsten Oeffnen wird der
  Stand korrekt nachgeholt.
- **Wake-Word** ist auf Handys (besonders iPhone/Safari) unzuverlaessig — dort den
  Mikro-Knopf nutzen.

---

## Aufbau
```
index.html              Login + Dashboard + Icon-Sprite (keine Emojis)
style.css               modernes Design (hell/dunkel, Akzentfarben, mobile-first)
manifest.webmanifest    PWA
icons/icon.svg          App-Icon
js/
  constants.js          feste Werte, Standard-Einstellungen
  utils.js              DOM-/Datum-/Datei-Helfer
  crypto.js (Enc)       Ende-zu-Ende-Verschluesselung (AES-GCM, PBKDF2)
  auth.js               Anmeldung, Token, Schluessel
  store.js              EINZIGE Datenquelle + Cloud-Sync + Snapshot fuer die KI
  reminders.js          Erinnerungen planen + Benachrichtigungen
  pomodoro.js           tab-uebergreifender Lern-Timer
  charts.js             kleine SVG-Diagramme
  calendar.js           Monatsansicht
  search.js             globale Suche
  tools.js              Werkzeuge fuer die KI (Function-Calling)
  ui.js                 Dashboard, Karten, Dialoge, Theme, Befehlspalette
  shortcuts.js          Tastenkuerzel + Befehlspalette
  onboarding.js         Begruessung beim ersten Start
  app.js                Steuerung: Login, Agenten-Loop, Stimme, Briefing
api/                    sichere Server-Funktionen (Keys bleiben hier)
  _lib.js               Auth (Token/Passwort), Validatoren, Helfer
  _session.js           signierte Sitzungs-Tokens (HMAC)
  _ratelimit.js         Ratenbegrenzung + Brute-Force-Schutz (KV oder In-Memory)
  login.js              Anmeldung -> Token
  chat.js               Gehirn (OpenAI)
  state.js              Cloud-Sync (Upstash Redis, speichert undurchsichtige Daten)
  stt.js / tts.js       Whisper / ElevenLabs
  search.js             Websuche (DuckDuckGo, kein Key)
  health.js             Status (zeigt nur ja/nein)
test/
  logic.mjs             Logik- + Sicherheits-Tests (node test/logic.mjs)
  dom.mjs               DOM-Rauchtest (npm i -D jsdom && node test/dom.mjs)
```

## Entwickeln / Testen
```
npm test                 # Logik- und Sicherheits-Tests (ohne Abhaengigkeiten)
npx vercel dev           # lokal mit /api/* (Variablen aus .env / vercel env pull)
```
Es gibt keinen Build-Schritt. Browser-Code laeuft als klassische Skripte in fester
Reihenfolge (siehe `index.html`).
