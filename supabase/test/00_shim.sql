-- LOCAL TEST ONLY. Emulates the parts of Supabase the migrations depend on,
-- so RLS policies can be executed and attacked against real Postgres.
-- Never applied to the hosted project.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Supabase exposes the current user id via a JWT claim; locally we drive it
-- with a session GUC so tests can impersonate people.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname='anon') then
    create role anon nologin;
  end if;
end $$;

grant usage on schema public to authenticated, anon;
grant usage on schema auth to authenticated, anon;
