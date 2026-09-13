-- Regression suite for the nine findings from the adversarial review.
-- Each of these WAS exploitable before 20260814000400_security_fixes.sql.
\pset tuples_only on
\pset format unaligned
\set ON_ERROR_STOP off

\echo '========== 1. stranger signup must NOT become a member =========='
reset role;
insert into auth.users (id, email) values
  ('99999999-9999-9999-9999-999999999999','stranger@gmail.com')
  on conflict do nothing;
select t('stranger profile is pending, not active',
  (select count(*) from profiles where id='99999999-9999-9999-9999-999999999999' and status='pending'), 1);
select t('stranger has no membership',
  (select count(*) from memberships where profile_id='99999999-9999-9999-9999-999999999999'), 0);
select set_config('request.jwt.claim.sub','99999999-9999-9999-9999-999999999999',false);
set role authenticated;
select t('stranger is_active_member() = false', (select count(*) from (select 1 where is_active_member()) x), 0);
select t('stranger sees only their own profile row', (select count(*) from profiles), 1);
select t('stranger reads no recordings', (select count(*) from recordings), 0);
select t('stranger reads no rsvps',      (select count(*) from rsvps), 0);
select t('stranger reads no notes',      (select count(*) from notes), 0);
select t('stranger reads no guests',     (select count(*) from guests), 0);
reset role;

\echo '========== 2. display_name must not leak the email local-part =========='
select t('display_name is not derived from email',
  (select count(*) from profiles where id='99999999-9999-9999-9999-999999999999' and display_name='stranger'), 0);

\echo '========== 3. off-boarding actually revokes =========='
reset role;
create temp table _saved as select * from memberships where profile_id='55555555-5555-5555-5555-555555555555';
delete from memberships where profile_id='55555555-5555-5555-5555-555555555555';
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false);
set role authenticated;
select t('removed member sees only their own row', (select count(*) from profiles), 1);
select t('removed member loses recordings',    (select count(*) from recordings), 0);
reset role;
insert into memberships select * from _saved;

\echo '========== 4. draft-event RSVP notes must not leak =========='
reset role;
insert into events (id,title,kind,starts_at,published_at)
  values ('eeeeeeee-0000-0000-0000-000000000009','SECRET leadership retreat','retreat', now()+interval '20 days', null)
  on conflict do nothing;
insert into event_rsvps (profile_id,event_id,response,note) values
  ('44444444-4444-4444-4444-444444444444','eeeeeeee-0000-0000-0000-000000000009','yes','driving up Friday')
  on conflict do nothing;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
set role authenticated;
select t('draft event hidden',            (select count(*) from events where published_at is null), 0);
select t('draft event RSVPs also hidden', (select count(*) from event_rsvps), 0);
reset role;

\echo '========== 5. unpublished episodes must be hidden from non-members =========='
reset role;
insert into episodes (id,title,url,published_at)
  values ('ffffffff-0000-0000-0000-000000000009','DRAFT ep 12','https://cdn/secret.mp3', null)
  on conflict do nothing;
select set_config('request.jwt.claim.sub','99999999-9999-9999-9999-999999999999',false);
set role authenticated;
select t('stranger sees no unpublished episodes',
  (select count(*) from episodes where published_at is null), 0);
reset role;

\echo '========== 6. deletes now work for the right people =========='
reset role;
insert into prayer_requests (id,profile_id,body)
  values ('aaaaaaaa-1111-0000-0000-000000000009','33333333-3333-3333-3333-333333333333','retract me')
  on conflict do nothing;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
set role authenticated;
delete from prayer_requests where id='aaaaaaaa-1111-0000-0000-000000000009';
reset role;
select t('co-host can retract her own prayer request',
  (select count(*) from prayer_requests where id='aaaaaaaa-1111-0000-0000-000000000009'), 0);

