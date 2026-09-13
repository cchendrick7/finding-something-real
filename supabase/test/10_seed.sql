-- Deterministic fixtures for the RLS attack suite.
set session role postgres;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','janell@fsr.test'),
  ('22222222-2222-2222-2222-222222222222','lauren@fsr.test'),
  ('33333333-3333-3333-3333-333333333333','imani@fsr.test'),
  ('44444444-4444-4444-4444-444444444444','priya@fsr.test'),
  ('55555555-5555-5555-5555-555555555555','sarah@fsr.test');

-- trigger created profiles; set roles/names
-- The signup trigger now creates profiles as 'pending' (security fix #2), so
-- fixtures must activate them explicitly, exactly as invite redemption does.
update profiles set display_name='Janell', role='admin', status='active' where id='11111111-1111-1111-1111-111111111111';
update profiles set display_name='Lauren', role='admin', status='active' where id='22222222-2222-2222-2222-222222222222';
update profiles set display_name='Imani',  status='active' where id='33333333-3333-3333-3333-333333333333';
update profiles set display_name='Priya',  status='active' where id='44444444-4444-4444-4444-444444444444';
update profiles set display_name='Sarah',  status='active', timezone='Europe/Amsterdam' where id='55555555-5555-5555-5555-555555555555';

insert into seasons (id,name,is_current) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Fall 2026', true),
  ('aaaaaaaa-0000-0000-0000-000000000002','Fall 2025', false);

insert into memberships (profile_id, season_id, kind) values
  ('33333333-3333-3333-3333-333333333333','aaaaaaaa-0000-0000-0000-000000000001','cohort'),
  ('44444444-4444-4444-4444-444444444444','aaaaaaaa-0000-0000-0000-000000000001','cohort'),
  ('55555555-5555-5555-5555-555555555555','aaaaaaaa-0000-0000-0000-000000000002','alum');

insert into guests (id,name,blurb,admin_notes) values
  ('bbbbbbbb-0000-0000-0000-000000000001','Dr. Rachel Kwon','Philosopher of religion',
   'PRIVATE: asked for a soft intro, going through a divorce');

-- one published, one draft (Calendly-created, unreviewed)
insert into recordings (id,season_id,guest_id,title,scheduled_at,published_at,source) values
  ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001','Why does God allow suffering?',
   '2026-09-11T01:00:00Z', now(), 'manual'),
  ('cccccccc-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001',
   null,'UNPUBLISHED draft from Calendly','2026-09-18T01:00:00Z', null, 'calendly');

-- Priya said yes; Imani said NO (must stay private from peers)
insert into rsvps (profile_id, recording_id, response) values
  ('44444444-4444-4444-4444-444444444444','cccccccc-0000-0000-0000-000000000001','yes'),
  ('33333333-3333-3333-3333-333333333333','cccccccc-0000-0000-0000-000000000001','no');

insert into questions (profile_id, recording_id, body) values
  ('33333333-3333-3333-3333-333333333333','cccccccc-0000-0000-0000-000000000001',
   'IMANI PRIVATE QUESTION about her cousin');

insert into intake_questions (id, profile_id, season_id, body) values
  ('dddddddd-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444',
   'aaaaaaaa-0000-0000-0000-000000000001','PRIYA intake question about translation');
insert into question_links (intake_question_id, recording_id) values
  ('dddddddd-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001');

insert into prayer_requests (profile_id, body) values
  ('44444444-4444-4444-4444-444444444444','PRIYA SECRET: my mother''s surgery is Thursday'),
  ('33333333-3333-3333-3333-333333333333','IMANI SECRET: I almost did not come');

insert into notes (title, body, audience, published_at) values
  ('To everyone','all note','all', now()),
  ('Alumni only','alumni note','alumni', now()),
  ('Unpublished draft','should be invisible','all', null);
insert into notes (title, body, audience, recipient_ids, published_at) values
  ('Just for Priya','custom note','custom',
   array['44444444-4444-4444-4444-444444444444']::uuid[], now());

insert into receipts (profile_id, target_type, target_id, opened_at) values
  ('44444444-4444-4444-4444-444444444444','recording','cccccccc-0000-0000-0000-000000000001', now());
