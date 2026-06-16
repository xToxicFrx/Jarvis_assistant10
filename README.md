# Jarvis — persoenlicher Planungs-Assistent (Vercel + GitHub)

Ein moderner Assistent fuer den Schulalltag. Du redest per Stimme oder Text
mit ChatGPT, und Jarvis haelt deine **Aufgaben, Hausaufgaben (nach Fach),
deinen Stundenplan und Erinnerungen** an einem Ort fest — immer sichtbar auf
einem ruhigen, modernen Dashboard. Laeuft im Browser, gehostet ueber **Vercel**.

Die API-Keys liegen **sicher auf dem Server** — niemals im Code, niemals im Browser.

---

## Wie die Sicherheit funktioniert

1. **Keys nur als Server-Geheimnisse:** OpenAI- und ElevenLabs-Keys liegen als
   *Environment Variables* bei Vercel. Sie stehen nie im Code und kommen nie auf
   GitHub (`.gitignore` schuetzt `.env`).
2. **Der Browser sieht die Keys nie:** Die Seite ruft nur deine eigenen Funktionen
   `/api/chat`, `/api/tts`, `/api/stt`, `/api/state`. Diese fuegen den Key
   serverseitig hinzu.
3. **Persoenliches Passwort:** Jede Funktion ist mit deinem `APP_PASSWORD`
   geschuetzt. Nur du kannst Jarvis benutzen.
4. **Backstop:** Setz im OpenAI-Dashboard ein Ausgabenlimit.

---

## Einrichten (einmalig)

### Schritt 1 — Keys besorgen
- **OpenAI:** platform.openai.com -> *API keys* -> *Create new secret key* (`sk-...`)
- **ElevenLabs:** elevenlabs.io -> Profil -> *API Key*
- **Voice-ID:** elevenlabs.io -> *Voices* -> ID kopieren (Standard: `MMwckqU477oQxnAk1SgA`)

### Schritt 2 — Vercel verbinden
1. vercel.com -> mit GitHub anmelden
2. *Add New… -> Project* -> Repo `Jarvis_assistant10` -> *Import*
3. Framework: **Other** (nichts aendern)
4. Erst die Variablen eintragen (unten), dann **Deploy**.

### Schritt 3 — Variablen bei Vercel eintragen
Unter *Settings -> Environment Variables*:

| Name | Wert |
|------|------|
| `OPENAI_API_KEY` | dein OpenAI-Key |
| `ELEVENLABS_API_KEY` | dein ElevenLabs-Key |
| `ELEVENLABS_VOICE_ID` | `MMwckqU477oQxnAk1SgA` |
| `APP_PASSWORD` | ein Passwort, das du dir ausdenkst |

### Schritt 4 (optional, empfohlen) — Cloud-Sync ueber alle Geraete
Damit Handy und Laptop dieselben Aufgaben zeigen:
1. Vercel -> *Storage* -> neue **KV (Upstash Redis)** anlegen und mit dem Projekt
   verbinden. Das setzt automatisch `KV_REST_API_URL` und `KV_REST_API_TOKEN`.
2. Neu deployen.

Ohne diesen Schritt funktioniert alles trotzdem — die Daten liegen dann nur
**lokal auf dem jeweiligen Geraet** (kein Sync). Sobald die beiden Variablen
gesetzt sind, schaltet Jarvis automatisch auf Synchronisierung um.

### Schritt 5 — Benutzen
1. Oeffne deine `…vercel.app`-Adresse (am besten **Chrome**)
2. Gib dein `APP_PASSWORD` ein
3. Mikro-Knopf (oder Leertaste) halten und sprechen — oder Text tippen
4. Auf dem Handy: ueber das Browser-Menue *Zum Startbildschirm hinzufuegen* —
   dann startet Jarvis wie eine App.

> Test: `…vercel.app/api/health` zeigt, ob die Variablen gesetzt sind (nur ja/nein).

---

## Was Jarvis kann
- **Reden mit ChatGPT** per Stimme (Whisper) oder Text, Antwort als Stimme (ElevenLabs).
- **Wake-Word "Jarvis"** (Desktop Chrome/Edge): sag "Jarvis ...", er hoert zu.
- **Aufgaben/Todos** mit Faelligkeitsdatum und Prioritaet.
- **Hausaufgaben nach Fach** gruppiert.
- **Stundenplan** fuer die Woche (heute hervorgehoben).
- **Erinnerungen** mit Browser-Benachrichtigung.
- **Planungs-Coach:** Jarvis kennt deinen aktuellen Stand, analysiert deine Woche
  und gibt Tipps ("Was soll ich zuerst machen?", "Analysiere meine Woche").
- Alles ist auch per Hand eintragbar und immer auf dem Dashboard sichtbar.
- Hell/Dunkel-Design, handytauglich, ohne Emojis.

## Grenzen
- **Benachrichtigungen** funktionieren nur, solange die App (der Tab) offen ist.
  Echte Hinweise bei geschlossener App braeuchten Web-Push — nicht in dieser Version.
- **Wake-Word** ist auf Handys (besonders iPhone/Safari) unzuverlaessig. Dort lieber
  den Mikro-Knopf zum Sprechen nutzen.

---

## Aufbau
```
index.html        Login + Dashboard + Icon-Sprite (keine Emojis)
style.css         modernes Design (hell/dunkel, mobile-first)
manifest.webmanifest  PWA (Add-to-Home-Screen)
icons/icon.svg    App-Icon
js/
  store.js        einzige Datenquelle: lokal + Cloud-Sync, Schnappschuss fuer die KI
  reminders.js    Erinnerungen planen + Benachrichtigungen
  tools.js        Werkzeuge: Aufgaben/Hausaufgaben/Stundenplan/Erinnerung, Wetter, Suche, Timer
  ui.js           Dashboard, Dialoge, Toasts, Theme
  app.js          Login, Agenten-Loop, Stimme (STT/TTS), Wake-Word
  obsidian.js     (optional, derzeit nicht eingebunden)
api/              sichere Server-Funktionen (Keys bleiben hier)
  _lib.js         Passwort-Pruefung
  chat.js         Gehirn (OpenAI, mit Function-Calling)
  state.js        Cloud-Sync (Upstash Redis ueber REST)
  search.js       Websuche (DuckDuckGo, kein Key)
  tts.js          Stimme raus (ElevenLabs)
  stt.js          Stimme rein (Whisper)
  health.js       Test
```

## Lokal testen
Mit der Vercel-CLI (liefert statische Dateien UND die `/api/*`-Funktionen):
```
npx vercel dev
```
Variablen vorher per `vercel env pull .env.local` holen oder in `.env` setzen.
Ohne gesetzte KV-Variablen laeuft die App im lokalen Modus (ohne Sync).
