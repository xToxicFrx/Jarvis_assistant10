// ============================================================
// coach — Supabase Edge Function (Deno): KI-Trainings-Coach (OpenAI).
// ============================================================
// Sicherheit:
//   * OpenAI-Key bleibt SERVERSEITIG (Deno.env, niemals im Browser).
//   * Liest nur die EIGENEN Daten des Nutzers: Wir erstellen den Supabase-
//     Client mit dem JWT des Aufrufers -> RLS greift automatisch.
//   * Tageslimit gegen ausufernde OpenAI-Kosten (AI_DAILY_CAP).
//
// Deploy:  supabase functions deploy coach
// Secrets: supabase secrets set OPENAI_API_KEY=sk-...
//          (optional) OPENAI_MODEL=gpt-4o-mini  AI_DAILY_CAP=5
// (SUPABASE_URL / SUPABASE_ANON_KEY werden von Supabase automatisch gesetzt.)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const SYSTEM =
  "Du bist ein motivierender, kompetenter Fitness-Coach. Antworte auf Deutsch, " +
  "kurz (höchstens 6 Sätze), konkret und ermutigend. Gib 2–3 umsetzbare Tipps, " +
  "die direkt auf den Trainingsdaten basieren. Keine medizinischen Diagnosen; " +
  "bei Schmerzen oder Beschwerden rate, eine Ärztin/einen Arzt aufzusuchen.";

function buildSummary(profile: any, workouts: any[]): string {
  const stats = profile?.stats || {};
  const byType: Record<string, number> = {};
  let verifiedMin = 0;
  for (const w of workouts) {
    byType[w.type] = (byType[w.type] || 0) + 1;
    if (w.verified) verifiedMin += w.duration_min || 0;
  }
  const typeStr = Object.entries(byType).map(([t, n]) => `${t}: ${n}`).join(", ") || "keine";
  return [
    `Level: ${profile?.level ?? 1}, XP: ${profile?.xp ?? 0}.`,
    `Stats — Kraft ${stats.strength || 0}, Ausdauer ${stats.endurance || 0}, Speed ${stats.speed || 0}, Disziplin ${stats.discipline || 0}.`,
    `Letzte ${workouts.length} Workouts nach Art: ${typeStr}.`,
    `Verifizierte Minuten (letzte Workouts): ${verifiedMin}.`,
    `Bitte gib mir Feedback und einen Fokus für die nächste Woche.`,
  ].join(" ");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST." }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Nicht angemeldet." }, 401);

    // --- Tageslimit (Kostenschutz) ---
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("ai_requests")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since.toISOString());
    const cap = Number(Deno.env.get("AI_DAILY_CAP") || "5");
    if ((count ?? 0) >= cap) {
      return json({ error: `Tageslimit erreicht (${cap} Coach-Anfragen). Morgen wieder!` }, 429);
    }

    // --- Eigene Daten holen (RLS sorgt für die Abschottung) ---
    const { data: profile } = await supabase
      .from("profiles").select("level, xp, stats").eq("id", user.id).single();
    const { data: workouts } = await supabase
      .from("workouts").select("type, duration_min, verified, distance_m, ended_at")
      .eq("completed", true).order("ended_at", { ascending: false }).limit(20);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "KI ist noch nicht konfiguriert (OPENAI_API_KEY fehlt)." }, 500);

    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 350,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: buildSummary(profile, workouts || []) },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return json({ error: "KI-Dienst-Fehler: " + t.slice(0, 200) }, 502);
    }
    const data = await res.json();
    const advice = data?.choices?.[0]?.message?.content?.trim() || "Kein Rat erhalten.";

    // Nutzung protokollieren (zählt fürs Tageslimit, speichert den Tipp).
    await supabase.from("ai_requests").insert({ user_id: user.id, advice });

    return json({ advice });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
