// ============================================================
// config.js — Verbindung zu deinem Supabase-Projekt.
// ============================================================
// So füllst du das aus:
//   1. Lege ein kostenloses Projekt auf https://supabase.com an.
//   2. Project Settings -> API -> "Project URL" und "anon public" Key kopieren.
//   3. Hier eintragen. BEIDE Werte sind ÖFFENTLICH und ungefährlich,
//      solange RLS aktiv ist (siehe db/schema.sql). Der geheime
//      "service_role"-Key gehört NIEMALS hierher.
//
// Tipp: Für echtes Deployment kannst du diese Werte auch zur Build-/Deploy-Zeit
// einsetzen. Für den Start reicht es, sie hier direkt einzutragen.
// ============================================================
window.FITRANK_CONFIG = {
  SUPABASE_URL: "DEINE_SUPABASE_URL_HIER",      // z.B. https://abcdxyz.supabase.co
  SUPABASE_ANON_KEY: "DEIN_ANON_KEY_HIER",
};
