# JARVIS — sicherer KI-Sprachassistent (Vercel + GitHub)

Ein sprachgesteuerter KI-Assistent im Iron-Man-HUD-Stil. Läuft im Browser,
gehostet über **Vercel**, verbunden mit **GitHub**. Die API-Keys liegen
**sicher auf dem Server** — niemals im Code, niemals im Browser.

---

## 🔒 Wie die Sicherheit funktioniert

1. **Keys nur als Server-Geheimnisse:** Deine OpenAI- und ElevenLabs-Keys
   speicherst du als *Environment Variables* bei Vercel. Sie stehen nie im
   Code und kommen nie auf GitHub (`.gitignore` schützt `.env`).
2. **Der Browser sieht die Keys nie:** Die Webseite ruft nur **deine eigenen**
   Funktionen `/api/chat`, `/api/tts`, `/api/stt`. Diese fügen den Key
   serverseitig hinzu und sprechen mit OpenAI/ElevenLabs.
3. **Persönliches Passwort:** Jede Funktion ist mit deinem `APP_PASSWORD`
   geschützt. Die Seite ist zwar im Internet, aber nur **du** kannst JARVIS
   benutzen — niemand sonst kann deine Rechnung belasten.
4. **Backstop:** Setz im OpenAI-Dashboard ein **Ausgabenlimit**.

---

## 🚀 Einrichten (einmalig, ~10 Minuten)

### Schritt 1 — Keys besorgen
- **OpenAI:** platform.openai.com → *API keys* → *Create new secret key* (`sk-...`)
- **ElevenLabs:** elevenlabs.io → Profil → *API Key*
- **Voice-ID:** elevenlabs.io → *Voices* → bei einer Stimme die ID kopieren
  (Standard ist schon `MMwckqU477oQxnAk1SgA`)

### Schritt 2 — Code auf GitHub
Der Code liegt in deinem Repo `Jarvis_assistant10`. Wenn Dateien fehlen:
GitHub → **Add file → Upload files** → Dateien reinziehen → **Commit**.

### Schritt 3 — Vercel verbinden
1. **vercel.com** → mit **GitHub** anmelden
2. **Add New… → Project** → Repo `Jarvis_assistant10` → **Import**
3. Framework: **Other** (nichts ändern)
4. **NOCH NICHT auf Deploy klicken!** Erst die Keys eintragen ⬇️

### Schritt 4 — Geheime Keys bei Vercel eintragen 🔑
Im Import-Bildschirm (oder später unter **Settings → Environment Variables**)
trag diese **4 Variablen** ein:

| Name | Wert |
|------|------|
| `OPENAI_API_KEY` | dein OpenAI-Key |
| `ELEVENLABS_API_KEY` | dein ElevenLabs-Key |
| `ELEVENLABS_VOICE_ID` | `MMwckqU477oQxnAk1SgA` |
| `APP_PASSWORD` | ein Passwort, das du dir ausdenkst |

Dann **Deploy** klicken.

### Schritt 5 — Benutzen
1. Öffne deine `…vercel.app`-Adresse in **Chrome**
2. Gib dein `APP_PASSWORD` ein
3. 🎤 Mikro-Knopf (oder Leertaste) halten und sprechen — oder Text tippen
4. JARVIS antwortet mit Stimme ✨

> Test: `…vercel.app/api/health` zeigt, ob alle 4 Variablen gesetzt sind
> (nur ja/nein, keine Keys werden angezeigt).

---

## 🧠 Wie JARVIS "denkt" (Function-Calling)

JARVIS bekommt vom KI-Modell eine Liste von **Werkzeugen**. Das Modell
entscheidet selbst, ob es direkt antwortet oder erst ein Werkzeug benutzt
(z.B. Wetter holen, Notizen durchsuchen). Der Browser führt das Werkzeug aus,
schickt das Ergebnis zurück, und das Modell antwortet damit. So bleibt alles
sicher (Keys am Server) und JARVIS kann echte Aktionen ausführen.

Rechts im HUD zeigt das **Aktivitäts-Log** live, was gerade passiert.

