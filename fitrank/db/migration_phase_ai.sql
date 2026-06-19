-- ============================================================
-- FitRank — Migration: KI-Coach (OpenAI)
-- ============================================================
-- Tabelle für das Protokoll der KI-Anfragen. Dient (a) dem Tageslimit
-- (Kostenschutz) und (b) speichert den letzten Tipp. RLS: nur eigene Zeilen.
-- Im Supabase-SQL-Editor ausführen.
-- ============================================================
create table if not exists public.ai_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  advice     text,
  created_at timestamptz not null default now()
);
alter table public.ai_requests enable row level security;

create policy "ai_req_select_own" on public.ai_requests
  for select using (user_id = auth.uid());
create policy "ai_req_insert_own" on public.ai_requests
  for insert with check (user_id = auth.uid());

create index if not exists ai_requests_user_day on public.ai_requests (user_id, created_at);