\echo '========== 7. peer must not delete another prayer request =========='
reset role;
insert into prayer_requests (id,profile_id,body)
  values ('aaaaaaaa-2222-0000-0000-000000000009','44444444-4444-4444-4444-444444444444','priya keeps this')
  on conflict do nothing;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
set role authenticated;
delete from prayer_requests where id='aaaaaaaa-2222-0000-0000-000000000009';
reset role;
select t('peer CANNOT delete another prayer request',
  (select count(*) from prayer_requests where id='aaaaaaaa-2222-0000-0000-000000000009'), 1);

\echo '========== 8. guest attached only to a draft must not leak =========='
reset role;
insert into guests (id,name,blurb) values
  ('bbbbbbbb-0000-0000-0000-000000000002','Bishop Secret Booking','not announced yet')
  on conflict do nothing;
update recordings set guest_id='bbbbbbbb-0000-0000-0000-000000000002'
  where id='cccccccc-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
set role authenticated;
select t('draft-only guest is hidden',
  (select count(*) from guests where id='bbbbbbbb-0000-0000-0000-000000000002'), 0);
select t('published guest still visible',
  (select count(*) from guests where id='bbbbbbbb-0000-0000-0000-000000000001'), 1);
reset role;

\echo '========== 9. question_links must not leak draft recording ids =========='
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
set role authenticated;
select t('own link to PUBLISHED recording visible',
  (select count(*) from question_links where recording_id='cccccccc-0000-0000-0000-000000000001'), 1);
select t('own link to DRAFT recording hidden',
  (select count(*) from question_links where recording_id='cccccccc-0000-0000-0000-000000000002'), 0);
reset role;

\echo '========== 10. profiles INSERT grant revoked (escalation surface) =========='
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
set role authenticated;
\echo 'ATTEMPT: insert a profile row (must be permission denied)'
insert into profiles (id,email,display_name,role,status)
  values ('77777777-7777-7777-7777-777777777777','x@x.test','x','admin','active');
reset role;
select t('no forged admin profile exists',
  (select count(*) from profiles where role='admin' and id='77777777-7777-7777-7777-777777777777'), 0);

\echo '========== 11. admins still work =========='
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select t('admin still reads prayer requests', (select count(*) >= 2 from prayer_requests)::int::bigint, 1);
select t('admin still sees drafts',           (select count(*) from recordings where published_at is null), 1);
select t('admin still sees all guests',       (select count(*) >= 2 from guests)::int::bigint, 1);
reset role;

\echo '========== 12. ordinary co-host is unaffected =========='
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
set role authenticated;
select t('co-host still sees the roster',       (select count(*) >= 5 from profiles)::int::bigint, 1);
select t('co-host still sees published session',(select count(*) from recordings), 1);
select t('co-host still sees YES attendees',    (select count(*) from rsvps where response='yes' and profile_id <> '33333333-3333-3333-3333-333333333333'), 1);
select t('co-host still cannot see declines',   (select count(*) from rsvps where response='no' and profile_id <> '33333333-3333-3333-3333-333333333333'), 0);
reset role;

\echo '========== teardown — leave the database as we found it =========='
-- Without this the suites are order-dependent: fixtures left behind here
-- change the row counts 20_attack.sql asserts on.
reset role;
delete from prayer_requests where id in
  ('aaaaaaaa-1111-0000-0000-000000000009','aaaaaaaa-2222-0000-0000-000000000009');
delete from event_rsvps where event_id='eeeeeeee-0000-0000-0000-000000000009';
delete from events        where id='eeeeeeee-0000-0000-0000-000000000009';
delete from episodes      where id='ffffffff-0000-0000-0000-000000000009';
update recordings set guest_id = null where id='cccccccc-0000-0000-0000-000000000002';
delete from guests        where id='bbbbbbbb-0000-0000-0000-000000000002';
delete from memberships   where profile_id='99999999-9999-9999-9999-999999999999';
delete from profiles      where id='99999999-9999-9999-9999-999999999999';
delete from auth.users    where id='99999999-9999-9999-9999-999999999999';
select 'teardown complete';
