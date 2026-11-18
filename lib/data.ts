/**
 * Data access layer.
 *
 * One API, two backends. In DEMO_MODE it reads mutable in-memory fixtures and
 * deliberately re-implements the privacy rules, so a reviewer clicking through
 * the demo sees exactly what the deployed backend allows. Otherwise it calls
 * AWS — and note the asymmetry:
 *
 *   Co-hosts  → custom queries only (listSessions, listAttendees, …). The
 *               member-api Lambda applies every value-based rule.
 *   Leadership → direct model access, which the AppSync authorization rules
 *               restrict to the `leadership` Cognito group.
 *
 * If you find yourself adding a model call on a co-host path, stop: that is
 * the mistake this whole design exists to prevent.
 */
import { DEMO_MODE, client } from './amplify';
import * as fx from './demo';
import { fetchAuthSession } from 'aws-amplify/auth';
import type {
  Profile, Recording, Rsvp, Note, Guest, Question, IntakeQuestion,
  PrayerRequest, Message, Inquiry, Episode, FsrEvent, Receipt, QuestionLink, PublicEpisode,
} from './types';

export { DEMO_MODE };

// Mutable copies so demo interactions persist for the session.
const db = {
  profiles: [...fx.profiles],
  recordings: fx.recordings.map((r) => ({ ...r })),
  rsvps: fx.rsvps.map((r) => ({ ...r })),
  notes: fx.notes.map((n) => ({ ...n })),
  guests: fx.guests.map((g) => ({ ...g })),
  questions: fx.questions.map((q) => ({ ...q })),
  intake: fx.intakeQuestions.map((q) => ({ ...q })),
  links: fx.questionLinks.map((l) => ({ ...l })),
  prayers: fx.prayerRequests.map((p) => ({ ...p })),
  messages: fx.messages.map((m) => ({ ...m })),
  receipts: fx.receipts.map((r) => ({ ...r })),
  episodes: [...fx.episodes],
  events: [...fx.events],
  memberships: [...fx.memberships],
};

const nowIso = () => new Date().toISOString();
const uid = () => `id-${Math.random().toString(36).slice(2, 10)}`;
const unwrap = <T,>(r: { data?: T | null }): T | null => (r?.data ?? null);
const unwrapList = <T,>(r: { data?: T[] | null }): T[] => (r?.data ?? []);

/**
 * Read an AWSJSON result.
 *
 * A custom mutation declared with `a.json()` does not hand the client an
 * object. It hands it the JSON TEXT: `{"ok":true}` arrives as an eleven
 * character string, `.ok` on a string is undefined, and every caller read a
 * success as a failure. Parse a string; pass an object through untouched (in
 * case the library ever starts decoding it); anything else, or text that is
 * not JSON, is the fallback.
 */
const awsJson = <T,>(raw: unknown, fallback: T): T => {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

/**
 * Paginating list.
 *
 * DynamoDB's Limit caps rows SCANNED, not rows returned after the filter is
 * applied — so a filtered list can come back EMPTY while the row exists, and a
 * short one is not a signal that there is nothing more. This bit us twice:
 * once in member-api (`limit: 1` reading the caller's own profile) and once in
 * getMyRsvp, where an RSVP wrote successfully and then read back as "no answer
 * yet", which looked like the button was broken.
 *
 * Never call `.list()` with a filter directly. Use this.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyList = (a?: any) => Promise<{ data?: any[] | null; nextToken?: string | null }>;

async function listAll<F extends AnyList>(
  fn: F,
  args: Omit<NonNullable<Parameters<F>[0]>, 'nextToken'>,
): Promise<NonNullable<Awaited<ReturnType<F>>['data']>> {
  const out: any[] = [];
  let nextToken: string | null | undefined;
  let pages = 0;
  do {
    const r = await fn({ limit: 1000, ...args, nextToken });
    out.push(...(r?.data ?? []));
    nextToken = r?.nextToken;
  } while (nextToken && ++pages < 20); // 20k rows is far past this ministry's scale
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ------------------------------------------------------------------ people */

type ProfileModel = {
  id: string; email?: string | null; displayName: string;
  role?: string | null; timezone?: string | null; status?: string | null;
};

function fromProfileModel(p: ProfileModel): Profile {
  return {
    id: p.id,
    display_name: p.displayName,
    role: (p.role ?? 'member') as Profile['role'],
    timezone: p.timezone ?? 'America/Los_Angeles',
    status: p.status ?? 'active',
    email: p.email ?? undefined,
  };
}

/**
 * The signed-in user's own row, resolved from their Cognito `sub`.
 *
 * Profile.id is a DynamoDB uuid, NOT the sub — the two are different values,
 * which is the thing that made the Supabase code (where profiles.id WAS the
 * auth id) unportable. `owner` carries the sub.
 *
 * limit is deliberately large: DynamoDB's Limit caps rows SCANNED, not rows
 * returned after the filter. A small limit here scans one unrelated row,
 * discards it, and reports "no such member". Same trap as member-api.
 */
export async function getMyProfile(sub: string): Promise<Profile | null> {
  if (DEMO_MODE) return null;
  const rows = await listAll(client.models.Profile.list, {
    filter: { owner: { contains: sub } },
  });
  return rows[0] ? fromProfileModel(rows[0] as ProfileModel) : null;
}

export async function getProfile(id: string): Promise<Profile | null> {
  if (DEMO_MODE) return db.profiles.find((p) => p.id === id) ?? null;
  const p = unwrap(await client.models.Profile.get({ id }));
  return p ? fromProfileModel(p) : null;
}

/** Leadership only. Co-hosts get names via listAttendees, never the roster. */
export async function listMembers(): Promise<Profile[]> {
  if (DEMO_MODE) return db.profiles.filter((p) => p.status === 'active');
  return unwrapList(await client.models.Profile.list({ limit: 200 })).map(fromProfileModel);
}

/**
 * The current co-hosts: role member, not removed. What every leadership count
 * and roster is about. listMembers itself keeps removed people, because
 * questions, messages and prayer requests they sent still need a name.
 * (Demo mode already filtered them; production showed removed accounts on
 * Responses until 8 Nov 2026.)
 */
export async function listCohosts(): Promise<Profile[]> {
  return (await listMembers()).filter((m) => m.role === 'member' && m.status !== 'removed');
}

/**
 * Leadership's People screen: everyone, including removed accounts, which sort
 * to the bottom so they can be found and restored without crowding the list.
 */
export async function listPeople(): Promise<Profile[]> {
  if (DEMO_MODE) return [...db.profiles];
  const rows = await listAll(client.models.Profile.list, {});
  return rows
    .map(fromProfileModel)
    .sort((a, b) =>
      (a.status === 'removed') !== (b.status === 'removed')
        ? (a.status === 'removed' ? 1 : -1)
        : a.display_name.localeCompare(b.display_name));
}

export async function updateMyProfile(
  id: string, patch: Partial<Pick<Profile, 'display_name' | 'timezone'>>,
) {
  if (DEMO_MODE) {
    const p = db.profiles.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
    return;
  }
  // Through the Lambda, not the model. Direct Profile.update was writable by
  // the owner, which meant status and role were too — a pending account could
  // activate itself. The mutation only accepts these two fields.
  await client.mutations.updateMyProfile({
    displayName: patch.display_name ?? null,
    timezone: patch.timezone ?? null,
  });
}

/* --------------------------------------------------------------- public */

/**
 * Which auth mode reads PublicEpisode.
 *
 * Signed out, it has to be `identityPool`: AppSync authorises as the identity
 * pool's *unauthenticated* role. Signed in, that did not work — this always
 * asked as the guest role, and a signed-in co-host got no episodes. So: the
 * user pool when there is an id token, the guest role otherwise (or if the
 * session cannot be read at all).
 */
async function publicReadMode(): Promise<'userPool' | 'identityPool'> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken ? 'userPool' : 'identityPool';
  } catch {
    return 'identityPool';
  }
}

