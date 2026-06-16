# Sicherheitskonzept

Jarvis ist ein persoenliches Tool (ein Nutzer), aber bewusst defensiv gebaut.
Dieses Dokument beschreibt, wie deine Daten und Keys geschuetzt sind.

## Geheimnisse bleiben am Server
- `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `APP_PASSWORD`, `SESSION_SECRET`,
  `KV_REST_API_*` liegen ausschliesslich als Vercel-Umgebungsvariablen vor.
- Der Browser ruft nur die eigenen Endpunkte unter `/api/*` auf; diese fuegen die
  Keys serverseitig hinzu. Die Keys erscheinen nie im Quelltext, nie im Browser,
  nie auf GitHub (`.gitignore` schuetzt `.env` und `.vercel`).

## Authentifizierung
- Anmeldung ueber `/api/login`: Passwort rein, **signiertes Sitzungs-Token** raus
  (HMAC-SHA256 mit `SESSION_SECRET`, Ablauf nach 7 Tagen). Das Token kann nicht
  gefaelscht werden und enthaelt das Passwort nicht.
- Alle weiteren Endpunkte pruefen das Token (`Authorization: Bearer ...`). Ein
  direkter Passwort-Header wird als Rueckfalloption ebenfalls akzeptiert, immer
  **zeitkonstant** verglichen (`crypto.timingSafeEqual` ueber SHA-256-Hashes),
  damit die Antwortzeit nichts ueber das Passwort verraet.
- Das Token liegt im `sessionStorage` (pro Tab, wird beim Schliessen geloescht).
  Das Passwort wird nie dauerhaft gespeichert.

## Missbrauchsschutz
- **Brute-Force-Sperre:** nach mehreren Fehlversuchen wird die IP kurzzeitig
  gesperrt (`/api/login`).
- **Ratenbegrenzung** pro Endpunkt und IP (Login, Chat, STT, TTS, Suche, State).
  Bevorzugt zentral ueber Upstash Redis; ohne KV als In-Memory-Fallback.
- **Eingabe-Validierung & Groessen-Limits** auf allen Endpunkten (Typ, Laenge,
  Wertebereich; z.B. max. Audio-/State-Groesse), gegen Ueberlastung und Unsinn.

## Zero-Knowledge-Cloud (optional, standardmaessig an)
- Vor dem Hochladen werden die Daten **im Browser** mit AES-256-GCM verschluesselt.
- Der Schluessel wird aus deinem Passwort via **PBKDF2 (150.000 Runden, SHA-256)**
  mit einem zufaelligen Salt abgeleitet und nur im Tab gehalten.
- Der Server (und Upstash) speichern nur den verschluesselten Umschlag plus den
  oeffentlichen Salt und einen Zeitstempel — der Inhalt ist fuer sie unlesbar.
- Der Speicher-Schluessel in der Datenbank haengt an einem Hash des Passworts;
  beim Passwortwechsel entsteht ein neuer Bereich (alte Daten bleiben unlesbar).

## Browser-Haertung (vercel.json)
- **Content-Security-Policy** ohne `unsafe-inline`: nur eigene Skripte/Styles,
  Netzwerk nur zu `self` und `api.open-meteo.com`, `object-src 'none'`,
  `frame-ancestors 'none'`. Es gibt keine Inline-Skripte; Styles laufen ueber
  Klassen bzw. CSSOM.
- **HSTS**, **X-Frame-Options: DENY**, **X-Content-Type-Options: nosniff**,
  **Referrer-Policy: no-referrer**, restriktive **Permissions-Policy**
  (Mikrofon/Standort nur fuer die eigene Seite), `X-Robots-Tag: noindex`,
  `Cache-Control: no-store` fuer `/api/*`.
- Der Service-Worker cacht niemals `/api/*` (keine Auth-Daten im Cache).

## Bekannte Grenzen
- Einzelnutzer-Modell (ein Passwort). Kein Mehrbenutzer-Login.
- XSS-Restrisiko wird durch strenge CSP und konsequentes `textContent`
  (kein `innerHTML` mit Fremddaten) klein gehalten.
- Bei aktiver Verschluesselung kann der Inhalt nach einem Passwortwechsel nicht
  mehr entschluesselt werden (Designentscheidung, kein Hintertuerchen).

## Einen Fund melden
Da dies ein privates Projekt ist: Probleme bitte als GitHub-Issue im Repository
melden. Keine echten Secrets in Issues posten.
