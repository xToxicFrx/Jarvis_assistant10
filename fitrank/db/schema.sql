-- ============================================================
-- FitRank — Datenbank-Schema (Supabase / Postgres)
-- ============================================================
-- Sicherheits-Prinzipien:
--   * Row Level Security (RLS) auf ALLEN Tabellen, Default-Deny.
--   * Jeder Nutzer sieht/ändert nur eigene Zeilen (auth.uid()).
--   * XP, Level, Stats und PR-Erkennung werden NUR serverseitig
--     (Trigger/Funktionen) berechnet — der Client kann sie nicht fälschen.
--   * Nur "verifizierte" Workouts (GPS/Bewegung/Puls) zählen fürs Ranking.
--
-- Ausführen: Supabase Dashboard -> SQL Editor -> dieses Skript einfügen -> Run.
-- ============================================================

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null check (char_length(username) between 3 and 20),
  display_name  text,
  level         int  not null default 1,
  xp            int  not null default 0,
  stats         jsonb not null default '{"strength":0,"endurance":0,"speed":0,"discipline":0}'::jsonb,
  equipped      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Profil lesbar für sich selbst ODER für akzeptierte Freunde (für Bestenliste/Feed).
create policy "profiles_select_self_or_friend" on public.profiles
  for select using (
    auth.uid() = id
    or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ( (f.user_id = auth.uid() and f.friend_id = profiles.id)
           or (f.friend_id = auth.uid() and f.user_id = profiles.id) )
    )
  );
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);
-- Update erlaubt, ABER xp/level/stats werden per Trigger gegen Manipulation geschützt (s.u.).
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Schutz: Client darf xp/level/stats NICHT direkt ändern (nur Server-Funktionen).
create or replace function public.protect_profile_stats()
returns trigger language plpgsql as $$
begin
  if current_setting('fitrank.server', true) is distinct from 'on' then
    new.xp    := old.xp;
    new.level := old.level;
    new.stats := old.stats;
  end if;
  return new;
end $$;
create trigger trg_protect_profile_stats
  before update on public.profiles
  for each row execute function public.protect_profile_stats();

-- ---------- EXERCISES (Übungs-Datenbank) ----------
create table if not exists public.exercises (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references auth.users(id) on delete cascade, -- NULL = globale Übung
  name          text not null,
  muscle_group  text,
  instructions  text,
  created_at    timestamptz not null default now()
);
alter table public.exercises enable row level security;
-- Globale Übungen (owner_id null) für alle lesbar; eigene zusätzlich.
create policy "exercises_select" on public.exercises
  for select using (owner_id is null or owner_id = auth.uid());
create policy "exercises_insert_own" on public.exercises
  for insert with check (owner_id = auth.uid());
create policy "exercises_modify_own" on public.exercises
  for update using (owner_id = auth.uid());
create policy "exercises_delete_own" on public.exercises
  for delete using (owner_id = auth.uid());

-- ---------- WORKOUTS ----------
create table if not exists public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         text not null default 'lifting',           -- lifting | run | cycle | other
  source       text not null default 'manual',            -- gps | motion | heartrate | manual
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  duration_min int not null default 0,                    -- serverseitig aus started/ended berechnet
  distance_m   int,                                        -- für GPS-Aktivitäten
  verified     boolean not null default false,            -- serverseitig gesetzt
  xp_awarded   int not null default 0,                     -- serverseitig berechnet
  completed    boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table public.workouts enable row level security;
create policy "workouts_select_own" on public.workouts
  for select using (user_id = auth.uid());
create policy "workouts_insert_own" on public.workouts
  for insert with check (user_id = auth.uid());
create policy "workouts_update_own" on public.workouts
  for update using (user_id = auth.uid());
create policy "workouts_delete_own" on public.workouts
  for delete using (user_id = auth.uid());

