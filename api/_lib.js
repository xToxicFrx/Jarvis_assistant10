// ============================================================
// Gemeinsame Helfer für alle API-Funktionen.
// (Dateien mit "_" am Anfang sind KEINE eigene Internetadresse,
//  sondern nur Hilfscode, den die anderen Funktionen importieren.)
// ============================================================

// Prüft das persönliche Zugangspasswort.
// Nur wer das richtige Passwort mitschickt, darf die Funktionen nutzen.
// Das echte Passwort steht NUR auf dem Server (Vercel-Umgebungsvariable
// APP_PASSWORD) — niemals im Code oder im Browser.
export function checkAuth(req, res) {
  const expected = process.env.APP_PASSWORD;

  // Sicherheit: Wenn gar kein Passwort gesetzt ist, alles blockieren,
  // damit die Seite nicht aus Versehen offen für jeden ist.
  if (!expected) {
    res.status(500).json({ error: "Server ist nicht eingerichtet: APP_PASSWORD fehlt." });
    return false;
  }

  const given = req.headers["x-app-password"];
  if (given !== expected) {
    res.status(401).json({ error: "Falsches oder fehlendes Passwort." });
    return false;
  }
  return true;
}
