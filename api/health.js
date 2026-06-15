// /api/health — kleiner Test, ob das Backend lebt und ob die
// Server-Variablen gesetzt sind. Zeigt KEINE Keys an, nur ja/nein.
// Aufrufbar im Browser: https://deine-seite.vercel.app/api/health
export default function handler(req, res) {
  res.status(200).json({
    status: "ok",
    name: "JARVIS",
    konfiguriert: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
      voice_id: Boolean(process.env.ELEVENLABS_VOICE_ID),
      passwort: Boolean(process.env.APP_PASSWORD),
    },
  });
}