-- ---------- WORKOUT SETS ----------
create table if not exists public.workout_sets (
  id          uuid primary key default gen_random_uuid(),
  workout_id  uuid not null references public.workouts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  reps        int  not null check (reps between 0 and 1000),
  weight      numeric(6,2) not null default 0 check (weight between 0 and 1000),
  is_pr       boolean not null default false,             -- serverseitig erkannt
  created_at  timestamptz not null default now()
);
alter table public.workout_sets enable row level security;
create policy "sets_select_own" on public.workout_sets
  for select using (user_id = auth.uid());
create policy "sets_insert_own" on public.workout_sets
  for insert with check (user_id = auth.uid());
create policy "sets_delete_own" on public.workout_sets
  for delete using (user_id = auth.uid());

-- ---------- BODY METRICS ----------
create table if not exists public.body_metrics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  date         date not null default current_date,
  weight       numeric(5,2),
  measurements jsonb,
  created_at   timestamptz not null default now(),
  unique (user_id, date)
);
alter table public.body_metrics enable row level security;
create policy "metrics_all_own" on public.body_metrics
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- HABITS ----------
create table if not exists public.habits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  icon       text,
  created_at timestamptz not null default now()
);
alter table public.habits enable row level security;
create policy "habits_all_own" on public.habits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.habit_logs (
  id        uuid primary key default gen_random_uuid(),
  habit_id  uuid not null references public.habits(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  date      date not null default current_date,
  unique (habit_id, date)
);
alter table public.habit_logs enable row level security;
create policy "habit_logs_all_own" on public.habit_logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- FRIENDSHIPS ----------
create table if not exists public.friendships (
  user_id    uuid not null references auth.users(id) on delete cascade,
  friend_id  uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending',  -- pending | accepted
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
alter table public.friendships enable row level security;
-- Beide Beteiligten dürfen die Beziehung sehen.
create policy "friendships_select" on public.friendships
  for select using (user_id = auth.uid() or friend_id = auth.uid());
-- Anfrage senden: nur in eigenem Namen.
create policy "friendships_insert" on public.friendships
  for insert with check (user_id = auth.uid());
-- Annehmen/ändern: nur der Empfänger der Anfrage.
create policy "friendships_update" on public.friendships
  for update using (friend_id = auth.uid());
create policy "friendships_delete" on public.friendships
  for delete using (user_id = auth.uid() or friend_id = auth.uid());

-- ============================================================
-- SERVERSEITIGE LOGIK (Anti-Cheat)
-- ============================================================

-- XP -> Level: einfache, leicht ansteigende Kurve.
create or replace function public.xp_to_level(p_xp int)
returns int language sql immutable as $$
  select greatest(1, floor(sqrt(greatest(p_xp,0)::numeric / 100))::int + 1);
$$;

-- PR-Erkennung: Vor dem Einfügen prüfen, ob das Gewicht ein neuer Rekord
-- für (Nutzer, Übung) ist. Wird serverseitig gesetzt, nicht vom Client.
create or replace function public.detect_pr()
returns trigger language plpgsql as $$
declare best numeric;
begin
  select max(weight) into best
    from public.workout_sets
    where user_id = new.user_id and exercise_id = new.exercise_id;
  new.is_pr := (best is null or new.weight > best) and new.weight > 0;
  return new;
end $$;
create trigger trg_detect_pr
  before insert on public.workout_sets
  for each row execute function public.detect_pr();

-- Workout abschließen: Dauer, Verifizierung und XP serverseitig berechnen.
-- Der Client setzt completed=true; alles andere wird hier (vertrauenswürdig) gesetzt.
create or replace function public.finalize_workout()
returns trigger language plpgsql as $$
declare
  mins int;
  base int;
begin
  if new.completed and not old.completed then
    -- Dauer serverseitig aus Zeitstempeln (Client-Wert wird ignoriert).
    new.ended_at := coalesce(new.ended_at, now());
    mins := greatest(0, ceil(extract(epoch from (new.ended_at - new.started_at)) / 60.0)::int);
    -- Plausibilitäts-Cap: max. 4 Stunden pro Session.
    mins := least(mins, 240);
    new.duration_min := mins;

    -- Verifiziert, wenn die Quelle ein Live-Sensor war.
    new.verified := new.source in ('gps','motion','heartrate');

    -- XP: Basis aus Dauer; verifiziert gibt vollen, manuell stark reduzierten Wert.
    base := mins * 10;
    new.xp_awarded := case when new.verified then base else floor(base * 0.1)::int end;
  end if;
  return new;
end $$;
create trigger trg_finalize_workout
  before update on public.workouts
  for each row execute function public.finalize_workout();

-- Nach Abschluss: XP/Level/Stats im Profil gutschreiben (server-markiert).
create or replace function public.apply_workout_rewards()
returns trigger language plpgsql as $$
declare
  s jsonb;
  new_xp int;
begin
  if new.completed and not old.completed and new.xp_awarded > 0 then
    perform set_config('fitrank.server', 'on', true);  -- erlaubt Stat-Update trotz Schutz-Trigger

    select stats into s from public.profiles where id = new.user_id for update;
    s := coalesce(s, '{"strength":0,"endurance":0,"speed":0,"discipline":0}'::jsonb);

    -- Stat-Zuwachs je nach Trainingsart.
    if new.type = 'lifting' then
      s := jsonb_set(s, '{strength}', to_jsonb((s->>'strength')::int + new.duration_min));
    elsif new.type in ('run','cycle') then
      s := jsonb_set(s, '{endurance}', to_jsonb((s->>'endurance')::int + new.duration_min));
      s := jsonb_set(s, '{speed}',     to_jsonb((s->>'speed')::int + greatest(1, new.duration_min/5)));
    else
      s := jsonb_set(s, '{discipline}', to_jsonb((s->>'discipline')::int + new.duration_min));
    end if;
    -- Disziplin steigt bei jedem abgeschlossenen Training leicht.
    s := jsonb_set(s, '{discipline}', to_jsonb((s->>'discipline')::int + 1));

    update public.profiles
      set xp = xp + new.xp_awarded,
          stats = s,
          level = public.xp_to_level(xp + new.xp_awarded)
      where id = new.user_id
      returning xp into new_xp;

    perform set_config('fitrank.server', 'off', true);
  end if;
  return new;
end $$;
create trigger trg_apply_workout_rewards
  after update on public.workouts
  for each row execute function public.apply_workout_rewards();

-- ============================================================
-- HILFSFUNKTIONEN
-- ============================================================

-- Sichere Freundessuche per Username, OHNE die ganze profiles-Tabelle
-- offenzulegen. SECURITY DEFINER, gibt nur minimale Felder zurück.
create or replace function public.find_user_by_username(p_username text)
returns table (id uuid, username text, display_name text, level int)
language sql security definer set search_path = public as $$
  select id, username, display_name, level
  from public.profiles
  where lower(username) = lower(p_username)
  limit 1;
$$;
revoke all on function public.find_user_by_username(text) from public;
grant execute on function public.find_user_by_username(text) to authenticated;

-- Profil automatisch anlegen, sobald sich jemand registriert.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    -- Vorläufiger Username aus E-Mail; in der App änderbar.
    split_part(coalesce(new.email, 'athlet'), '@', 1) || '_' || substr(new.id::text, 1, 4),
    coalesce(new.raw_user_meta_data->>'full_name', null)
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- SEED: ein paar globale Übungen zum Start.
-- ============================================================
insert into public.exercises (owner_id, name, muscle_group) values
  (null, 'Bankdrücken', 'Brust'),
  (null, 'Kniebeuge',  'Beine'),
  (null, 'Kreuzheben', 'Rücken'),
  (null, 'Klimmzug',   'Rücken'),
  (null, 'Schulterdrücken', 'Schultern'),
  (null, 'Bizeps-Curl', 'Arme'),
  (null, 'Liegestütze', 'Brust'),
  (null, 'Plank',       'Core')
on conflict do nothing;

-- ============================================================
-- SPÄTERE PHASEN (hier nur als Notiz, noch nicht angelegt):
--   challenges, challenge_participants, avatar_items, user_avatar_items,
--   routines, routine_exercises
-- ============================================================