## 🧭 Decision Engine — „Was soll ich jetzt tun?"

Manchmal ist die schwerste Frage nicht *wie*, sondern *was überhaupt*. Dafür
gibt es die **Decision Engine** (Knopf `🧭 ENTSCHEIDEN` oder `Strg+D`, oder
sag einfach „Jarvis, was soll ich jetzt tun?").

So funktioniert sie:

1. **Erfassen** — du gibst in drei Klicks an: Energie-Level, freie Zeit und
   Stimmung/Fokus (plus optional ein freier Hinweis).
2. **Analysieren** — JARVIS bewertet jede mögliche Aktivität anhand von sechs
   Faktoren: **Energie-Match, Zeit-Fit, Tageszeit, Stimmung, Priorität und
   Wetter**. Mit dabei: ein kuratierter Aktivitäten-Pool *und* deine echten
   **offenen Aufgaben** aus dem Obsidian-Vault (`- [ ]`). Aufgaben mit Frist
   („bis morgen") werden nach oben geholt.
3. **Ergebnis** — die Top-Empfehlung mit **Confidence-Ring**, einer
   nachvollziehbaren **Faktor-Aufschlüsselung** (warum genau das?) und
   anklickbaren Alternativen. Mit `▶ LOS GEHT'S` startet direkt ein
   Fokus-Timer, `💾 NOTIEREN` schreibt die Entscheidung in deine Daily Note.

Das Besondere: Die Engine rät nicht zufällig, sondern **erklärt jede
Empfehlung** – deterministisch, transparent und ganz ohne zusätzlichen Key.

## 📁 Aufbau
```
index.html        HUD + Login
style.css         Aussehen
js/
  voice-viz.js       Arc-Reaktor-Visualizer (Mitte)
  hud-fx.js          animierter Hintergrund (Gitter/Radar/Partikel) + Gauges
  obsidian.js        Vault: suchen, lesen, Statistik, schreiben, offene Aufgaben
  decision-engine.js erklärbare Scoring-Engine ("Was soll ich jetzt tun?")
  decision-ui.js     HUD-Overlay der Decision Engine (Erfassen → Analyse → Ergebnis)
  tools.js           12 Werkzeuge (Wetter, Suche, Notizen, Timer, Decision Engine …)
  app.js             Login, Agenten-Loop, Mikro, Wake-Word, Gedächtnis, Vault-Panel
api/              SICHERE Server-Funktionen (Keys bleiben hier)
  _lib.js         Passwort-Prüfung
  chat.js         Gehirn (OpenAI, mit Function-Calling)
  search.js       Websuche (DuckDuckGo, kein Key)
  tts.js          Stimme raus (ElevenLabs)
  stt.js          Stimme rein (Whisper)
  health.js       Test
```

## Funktionen
- [x] Sicheres Hosting, Text + Sprache (Keys serverseitig + Passwort)
- [x] Persönlichkeit (JARVIS kennt dich)
- [x] **Timer & Erinnerungen** — "Erinner mich in 5 Minuten"
- [x] **Wetter-Vorhersage** — "Wie ist das Wetter morgen?" (Open-Meteo, kein Key)
- [x] **Obsidian-Notizen** — "Was steht in meinen Notizen über X?" (Browser fragt
      einmal nach deinem Vault-Ordner; nur Chrome/Edge)
- [x] **Wake-Word „Jarvis"** — Knopf 👂 anschalten, dann "Jarvis …" sagen.
      Nutzt die eingebaute Chrome-Spracherkennung — **kein zusätzlicher Key nötig!**
- [x] **Decision Engine** — „Was soll ich jetzt tun?" (`🧭`/`Strg+D`). Erklärbare
      Empfehlung aus Energie, Zeit, Stimmung, Tageszeit, Wetter & offenen Aufgaben.

## Brauche ich neue Keys?
Nein! Es bleiben dieselben 4 Vercel-Variablen wie vorher
(`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `APP_PASSWORD`).
Das Wake-Word läuft ohne extra Key.
