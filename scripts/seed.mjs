/**
 * Creates Cognito users and seeds a season's worth of realistic data.
 *
 * Run with deployer credentials:
 *   node scripts/seed.mjs
 *
 * Idempotent — safe to re-run. Passwords are printed once at the end; change
 * them before anyone real uses this.
 */
import {
  CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand, AdminInitiateAuthCommand, ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { readFileSync, writeFileSync } from 'node:fs';

const outputs = JSON.parse(readFileSync(new URL('../amplify_outputs.json', import.meta.url)));
const REGION = outputs.auth.aws_region;
const POOL = outputs.auth.user_pool_id;
const CLIENT = outputs.auth.user_pool_client_id;
const GQL = outputs.data.url;

const cog = new CognitoIdentityProviderClient({ region: REGION });

export const PEOPLE = [
  { email: 'curtis@fsr.test',  name: 'Curtis',  group: 'leadership', pw: 'FsrLead!2026aA' },
  { email: 'lauren@fsr.test',  name: 'Lauren',  group: 'leadership', pw: 'FsrLead!2026aA' },
  { email: 'imani@fsr.test',   name: 'Imani',   group: 'cohost',     pw: 'FsrHost!2026aA', tz: 'America/Los_Angeles' },
  { email: 'priya@fsr.test',   name: 'Priya',   group: 'cohost',     pw: 'FsrHost!2026aA', tz: 'America/New_York' },
  { email: 'nadia@fsr.test',   name: 'Nadia',   group: 'cohost',     pw: 'FsrHost!2026aA', tz: 'Europe/London' },
  { email: 'maya@fsr.test',    name: 'Maya',    group: 'cohost',     pw: 'FsrHost!2026aA', tz: 'America/Los_Angeles' },
  { email: 'stranger@fsr.test',name: 'Stranger',group: null,         pw: 'FsrNone!2026aA' },
];

export async function ensureUser(p) {
  try {
    await cog.send(new AdminCreateUserCommand({
      UserPoolId: POOL, Username: p.email,
      UserAttributes: [
        { Name: 'email', Value: p.email },
        { Name: 'email_verified', Value: 'true' },
      ],
      MessageAction: 'SUPPRESS', // no email sent — SES isn't set up and isn't needed
    }));
  } catch (e) {
    if (e.name !== 'UsernameExistsException') throw e;
  }
  await cog.send(new AdminSetUserPasswordCommand({
    UserPoolId: POOL, Username: p.email, Password: p.pw, Permanent: true,
  }));
  if (p.group) {
    await cog.send(new AdminAddUserToGroupCommand({
      UserPoolId: POOL, Username: p.email, GroupName: p.group,
    }));
  }
  const found = await cog.send(new ListUsersCommand({
    UserPoolId: POOL, Filter: `email = "${p.email}"`, Limit: 1,
  }));
  return found.Users?.[0]?.Attributes?.find((a) => a.Name === 'sub')?.Value ?? null;
}

export async function token(p) {
  const r = await cog.send(new AdminInitiateAuthCommand({
    UserPoolId: POOL, ClientId: CLIENT, AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: p.email, PASSWORD: p.pw },
  }));
  return r.AuthenticationResult.IdToken;
}

/** Raw GraphQL against AppSync as a specific user. */
export async function gql(idToken, query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: idToken },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

const CREATE = (model, fields) => `mutation M($input: Create${model}Input!) {
  create${model}(input: $input) { ${fields} }
}`;

