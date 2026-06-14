// Kleine Vercel-Funktion zum Testen, dass das Backend lebt.
// Aufrufbar unter: https://deine-seite.vercel.app/api/health
export default function handler(req, res) {
  res.status(200).json({ status: "ok", name: "JARVIS", phase: 1 });
}
