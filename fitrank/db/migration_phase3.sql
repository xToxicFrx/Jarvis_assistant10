-- ============================================================
-- FitRank — Migration Phase 3: Trainingspläne (Routinen)
-- ============================================================
-- Additiv: ergänzt nur neue Tabellen. db/schema.sql (Phase 0/1) muss bereits
-- gelaufen sein (es enthält profiles, exercises, workouts, body_metrics,
-- habits, habit_logs ...). Im Supabase-SQL-Editor ausführen.
-- ============================================================

-- Trainingspläne / Splits (z.B. "Push", "Pull", "Beine").
create table if not exists public.routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);
alter table public.routines enable row level security;
create policy "routines_all_own" on public.routines
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Übungen innerhalb eines Plans (mit Zielwerten).
create table if not exists public.routine_exercises (
  id          uuid primary key default gen_random_uuid(),
  routine_id  uuid not null references public.routines(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  target_sets int not null default 3 check (target_sets between 1 and 20),
  target_reps int not null default 10 check (target_reps between 1 and 100),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.routine_exercises enable row level security;
create policy "routine_ex_all_own" on public.routine_exercises
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Hinweis: Avatar-Gear (Phase 2) braucht KEINE neue Tabelle — der freigeschaltete
-- "equipped"-Stand liegt in profiles.equipped (jsonb) und der Katalog ist statisch
-- im Frontend (js/avatar.js). Freischaltung erfolgt rein über das Level.
