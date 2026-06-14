# JARVIS — KI-Sprachassistent (Web-Version)

Ein sprachgesteuerter KI-Assistent im Iron-Man-HUD-Stil, der **komplett im
Browser** läuft und über **Vercel** gehostet wird. Kein Python, keine
Installation.

## So bringst du JARVIS online (einmalig, ca. 5 Minuten)

### 1. Auf GitHub speichern
Der Code liegt schon in deinem GitHub-Repo `Jarvis_assistant10`. ✅

### 2. Mit Vercel verbinden
1. Geh auf **https://vercel.com** und melde dich mit **GitHub** an.
2. Klick **"Add New… → Project"**.
3. Wähl dein Repo **`Jarvis_assistant10`** aus → **Import**.
4. Bei "Framework Preset" einfach **"Other"** lassen, nichts ändern.
5. Klick **Deploy**.
6. Nach ~1 Minute bekommst du eine Adresse wie **`jarvis-xxx.vercel.app`**.

Das war's — öffne die Adresse und du siehst das HUD! 🎉

### 3. (Später) API-Keys hinzufügen
Sobald wir Stimme & Gehirn einbauen, brauchst du Keys. Die kommen in Vercel
unter **Settings → Environment Variables** (siehe `.env.example`):

| Variable | Wofür | Wo bekommen |
|----------|-------|-------------|
| `OPENAI_API_KEY` | Gehirn + Whisper | platform.openai.com |
| `ELEVENLABS_API_KEY` | Stimme | elevenlabs.io |
| `ELEVENLABS_VOICE_ID` | welche Stimme | elevenlabs.io |
| `PICOVOICE_ACCESS_KEY` | Wake-Word „Jarvis" | console.picovoice.ai |

⚠️ **Keys NIEMALS in den Code schreiben** — nur in Vercel eintragen. Setz im
OpenAI-Dashboard ein Ausgabenlimit. ElevenLabs hat einen Gratis-Tier.

## Wichtig zu wissen
- Vercel hostet nur die **Webseite**. Mikrofon, Lautsprecher und der Zugriff
  auf deinen **Obsidian-Ordner** passieren in **deinem Browser** auf deinem PC.
- **Benutze Chrome oder Edge** — der Obsidian-Ordnerzugriff (später) geht nur dort.

## Aufbau
```
index.html        Das HUD-Dashboard
style.css         Aussehen (dunkel, cyan, Iron-Man-Stil)
js/
  voice-viz.js    Der leuchtende Kreis in der Mitte
  hud.js          Uhr, Wetter, Systeminfo, Status
  main.js         Startet alles & verbindet später die Sprache
api/
  health.js       Test-Funktion (später: chat, tts, stt)
```

## Schritte (Phasen)
- [x] **Schritt 1** — HUD-Dashboard, live auf Vercel (kein Key nötig)
- [ ] Schritt 2 — Gehirn (Text-Chat) + Obsidian-Zugriff
- [ ] Schritt 3 — Stimme raus (ElevenLabs)
- [ ] Schritt 4 — Stimme rein (Mikrofon + Whisper)
- [ ] Schritt 5 — Wake-Word „Jarvis"
