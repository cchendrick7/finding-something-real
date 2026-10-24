/**
 * ONE-TIME: clear the test accounts and demo content out of PRODUCTION.
 *
 *   FSR_TARGET=production node scripts/production-reset.mjs           # show the plan
 *   FSR_TARGET=production node scripts/production-reset.mjs --apply   # do it
 *
 * Run on 3 Oct 2026, the day the backend became production in fact as well as
 * in name. Kept, like repair-push-prefs, as the record of exactly what was
 * removed and why.
 *
 * WHY IT WAS NEEDED. Production had always been the only backend, so the
 * seeded test people — Imani, Priya, Nadia, Maya, a "Curtis" and a "Lauren"
 * on @fsr.test addresses — lived in it alongside the real ones, with their
 * passwords committed to this repository. Two of those "demo" logins had
 * quietly become real leaders' daily accounts. The test suites now have a
 * backend of their own (scripts/target.mjs), so production can be cleared.
 *
 * THE RULES, which are deliberately narrow:
 *
 *   SIGN-INS   Only addresses ending @fsr.test are ever deleted, and two of
 *              those are kept on purpose as production test accounts:
 *              stranger@fsr.test and testcohost@fsr.test. Any other address
 *              is a real person and this script will not touch it — it is
 *              listed, never deleted.
 *   PROFILES   The Profile row of each deleted sign-in, and every row that
 *              hangs off it.
 *   CONTENT    Clean slate, as Curtis chose: notes, receipts, the notification
 *              log, intake questions, the demo episode records, prayer
 *              requests, messages, RSVPs and questions. All of it was made by
 *              or for test people.
 *
 * WHAT STAYS, and why each one:
 *
 *   The SEASON. There is one ("Fall 2026", current), nothing in the app can
 *     create a season, and a recording requires one. Deleting it would leave
 *     Janell unable to schedule anything at all.
 *   Two GUESTS, Paul Copan and Francine Rivers — real people Janell entered.
 *     The two seed fixtures go.
 *   PublicEpisode — the YouTube catalogue, public anyway.
 *   Inquiry — real submissions from the interest form (there were none).
 *   Listener PUSH TOKENS — real phones of real listeners.
 *
 * Devices attached to a deleted profile are DETACHED, not deleted: they go
 * back to being listeners. When Curtis and Lauren sign in with their new
 * accounts, push-api sees a listener device being promoted and turns the
 * co-host categories on (see the PROMOTION note in push-api/handler.ts).
 */
if (process.env.FSR_TARGET !== 'production') {
  console.error('This is a production clean-up. Set FSR_TARGET=production deliberately.');
  process.exit(2);
}

const { outputs, announce, isProduction } = await import('./target.mjs');
const { tables } = await import('./ddb.mjs');
const {
  CognitoIdentityProviderClient, ListUsersCommand, AdminDeleteUserCommand,
} = await import('@aws-sdk/client-cognito-identity-provider');

const APPLY = process.argv.includes('--apply');
const KEEP_TEST = new Set(['stranger@fsr.test', 'testcohost@fsr.test']);
const SEED_GUESTS = new Set(['Bishop Secret Booking', 'Dr. Rachel Kwon']);

/** Tables emptied outright: everything in them was made by or for test people. */
const WIPE = [
  'Note', 'Receipt', 'NotificationLog', 'IntakeQuestion', 'QuestionLink', 'Episode',
  'PrayerRequest', 'Message', 'Rsvp', 'Attendee', 'Question', 'EventItem', 'Invite', 'Recording',
];

announce('production-reset');
if (!isProduction) console.log('(not production — running against the test backend)');
console.log(APPLY ? 'MODE: APPLY — changes will be made\n' : 'MODE: plan only — nothing will change\n');

const cog = new CognitoIdentityProviderClient({ region: outputs.auth.aws_region });
const POOL = outputs.auth.user_pool_id;
const db = await tables(outputs);

/* ------------------------------------------------------------- who goes */
const users = [];
let next;
do {
  const r = await cog.send(new ListUsersCommand({ UserPoolId: POOL, PaginationToken: next }));
  users.push(...r.Users);
  next = r.PaginationToken;
} while (next);

const emailOf = (u) => (u.Attributes.find((a) => a.Name === 'email')?.Value ?? '').toLowerCase();
const subOf = (u) => u.Attributes.find((a) => a.Name === 'sub')?.Value;

