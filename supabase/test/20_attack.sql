-- RED TEAM. Every query below is an ATTACK. Each prints PASS only if the
-- database refused. Run as: psql -f 20_attack.sql
\set QUIET on
\pset tuples_only on
\pset format unaligned
\set ON_ERROR_STOP off

-- helper: become a co-host (Imani, non-admin)
\set imani '33333333-3333-3333-3333-333333333333'
\set priya '44444444-4444-4444-4444-444444444444'
\set janell '11111111-1111-1111-1111-111111111111'

create or replace function t(label text, got bigint, want bigint) returns text
language sql as $$
  select case when got = want
    then 'PASS  ' || label
    else 'FAIL  ' || label || '  (got ' || got || ', expected ' || want || ')' end;
$$;

\echo '=============== attacking as CO-HOST (Imani) ==============='
set role authenticated;
select set_config('request.jwt.claim.sub', :'imani', false);

select t('cannot read peer prayer requests',
  (select count(*) from prayer_requests where profile_id <> :'imani'::uuid), 0);

select t('can read own prayer request',
  (select count(*) from prayer_requests where profile_id = :'imani'::uuid), 1);

select t('cannot see who DECLINED a recording',
  (select count(*) from rsvps where response='no' and profile_id <> :'imani'::uuid), 0);

select t('CAN see peers who said yes (attendee names)',
  (select count(*) from rsvps where response='yes' and profile_id <> :'imani'::uuid), 1);

select t('can still see own decline',
  (select count(*) from rsvps where profile_id = :'imani'::uuid and response='no'), 1);

select t('cannot read peer session questions',
  (select count(*) from questions where profile_id <> :'imani'::uuid), 0);

select t('cannot read peer intake questions',
  (select count(*) from intake_questions where profile_id <> :'imani'::uuid), 0);

select t('cannot read peer question_links',
  (select count(*) from question_links), 0);

select t('cannot see unpublished draft recordings',
  (select count(*) from recordings where published_at is null), 0);

select t('can see published recordings',
  (select count(*) from recordings where published_at is not null), 1);

select t('cannot read alumni-only note (is cohort)',
  (select count(*) from notes where audience='alumni'), 0);

select t('cannot read custom note addressed to Priya',
  (select count(*) from notes where audience='custom'), 0);

select t('cannot read unpublished note',
  (select count(*) from notes where published_at is null), 0);

select t('can read the all-hands note',
  (select count(*) from notes where audience='all' and published_at is not null), 1);

select t('cannot read peer read-receipts',
  (select count(*) from receipts where profile_id <> :'imani'::uuid), 0);

select t('cannot read invites',
  (select count(*) from invites), 0);

select t('cannot read notification log of peers',
  (select count(*) from notification_log where profile_id <> :'imani'::uuid), 0);

\echo '--- column-level: these must ERROR (permission denied) ---'
\echo 'ATTEMPT: read guest admin_notes'
select admin_notes from guests limit 1;
\echo 'ATTEMPT: read peer email from profiles'
select email from profiles limit 1;
\echo 'ATTEMPT: escalate self to admin'
update profiles set role='admin' where id = :'imani'::uuid;

\echo '--- write attacks: must affect 0 rows or error ---'
\echo 'ATTEMPT: RSVP on behalf of Priya'
insert into rsvps (profile_id, recording_id, response)
  values (:'priya'::uuid,'cccccccc-0000-0000-0000-000000000002','yes');
\echo 'ATTEMPT: submit prayer request as Priya'
insert into prayer_requests (profile_id, body) values (:'priya'::uuid,'forged');
\echo 'ATTEMPT: delete Priya''s RSVP'
delete from rsvps where profile_id = :'priya'::uuid;
\echo 'ATTEMPT: publish a draft recording'
update recordings set published_at = now() where published_at is null;
\echo 'ATTEMPT: create a note'
insert into notes (title, body, published_at) values ('forged','x',now());

reset role;
select set_config('request.jwt.claim.sub', :'imani', false);
set role authenticated;
select t('after write attacks: draft still unpublished',
  (select count(*) from recordings where published_at is null), 0);

\echo ''
\echo '=============== as ADMIN (Janell) ==============='
reset role;
select set_config('request.jwt.claim.sub', :'janell', false);
set role authenticated;

select t('admin reads all prayer requests',
  (select count(*) from prayer_requests), 2);
select t('admin sees declines',
  (select count(*) from rsvps where response='no'), 1);
select t('admin sees draft recordings',
  (select count(*) from recordings where published_at is null), 1);
select t('admin reads all session questions',
  (select count(*) from questions), 1);
select t('admin reads all receipts',
  (select count(*) from receipts), 1);
select t('admin reads invites table',
  (select count(*) from invites), 0);

\echo ''
\echo '=============== as ANON (logged out) ==============='
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select t('anon reads no prayer requests',   (select count(*) from prayer_requests), 0);
select t('anon reads no profiles',          (select count(*) from profiles), 0);
select t('anon reads no recordings',        (select count(*) from recordings), 0);
select t('anon reads no notes',             (select count(*) from notes), 0);
select t('anon reads no rsvps',             (select count(*) from rsvps), 0);
reset role;
