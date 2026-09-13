-- Explicit privilege model.
--
-- A fresh Supabase project grants ALL on public tables to anon+authenticated
-- by default and leans entirely on RLS. That works, but it is invisible and
-- it means `anon` starts with table privileges on everything. We declare the
-- grants ourselves instead, so the security model is readable in one file and
-- survives being moved off Supabase.
--
-- Key point: "admin" is a row value (profiles.role), not a database role.
-- Both co-hosts and leadership connect as `authenticated`, so `authenticated`
-- needs DML on anything an admin can write — RLS decides who actually may.

-- Start from zero.
revoke all on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------- anon
-- Logged-out visitors see published episodes and nothing else.
grant select on episodes to anon;

-- ---------------------------------------------------------------- authenticated
grant select, insert, update, delete on
  seasons, memberships, invites, recordings, rsvps, events, event_rsvps,
  questions, intake_questions, question_links, prayer_requests, notes,
  receipts, notification_log, episodes, push_tokens
to authenticated;

-- profiles: column-restricted. `role` is deliberately NOT updatable through
-- the API by anyone — otherwise profiles_self_update would let a co-host set
-- their own role to 'admin'. Role changes go through set_member_role() below.
grant select (id, display_name, role, timezone, status) on profiles to authenticated;
grant update (display_name, timezone)                   on profiles to authenticated;
grant insert                                            on profiles to authenticated;

-- guests: admin_notes is leadership-only, so it is not in the select grant.
grant select (id, name, photo_url, blurb, external_url, returning_override, created_at)
  on guests to authenticated;
grant insert, update, delete on guests to authenticated;

grant execute on function is_admin()             to authenticated;
grant execute on function is_active_member()     to authenticated;
grant execute on function guest_is_returning(uuid) to authenticated;

-- ---------------------------------------------------------------- admin RPCs
-- Privileged operations that column grants intentionally block.

create or replace function set_member_role(target uuid, new_role member_role)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if target = auth.uid() and new_role <> 'admin' then
    raise exception 'refusing to remove your own admin access' using errcode = '42501';
  end if;
  update profiles set role = new_role where id = target;
end;
$$;
grant execute on function set_member_role(uuid, member_role) to authenticated;

-- Leadership-only read of guest admin notes (blocked by column grant).
create or replace function guest_admin_notes(g uuid)
returns text
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not is_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  return (select admin_notes from guests where id = g);
end;
$$;
grant execute on function guest_admin_notes(uuid) to authenticated;

-- Read own email (not granted on the table, so peers can't enumerate emails).
create or replace function my_email()
returns text
language sql stable security definer set search_path = public, pg_temp
as $$ select email from profiles where id = auth.uid(); $$;
grant execute on function my_email() to authenticated;
