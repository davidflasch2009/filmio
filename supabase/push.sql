-- filmio: Push-Benachrichtigungen.

-- Ein Eintrag pro Gerät, das Benachrichtigungen erlaubt hat.
create table if not exists public.filmio_push (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  region text not null default 'DE' check (region in ('DE', 'AT', 'CH')),
  created_at timestamptz not null default now()
);
alter table public.filmio_push enable row level security;
revoke all on public.filmio_push from anon, authenticated;
grant select, insert, update, delete on public.filmio_push to authenticated;
drop policy if exists "eigene Geräte" on public.filmio_push;
create policy "eigene Geräte" on public.filmio_push for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Was schon gemeldet wurde (nur für die Server-Funktion).
create table if not exists public.filmio_notify_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.filmio_notify_state enable row level security;
revoke all on public.filmio_notify_state from anon, authenticated;

-- Einstellungen für die Server-Funktion (TMDB-Token – derselbe, der ohnehin in der App steckt).
create table if not exists public.filmio_config (
  key text primary key,
  value text not null
);
alter table public.filmio_config enable row level security;
revoke all on public.filmio_config from anon, authenticated;

create or replace function public.filmio_set_tmdb_token(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  if p_token is null or length(p_token) < 20 then return; end if;
  insert into public.filmio_config (key, value) values ('tmdb_token', p_token)
  on conflict (key) do update set value = excluded.value;
end $$;
revoke all on function public.filmio_set_tmdb_token(text) from public, anon;
grant execute on function public.filmio_set_tmdb_token(text) to authenticated;