/**
 * The ministry's YouTube catalogue. THE ONLY DATA PATH THAT WORKS SIGNED OUT.
 *
 * The guest (identity pool) role is what makes that true. PublicEpisode is the
 * one model that role can touch, and it can only read. Do not reach for the
 * guest role on any other model — every other model is deliberately
 * unreachable from it, and the security suite signs in as nobody at all to
 * prove that stays true. (The push and interest mutations below use it too;
 * they are Lambdas that take no identity, not models.)
 */
export async function listPublicEpisodes(): Promise<PublicEpisode[]> {
  if (DEMO_MODE) {
    return [...fx.publicEpisodes].sort((a, b) => b.published_at.localeCompare(a.published_at));
  }
  const rows = await listAll(client.models.PublicEpisode.list, { authMode: await publicReadMode() });
  return rows
    .map((r) => ({
      id: r.id,
      video_id: r.videoId,
      title: r.title,
      url: r.url,
      thumbnail_url: r.thumbnailUrl ?? null,
      published_at: r.publishedAt,
      kind: (r.kind ?? 'episode') as PublicEpisode['kind'],
      blurb: r.blurb ?? null,
    }))
    .sort((a, b) => b.published_at.localeCompare(a.published_at));
}

/* ---------------------------------------------------------- co-host accounts */

/**
 * Leadership issues co-host accounts; nobody registers themselves.
 *
 * All three go through admin-api. provisionCohost takes no role, group or
 * status — the group is a constant `cohost` in the Lambda — so no input from
 * here can produce a leader. Reset and deactivate refuse leadership targets,
 * checked against Cognito group membership rather than Profile.role.
 */
export type AdminResult = {
  ok: boolean;
  error?: string;
  profileId?: string;
  temporaryPassword?: string;
  emailed?: boolean;
};

/** These mutations return a.json(), so `data` may be text. See awsJson. */
const asJson = (raw: unknown): AdminResult | null => {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as AdminResult;
  try {
    return JSON.parse(String(raw)) as AdminResult;
  } catch {
    return null;
  }
};

/** The temporary password comes back once, to be shown once; she is also emailed it. */
export async function provisionCohost(
  email: string, displayName: string, timezone: string,
): Promise<AdminResult> {
  if (DEMO_MODE) {
    return { ok: true, profileId: uid(), temporaryPassword: 'Cedar-Harbor-4192!', emailed: true };
  }
  const r = await client.mutations.provisionCohost({ email, displayName, timezone });
  if (r.errors?.length) return { ok: false, error: r.errors[0].message };
  return asJson(r.data) ?? { ok: false, error: 'no_response' };
}

export async function resetCohostPassword(profileId: string): Promise<AdminResult> {
  if (DEMO_MODE) return { ok: true, temporaryPassword: 'Willow-Compass-8317!' };
  const r = await client.mutations.resetCohostPassword({ profileId });
  if (r.errors?.length) return { ok: false, error: r.errors[0].message };
  return asJson(r.data) ?? { ok: false, error: 'no_response' };
}

export async function setCohostActive(profileId: string, active: boolean): Promise<AdminResult> {
  if (DEMO_MODE) {
    const p = db.profiles.find((x) => x.id === profileId);
    if (p) p.status = active ? 'active' : 'removed';
    return { ok: true };
  }
  const r = await client.mutations.setCohostActive({ profileId, active });
  if (r.errors?.length) return { ok: false, error: r.errors[0].message };
  return asJson(r.data) ?? { ok: false, error: 'no_response' };
}

/* ----------------------------------------------------------------- push */

