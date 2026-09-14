/**
 * ADVERSARIAL SECURITY SUITE — runs against the LIVE AppSync API.
 *
 * The Postgres version of this app had 52 SQL assertions. Those don't port:
 * the rules now live in AppSync authorization plus the member-api Lambda. So
 * this signs in as real Cognito users and tries to break the promises made to
 * co-hosts at onboarding.
 *
 *   node scripts/security-test.mjs
 *
 * Every test is an ATTACK. A pass means the API refused.
 */
import { PEOPLE, token, gql } from './seed.mjs';

const pass = [], fail = [];
const ok = (c, m) => (c ? pass : fail).push(m);

/** AppSync denies either by erroring or by returning null/[]. Treat both as denied. */
const denied = (r, field) => {
  const errs = r.errors ?? [];
  if (errs.some((e) => /not authorized|Unauthorized/i.test(e.message))) return true;
  const d = r.data?.[field];
  if (d === null || d === undefined) return true;
  if (Array.isArray(d?.items)) return d.items.length === 0;
  return false;
};
const items = (r, field) => r.data?.[field]?.items ?? [];
const txt = (r) => JSON.stringify(r);

const L = (m, f) => `query { ${m} { items { ${f} } } }`;

async function main() {
  const curtis = PEOPLE.find((p) => p.name === 'Curtis');
  const imani = PEOPLE.find((p) => p.name === 'Imani');
  const stranger = PEOPLE.find((p) => p.name === 'Stranger');

  const lead = await token(curtis);
  const cohost = await token(imani);
  const nobody = await token(stranger);

  const allProfiles = items(await gql(lead, L('listProfiles', 'id displayName status')), 'listProfiles');
  const strangerId = (allProfiles.find((p) => p.displayName === 'Stranger') ?? {}).id;

  /**
   * Ids we need, fetched as leadership (who legitimately sees everything).
   *
   * Do NOT assume the seeded draft is still a draft. Someone clicking through
   * the demo published it, and because half these attacks need an unpublished
   * recording, the suite then died on `draft.id` of undefined — which reads
   * like a broken test, not like drifted data. Make the fixture rather than
   * hope for it.
   */
  const recs = items(await gql(lead, L('listRecordings', 'id title publishedAt')), 'listRecordings');
  const pub = recs.find((r) => r.publishedAt);
  if (!pub) throw new Error('No published recording — run `node scripts/seed.mjs` first.');

  let draft = recs.find((r) => !r.publishedAt);
  if (!draft) {
    console.log('no unpublished recording found — creating one for this run');
    // seasonId is required on Recording. Reuse the current season rather than
    // inventing one, so the probe sits in the same season as everything else.
    const seasons = items(await gql(lead, L('listSeasons', 'id name isCurrent')), 'listSeasons');
    const seasonId = (seasons.find((x) => x.isCurrent) ?? seasons[0] ?? {}).id;
    if (!seasonId) throw new Error('No season exists — run `node scripts/seed.mjs` first.');
    const made = await gql(lead, `mutation {
      createRecording(input: {
        seasonId: "${seasonId}",
        title: "UNPUBLISHED probe ${Date.now()}",
        scheduledAt: "2027-01-01T01:00:00Z",
        joinUrl: "https://riverside.fm/studio/SECRET-probe",
        source: manual
      }) { id title }
    }`);
    draft = made.data?.createRecording;
    if (!draft) throw new Error('could not create a draft fixture: ' + JSON.stringify(made.errors));
  }

  console.log('=============== ATTACKING AS A CO-HOST (Imani) ===============');

  // --- direct model reads must all be refused ---
  // Not "cannot see a PEER's" — cannot see ANY, including her own. The model is
  // not addressable from a member session in either direction.
  const prayerPeek = await gql(cohost, L('listPrayerRequests', 'id body'));
  ok(denied(prayerPeek, 'listPrayerRequests'),
     'cannot list prayer requests — not even her own');
  ok(denied(await gql(cohost, L('listRecordings', 'id title')), 'listRecordings'),
     'cannot list recordings directly (drafts stay hidden)');
  ok(denied(await gql(cohost, L('listGuests', 'id name adminNotes')), 'listGuests'),
     "cannot list guests (guest adminNotes are leadership-only)");
  const profs = items(await gql(cohost, L('listProfiles', 'id email displayName')), 'listProfiles');
  ok(profs.length <= 1, `co-host sees at most their own profile row (${profs.length})`);
  ok(!profs.some((p) => p.displayName && p.displayName !== 'Imani'),
     'co-host cannot enumerate the roster');
  ok(!txt(profs).includes('priya@fsr.test'), "co-host cannot read a peer's email");
  ok(denied(await gql(cohost, L('listNotes', 'id title body')), 'listNotes'),
     'cannot list notes directly (audience targeting bypassed)');
  ok(denied(await gql(cohost, L('listAttendees', 'id profileId')), 'listAttendees'),
     'cannot list the Attendee table directly');
  ok(denied(await gql(cohost, L('listMemberships', 'id profileId')), 'listMemberships'),
     'cannot list memberships');
  ok(denied(await gql(cohost, L('listInvites', 'id email code')), 'listInvites'),
     'cannot list invites');
  ok(denied(await gql(cohost, L('listQuestionLinks', 'id recordingId')), 'listQuestionLinks'),
     'cannot list question links (no draft id enumeration)');
  ok(denied(await gql(cohost, L('listEpisodes', 'id title url')), 'listEpisodes'),
     'cannot list episodes directly (unreleased stay hidden)');

  // --- the draft must be invisible AND indistinguishable from nonexistent ---
  const draftDirect = await gql(cohost,
    `query { getRecording(id: "${draft.id}") { id title joinUrl } }`);
  ok(denied(draftDirect, 'getRecording'), 'cannot getRecording on a draft directly');

  const draftViaApi = await gql(cohost,
    `query { getSession(id: "${draft.id}") { id title joinUrl } }`);
  ok(draftViaApi.data?.getSession === null,
     'getSession returns null for a draft (no existence oracle)');

  const fakeId = await gql(cohost,
    `query { getSession(id: "00000000-0000-0000-0000-000000000000") { id title } }`);
  ok(JSON.stringify(draftViaApi.data) === JSON.stringify(fakeId.data),
     'a draft is INDISTINGUISHABLE from a nonexistent id');

  /* --------------------------- the member-facing API returns published only
   * Assert the PROPERTY, not the seed's row count. This read `list.length === 1`
   * and started failing the moment leadership published a second recording
   * through the new editor — a green feature reported as a red test. The
   * security question was never "how many are there"; it is whether anything
   * unpublished got through.
   */
  const sessions = await gql(cohost, `query { listSessions { id title guestName } }`);
  const list = sessions.data?.listSessions ?? [];
  const publishedIds = new Set(recs.filter((r) => r.publishedAt).map((r) => r.id));
  ok(list.length > 0, `listSessions returns something (${list.length})`);
  ok(list.every((s) => publishedIds.has(s.id)),
     'every session a co-host can see is published');
  ok(!list.some((s) => s.id === draft.id), 'the draft is not among them');
  ok(!txt(sessions).includes('UNPUBLISHED'), 'no draft title leaks into listSessions');
  ok(!txt(sessions).includes('SECRET'), 'no draft joinUrl leaks into listSessions');
  ok(!txt(sessions).includes('LEADERSHIP ONLY'), 'guest adminNotes never reach a co-host');

  // --- notes: audience targeting ---
  const notes = await gql(cohost, `query { myNotes { id title body read } }`);
  const nt = txt(notes);
  ok(nt.includes('Week one'), 'co-host sees the all-hands note');
  ok(!nt.includes('ALUMNI ONLY'), 'co-host does NOT see the alumni-only note');
  ok(!nt.includes('UNPUBLISHED draft note'), 'co-host does NOT see an unpublished note');

  // --- episodes ---
  const eps = await gql(cohost, `query { publishedEpisodes { id title url } }`);
  ok(txt(eps).includes('wishful thinking'), 'co-host sees the released episode');
  ok(!txt(eps).includes('UNRELEASED'), 'co-host does NOT see the unreleased episode');
  ok(!txt(eps).includes('secret.mp3'), 'unreleased episode URL never leaks');

  // --- RSVP: the attendance asymmetry (spec §5.3) ---
  await gql(cohost, `mutation { submitRsvp(recordingId: "${pub.id}", response: "yes") }`);
  const priya = PEOPLE.find((p) => p.name === 'Priya');
  const nadia = PEOPLE.find((p) => p.name === 'Nadia');
  const priyaTok = await token(priya);
  const nadiaTok = await token(nadia);
  await gql(priyaTok, `mutation { submitRsvp(recordingId: "${pub.id}", response: "yes") }`);
  await gql(nadiaTok, `mutation { submitRsvp(recordingId: "${pub.id}", response: "no", note: "3am here") }`);

  const att = await gql(cohost, `query { sessionAttendees(recordingId: "${pub.id}") { id displayName } }`);
  const names = (att.data?.sessionAttendees ?? []).map((a) => a.displayName);
  ok(names.includes('Priya'), 'co-host CAN see a peer who said yes');
  ok(!names.includes('Nadia'), 'co-host CANNOT see a peer who said NO');
  ok(!names.includes('Maya'), 'co-host CANNOT see a peer who never answered');

  // Nadia's decline must not be reachable any other way.
  const peerRsvps = await gql(cohost, L('listRsvps', 'id profileId response note'));
  const seen = items(peerRsvps, 'listRsvps');
  ok(!txt(seen).includes('3am here'), "a decliner's private note is unreachable");
  /**
   * Check OWNERSHIP, not count. The previous form was
   *   seen.every((r) => r.profileId === undefined || seen.length <= 1)
   * which passes whenever the list happens to hold one row — including one
   * row belonging to somebody else — and short-circuits to true the moment
   * `profileId` isn't selected. Third assertion in this file found to be
   * green for the wrong reason.
   */
  const myProfileId = profs[0]?.id;
  ok(Boolean(myProfileId), 'co-host can read her own profile row (needed by the next check)');
  ok(seen.length > 0 && seen.every((r) => r.profileId === myProfileId),
     `every RSVP row a co-host can see is her own (${seen.length} rows)`);

  // Flipping to "no" must remove the attendee record entirely.
  await gql(priyaTok, `mutation { submitRsvp(recordingId: "${pub.id}", response: "no") }`);
  const att2 = await gql(cohost, `query { sessionAttendees(recordingId: "${pub.id}") { displayName } }`);
  const names2 = (att2.data?.sessionAttendees ?? []).map((a) => a.displayName);
  ok(!names2.includes('Priya'), 'changing yes→no removes the attendance record');

  // --- forging attendance directly must fail ---
  const forge = await gql(cohost, `mutation {
    createAttendee(input: { recordingId: "${pub.id}", profileId: "fake", displayName: "Forged" }) { id }
  }`);
  ok(denied(forge, 'createAttendee'), 'co-host cannot forge an Attendee row');

  /* ---------------------------------------------- privilege escalation ---
   * These use REAL row ids. The first version of this test passed id "x" and
   * "passed" because the row did not exist — it was asserting nothing. Every
   * attack below was live until the owner rules were cut back to read-only.
   */
  const myProfile = profs[0];
  const peerId = (items(await gql(lead, L('listProfiles', 'id displayName')), 'listProfiles')
    .find((p) => p.displayName === 'Priya') ?? {}).id;

  const esc = await gql(cohost, `mutation {
    updateProfile(input: { id: "${myProfile?.id}", role: admin }) { id role }
  }`);
  ok(denied(esc, 'updateProfile'), 'co-host cannot promote HERSELF to admin (real id)');

  const selfActivate = await gql(nobody, `mutation {
    updateProfile(input: { id: "${strangerId}", status: active }) { id status }
  }`);
  ok(denied(selfActivate, 'updateProfile'),
     'a PENDING account cannot activate itself');

  const stillNothing = await gql(nobody, `query { listSessions { id title } }`);
  ok((stillNothing.errors ?? []).length > 0 || (stillNothing.data?.listSessions ?? []).length === 0,
     'and it still gets nothing afterwards');

  // --- impersonation: the client used to supply profileId on every write ---
  const forgeRsvp = await gql(cohost, `mutation {
    createRsvp(input: { profileId: "${peerId}", recordingId: "${pub.id}", response: no, note: "FORGED" }) { id }
  }`);
  ok(denied(forgeRsvp, 'createRsvp'), "co-host cannot write an RSVP under a PEER's profileId");

  const forgePrayer = await gql(cohost, `mutation {
    createPrayerRequest(input: { profileId: "${peerId}", body: "FORGED" }) { id }
  }`);
  ok(denied(forgePrayer, 'createPrayerRequest'),
     'co-host cannot file a prayer request in a peer\'s name');

  const forgeQuestion = await gql(cohost, `mutation {
    createQuestion(input: { profileId: "${peerId}", recordingId: "${pub.id}", body: "FORGED" }) { id }
  }`);
  ok(denied(forgeQuestion, 'createQuestion'), "co-host cannot ask a question in a peer's name");

  const forgeReceipt = await gql(cohost, `mutation {
    createReceipt(input: { profileId: "${peerId}", targetType: note, targetId: "x", openedAt: "2026-01-01T00:00:00Z" }) { id }
  }`);
  ok(denied(forgeReceipt, 'createReceipt'),
     'co-host cannot fake a read receipt (leadership reads these as engagement)');

  // --- and the legitimate replacements still work ---
  const tzOk = await gql(cohost, `mutation { updateMyProfile(timezone: "America/Los_Angeles") }`);
  ok(!tzOk.errors && txt(tzOk).includes('true'), 'co-host CAN still set her own timezone');

  const roleViaLambda = await gql(cohost, `mutation { updateMyProfile(displayName: "Imani") }`);
  ok(!roleViaLambda.errors, 'co-host CAN still set her own display name');
  const after = items(await gql(cohost, L('listProfiles', 'id role status')), 'listProfiles');
  ok(after[0]?.role === 'member' && after[0]?.status === 'active',
     'and role/status are unreachable through that mutation');

  const mkNote = await gql(cohost, `mutation {
    createNote(input: { title: "forged", body: "x", audience: all }) { id }
  }`);
  ok(denied(mkNote, 'createNote'), 'co-host cannot publish a note');

  const pubDraft = await gql(cohost, `mutation {
    updateRecording(input: { id: "${draft.id}", publishedAt: "2026-01-01T00:00:00Z" }) { id }
  }`);
  ok(denied(pubDraft, 'updateRecording'), 'co-host cannot publish a draft recording');

  /* --------------------------------------------- scheduling is leadership's
   * The admin portal can now create and edit sessions directly. That is a new
   * write surface, so it gets attacked like every other one: a co-host must
   * not be able to put a session on the season's calendar, rename someone
   * else's, invent a guest, or even read the season list.
   */
  const cohostMake = await gql(cohost, `mutation {
    createRecording(input: { seasonId: "x", title: "FORGED", scheduledAt: "2027-01-01T00:00:00Z", source: manual }) { id }
  }`);
  ok(denied(cohostMake, 'createRecording'), 'co-host cannot schedule a session');

  const cohostEdit = await gql(cohost, `mutation {
    updateRecording(input: { id: "${pub.id}", title: "FORGED" }) { id }
  }`);
  ok(denied(cohostEdit, 'updateRecording'), "co-host cannot rename a session");

  const cohostGuest = await gql(cohost, `mutation {
    createGuest(input: { name: "FORGED" }) { id }
  }`);
  ok(denied(cohostGuest, 'createGuest'), 'co-host cannot invent a guest');

  ok(denied(await gql(cohost, L('listSeasons', 'id name')), 'listSeasons'),
     'co-host cannot list seasons');

  console.log('\n=============== AS A PENDING ACCOUNT (Stranger) ===============');
  // The AWS equivalent of the worst Postgres bug: any signup becoming a member.
  const sSessions = await gql(nobody, `query { listSessions { id title } }`);
  ok((sSessions.errors ?? []).length > 0 || (sSessions.data?.listSessions ?? []).length === 0,
     'a pending account gets NO sessions');
  const sNotes = await gql(nobody, `query { myNotes { id title } }`);
  ok((sNotes.errors ?? []).length > 0 || (sNotes.data?.myNotes ?? []).length === 0,
     'a pending account gets NO notes');
  const sProfs = items(await gql(nobody, L('listProfiles', 'id email')), 'listProfiles');
  ok(sProfs.length <= 1, `pending account sees at most its own row (${sProfs.length})`);
  ok(!txt(sProfs).includes('imani@fsr.test'), 'pending account cannot read peer emails');

  console.log('\n=============== AS LEADERSHIP (Curtis) ===============');
  const lp = await gql(lead, L('listPrayerRequests', 'id body'));
  ok(items(lp, 'listPrayerRequests').length >= 2, 'leadership CAN read prayer requests');
  ok(txt(lp).includes('SECRET'), 'leadership sees the actual prayer text');
  const lr = await gql(lead, L('listRecordings', 'id title publishedAt'));
  ok(items(lr, 'listRecordings').some((r) => !r.publishedAt), 'leadership CAN see drafts');
  const lg = await gql(lead, L('listGuests', 'id name adminNotes'));
  ok(txt(lg).includes('LEADERSHIP ONLY'), 'leadership CAN read guest admin notes');
  const lrs = await gql(lead, L('listRsvps', 'id response note'));
  ok(items(lrs, 'listRsvps').some((r) => r.response === 'no'), 'leadership CAN see declines');

  // The portal's new create/edit path, proven end to end and cleaned up after.
  const seasons = items(await gql(lead, L('listSeasons', 'id isCurrent')), 'listSeasons');
  const seasonId = (seasons.find((x) => x.isCurrent) ?? seasons[0] ?? {}).id;
  ok(Boolean(seasonId), 'leadership CAN read the season list');

  const made = await gql(lead, `mutation {
    createRecording(input: {
      seasonId: "${seasonId}", title: "PROBE from suite",
      scheduledAt: "2027-02-11T02:00:00Z", durationMinutes: 90, source: manual
    }) { id publishedAt }
  }`);
  const madeId = made.data?.createRecording?.id;
  ok(Boolean(madeId), 'leadership CAN schedule a session from the portal');
  ok(made.data?.createRecording?.publishedAt == null,
     'a session created in the portal starts UNPUBLISHED');

  if (madeId) {
    const edited = await gql(lead, `mutation {
      updateRecording(input: { id: "${madeId}", topic: "edited", questionsCovered: "a" }) { topic }
    }`);
    ok(edited.data?.updateRecording?.topic === 'edited',
       'leadership CAN edit the topic — the thing Overview always told them to do');

    const hidden = await gql(cohost, `query { getSession(id: "${madeId}") { id } }`);
    ok(hidden.data?.getSession === null, 'the new session is invisible to co-hosts until published');

    await gql(lead, `mutation { deleteRecording(input: { id: "${madeId}" }) { id } }`);
  }

  console.log('\n======================= RESULTS =======================');
  pass.forEach((m) => console.log('  PASS ', m));
  fail.forEach((m) => console.log('  FAIL ', m));
  console.log(`\n${pass.length} passed, ${fail.length} failed`);
  process.exit(fail.length ? 1 : 0);
}

main().catch((e) => { console.error('SUITE ERROR', e); process.exit(1); });
