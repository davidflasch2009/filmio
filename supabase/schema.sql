-- filmio: eine Liste pro Account, genau ein Account.
create table if not exists public.filmio_store (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  rev bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.filmio_store enable row level security;
revoke all on public.filmio_store from anon, authenticated;
grant select on public.filmio_store to authenticated;

drop policy if exists "eigene Liste lesen" on public.filmio_store;
create policy "eigene Liste lesen" on public.filmio_store for select to authenticated using (user_id = auth.uid());

-- Speichern nur mit passender Revision (sonst null → Client lädt, führt zusammen, versucht erneut).
create or replace function public.filmio_save(p_data jsonb, p_rev bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); new_rev bigint;
begin
  if uid is null then raise exception 'nicht angemeldet'; end if;
  insert into public.filmio_store as s (user_id, data, rev) values (uid, p_data, 1)
  on conflict (user_id) do update set data = excluded.data, rev = s.rev + 1, updated_at = now()
    where s.rev = p_rev
  returning s.rev into new_rev;
  return new_rev;
end $$;
revoke all on function public.filmio_save(jsonb, bigint) from public, anon;
grant execute on function public.filmio_save(jsonb, bigint) to authenticated;

-- Gibt es schon den einen Account?
create or replace function public.filmio_account_exists()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users)
$$;
revoke all on function public.filmio_account_exists() from public;
grant execute on function public.filmio_account_exists() to anon, authenticated;

-- Genau ein Account: jede weitere Registrierung wird abgelehnt.
create or replace function public.filmio_single_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(424242);
  if exists (select 1 from auth.users) then
    raise exception 'filmio: Es gibt bereits einen Account.';
  end if;
  return new;
end $$;
revoke all on function public.filmio_single_account() from public, anon, authenticated;
drop trigger if exists filmio_single_account on auth.users;
create trigger filmio_single_account before insert on auth.users
  for each row execute function public.filmio_single_account();
