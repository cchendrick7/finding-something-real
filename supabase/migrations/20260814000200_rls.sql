-- Row Level Security.
-- Design rule: every privacy promise made to a co-host during onboarding is
-- enforced HERE, in the database, not in application code. If the app has a
-- bug or someone queries the API directly, these still hold.

alter table profiles         enable row level security;
alter table seasons          enable row level security;
alter table memberships      enable row level security;
alter table invites          enable row level security;
alter table push_tokens      enable row level security;
alter table guests           enable row level security;
alter table recordings       enable row level security;
alter table rsvps            enable row level security;
alter table events           enable row level security;
alter table event_rsvps      enable row level security;
alter table questions        enable row level security;
alter table intake_questions enable row level security;
alter table question_links   enable row level security;
alter table prayer_requests  enable row level security;
alter table notes            enable row level security;
alter table receipts         enable row level security;
alter table notification_log enable row level security;
alter table episodes         enable row level security;

-- ============================================================ column grants
-- RLS is row-level; these two tables need COLUMN-level restriction too.
revoke all on profiles from authenticated, anon;
-- Co-hosts need each other's names (attendee lists). They do not need emails.
-- A user's own email is already in their JWT, so nothing is lost.
grant select (id, display_name, role, timezone, status) on profiles to authenticated;
grant update (display_name, timezone) on profiles to authenticated;

revoke all on guests from authenticated, anon;
-- admin_notes is leadership-only and simply not granted to co-hosts.
grant select (id, name, photo_url, blurb, external_url, returning_override, created_at)
  on guests to authenticated;

-- ============================================================ profiles
create policy profiles_self_read on profiles
  for select to authenticated using (id = auth.uid());

-- Co-hosts can see other active members (needed for attendee names).
create policy profiles_peer_read on profiles
  for select to authenticated
  using (is_active_member() and status = 'active');

create policy profiles_self_update on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_all on profiles
  for all to authenticated using (is_admin()) with check (is_admin());

-- ============================================================ seasons / memberships
create policy seasons_read on seasons
  for select to authenticated using (is_active_member());
create policy seasons_admin on seasons
  for all to authenticated using (is_admin()) with check (is_admin());

create policy memberships_read on memberships
  for select to authenticated using (is_active_member());
create policy memberships_admin on memberships
  for all to authenticated using (is_admin()) with check (is_admin());

-- ============================================================ invites (admin only)
create policy invites_admin on invites
  for all to authenticated using (is_admin()) with check (is_admin());

-- ============================================================ push tokens (own only)
create policy push_self on push_tokens
  for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy push_admin_read on push_tokens
  for select to authenticated using (is_admin());

-- ============================================================ guests
create policy guests_read on guests
  for select to authenticated using (is_active_member());
create policy guests_admin on guests
  for all to authenticated using (is_admin()) with check (is_admin());

-- ============================================================ recordings
-- Members see published recordings only. Drafts (incl. Calendly-created) are
-- admin-only until a human publishes them.
create policy recordings_read_published on recordings
  for select to authenticated
  using (is_active_member() and published_at is not null);
create policy recordings_admin on recordings
  for all to authenticated using (is_admin()) with check (is_admin());

-- ============================================================ RSVPs
-- SPEC §5.3 — the attendance asymmetry, enforced in the database:
--   * you always see your own RSVP, whatever it is
--   * you see OTHER people's RSVPs only when the answer was YES
--   * declines and non-responses are invisible to peers
-- Saying no has to stay safe or co-hosts stop answering at all.
create policy rsvps_self on rsvps
  for select to authenticated using (profile_id = auth.uid());

create policy rsvps_peer_yes_only on rsvps
  for select to authenticated
  using (
    is_active_member()
    and response = 'yes'
    and exists (
      select 1 from recordings r
      where r.id = rsvps.recording_id and r.published_at is not null
    )
  );

create policy rsvps_self_write on rsvps
  for insert to authenticated with check (profile_id = auth.uid());
create policy rsvps_self_update on rsvps
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy rsvps_self_delete on rsvps
  for delete to authenticated using (profile_id = auth.uid());