/**
 * A signed-in co-host's device. push-api turns her co-host categories on only
 * when a device moves from listener to member; a co-host who switched one off
 * keeps her choice. Failure is false, never a throw.
 */
/**
 * Did push-api accept the registration? It answers { ok: false, error } as
 * DATA, not as a GraphQL error, so checking r.errors alone reported refusals
 * (no_profile, invalid_token) as success and the phone silently stayed
 * unregistered. A JSON field may arrive as a string or already parsed.
 * Anything other than an explicit ok: false still counts as accepted, so an
 * unexpected shape cannot turn working registrations into failures.
 */
function accepted(r: { data?: unknown; errors?: unknown[] | null }): boolean {
  if (r.errors?.length) return false;
  let d = r.data;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return true; } }
  return !(d && typeof d === 'object' && (d as { ok?: unknown }).ok === false);
}

export async function registerMemberPushToken(
  token: string, platform: string, deviceLabel?: string | null,
): Promise<boolean> {
  if (DEMO_MODE) return true;
  try {
    const r = await client.mutations.registerPushToken({ token, platform, deviceLabel });
    return accepted(r);
  } catch {
    return false;
  }
}

/**
 * A listener: no account, new-episode announcements only. Stored against the
 * device token and no profile, which is why it goes as the guest role.
 */