const doomed = users.filter((u) => emailOf(u).endsWith('@fsr.test') && !KEEP_TEST.has(emailOf(u)));
const kept = users.filter((u) => !doomed.includes(u));

console.log('SIGN-INS KEPT');
kept.forEach((u) => console.log(`  keep    ${emailOf(u)}`));
console.log('SIGN-INS DELETED');
doomed.forEach((u) => console.log(`  delete  ${emailOf(u)}`));

const doomedSubs = new Set(doomed.map(subOf));
const doomedEmails = new Set(doomed.map(emailOf));
const profiles = await db.scan('Profile');
const doomedProfiles = profiles.filter((p) => doomedSubs.has(p.owner) || doomedEmails.has((p.email ?? '').toLowerCase()));
const doomedIds = new Set(doomedProfiles.map((p) => p.id));
console.log(`\nPROFILES DELETED: ${doomedProfiles.map((p) => p.displayName).join(', ') || 'none'}`);

/* ---------------------------------------------------------- what else */
const plan = [];
for (const model of WIPE) {
  const rows = await db.scan(model);
  if (rows.length) plan.push({ model, rows, why: 'clean slate' });
}
const memberships = (await db.scan('Membership')).filter((m) => doomedIds.has(m.profileId));
if (memberships.length) plan.push({ model: 'Membership', rows: memberships, why: 'belongs to a deleted profile' });
const guests = (await db.scan('Guest')).filter((g) => SEED_GUESTS.has(g.name));
if (guests.length) plan.push({ model: 'Guest', rows: guests, why: `seed fixtures (${guests.map((g) => g.name).join(', ')})` });

const tokens = await db.scan('PushToken');
const retired = tokens.filter((t) => t.retiredAt);
const detach = tokens.filter((t) => !t.retiredAt && t.profileId && doomedIds.has(t.profileId));
if (retired.length) plan.push({ model: 'PushToken', rows: retired, why: 'retired devices' });

console.log('\nROWS DELETED');
plan.forEach((p) => console.log(`  ${String(p.rows.length).padStart(3)}  ${p.model.padEnd(16)} ${p.why}`));
console.log('\nDEVICES DETACHED (back to listener; promoted again on next sign-in)');
detach.forEach((t) => {
  const who = profiles.find((p) => p.id === t.profileId)?.displayName ?? '?';
  console.log(`  ${who.padEnd(10)} ${t.deviceLabel ?? '-'}`);
});

const season = (await db.scan('Season'));
const allGuests = await db.scan('Guest');
console.log('\nSTAYS');
console.log(`  Season         ${season.map((s) => `${s.name}${s.isCurrent ? ' (current)' : ''}`).join(', ')}`);
console.log(`  Guest          ${allGuests.filter((g) => !SEED_GUESTS.has(g.name)).map((g) => g.name).join(', ')}`);
console.log(`  PublicEpisode  ${(await db.scan('PublicEpisode')).length}`);
console.log(`  Inquiry        ${(await db.scan('Inquiry')).length}`);
console.log(`  PushToken      ${tokens.filter((t) => !t.retiredAt && !t.profileId).length} listener device(s)`);

if (!APPLY) {
  console.log('\nPlan only. Re-run with --apply to make these changes.');
  process.exit(0);
}

/* ---------------------------------------------------------------- apply */
// Content first, then the rows that point at profiles, then profiles, then
// sign-ins last — so a failure part-way leaves nothing pointing at a person
// who no longer exists.
console.log('\napplying…');
for (const p of plan) {
  for (const r of p.rows) await db.remove(p.model, r.id);
  console.log(`  removed ${p.rows.length} ${p.model}`);
}
for (const t of detach) {
  await db.patch('PushToken', t.id,
    { wantsSessions: false, wantsReminders: false, wantsNotes: false, wantsEpisodes: true }, ['profileId']);
}
console.log(`  detached ${detach.length} device(s)`);
for (const p of doomedProfiles) await db.remove('Profile', p.id);
console.log(`  removed ${doomedProfiles.length} Profile`);
for (const u of doomed) {
  await cog.send(new AdminDeleteUserCommand({ UserPoolId: POOL, Username: u.Username }));
}
console.log(`  removed ${doomed.length} sign-in(s)`);
console.log('\ndone.');