async function main() {
  console.log('creating users…');
  const subs = {};
  for (const p of PEOPLE) subs[p.name] = await ensureUser(p);
  console.log('  ', Object.entries(subs).map(([n, s]) => `${n}=${s?.slice(0, 8)}`).join(' '));

  const lead = await token(PEOPLE[0]);

  // --- profiles ---
  console.log('seeding profiles…');
  const profileIds = {};
  for (const p of PEOPLE) {
    const r = await gql(lead, CREATE('Profile', 'id displayName'), {
      input: {
        owner: subs[p.name], email: p.email, displayName: p.name,
        role: p.group === 'leadership' ? 'admin' : 'member',
        timezone: p.tz ?? 'America/Los_Angeles',
        // The stranger stays PENDING — that is the fix that stopped any
        // signup from becoming a member. The tests rely on it.
        status: p.group ? 'active' : 'pending',
      },
    });
    if (r.errors) { console.log('  profile error', p.name, JSON.stringify(r.errors[0]?.message)); continue; }
    profileIds[p.name] = r.data.createProfile.id;
  }

  // --- season + memberships ---
  const season = await gql(lead, CREATE('Season', 'id name'), {
    input: { name: 'Fall 2026', isCurrent: true, startsAt: '2026-08-23', endsAt: '2027-05-31' },
  });
  const seasonId = season.data?.createSeason?.id;
  console.log('season:', seasonId);

  for (const n of ['Imani', 'Priya', 'Nadia', 'Maya', 'Curtis', 'Lauren']) {
    if (!profileIds[n]) continue;
    await gql(lead, CREATE('Membership', 'profileId'), {
      input: { profileId: profileIds[n], seasonId, kind: 'cohort' },
    });
  }

  // --- guests ---
  const g1 = await gql(lead, CREATE('Guest', 'id name'), {
    input: {
      name: 'Dr. Rachel Kwon',
      blurb: 'Philosopher of religion. Six years an atheist before returning to faith.',
      externalUrl: 'https://example.com/kwon', returningOverride: true,
      adminNotes: 'LEADERSHIP ONLY: prefers a soft intro, keep the first ten minutes light.',
    },
  });
  const g2 = await gql(lead, CREATE('Guest', 'id name'), {
    input: { name: 'Bishop Secret Booking', blurb: 'not announced yet',
             adminNotes: 'LEADERSHIP ONLY: unannounced' },
  });
  const guestId = g1.data?.createGuest?.id;
  const secretGuestId = g2.data?.createGuest?.id;

  // --- recordings: one published, one draft ---
  const pub = await gql(lead, CREATE('Recording', 'id title'), {
    input: {
      seasonId, guestId, title: 'Why does God allow suffering?',
      topic: 'The problem of evil, honestly',
      questionsCovered: 'If God is good, why is there so much pain?\nIs suffering evidence against God, or just hard?',
      scheduledAt: '2026-09-11T01:00:00Z', durationMinutes: 90,
      joinUrl: 'https://riverside.fm/studio/fsr',
      publishedAt: new Date().toISOString(), source: 'manual',
    },
  });
  const draft = await gql(lead, CREATE('Recording', 'id title'), {
    input: {
      seasonId, guestId: secretGuestId, title: 'UNPUBLISHED DRAFT from Calendly',
      scheduledAt: '2026-09-18T01:00:00Z', source: 'calendly',
      joinUrl: 'https://riverside.fm/studio/SECRET',
    },
  });
  const pubId = pub.data?.createRecording?.id;
  const draftId = draft.data?.createRecording?.id;
  console.log('recordings: published', pubId, '| draft', draftId);

  // --- notes: all / alumni-only / unpublished ---
  await gql(lead, CREATE('Note', 'id title'), {
    input: {
      title: 'Week one — you made it', audience: 'all',
      body: '{first_name} — I have been thinking about the retreat all week.',
      publishedAt: new Date().toISOString(), authorId: profileIds.Curtis,
    },
  });
  await gql(lead, CREATE('Note', 'id title'), {
    input: { title: 'ALUMNI ONLY note', audience: 'alumni', body: 'should be invisible to cohort',
             publishedAt: new Date().toISOString() },
  });
  await gql(lead, CREATE('Note', 'id title'), {
    input: { title: 'UNPUBLISHED draft note', audience: 'all', body: 'should be invisible to everyone' },
  });

  // --- episodes: one live, one unreleased ---
  await gql(lead, CREATE('Episode', 'id title'), {
    input: { title: 'Is faith just wishful thinking?', number: 41,
             url: 'https://example.com/ep41', publishedAt: new Date().toISOString() },
  });
  await gql(lead, CREATE('Episode', 'id title'), {
    input: { title: 'UNRELEASED ep 42', number: 42, url: 'https://cdn/secret.mp3' },
  });

  // --- intake questions + a link ---
  const iq = await gql(lead, CREATE('IntakeQuestion', 'id body'), {
    input: { profileId: profileIds.Imani, seasonId,
             body: 'If God is good, why did my cousin die?', kind: 'question', source: 'retreat' },
  });
  await gql(lead, CREATE('IntakeQuestion', 'id body'), {
    input: { profileId: profileIds.Maya, seasonId,
             body: 'I do not understand how anyone smart believes this.',
             kind: 'objection', source: 'retreat' },
  });
  if (iq.data?.createIntakeQuestion?.id && pubId) {
    await gql(lead, CREATE('QuestionLink', 'recordingId'), {
      input: { intakeQuestionId: iq.data.createIntakeQuestion.id, recordingId: pubId },
    });
  }

  // --- prayer requests (the most sensitive rows in the system) ---
  await gql(lead, CREATE('PrayerRequest', 'id'), {
    input: { profileId: profileIds.Priya, body: "PRIYA SECRET: my mom's surgery is Thursday." },
  });
  await gql(lead, CREATE('PrayerRequest', 'id'), {
    input: { profileId: profileIds.Imani, body: 'IMANI SECRET: I almost did not come to the retreat.' },
  });

  // ui-test.mjs deep-links straight to the session detail screen rather than
  // tapping through the list (both screens stay mounted, which made an earlier
  // UI assertion read the wrong one). It needs a real id, so hand it one here
  // instead of leaving a hardcoded uuid to rot in the repo.
  writeFileSync(
    new URL('./ui-test-fixtures.json', import.meta.url),
    JSON.stringify({ publishedRecordingId: pubId, draftRecordingId: draftId }, null, 1) + '\n',
  );

  console.log('\nseed complete.');
  console.log(JSON.stringify({ seasonId, pubId, draftId, guestId, secretGuestId, profileIds }, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