export async function registerListenerPushToken(token: string, platform: string): Promise<boolean> {
  if (DEMO_MODE) return true;
  try {
    const r = await client.mutations.registerListenerPushToken(
      { token, platform },
      { authMode: 'identityPool' },
    );
    return accepted(r);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------- interest */

export interface InterestInput {
  name: string;
  email: string;
  phone?: string | null;
  note?: string | null;
}

/**
 * The public interest form. Signed out, so the guest role, through public-api.
 * The result is AWSJSON — this is the call that read every success as a
 * failure until awsJson existed.
 */
export async function submitInterest(
  input: InterestInput,
): Promise<{ ok: boolean; invalid?: string[] }> {
  if (DEMO_MODE) return { ok: true };
  try {
    const r = await client.mutations.submitInterest(input, { authMode: 'identityPool' });
    if (r.errors?.length) return { ok: false };
    const body = awsJson<{ ok?: boolean; invalid?: string[] }>(r.data, {});
    return { ok: body.ok === true, invalid: body.invalid };
  } catch {
    return { ok: false };
  }
}

/** Leadership only. Unanswered first, then newest. */
export async function listInquiries(): Promise<Inquiry[]> {
  if (DEMO_MODE) return [];
  return unwrapList(await client.models.Inquiry.list({ limit: 500 }))
    .map((q) => ({
      id: q.id, name: q.name, email: q.email, phone: q.phone, note: q.note,
      source: q.source ?? 'app',
      handled: q.handled ?? false,
      handled_at: q.handledAt,
      submitted_at: q.createdAt ?? nowIso(),
    }))
    .sort((a, b) =>
      Number(a.handled) - Number(b.handled) || b.submitted_at.localeCompare(a.submitted_at));
}

export async function markInquiryHandled(id: string, handled: boolean) {
  if (DEMO_MODE) return;
  await client.models.Inquiry.update({ id, handled, handledAt: handled ? nowIso() : null });
}

/* ------------------------------------------------------------- push prefs */

export async function unregisterPushToken(token: string): Promise<boolean> {
  if (DEMO_MODE) return true;
  try {
    const r = await client.mutations.unregisterPushToken(
      { token },
      { authMode: 'identityPool' },
    );
    return !r.errors?.length;
  } catch {
    return false;
  }
}

export interface PushPrefs {
  wantsSessions: boolean;
  wantsReminders: boolean;
  wantsNotes: boolean;
  wantsEpisodes: boolean;
}

/** Anything not explicitly switched off counts as on. */
const asPrefs = (raw: unknown): PushPrefs | null => {
  const p = raw as Partial<PushPrefs> | null;
  return p && typeof p === 'object'
    ? {
        wantsSessions: p.wantsSessions !== false,
        wantsReminders: p.wantsReminders !== false,
        wantsNotes: p.wantsNotes !== false,
        wantsEpisodes: p.wantsEpisodes !== false,
      }
    : null;
};

export async function setPushPrefs(
  token: string, prefs: Partial<PushPrefs>,
): Promise<PushPrefs | null> {
  if (DEMO_MODE) return null;
  try {
    const r = await client.mutations.setPushPrefs(
      { token, ...prefs },
      { authMode: 'identityPool' },
    );
    return asPrefs(r.data);
  } catch {
    return null;
  }
}

export async function getPushPrefs(token: string): Promise<PushPrefs | null> {
  if (DEMO_MODE) return null;
  try {
    const r = await client.queries.myPushPrefs({ token }, { authMode: 'identityPool' });
    return asPrefs(r.data);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------- recordings */

export async function listRecordings(isAdmin: boolean): Promise<Recording[]> {
  if (DEMO_MODE) {
    return db.recordings
      .filter((r) => isAdmin || r.published_at)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  }
  if (isAdmin) {
    const rows = unwrapList(await client.models.Recording.list({ limit: 500 }));
    return rows
      .map(fromRecordingModel)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  }
  // Co-host path: the Lambda has already filtered to published.
  const rows = unwrapList(await client.queries.listSessions());
  return rows.map(fromSessionView);
}

export async function getRecording(id: string): Promise<Recording | null> {
  if (DEMO_MODE) return db.recordings.find((r) => r.id === id) ?? null;
  const view = unwrap(await client.queries.getSession({ id }));
  return view ? fromSessionView(view) : null;
}

/**
 * The current season's id. Recording requires one, and until now nothing in
 * the app ever created a Recording, so nothing needed to know it.
 */
export async function currentSeasonId(): Promise<string | null> {
  if (DEMO_MODE) return db.recordings[0]?.season_id ?? 'demo-season';
  const rows = await listAll(client.models.Season.list, {});
  return (rows.find((s) => s.isCurrent) ?? rows[0])?.id ?? null;
}

export interface RecordingDraft {
  title: string;
  scheduled_at: string;          // UTC ISO — build it with zonedToUtcIso
  duration_minutes: number;
  guest_id: string | null;
  topic: string | null;
  questions_covered: string | null;
  join_url: string | null;
}

/**
 * Create a session.
 *
 * There was no way to do this. Recordings could only arrive from the Calendly
 * webhook — which is not built — or the seed script, while the Overview told
 * leadership to "add the topic and questions" on a screen that had no fields.
 * No backend change was needed for this: Recording is already
 * allow.group('leadership'), so the capability existed and only the UI was
 * missing.
 *
 * Created unpublished on purpose. Publishing is the step that notifies
 * co-hosts, and it stays a separate, deliberate action.
 */
export async function createRecording(draft: RecordingDraft): Promise<string | null> {
  const seasonId = (await currentSeasonId()) ?? '';
  if (DEMO_MODE) {
    const id = uid();
    db.recordings.push({
      id, season_id: seasonId, guest_id: draft.guest_id, title: draft.title,
      topic: draft.topic, questions_covered: draft.questions_covered, description: null,
      scheduled_at: draft.scheduled_at, duration_minutes: draft.duration_minutes,
      join_url: draft.join_url, published_at: null, announce_at: null, announced_at: null,
      source: 'manual',
    });
    return id;
  }
  const r = await client.models.Recording.create({
    seasonId,
    title: draft.title,
    scheduledAt: draft.scheduled_at,
    durationMinutes: draft.duration_minutes,
    guestId: draft.guest_id,
    topic: draft.topic,
    questionsCovered: draft.questions_covered,
    joinUrl: draft.join_url,
    source: 'manual',
  });
  return r?.data?.id ?? null;
}

/** Edit a session. Publishing stays in publishRecording — this never publishes. */
export async function updateRecording(id: string, draft: RecordingDraft) {
  if (DEMO_MODE) {
    const r = db.recordings.find((x) => x.id === id);
    if (r) Object.assign(r, {
      title: draft.title, scheduled_at: draft.scheduled_at,
      duration_minutes: draft.duration_minutes, guest_id: draft.guest_id,
      topic: draft.topic, questions_covered: draft.questions_covered,
      join_url: draft.join_url,
    });
    return;
  }
  await client.models.Recording.update({
    id,
    title: draft.title,
    scheduledAt: draft.scheduled_at,
    durationMinutes: draft.duration_minutes,
    guestId: draft.guest_id,
    topic: draft.topic,
    questionsCovered: draft.questions_covered,
    joinUrl: draft.join_url,
  });
}

/** Minimal guest creation, so naming a new guest doesn't need a second screen. */
export async function createGuest(name: string): Promise<string | null> {
  if (DEMO_MODE) {
    const id = uid();
    db.guests.push({
      id, name, photo_url: null, blurb: null, external_url: null,
      returning_override: null, admin_notes: null,
    });
    return id;
  }
  const g = await client.models.Guest.create({ name });
  return g?.data?.id ?? null;
}

export async function publishRecording(id: string, announceAt: string | null) {
  if (DEMO_MODE) {
    const r = db.recordings.find((x) => x.id === id);
    if (r) {
      r.published_at = nowIso();
      r.announce_at = announceAt;
      r.announced_at = announceAt ? null : nowIso();
    }
    return;
  }
  await client.models.Recording.update({
    id, publishedAt: nowIso(), announceAt,
    announcedAt: announceAt ? null : nowIso(),
  });
}

export type WithdrawResult = { ok: boolean; error?: string };

/**
 * Withdraw a session, through admin-api.
 *
 * Six tables point at a recording and none of them cascade — a QuestionLink
 * left behind would quietly keep marking someone "covered" — so the Lambda
 * removes the children first. A published session is called off (cancelledAt)
 * and everyone invited is told once; withdrawing it again deletes it. A draft
 * goes in one step, because nobody was ever told it existed.
 */
export async function withdrawRecording(id: string): Promise<WithdrawResult> {
  if (DEMO_MODE) {
    const i = db.recordings.findIndex((r) => r.id === id);
    if (i < 0) return { ok: false, error: 'not_found' };
    db.recordings.splice(i, 1);
    db.rsvps = db.rsvps.filter((r) => r.recording_id !== id);
    return { ok: true };
  }
  const r = await client.mutations.withdrawRecording({ recordingId: id });
  if (r.errors?.length) return { ok: false, error: 'failed' };
  return awsJson<WithdrawResult>(r.data, { ok: false, error: 'failed' });
}

/* -------------------------------------------------------------------- RSVP */

/**
 * SPEC §5.3 — only people who said YES. On AWS this is structural: an
 * Attendee row exists solely for a yes, so a decline has nothing to leak.
 */
export async function listAttendees(recordingId: string): Promise<Profile[]> {
  if (DEMO_MODE) {
    const yes = db.rsvps.filter((r) => r.recording_id === recordingId && r.response === 'yes');
    return yes
      .map((r) => db.profiles.find((p) => p.id === r.profile_id))
      .filter((p): p is Profile => Boolean(p));
  }
  const rows = unwrapList(await client.queries.sessionAttendees({ recordingId }));
  return rows.map((r) => ({
    id: String(r?.id ?? ''),
    display_name: String(r?.displayName ?? ''),
    role: 'member' as const,
    timezone: r?.timezone ?? 'America/Los_Angeles',
    status: 'active',
  }));
}

export async function getMyRsvp(recordingId: string, me: string): Promise<Rsvp | null> {
  if (DEMO_MODE) {
    return db.rsvps.find((r) => r.recording_id === recordingId && r.profile_id === me) ?? null;
  }
  const rows = await listAll(client.models.Rsvp.list, {
    filter: { profileId: { eq: me }, recordingId: { eq: recordingId } },
  });
  const r = rows[0];
  return r ? {
    profile_id: r.profileId, recording_id: r.recordingId,
    response: (r.response ?? 'no') as 'yes' | 'no',
    note: r.note ?? null, responded_at: r.respondedAt ?? nowIso(),
  } : null;
}

/**
 * Returns the resulting RSVP. Callers should use it rather than re-reading —
 * AppSync list reads are eventually consistent, so a read-back issued straight
 * after this write can return the previous answer.
 */
export async function setRsvp(
  recordingId: string, me: string, response: 'yes' | 'no', note?: string,
): Promise<Rsvp> {
  const row: Rsvp = {
    profile_id: me, recording_id: recordingId, response,
    note: note ?? null, responded_at: nowIso(),
  };
  if (DEMO_MODE) {
    const existing = db.rsvps.find((r) => r.recording_id === recordingId && r.profile_id === me);
    if (existing) Object.assign(existing, { response, note, responded_at: row.responded_at });
    else db.rsvps.push({ ...row });
    return row;
  }
  // Goes through the Lambda so Rsvp and Attendee can never disagree, and so a
  // client cannot forge attendance by writing an Attendee row directly.
  await client.mutations.submitRsvp({ recordingId, response, note: note ?? null });
  return row;
}

/**
 * Can notifications reach her phone? Per co-host: 'on' — a live phone with
 * this category switched on; 'muted' — a phone, but this category is off;
 * 'off' — no phone registered at all (never turned notifications on in the
 * app, or never installed it). Read from PushToken, which only leadership can.
 */
export type PushReach = 'on' | 'muted' | 'off';
type PushCategory = 'wantsSessions' | 'wantsReminders' | 'wantsNotes' | 'wantsEpisodes';

export async function pushReach(category: PushCategory): Promise<Map<string, PushReach>> {
  const out = new Map<string, PushReach>();
  if (DEMO_MODE) {
    // The demo has no devices; a delivered receipt stands in for "has a phone".
    for (const r of db.receipts) if (r.delivered_at) out.set(r.profile_id, 'on');
    return out;
  }
  const rows = await listAll(client.models.PushToken.list, {});
  for (const t of rows) {
    if (!t.profileId || t.retiredAt) continue;
    const here: PushReach = t[category] === false ? 'muted' : 'on';
    // Any one phone that will get it is enough.
    if (out.get(t.profileId) !== 'on') out.set(t.profileId, here);
  }
  return out;
}

/**
 * When each person was sent a notification about this target, by profile id.
 *
 * NotificationLog is written by the outbox and is the only record of a push
 * going out — sentAt is set once Expo has accepted it for her phones. Kinds
 * are matched by prefix ('session' covers session_invite, session_moved:… and
 * session_cancelled).
 */
async function notifiedAt(targetId: string, kindPrefix: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (DEMO_MODE) {
    for (const r of db.receipts) if (r.target_id === targetId && r.delivered_at) out.set(r.profile_id, r.delivered_at);
    return out;
  }
  const rows = await listAll(client.models.NotificationLog.list, {
    filter: { targetId: { eq: targetId } },
  });
  for (const l of rows) {
    if (!l.profileId || !l.sentAt || !String(l.kind).startsWith(kindPrefix)) continue;
    const prev = out.get(l.profileId);
    if (!prev || l.sentAt < prev) out.set(l.profileId, l.sentAt);
  }
  return out;
}

/**
 * Admin view: the full roster including declines and silence, and whether the
 * invitation reached each co-host's phone.
 *
 * Until 8 Nov 2026 "delivered" and "opened" here came from Receipt rows for
 * NOTES — written only when someone opened a note in the app, never by the
 * push outbox — so everyone who had not opened a note showed "NOT DELIVERED —
 * Push is off", including co-hosts who had been sent every invitation.
 */
export async function rsvpRoster(recordingId: string) {
  const members = await listCohosts();
  let rows: Rsvp[] = [];

  if (DEMO_MODE) {
    rows = db.rsvps.filter((r) => r.recording_id === recordingId);
  } else {
    rows = (await listAll(client.models.Rsvp.list, {
      filter: { recordingId: { eq: recordingId } },
    })).map((r) => ({
      profile_id: r.profileId, recording_id: r.recordingId,
      response: (r.response ?? 'no') as 'yes' | 'no',
      note: r.note ?? null, responded_at: r.respondedAt ?? '',
    }));
  }
  const [reach, sent] = await Promise.all([
    pushReach('wantsSessions'),
    notifiedAt(recordingId, 'session'),
  ]);

  return members.map((m) => {
    const rsvp = rows.find((r) => r.profile_id === m.id) ?? null;
    return {
      member: m,
      response: rsvp?.response ?? null,
      respondedAt: rsvp?.responded_at ?? null,
      note: rsvp?.note ?? null,
      notifiedAt: sent.get(m.id) ?? null,
      push: reach.get(m.id) ?? ('off' as PushReach),
    };
  });
}

/**
 * Yes / can't-make-it counts for every session at once, current co-hosts only —
 * for the session picker on Responses, so leaders can see where each one
 * stands without opening it.
 */
export async function rsvpCounts(): Promise<Map<string, { yes: number; no: number }>> {
  const ids = new Set((await listCohosts()).map((m) => m.id));
  const rows: { recording_id: string; profile_id: string; response: string }[] = DEMO_MODE
    ? db.rsvps
    : (await listAll(client.models.Rsvp.list, {})).map((r) => ({
        recording_id: r.recordingId, profile_id: r.profileId, response: r.response ?? 'no',
      }));
  const out = new Map<string, { yes: number; no: number }>();
  for (const r of rows) {
    if (!ids.has(r.profile_id)) continue;
    const c = out.get(r.recording_id) ?? { yes: 0, no: 0 };
    if (r.response === 'yes') c.yes += 1; else c.no += 1;
    out.set(r.recording_id, c);
  }
  return out;
}

/* ------------------------------------------------------------------- notes */

export async function listNotesFor(me: string): Promise<Note[]> {
  if (DEMO_MODE) {
    const mine = db.memberships.filter((m) => m.profile_id === me);
    const isCohort = mine.some((m) => m.kind === 'cohort');
    const isAlum = mine.some((m) => m.kind === 'alum');
    return db.notes
      .filter((n) => n.published_at)
      .filter((n) =>
        n.audience === 'all' ||
        (n.audience === 'cohort' && isCohort) ||
        (n.audience === 'alumni' && isAlum) ||
        (n.audience === 'custom' && n.recipient_ids.includes(me)))
      .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
  }
  // Audience targeting is resolved server-side.
  return unwrapList(await client.queries.myNotes()).map((n) => ({
    id: String(n?.id), title: String(n?.title), body: String(n?.body),
    link_url: n?.linkUrl ?? null, link_label: n?.linkLabel ?? null,
    author_id: null, audience: 'all' as const, recipient_ids: [],
    published_at: n?.publishedAt ?? null,
  }));
}

export async function listAllNotes(): Promise<Note[]> {
  if (DEMO_MODE) {
    return [...db.notes].sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
  }
  return unwrapList(await client.models.Note.list({ limit: 200 }))
    .map((n) => ({
      id: n.id, title: n.title, body: n.body,
      link_url: n.linkUrl ?? null, link_label: n.linkLabel ?? null,
      author_id: n.authorId ?? null,
      audience: (n.audience ?? 'all') as Note['audience'],
      recipient_ids: (n.recipientIds ?? []).filter(Boolean) as string[],
      published_at: n.publishedAt ?? null,
    }))
    .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
}

export async function createNote(n: Omit<Note, 'id'>): Promise<Note> {
  const row = { ...n, id: uid() } as Note;
  if (DEMO_MODE) { db.notes.unshift(row); return row; }
  const res = await client.models.Note.create({
    title: n.title, body: n.body,
    linkUrl: n.link_url ?? null, linkLabel: n.link_label ?? null,
    authorId: n.author_id ?? null, audience: n.audience,
    recipientIds: n.recipient_ids, publishedAt: n.published_at ?? null,
  });
  return (unwrap(res) ? { ...row, id: unwrap(res)!.id } : row);
}

/** Personalises {first_name} on group sends. Spec §5.6. */
export function renderNoteBody(body: string, name: string): string {
  return body.replace(/\{first_name\}/g, name);
}

export async function unreadNoteFor(me: string): Promise<Note | null> {
  if (!DEMO_MODE) {
    const rows = unwrapList(await client.queries.myNotes());
    const first = rows.find((n) => !n?.read);
    return first ? {
      id: String(first.id), title: String(first.title), body: String(first.body),
      link_url: first.linkUrl ?? null, link_label: first.linkLabel ?? null,
      author_id: null, audience: 'all', recipient_ids: [],
      published_at: first.publishedAt ?? null,
    } : null;
  }
  const all = await listNotesFor(me);
  const read = db.receipts.filter((r) => r.profile_id === me && r.target_type === 'note' && r.opened_at);
  const readIds = new Set(read.map((r) => r.target_id));
  return all.find((n) => !readIds.has(n.id)) ?? null;
}

export async function markRead(me: string, targetType: string, targetId: string) {
  if (DEMO_MODE) {
    const found = db.receipts.find(
      (r) => r.profile_id === me && r.target_type === targetType && r.target_id === targetId);
    if (found) found.opened_at = nowIso();
    else db.receipts.push({
      id: uid(), profile_id: me, target_type: targetType, target_id: targetId,
      delivered_at: nowIso(), opened_at: nowIso(),
    });
    return;
  }
  await client.mutations.markRead({ targetType, targetId });
}

/**
 * For a sent note: how many co-hosts opened it in the app (Receipt, written by
 * markRead) and how many were sent a notification about it (NotificationLog).
 */
export async function readStats(noteId: string) {
  const members = await listCohosts();
  const rs: Receipt[] = DEMO_MODE
    ? db.receipts.filter((r) => r.target_type === 'note' && r.target_id === noteId)
    : (await listAll(client.models.Receipt.list, {
        filter: { targetType: { eq: 'note' }, targetId: { eq: noteId } },
      })).map((r) => ({
        id: r.id, profile_id: r.profileId, target_type: 'note', target_id: r.targetId,
        delivered_at: r.deliveredAt ?? null, opened_at: r.openedAt ?? null,
      }));
  const ids = new Set(members.map((m) => m.id));
  const opened = rs.filter((r) => r.opened_at && ids.has(r.profile_id)).length;
  const sent = await notifiedAt(noteId, 'note');
  const notified = members.filter((m) => sent.has(m.id)).length;
  return { total: members.length, opened, notified };
}

/** Co-hosts that a new-recording invitation cannot reach at all, by name. */
export async function pushOff(): Promise<Profile[]> {
  const [members, reach] = await Promise.all([listCohosts(), pushReach('wantsSessions')]);
  return members.filter((m) => reach.get(m.id) !== 'on');
}

/* --------------------------------------------------------------- questions */

export async function submitQuestion(me: string, recordingId: string, body: string) {
  if (DEMO_MODE) {
    db.questions.push({ id: uid(), profile_id: me, recording_id: recordingId, body, submitted_at: nowIso() });
    return;
  }
  // profileId is set server-side from the caller. Passing it from here let a
  // co-host file a question under a peer's name.
  await client.mutations.submitQuestion({ recordingId, body });
}

export async function listQuestions(): Promise<(Question & { author?: Profile })[]> {
  const people = await listMembers();
  const rows: Question[] = DEMO_MODE
    ? db.questions
    : unwrapList(await client.models.Question.list({ limit: 500 })).map((q) => ({
        id: q.id, profile_id: q.profileId, recording_id: q.recordingId,
        body: q.body, submitted_at: q.createdAt ?? nowIso(),
      }));
  return rows.map((q) => ({ ...q, author: people.find((p) => p.id === q.profile_id) }));
}

export async function listIntake(): Promise<(IntakeQuestion & { author?: Profile; recordings: string[] })[]> {
  const people = await listMembers();
  let rows: IntakeQuestion[];
  let links: QuestionLink[];
  if (DEMO_MODE) {
    rows = db.intake; links = db.links;
  } else {
    rows = unwrapList(await client.models.IntakeQuestion.list({ limit: 500 })).map((q) => ({
      id: q.id, profile_id: q.profileId, season_id: q.seasonId, body: q.body,
      kind: (q.kind ?? 'question') as IntakeQuestion['kind'],
      source: (q.source ?? 'form') as IntakeQuestion['source'],
      submitted_at: q.createdAt ?? nowIso(),
    }));
    links = unwrapList(await client.models.QuestionLink.list({ limit: 500 })).map((l) => ({
      intake_question_id: l.intakeQuestionId, recording_id: l.recordingId,
      assigned_at: l.createdAt ?? nowIso(),
    }));
  }
  return rows.map((q) => ({
    ...q,
    author: people.find((p) => p.id === q.profile_id),
    recordings: links.filter((l) => l.intake_question_id === q.id).map((l) => l.recording_id),
  }));
}

export async function assignIntake(intakeId: string, recordingId: string) {
  if (DEMO_MODE) {
    if (!db.links.find((l) => l.intake_question_id === intakeId && l.recording_id === recordingId)) {
      db.links.push({ intake_question_id: intakeId, recording_id: recordingId, assigned_at: nowIso() });
    }
    return;
  }
  await client.models.QuestionLink.create({ intakeQuestionId: intakeId, recordingId });
}

/** "This one came from your question." Populated server-side for co-hosts. */
export async function myQuestionForRecording(me: string, recordingId: string): Promise<IntakeQuestion | null> {
  if (DEMO_MODE) {
    const links = db.links.filter((l) => l.recording_id === recordingId);
    const ids = new Set(links.map((l) => l.intake_question_id));
    return db.intake.find((q) => q.profile_id === me && ids.has(q.id)) ?? null;
  }
  const view = unwrap(await client.queries.getSession({ id: recordingId }));
  return view?.yourQuestion
    ? {
        id: 'linked', profile_id: me, season_id: '', body: String(view.yourQuestion),
        kind: 'question', source: 'retreat', submitted_at: nowIso(),
      }
    : null;
}

/**
 * Two different problems that used to be one number.
 *
 * `coverageGaps` returned every co-host without an answered question, which
 * silently merged "she asked something and we haven't covered it" with "she
 * has never submitted anything". Those need opposite responses from Janell —
 * the first is a scheduling job, the second is a phone call — and a tester
 * asked what the single count meant, which is how this surfaced.
 */
export interface CoverageStatus {
  /** Asked something; nothing assigned to a recording yet. Act on the backlog. */
  waiting: Profile[];
  /** Has never submitted a question or objection at all. Go and ask her. */
  neverAsked: Profile[];
}

export async function coverageStatus(): Promise<CoverageStatus> {
  const intake = await listIntake();
  const members = await listCohosts();
  const covered = new Set(intake.filter((q) => q.recordings.length > 0).map((q) => q.profile_id));
  const asked = new Set(intake.map((q) => q.profile_id));
  const uncovered = members.filter((m) => !covered.has(m.id));
  return {
    waiting: uncovered.filter((m) => asked.has(m.id)),
    neverAsked: uncovered.filter((m) => !asked.has(m.id)),
  };
}

/** Everyone without an answered question. Kept as the union of the two above. */
export async function coverageGaps(): Promise<Profile[]> {
  const { waiting, neverAsked } = await coverageStatus();
  return [...waiting, ...neverAsked];
}

/**
 * Erase the signed-in account: every row keyed to this person, then the login.
 *
 * Takes no id on purpose — the Lambda deletes whoever holds the token and
 * nobody else. Ministry content (recordings, notes, episodes) is not personal
 * data and stays.
 */
export async function deleteMyAccount(): Promise<{ ok: boolean }> {
  if (DEMO_MODE) return { ok: true };
  const r = await client.mutations.deleteMyAccount();
  if (r.errors?.length) throw new Error(r.errors[0].message);
  return { ok: true };
}

/* ----------------------------------------------------------------- prayers */

export async function submitPrayer(me: string, body: string) {
  if (DEMO_MODE) {
    db.prayers.unshift({ id: uid(), profile_id: me, body, status: 'open', submitted_at: nowIso() });
    return;
  }
  // Same reason as submitQuestion: the caller's identity decides profileId.
  await client.mutations.submitPrayerRequest({ body });
}

/* ---------------------------------------------------------------- messages */

/**
 * "Reach out": a message to leadership. Its own model beside PrayerRequest,
 * not a kind field on it — the two are pastorally different. Leadership only,
 * and deliberately one way; the screen says so.
 */
export async function sendMessage(me: string, body: string) {
  if (DEMO_MODE) {
    db.messages.unshift({ id: uid(), profile_id: me, body, status: 'open', submitted_at: nowIso() });
    return;
  }
  // The caller's identity decides profileId, as with prayers.
  await client.mutations.sendMessage({ body });
}

/** Leadership only, like prayer requests. */
export async function listMessages(): Promise<(Message & { author?: Profile })[]> {
  const people = await listMembers();
  const rows: Message[] = DEMO_MODE
    ? db.messages
    : unwrapList(await client.models.Message.list({ limit: 500 })).map((m) => ({
        id: m.id, profile_id: m.profileId, body: m.body,
        status: m.status ?? 'open', submitted_at: m.createdAt ?? nowIso(),
      }));
  return rows
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
    .map((m) => ({ ...m, author: people.find((x) => x.id === m.profile_id) }));
}

/** Leadership only. There is deliberately no co-host-facing query for these. */
export async function listPrayers(): Promise<(PrayerRequest & { author?: Profile })[]> {
  const people = await listMembers();
  const rows: PrayerRequest[] = DEMO_MODE
    ? db.prayers
    : unwrapList(await client.models.PrayerRequest.list({ limit: 500 })).map((p) => ({
        id: p.id, profile_id: p.profileId, body: p.body,
        status: p.status ?? 'open', submitted_at: p.createdAt ?? nowIso(),
      }));
  return rows
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
    .map((p) => ({ ...p, author: people.find((x) => x.id === p.profile_id) }));
}

/* -------------------------------------------------------------------- misc */

export async function listGuests(): Promise<Guest[]> {
  if (DEMO_MODE) return db.guests;
  return unwrapList(await client.models.Guest.list({ limit: 200 })).map((g) => ({
    id: g.id, name: g.name, photo_url: g.photoUrl ?? null, blurb: g.blurb ?? null,
    external_url: g.externalUrl ?? null, returning_override: g.returningOverride ?? null,
    admin_notes: g.adminNotes ?? null,
  }));
}

export async function getGuest(id: string | null): Promise<Guest | null> {
  if (!id) return null;
  if (DEMO_MODE) return db.guests.find((g) => g.id === id) ?? null;
  const g = unwrap(await client.models.Guest.get({ id }));
  return g ? {
    id: g.id, name: g.name, photo_url: g.photoUrl ?? null, blurb: g.blurb ?? null,
    external_url: g.externalUrl ?? null, returning_override: g.returningOverride ?? null,
    admin_notes: g.adminNotes ?? null,
  } : null;
}

export async function guestIsReturning(g: Guest): Promise<boolean> {
  if (g.returning_override !== null && g.returning_override !== undefined) return g.returning_override;
  const recs = await listRecordings(false);
  return recs.filter((r) => r.guest_id === g.id).length > 1;
}

export async function listEpisodes(): Promise<Episode[]> {
  if (DEMO_MODE) return db.episodes;
  return unwrapList(await client.queries.publishedEpisodes()).map((e) => ({
    id: String(e?.id), title: String(e?.title), url: e?.url ?? null,
    number: e?.number ?? null, published_at: e?.publishedAt ?? null,
  }));
}

export async function listEvents(): Promise<FsrEvent[]> {
  if (DEMO_MODE) return db.events;
  return unwrapList(await client.models.EventItem.list({ limit: 200 }))
    .filter((e) => Boolean(e.publishedAt))
    .map((e) => ({
      id: e.id, title: e.title, kind: e.kind ?? 'gathering',
      starts_at: e.startsAt, ends_at: e.endsAt ?? null,
      location: e.location ?? null, description: e.description ?? null,
      published_at: e.publishedAt ?? null,
    }));
}

/* ------------------------------------------------------------- converters */

type RecordingModel = {
  id: string; seasonId: string; guestId?: string | null; title: string;
  topic?: string | null; questionsCovered?: string | null; description?: string | null;
  scheduledAt: string; durationMinutes?: number | null; joinUrl?: string | null;
  publishedAt?: string | null; announceAt?: string | null; announcedAt?: string | null;
  source?: string | null; calendlyEventId?: string | null; cancelledAt?: string | null;
};

function fromRecordingModel(r: RecordingModel): Recording {
  return {
    id: r.id, season_id: r.seasonId, guest_id: r.guestId ?? null, title: r.title,
    topic: r.topic ?? null, questions_covered: r.questionsCovered ?? null,
    description: r.description ?? null, scheduled_at: r.scheduledAt,
    duration_minutes: r.durationMinutes ?? 90, join_url: r.joinUrl ?? null,
    published_at: r.publishedAt ?? null, announce_at: r.announceAt ?? null,
    announced_at: r.announcedAt ?? null,
    source: (r.source ?? 'manual') as Recording['source'],
    calendly_event_id: r.calendlyEventId ?? null,
    cancelled_at: r.cancelledAt ?? null,
  };
}

type SessionViewShape = {
  id?: string | null; title?: string | null; topic?: string | null;
  questionsCovered?: string | null; scheduledAt?: string | null;
  durationMinutes?: number | null; joinUrl?: string | null;
  guestName?: string | null; guestBlurb?: string | null; guestUrl?: string | null;
  guestReturning?: boolean | null; attendeeCount?: number | null;
  yourQuestion?: string | null; cancelledAt?: string | null;
};

/**
 * A SessionView is already filtered and flattened by the Lambda — it never
 * carries publishedAt (everything returned is published) or the guest's
 * private admin notes.
 */
function fromSessionView(v: SessionViewShape | null | undefined): Recording {
  return {
    id: String(v?.id ?? ''), season_id: '', guest_id: v?.guestName ? `inline:${v.guestName}` : null,
    title: String(v?.title ?? ''), topic: v?.topic ?? null,
    questions_covered: v?.questionsCovered ?? null, description: null,
    scheduled_at: String(v?.scheduledAt ?? ''), duration_minutes: v?.durationMinutes ?? 90,
    join_url: v?.joinUrl ?? null,
    published_at: 'published', announce_at: null, announced_at: null,
    source: 'manual', calendly_event_id: null,
    // Called off is not gone: the co-host screen says so instead of loading forever.
    cancelled_at: v?.cancelledAt ?? null,
  };
}