create policy rsvps_admin on rsvps
  for select to authenticated using (is_admin());

-- ============================================================ events
create policy events_read on events
  for select to authenticated
  using (is_active_member() and published_at is not null);
create policy events_admin on events
  for all to authenticated using (is_admin()) with check (is_admin());

create policy ersvp_self on event_rsvps
  for select to authenticated using (profile_id = auth.uid());
create policy ersvp_peer_yes on event_rsvps
  for select to authenticated
  using (is_active_member() and response = 'yes');
create policy ersvp_write on event_rsvps
  for insert to authenticated with check (profile_id = auth.uid());
create policy ersvp_update on event_rsvps
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy ersvp_admin on event_rsvps
  for select to authenticated using (is_admin());

-- ============================================================ session questions
-- Author sees their own. Leadership sees all. Peers see none —
-- a question submitted in confidence is not group content.
create policy questions_self on questions
  for select to authenticated using (profile_id = auth.uid());
create policy questions_write on questions
  for insert to authenticated with check (profile_id = auth.uid());
create policy questions_admin on questions
  for all to authenticated using (is_admin()) with check (is_admin());

-- ============================================================ intake questions
create policy intake_self on intake_questions
  for select to authenticated using (profile_id = auth.uid());
create policy intake_write on intake_questions
  for insert to authenticated with check (profile_id = auth.uid());
create policy intake_admin on intake_questions
  for all to authenticated using (is_admin()) with check (is_admin());

-- A co-host may see that a published recording answers HER question
-- ("this one came from your question") but not the links for anyone else's.
create policy qlink_own on question_links
  for select to authenticated
  using (exists (
    select 1 from intake_questions iq
    where iq.id = question_links.intake_question_id
      and iq.profile_id = auth.uid()
  ));
create policy qlink_admin on question_links
  for all to authenticated using (is_admin()) with check (is_admin());

-- ============================================================ prayer requests
-- The most sensitive table. Co-hosts were told at signup that only the
-- FSR team sees these. There is deliberately NO peer-read policy.
create policy prayer_self_read on prayer_requests
  for select to authenticated using (profile_id = auth.uid());
create policy prayer_self_write on prayer_requests
  for insert to authenticated with check (profile_id = auth.uid());
create policy prayer_admin_read on prayer_requests
  for select to authenticated using (is_admin());
create policy prayer_admin_update on prayer_requests
  for update to authenticated using (is_admin()) with check (is_admin());

-- ============================================================ notes
-- Audience targeting (spec §5.6) enforced in the database.
create policy notes_read_targeted on notes
  for select to authenticated
  using (
    published_at is not null
    and is_active_member()
    and (
      audience = 'all'
      or (audience = 'cohort' and exists (
            select 1 from memberships m join seasons s on s.id = m.season_id
            where m.profile_id = auth.uid() and m.kind = 'cohort' and s.is_current))
      or (audience = 'alumni' and exists (
            select 1 from memberships m
            where m.profile_id = auth.uid() and m.kind = 'alum'))
      or (audience = 'custom' and auth.uid() = any (recipient_ids))
    )
  );
create policy notes_admin on notes
  for all to authenticated using (is_admin()) with check (is_admin());

-- ============================================================ receipts
-- Members write their own read state; only leadership reads across people.
create policy receipts_self on receipts
  for select to authenticated using (profile_id = auth.uid());
create policy receipts_self_write on receipts
  for insert to authenticated with check (profile_id = auth.uid());
create policy receipts_self_update on receipts
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy receipts_admin on receipts
  for select to authenticated using (is_admin());

-- ============================================================ notification log
create policy notif_self on notification_log
  for select to authenticated using (profile_id = auth.uid());
create policy notif_admin on notification_log
  for all to authenticated using (is_admin()) with check (is_admin());

-- ============================================================ episodes (public-ish)
create policy episodes_read on episodes
  for select to authenticated using (true);
create policy episodes_anon on episodes
  for select to anon using (published_at is not null);
create policy episodes_admin on episodes
  for all to authenticated using (is_admin()) with check (is_admin());
