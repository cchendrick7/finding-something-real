-- Finding Something Real — v1.1 schema
-- Postgres / Supabase. All timestamps UTC; rendered per-user from profiles.timezone.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type member_role     as enum ('member','admin');
create type membership_kind as enum ('cohort','alum');
create type rsvp_response   as enum ('yes','no');
create type question_kind   as enum ('question','objection');
create type intake_source   as enum ('form','retreat','app');
create type note_audience   as enum ('all','cohort','alumni','custom');
create type notif_class     as enum ('broadcast','time_sensitive','internal');
create type recording_source as enum ('manual','calendly');

-- ---------------------------------------------------------------- core
-- Mirrors auth.users. Supabase owns identity; this owns everything else.
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null unique,
  display_name text not null,
  role         member_role not null default 'member',
  timezone     text not null default 'America/Los_Angeles',
  status       text not null default 'active',
  created_at   timestamptz not null default now()
);

create table seasons (
  id        uuid primary key default uuid_generate_v4(),
  name      text not null,
  starts_at date,
  ends_at   date,
  is_current boolean not null default false
);
-- At most one current season.
create unique index seasons_one_current on seasons (is_current) where is_current;

create table memberships (
  profile_id uuid not null references profiles(id) on delete cascade,
  season_id  uuid not null references seasons(id)  on delete cascade,
  kind       membership_kind not null default 'cohort',
  primary key (profile_id, season_id)
);

create table invites (
  id         uuid primary key default uuid_generate_v4(),
  email      text not null,
  season_id  uuid not null references seasons(id) on delete cascade,
  code       text not null unique,
  sent_at    timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  redeemed_at timestamptz,
  redeemed_by uuid references profiles(id)
);
create index invites_email_idx on invites (lower(email)) where redeemed_at is null;

create table push_tokens (
  id         uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  platform   text not null,               -- ios | android | web
  token      text not null,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (profile_id, token)
);

-- ---------------------------------------------------------------- content
create table guests (
  id                 uuid primary key default uuid_generate_v4(),
  name               text not null,
  photo_url          text,
  blurb              text,
  external_url       text,
  admin_notes        text,                -- v1.1: leadership-only
  returning_override boolean,             -- null = derive from prior recordings
  created_at         timestamptz not null default now()
);

create table recordings (
  id                uuid primary key default uuid_generate_v4(),
  season_id         uuid not null references seasons(id) on delete cascade,
  guest_id          uuid references guests(id) on delete set null,
  title             text not null,
  topic             text,
  questions_covered text,
  description       text,
  scheduled_at      timestamptz not null,
  duration_minutes  int not null default 90,
  join_url          text,
  published_at      timestamptz,          -- visible in app
  announce_at       timestamptz,          -- when the push fires (may be later)
  announced_at      timestamptz,
  source            recording_source not null default 'manual',
  calendly_event_id text unique,
  created_at        timestamptz not null default now()
);
create index recordings_season_idx on recordings (season_id, scheduled_at);
create index recordings_pending_announce on recordings (announce_at)
  where published_at is not null and announced_at is null;

create table rsvps (
  profile_id   uuid not null references profiles(id) on delete cascade,
  recording_id uuid not null references recordings(id) on delete cascade,
  response     rsvp_response not null,
  note         text,
  responded_at timestamptz not null default now(),
  primary key (profile_id, recording_id)
);

create table events (
  id           uuid primary key default uuid_generate_v4(),
  season_id    uuid references seasons(id) on delete cascade,
  title        text not null,
  kind         text not null default 'gathering',
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  location     text,
  description  text,
  published_at timestamptz
);

create table event_rsvps (
  profile_id uuid not null references profiles(id) on delete cascade,
  event_id   uuid not null references events(id) on delete cascade,
  response   rsvp_response not null,
  note       text,
  responded_at timestamptz not null default now(),
  primary key (profile_id, event_id)
);

-- ---------------------------------------------------------------- questions
-- Session questions: "I can't attend, ask this for me."
create table questions (
  id           uuid primary key default uuid_generate_v4(),
  profile_id   uuid not null references profiles(id) on delete cascade,
  recording_id uuid not null references recordings(id) on delete cascade,
  body         text not null,
  submitted_at timestamptz not null default now()
);

-- Intake questions: the season-building questions. Spec §5.4.
create table intake_questions (
  id           uuid primary key default uuid_generate_v4(),
  profile_id   uuid not null references profiles(id) on delete cascade,
  season_id    uuid not null references seasons(id) on delete cascade,
  body         text not null,
  kind         question_kind not null default 'question',
  source       intake_source not null default 'form',
  submitted_at timestamptz not null default now()
);

-- Join table: one recording can address several questions; one question can span recordings.
create table question_links (
  intake_question_id uuid not null references intake_questions(id) on delete cascade,
  recording_id       uuid not null references recordings(id) on delete cascade,
  assigned_at        timestamptz not null default now(),
  primary key (intake_question_id, recording_id)
);

-- ---------------------------------------------------------------- sensitive
create table prayer_requests (
  id           uuid primary key default uuid_generate_v4(),
  profile_id   uuid not null references profiles(id) on delete cascade,
  body         text not null,
  status       text not null default 'open',
  submitted_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- messaging
create table notes (
  id            uuid primary key default uuid_generate_v4(),
  title         text not null,
  body          text not null,
  link_url      text,
  link_label    text,
  author_id     uuid references profiles(id) on delete set null,
  audience      note_audience not null default 'all',
  recipient_ids uuid[] not null default '{}',
  published_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- Generic so read tracking works across notes, recordings and events.
create table receipts (
  id           uuid primary key default uuid_generate_v4(),
  profile_id   uuid not null references profiles(id) on delete cascade,
  target_type  text not null,             -- note | recording | event
  target_id    uuid not null,
  delivered_at timestamptz,
  opened_at    timestamptz,
  unique (profile_id, target_type, target_id)
);

create table notification_log (
  id                uuid primary key default uuid_generate_v4(),
  profile_id        uuid not null references profiles(id) on delete cascade,
  kind              text not null,
  class             notif_class not null default 'broadcast',
  target_type       text,
  target_id         uuid,
  sent_at           timestamptz,
  suppressed_reason text,
  created_at        timestamptz not null default now()
);
create index notif_log_window on notification_log (profile_id, class, sent_at);

create table episodes (
  id           uuid primary key default uuid_generate_v4(),
  title        text not null,
  url          text,
  artwork_url  text,
  number       int,
  published_at timestamptz
);

-- ---------------------------------------------------------------- helpers
-- SECURITY DEFINER + empty search_path: callable from policies without
-- recursing back through RLS on profiles.
create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  );
$$;

create or replace function is_active_member()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.status = 'active'
  );
$$;

-- Derived "has this guest been on before?"
create or replace function guest_is_returning(g uuid)
returns boolean
language sql stable
as $$
  select coalesce(
    (select returning_override from guests where id = g),
    (select count(*) > 1 from recordings
      where guest_id = g and published_at is not null)
  );
$$;

-- Auto-create a profile when an invited user signs up.
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare inv record;
begin
  insert into profiles (id, email, display_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;

  select * into inv from invites
   where lower(email) = lower(new.email)
     and redeemed_at is null and expires_at > now()
   order by sent_at desc limit 1;

  if found then
    update invites set redeemed_at = now(), redeemed_by = new.id where id = inv.id;
    insert into memberships (profile_id, season_id, kind)
    values (new.id, inv.season_id, 'cohort')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
