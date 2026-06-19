// ============================================================
// db.js — Supabase-Client + Datenzugriffs-Schicht.
// ============================================================
// Lädt den offiziellen supabase-js-Client per ESM-CDN (kein Build-Schritt).
// Alle Datenbank-Zugriffe laufen über die exportierten Funktionen, damit der
// Rest der App nichts über Supabase-Interna wissen muss.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.FITRANK_CONFIG || {};
const configured =
  cfg.SUPABASE_URL && !cfg.SUPABASE_URL.startsWith("DEINE_") &&
  cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.startsWith("DEIN_");

export const isConfigured = configured;

export const supabase = configured
  ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

// ---------- Auth ----------
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}
export function onAuthChange(cb) {
  return supabase.auth.onAuthStateChange((_e, session) => cb(session));
}
export async function signUp(email, password) {
  return supabase.auth.signUp({ email, password });
}
export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}
export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.origin + location.pathname },
  });
}
export async function signOut() {
  return supabase.auth.signOut();
}

// ---------- Profil ----------
export async function getMyProfile(userId) {
  const { data, error } = await supabase
    .from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}
export async function updateProfile(userId, patch) {
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) throw error;
}

// ---------- Übungen ----------
export async function listExercises() {
  const { data, error } = await supabase
    .from("exercises").select("*").order("name");
  if (error) throw error;
  return data;
}
export async function addExercise(userId, name, muscleGroup) {
  const { data, error } = await supabase
    .from("exercises")
    .insert({ owner_id: userId, name, muscle_group: muscleGroup })
    .select().single();
  if (error) throw error;
  return data;
}

// ---------- Workouts ----------
export async function startWorkout(userId, type, source) {
  const { data, error } = await supabase
    .from("workouts")
    .insert({ user_id: userId, type, source, started_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}
export async function addSet(userId, workoutId, exerciseId, reps, weight) {
  const { data, error } = await supabase
    .from("workout_sets")
    .insert({ user_id: userId, workout_id: workoutId, exercise_id: exerciseId, reps, weight })
    .select().single();
  if (error) throw error;
  return data; // enthält server-berechnetes is_pr
}
export async function finishWorkout(workoutId, distanceM) {
  // completed=true -> Server berechnet Dauer, Verifizierung und XP (Trigger).
  const patch = { completed: true, ended_at: new Date().toISOString() };
  if (distanceM != null) patch.distance_m = Math.round(distanceM);
  const { data, error } = await supabase
    .from("workouts").update(patch).eq("id", workoutId).select().single();
  if (error) throw error;
  return data;
}
export async function recentWorkouts(userId, limit = 20) {
  const { data, error } = await supabase
    .from("workouts").select("*")
    .eq("user_id", userId).eq("completed", true)
    .order("ended_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}
export async function workoutSets(workoutId) {
  const { data, error } = await supabase
    .from("workout_sets").select("*, exercises(name)")
    .eq("workout_id", workoutId).order("created_at");
  if (error) throw error;
  return data;
}

// ---------- Trainingspläne (Routinen) ----------
export async function listRoutines(userId) {
  const { data, error } = await supabase
    .from("routines").select("*").eq("user_id", userId).order("created_at");
  if (error) throw error;
  return data;
}
export async function createRoutine(userId, name) {
  const { data, error } = await supabase
    .from("routines").insert({ user_id: userId, name }).select().single();
  if (error) throw error;
  return data;
}
export async function deleteRoutine(id) {
  const { error } = await supabase.from("routines").delete().eq("id", id);
  if (error) throw error;
}
export async function listRoutineExercises(routineId) {
  const { data, error } = await supabase
    .from("routine_exercises").select("*, exercises(name, muscle_group)")
    .eq("routine_id", routineId).order("position");
  if (error) throw error;
  return data;
}
export async function addRoutineExercise(userId, routineId, exerciseId, targetSets, targetReps, position) {
  const { data, error } = await supabase.from("routine_exercises")
    .insert({ user_id: userId, routine_id: routineId, exercise_id: exerciseId, target_sets: targetSets, target_reps: targetReps, position })
    .select().single();
  if (error) throw error;
  return data;
}
export async function removeRoutineExercise(id) {
  const { error } = await supabase.from("routine_exercises").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Körperdaten ----------
export async function addBodyMetric(userId, date, weight) {
  const { error } = await supabase.from("body_metrics")
    .upsert({ user_id: userId, date, weight }, { onConflict: "user_id,date" });
  if (error) throw error;
}
export async function listBodyMetrics(userId, limit = 60) {
  const { data, error } = await supabase.from("body_metrics")
    .select("*").eq("user_id", userId).order("date", { ascending: true }).limit(limit);
  if (error) throw error;
  return data;
}

// ---------- Habits ----------
export async function listHabits(userId) {
  const { data, error } = await supabase.from("habits")
    .select("*").eq("user_id", userId).order("created_at");
  if (error) throw error;
  return data;
}
export async function createHabit(userId, name, icon) {
  const { data, error } = await supabase.from("habits")
    .insert({ user_id: userId, name, icon }).select().single();
  if (error) throw error;
  return data;
}
export async function deleteHabit(id) {
  const { error } = await supabase.from("habits").delete().eq("id", id);
  if (error) throw error;
}
export async function listHabitLogs(userId, sinceDate) {
  const { data, error } = await supabase.from("habit_logs")
    .select("habit_id, date").eq("user_id", userId).gte("date", sinceDate);
  if (error) throw error;
  return data;
}
export async function logHabit(userId, habitId, date) {
  const { error } = await supabase.from("habit_logs")
    .upsert({ user_id: userId, habit_id: habitId, date }, { onConflict: "habit_id,date" });
  if (error) throw error;
}
export async function unlogHabit(habitId, date) {
  const { error } = await supabase.from("habit_logs")
    .delete().eq("habit_id", habitId).eq("date", date);
  if (error) throw error;
}

// ---------- KI-Coach (Edge Function) ----------
export async function getCoachAdvice() {
  const { data, error } = await supabase.functions.invoke("coach", { body: {} });
  if (error) {
    let msg = error.message || "Coach nicht erreichbar.";
    // Unsere JSON-Fehlermeldung aus der Funktion herausziehen, falls vorhanden.
    try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return data; // { advice }
}

// ---------- Freunde ----------
export async function findUserByUsername(username) {
  const { data, error } = await supabase.rpc("find_user_by_username", { p_username: username });
  if (error) throw error;
  return (data && data[0]) || null;
}
export async function sendFriendRequest(userId, friendId) {
  const { error } = await supabase
    .from("friendships").insert({ user_id: userId, friend_id: friendId });
  if (error) throw error;
}
