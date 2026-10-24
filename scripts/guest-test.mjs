/**
 * ADVERSARIAL SUITE FOR THE UNAUTHENTICATED PATH.
 *
 *   node scripts/guest-test.mjs
 *
 * Needs no AWS credentials — that is the entire point. It connects the way an
 * anonymous stranger's phone does: through the identity pool's unauthenticated
 * role, with no user, no token, no invitation.
 *
 * Adding a public half to this app opened the first door into a backend whose
 * whole design is that co-hosts cannot reach each other's data. Two adversarial
 * passes have found fourteen real vulnerabilities in exactly this layer. So the
 * door gets its own suite: prove the anonymous role can read PublicEpisode, and
 * prove it can reach absolutely nothing else, in either direction.
 *
 * Every test is an ATTACK. A pass means the API refused.
 */
import { readFileSync } from 'node:fs';
import {
  CognitoIdentityClient, GetIdCommand, GetCredentialsForIdentityCommand,
} from '@aws-sdk/client-cognito-identity';
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';

// Test backend unless FSR_TARGET=production — see scripts/target.mjs.
import { outputs, announce, refuseProduction } from './target.mjs';
announce('guest-test');
const REGION = outputs.auth.aws_region;
const POOL = outputs.auth.identity_pool_id;
const GQL = new URL(outputs.data.url);

const pass = [], fail = [];
const ok = (c, m) => (c ? pass : fail).push(m);

/**
 * Credentials for nobody. GetId with no logins returns an *unauthenticated*
 * identity — exactly what the app gets before anyone signs in.
 */
const cog = new CognitoIdentityClient({ region: REGION });
const { IdentityId } = await cog.send(new GetIdCommand({ IdentityPoolId: POOL }));
const { Credentials } = await cog.send(new GetCredentialsForIdentityCommand({ IdentityId }));

const signer = new SignatureV4({
  credentials: {
    accessKeyId: Credentials.AccessKeyId,
    secretAccessKey: Credentials.SecretKey,
    sessionToken: Credentials.SessionToken,
  },
  region: REGION,
  service: 'appsync',
  sha256: Sha256,
});

/** One GraphQL call as the anonymous role. */
async function guest(query) {
  const body = JSON.stringify({ query });
  const req = new HttpRequest({
    method: 'POST',
    protocol: GQL.protocol,
    hostname: GQL.hostname,
    path: GQL.pathname,
    headers: { 'content-type': 'application/json', host: GQL.hostname },
    body,
  });
  const signed = await signer.sign(req);
  const res = await fetch(GQL.toString(), {
    method: 'POST', headers: signed.headers, body,
  });
  return res.json();
}

const denied = (r, field) => {
  const errs = r.errors ?? [];
  if (errs.some((e) => /not authorized|unauthorized|forbidden/i.test(e.message || e.errorType || ''))) return true;
  if (errs.some((e) => /Validation error|Cannot query field/i.test(e.message || ''))) return true;
  const d = r.data?.[field];
  if (d === null || d === undefined) return true;
  if (Array.isArray(d?.items)) return d.items.length === 0;
  return false;
};
const txt = (r) => JSON.stringify(r);
const L = (m, f) => `query { ${m} { items { ${f} } } }`;

console.log(`anonymous identity: ${IdentityId}\n`);
console.log('=========== ATTACKING AS NOBODY AT ALL ===========');

/* ------------------------------------------------ what it SHOULD be able to do */
const eps = await guest(L('listPublicEpisodes', 'id title url kind publishedAt'));
const items = eps.data?.listPublicEpisodes?.items ?? [];
ok(!eps.errors && items.length > 0,
   `an anonymous visitor CAN read the episode catalogue (${items.length} rows)`);
ok(items.every((e) => e.title && e.url), 'and the rows are actually usable');

/* ------------------------------------- everything it must NOT be able to reach */
for (const [model, fields] of [
  ['listProfiles', 'id email displayName'],
  ['listRecordings', 'id title joinUrl'],
  ['listNotes', 'id title body'],
  ['listPrayerRequests', 'id body'],
  ['listRsvps', 'id response note'],
  ['listAttendees', 'id displayName'],
  ['listGuests', 'id name adminNotes'],
  ['listInvites', 'id email code'],
  ['listMemberships', 'id profileId'],
  ['listIntakeQuestions', 'id body'],
  ['listQuestions', 'id body'],
  ['listQuestionLinks', 'id recordingId'],
  ['listReceipts', 'id profileId'],
  ['listSeasons', 'id name'],
  ['listEpisodes', 'id title url'],
  ['listEventItems', 'id title'],
  ['listNotificationLogs', 'id profileId'],
]) {
  const r = await guest(L(model, fields));
  ok(denied(r, model), `anonymous CANNOT ${model.replace('list', 'read ')}`);
}

/* ---------------------------------------- nor the member-facing API, nor writes */
ok(denied(await guest('query { listSessions { id title joinUrl } }'), 'listSessions'),
   'anonymous CANNOT call the member API (listSessions)');
ok(denied(await guest('query { myNotes { id title body } }'), 'myNotes'),
   'anonymous CANNOT call myNotes');
ok(denied(await guest('query { publishedEpisodes { id title } }'), 'publishedEpisodes'),
   'anonymous CANNOT call publishedEpisodes');
ok(denied(await guest('mutation { submitPrayerRequest(body: "forged") }'), 'submitPrayerRequest'),
   'anonymous CANNOT file a prayer request');
ok(denied(await guest('mutation { updateMyProfile(displayName: "forged") }'), 'updateMyProfile'),
   'anonymous CANNOT touch a profile');

/* ------------------------- and cannot deface the one thing it is allowed to see */
const forge = await guest(`mutation {
  createPublicEpisode(input: {
    videoId: "FORGED", title: "FORGED", url: "https://evil.example",
    publishedAt: "2026-01-01T00:00:00Z"
  }) { id }
}`);
ok(denied(forge, 'createPublicEpisode'), 'anonymous CANNOT add an episode');

const firstId = items[0]?.id;
if (firstId) {
  const edit = await guest(`mutation {
    updatePublicEpisode(input: { id: "${firstId}", title: "FORGED", url: "https://evil.example" }) { id }
  }`);
  ok(denied(edit, 'updatePublicEpisode'), 'anonymous CANNOT rewrite an episode');
  const del = await guest(`mutation { deletePublicEpisode(input: { id: "${firstId}" }) { id } }`);
  ok(denied(del, 'deletePublicEpisode'), 'anonymous CANNOT delete an episode');
}

/* ---------------------------------------------------- no leakage in the payload */
ok(!/fsr\.test|@/.test(txt(items)), 'no email address appears anywhere in the public payload');
ok(!/riverside|joinUrl|LEADERSHIP ONLY/i.test(txt(items)),
   'no join link or leadership note appears in the public payload');

console.log('\n===================== RESULTS =====================');
pass.forEach((m) => console.log('  PASS ', m));
fail.forEach((m) => console.log('  FAIL ', m));
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
