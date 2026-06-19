# 🍅 Pomodoro / Study Discord-Bot (Portfolio)

Ein Discord-Bot für **gemeinsame Fokus-Sessions**. Mehrere Leute starten zusammen
eine Pomodoro-Runde, sammeln Fokusminuten, halten eine Tages-Streak und messen sich
in einer Bestenliste. Ideal für „Study-with-me"- und Lern-Server.

> Gebaut als **Portfolio-Beispiel** für Discord-Bot-Aufträge — und gleichzeitig als
> Grundgerüst für ein eigenes Produkt (Premium-Bot in Lern-/Gaming-Communities).

## Features
- `/pomodoro [arbeit] [pause] [runden]` — startet eine Session (Standard: 25/5, 4 Runden)
- **Beitreten-/Verlassen-Buttons** — alle Teilnehmer:innen sammeln gemeinsam Minuten
- Automatische Ansagen für Fokus- und Pausenphasen
- `/stats [nutzer]` — Fokuszeit, Anzahl Sessions, Streak 🔥
- `/leaderboard` — Top 10 des Servers mit Medaillen
- `/stop` — laufende Session beenden
- Daten werden lokal in `data.json` gespeichert (einfach austauschbar gegen echte DB)

## Technik
- **Node.js + discord.js v14**, ES-Module
- Saubere Struktur: Bot-Logik (`index.js`), Daten-Layer (`store.js`),
  Command-Registrierung (`deploy-commands.js`)
- Keine externen Services nötig (für ein echtes Produkt: DB + Hosting ergänzen)

## Setup (Schritt für Schritt)
1. **Abhängigkeiten installieren:**
   ```bash
   npm install
   ```
2. **Bot anlegen** im [Discord Developer Portal](https://discord.com/developers/applications)
   → „New Application" → Tab **Bot** → Token erzeugen.
3. **`.env` anlegen** (Vorlage kopieren) und Werte eintragen:
   ```bash
   cp .env.example .env
   ```
   `DISCORD_TOKEN`, `CLIENT_ID` (= Application ID) und zum Testen `GUILD_ID` setzen.
4. **Befehle registrieren:**
   ```bash
   npm run deploy
   ```
5. **Bot starten:**
   ```bash
   npm start
   ```
6. **Bot einladen:** Im Developer Portal unter „OAuth2 → URL Generator“
   Scopes `bot` + `applications.commands` wählen, Link öffnen, Server auswählen.

## So wird daraus ein bezahltes Produkt (Spur B)
- **Premium-Tier:** mehr gleichzeitige Sessions, längere Streaks-Historie,
  Server-Statistiken, eigenes Branding → via Stripe/Patreon (~3–8 €/Monat).
- **Verbreitung:** Eintrag auf Bot-Listen (z.B. top.gg) + Vorstellung in Study-Servern.
- **Skalierung:** `store.js` von JSON auf eine echte DB (z.B. Redis/Postgres) umstellen —
  die Funktionen `addFocus`, `getStats`, `leaderboard` bleiben gleich.

## Datenschutz / Sicherheit
- Token niemals committen — `.env` und `data.json` sind in `.gitignore`.
- Der Bot nutzt nur das `Guilds`-Intent (keine Nachrichten-Inhalte) — minimaler Zugriff.
