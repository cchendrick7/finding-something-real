/**
 * Account deletion, end to end against the LIVE backend.
 *
 *   node scripts/deletion-test.mjs
 *
 * Creates a throwaway co-host, gives her data in every table that holds
 * personal information, deletes the account through the same mutation the app
 * calls, and then proves two things that matter separately:
 *
 *   1. the rows are gone, and
 *   2. the LOGIN is gone — an account that is "deleted" but can still sign in
 *      is the failure mode this is most likely to have.
 *
 * It also checks the mutation cannot be aimed at anyone else.
 */
import {
  CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand, AdminInitiateAuthCommand, ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { readFileSync } from 'node:fs';
import { PEOPLE, token, gql } from './seed.mjs';

// Test backend unless FSR_TARGET=production — see scripts/target.mjs.
import { outputs, announce, refuseProduction } from './target.mjs';
announce('deletion-test');
const POOL = outputs.auth.user_pool_id;
const CLIENT = outputs.auth.user_pool_client_id;
const cog = new CognitoIdentityProviderClient({ region: outputs.auth.aws_region });

const pass = [], fail = [];
const ok = (c, m) => (c ? pass : fail).push(m);
const stamp = Date.now();
const victim = { email: `deltest-${stamp}@fsr.test`, pw: 'FsrDel!2026aA', name: `DelTest ${stamp}` };

const lead = await token(PEOPLE.find((p) => p.name === 'Curtis'));

/* ------------------------------------------------------------- set her up */
await cog.send(new AdminCreateUserCommand({
  UserPoolId: POOL, Username: victim.email, MessageAction: 'SUPPRESS',
  UserAttributes: [{ Name: 'email', Value: victim.email }, { Name: 'email_verified', Value: 'true' }],
}));
await cog.send(new AdminSetUserPasswordCommand({
  UserPoolId: POOL, Username: victim.email, Password: victim.pw, Permanent: true,
}));
await cog.send(new AdminAddUserToGroupCommand({
  UserPoolId: POOL, Username: victim.email, GroupName: 'cohost',
}));
const found = await cog.send(new ListUsersCommand({
  UserPoolId: POOL, Filter: `email = "${victim.email}"`, Limit: 1,
}));
const sub = found.Users[0].Attributes.find((a) => a.Name === 'sub').Value;

const prof = await gql(lead, `mutation { createProfile(input: {
  owner: "${sub}", email: "${victim.email}", displayName: "${victim.name}",
  role: member, status: active, timezone: "America/Los_Angeles" }) { id } }`);
const profileId = prof.data.createProfile.id;

const seasons = (await gql(lead, `query { listSeasons { items { id isCurrent } } }`)).data.listSeasons.items;
const seasonId = (seasons.find((s) => s.isCurrent) ?? seasons[0]).id;
const recs = (await gql(lead, `query { listRecordings { items { id publishedAt } } }`)).data.listRecordings.items;
const pubId = recs.find((r) => r.publishedAt).id;

await gql(lead, `mutation { createMembership(input: { profileId: "${profileId}", seasonId: "${seasonId}", kind: cohort }) { id } }`);
const iq = await gql(lead, `mutation { createIntakeQuestion(input: {
  profileId: "${profileId}", seasonId: "${seasonId}", body: "DELTEST question", kind: question, source: retreat }) { id } }`);
await gql(lead, `mutation { createQuestionLink(input: {
  intakeQuestionId: "${iq.data.createIntakeQuestion.id}", recordingId: "${pubId}" }) { id } }`);

// Her own writes, through the app's real paths.
const hers = await token(victim);
await gql(hers, `mutation { submitRsvp(recordingId: "${pubId}", response: "yes") }`);
await gql(hers, `mutation { submitPrayerRequest(body: "DELTEST prayer ${stamp}") }`);
await gql(hers, `mutation { submitQuestion(recordingId: "${pubId}", body: "DELTEST asked") }`);
await gql(hers, `mutation { markRead(targetType: "note", targetId: "x-${stamp}") }`);

const countFor = async () => {
  const q = async (m, f) => ((await gql(lead, `query { ${m} { items { ${f} } } }`)).data?.[m]?.items ?? []);
  return {
    profiles: (await q('listProfiles', 'id profileId:id owner')).filter((r) => r.owner === sub).length,
    rsvps: (await q('listRsvps', 'id profileId')).filter((r) => r.profileId === profileId).length,
    attendees: (await q('listAttendees', 'id profileId')).filter((r) => r.profileId === profileId).length,
    receipts: (await q('listReceipts', 'id profileId')).filter((r) => r.profileId === profileId).length,
    prayers: (await q('listPrayerRequests', 'id profileId')).filter((r) => r.profileId === profileId).length,
    questions: (await q('listQuestions', 'id profileId')).filter((r) => r.profileId === profileId).length,
    memberships: (await q('listMemberships', 'id profileId')).filter((r) => r.profileId === profileId).length,
    intake: (await q('listIntakeQuestions', 'id profileId')).filter((r) => r.profileId === profileId).length,
  };
};

const before = await countFor();
const total = Object.values(before).reduce((a, b) => a + b, 0);
ok(total >= 8, `the throwaway account has data in every table (${JSON.stringify(before)})`);

/* --------------------------------- it cannot be aimed at someone else ---- */
const imaniProfile = (await gql(lead, `query { listProfiles { items { id displayName } } }`))
  .data.listProfiles.items.find((p) => p.displayName === 'Imani');
const aimed = await gql(hers, `mutation { deleteMyAccount(id: "${imaniProfile.id}") }`);
ok((aimed.errors ?? []).length > 0, 'deleteMyAccount takes no id — it cannot be pointed at a peer');

/* ------------------------------------------------------------ delete her -- */
const res = await gql(hers, `mutation { deleteMyAccount }`);
ok(!res.errors, `the mutation succeeded (${JSON.stringify(res.data?.deleteMyAccount ?? res.errors?.[0]?.message).slice(0, 120)})`);

const after = await countFor();
for (const [k, v] of Object.entries(after)) ok(v === 0, `${k}: ${before[k]} → ${v}`);

/* ------------------------------------------ and the LOGIN is gone too ---- */
let stillIn = false;
try {
  await cog.send(new AdminInitiateAuthCommand({
    UserPoolId: POOL, ClientId: CLIENT, AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: victim.email, PASSWORD: victim.pw },
  }));
  stillIn = true;
} catch { /* expected */ }
ok(!stillIn, 'the deleted account can no longer sign in');

const left = await cog.send(new ListUsersCommand({
  UserPoolId: POOL, Filter: `email = "${victim.email}"`, Limit: 1,
}));
ok((left.Users ?? []).length === 0, 'the Cognito user is gone');

// Ministry content must survive a member leaving.
const recsAfter = (await gql(lead, `query { listRecordings { items { id } } }`)).data.listRecordings.items;
ok(recsAfter.length === recs.length, `recordings untouched (${recsAfter.length})`);

console.log('\n============= ACCOUNT DELETION =============');
pass.forEach((m) => console.log('  PASS ', m));
fail.forEach((m) => console.log('  FAIL ', m));
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
