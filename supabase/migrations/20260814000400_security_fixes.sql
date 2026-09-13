-- Security hardening. Every change here closes a hole that was demonstrated
-- with working SQL against a live database during an adversarial review.
-- Numbers refer to the findings in docs/SECURITY-REVIEW.md.

-- ============================================================ 1. membership
-- WAS: is_active_member() checked only profiles.status='active'. Combined with
-- a signup trigger that created an active profile for every auth.users row,
-- ANY account creation granted full co-host read access — roster, sessions,
-- join URLs, attendee lists. Deleting a membership also revoked nothing.
-- NOW: you must actually belong to a season (or be an admin).
create or replace function is_active_member()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from profiles p
     where p.id = auth.uid()
       and p.status = 'active'
       and (
         p.role = 'admin'
         or exists (select 1 from memberships m where m.profile_id = p.id)
       )
  );
$$;

-- ============================================================ 2. signup
-- WAS: every signup produced an active profile, and an invite was redeemed on
-- an unverified email match alone.
-- NOW: profiles start 'pending' and are only activated by a matching, unexpired
-- invite. Membership is granted at the same moment, so status and membership
-- can never disagree.
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare inv record;
begin
  insert into profiles (id, email, display_name, status)
  values (
    new.id,
    new.email,
    -- Do NOT derive from the email local-part: display_name is peer-readable,
    -- so that leaked part of every co-host's address to the whole roster.
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'New co-host'),
    'pending'
  )
  on conflict (id) do nothing;

  select * into inv
    from invites
   where lower(email) = lower(new.email)
     and redeemed_at is null
     and expires_at > now()
   order by sent_at desc
   limit 1;

  if found then
    update invites set redeemed_at = now(), redeemed_by = new.id where id = inv.id;
    insert into memberships (profile_id, season_id, kind)
      values (new.id, inv.season_id, 'cohort')
      on conflict do nothing;
    update profiles set status = 'active' where id = new.id;
  end if;

  return new;
end;
$$;

-- ============================================================ 3. event RSVPs
-- WAS: peers could read event_rsvps for UNPUBLISHED events — the event was
-- hidden but its guest list and free-text notes were not.
drop policy if exists ersvp_peer_yes on event_rsvps;
create policy ersvp_peer_yes on event_rsvps
  for select to authenticated
  using (
    is_active_member()
    and response = 'yes'
    and exists (
      select 1 from events e
      where e.id = event_rsvps.event_id and e.published_at is not null
    )
  );

-- ============================================================ 4. episodes
-- WAS: `using (true)` — unreleased episodes and their CDN URLs were readable
-- by anyone logged in, including deactivated accounts.
drop policy if exists episodes_read on episodes;
create policy episodes_read on episodes
  for select to authenticated
  using (is_active_member() or published_at is not null);

-- ============================================================ 5. deletes
-- WAS: DELETE was granted at table level but no DELETE policy existed, so it
-- silently affected 0 rows for everyone. A co-host could not retract a prayer
-- request and leadership could not honour a deletion request — which matters
-- for the account-deletion path both app stores require.
create policy prayer_self_delete on prayer_requests
  for delete to authenticated using (profile_id = auth.uid());
create policy prayer_admin_delete on prayer_requests
  for delete to authenticated using (is_admin());

create policy receipts_self_delete on receipts
  for delete to authenticated using (profile_id = auth.uid());
create policy receipts_admin_delete on receipts
  for delete to authenticated using (is_admin());

create policy ersvp_self_delete on event_rsvps
  for delete to authenticated using (profile_id = auth.uid());
create policy ersvp_admin_delete on event_rsvps
  for delete to authenticated using (is_admin());

-- Receipts were also insertable with arbitrary target_type. Constrain it.
alter table receipts drop constraint if exists receipts_target_type_ck;
alter table receipts add constraint receipts_target_type_ck
  check (target_type in ('note','recording','event'));

-- ============================================================ 6. guests
-- WAS: any guest row was readable, so a guest attached only to a draft
-- recording leaked the booking the draft was meant to keep quiet.
drop policy if exists guests_read on guests;
create policy guests_read on guests
  for select to authenticated
  using (
    is_active_member()
    and exists (
      select 1 from recordings r
      where r.guest_id = guests.id and r.published_at is not null
    )
  );

-- ============================================================ 7. question links
-- WAS: a co-host could enumerate draft recording UUIDs through links on her
-- own intake question.
drop policy if exists qlink_own on question_links;
create policy qlink_own on question_links
  for select to authenticated
  using (
    exists (
      select 1 from intake_questions iq
      where iq.id = question_links.intake_question_id
        and iq.profile_id = auth.uid()
    )
    and exists (
      select 1 from recordings r
      where r.id = question_links.recording_id and r.published_at is not null
    )
  );

-- ============================================================ 8. profiles insert
-- WAS: an unqualified `grant insert on profiles` covered role/status/email.
-- Nothing but the absence of an INSERT policy prevented self-escalation to
-- admin — one well-meaning policy away from total compromise. The signup
-- trigger is SECURITY DEFINER and creates the row itself, so this grant was
-- never needed.
revoke insert on profiles from authenticated;
