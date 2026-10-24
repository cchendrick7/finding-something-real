import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/push-outbox';

/**
 * THE OUTBOX.
 *
 * Nothing else in the backend sends a notification. Leadership publishes a
 * note by setting one field on one model; this function notices, five minutes
 * later at the worst, and does the rest.
 *
 * The invariant: a notification is sent at most once per (kind, target,
 * person), and NotificationLog is the proof. Every send in this file goes
 * through `claim()`, which writes the log rows BEFORE calling Expo. If the
 * call then fails outright the claim is released and the next run retries; if
 * it half-succeeds the claim stands and nobody is told twice. A missed
 * notification is a disappointment, a duplicate 6am reminder is a reason to
 * turn notifications off.
 *
 * FIRST-RUN SAFETY: on a fresh deployment the log is empty, so without a guard
 * this would announce every episode and every note ever published. Backward-
 * looking work is therefore bounded by BACKFILL_HORIZON_MS; only things
 * published inside that window can ever fire. Reminders look forward and need
 * no guard.
 */

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const db = generateClient<Schema>({ authMode: 'iam' });

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_CHUNK = 100;

/** Nothing published longer ago than this can trigger a notification. */
const BACKFILL_HORIZON_MS = 48 * 60 * 60 * 1000;

/** How close to the recording each reminder fires. */
const REMINDERS = [
  { kind: 'reminder_24h', leadMs: 24 * 60 * 60 * 1000 },
  { kind: 'reminder_1h', leadMs: 60 * 60 * 1000 },
] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyList = (a?: any) => Promise<{ data?: any[] | null; nextToken?: string | null }>;

/** DynamoDB's Limit caps rows scanned, not rows returned. Always paginate. */
async function listAll<F extends AnyList>(fn: F, args: Record<string, unknown> = {}): Promise<any[]> {
  const out: any[] = [];
  let nextToken: string | null | undefined;
  let pages = 0;
  do {
    const r = await fn({ limit: 1000, ...args, nextToken });
    out.push(...(r?.data ?? []));
    nextToken = r?.nextToken;
  } while (nextToken && ++pages < 20);
  return out;
}

type Msg = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
  priority: 'default' | 'high';
  channelId?: string;
};

/**
 * Hand a batch to Expo and report which tokens are dead.
 *
 * Expo answers per message, in order. `DeviceNotRegistered` means the app was
 * uninstalled or the token rotated — the row is retired rather than deleted so
 * a device that comes back keeps its preferences.
 */
async function sendToExpo(messages: Msg[]): Promise<{ sent: number; dead: string[] }> {
  let sent = 0;
  const dead: string[] = [];
  for (let i = 0; i < messages.length; i += EXPO_CHUNK) {
    const chunk = messages.slice(i, i + EXPO_CHUNK);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      throw new Error(`expo push ${res.status}: ${(await res.text()).slice(0, 400)}`);
    }
    const json = (await res.json()) as { data?: Array<Record<string, any>> };
    const tickets = json.data ?? [];
    tickets.forEach((t, n) => {
      if (t?.status === 'ok') { sent += 1; return; }
      if (t?.details?.error === 'DeviceNotRegistered') dead.push(chunk[n].to);
      else console.log(JSON.stringify({ pushError: t, to: chunk[n].to }));
    });
  }
  return { sent, dead };
}

async function retire(tokens: string[]) {
  const now = new Date().toISOString();
  for (const t of tokens) {
    const rows = await listAll(db.models.PushToken.list, { filter: { token: { eq: t } } });
    for (const row of rows) await db.models.PushToken.update({ id: row.id, retiredAt: now });
  }
}

type Claim = { ids: string[] };

/**
 * Reserve a set of sends, or discover they have already gone out.
 *
 * Returns the profile ids still owed this notification, plus the log row ids
 * so the caller can release them if Expo is unreachable. A `profileId` of null
 * is the broadcast case — one claim for the whole audience.
 */
async function claim(
  kind: string,
  targetType: string,
  targetId: string,
  profileIds: Array<string | null>,
  cls: 'broadcast' | 'time_sensitive' | 'internal',
): Promise<{ owed: Array<string | null>; claim: Claim }> {
  const existing = await listAll(db.models.NotificationLog.list, {
    filter: { kind: { eq: kind }, targetId: { eq: targetId } },
  });
  const done = new Set(existing.map((r) => r.dedupeKey));
  const owed: Array<string | null> = [];
  const ids: string[] = [];
  for (const pid of profileIds) {
    const dedupeKey = `${kind}:${targetId}:${pid ?? 'all'}`;
    if (done.has(dedupeKey)) continue;
    const r = await db.models.NotificationLog.create({
      profileId: pid, kind, class: cls, targetType, targetId, dedupeKey,
    });
    if (r.errors?.length) { console.log(JSON.stringify({ claimError: r.errors })); continue; }
    if (r.data) { owed.push(pid); ids.push(r.data.id); }
  }
  return { owed, claim: { ids } };
}

async function release(c: Claim) {
  for (const id of c.ids) await db.models.NotificationLog.delete({ id });
}

async function settle(c: Claim, deviceCount: number) {
  const sentAt = new Date().toISOString();
  for (const id of c.ids) await db.models.NotificationLog.update({ id, sentAt, deviceCount });
}

/**
 * Deliver, and keep the log honest.
 *
 * Wraps the send so that a total failure — Expo down, no network — undoes the
 * claim instead of silently eating the notification forever.
 */
async function deliver(messages: Msg[], c: Claim) {
  if (messages.length === 0) { await release(c); return 0; }
  try {
    const { sent, dead } = await sendToExpo(messages);
    await settle(c, sent);
    if (dead.length) await retire(dead);
    return sent;
  } catch (err) {
    console.log(JSON.stringify({ deliverFailed: String(err) }));
    await release(c);
    return 0;
  }
}

/** Devices for a set of people, filtered by the category they opted into. */
function pickTokens(
  tokens: any[],
  category: 'wantsSessions' | 'wantsReminders' | 'wantsNotes' | 'wantsEpisodes',
  profileIds: Set<string> | null,
): Map<string, string[]> {
  const byProfile = new Map<string, string[]>();
  for (const t of tokens) {
    if (t.retiredAt) continue;
    if (t[category] === false) continue;
    const key = t.profileId ?? '';
    if (profileIds === null) {
      // Broadcast: everyone, account or not.
    } else if (!t.profileId || !profileIds.has(t.profileId)) {
      continue;
    }
    if (!byProfile.has(key)) byProfile.set(key, []);
    byProfile.get(key)!.push(t.token);
  }
  return byProfile;
}

/**
 * "Thu, Oct 2 at 6:00 PM" in the recipient's own zone.
 *
 * The zone matters more here than anywhere else in the app: this cohort spans
 * Los Angeles, New York and London, and a reminder that says the wrong hour is
 * worse than no reminder. Falls back to Pacific — the ministry's own zone —
 * rather than UTC, which nobody reads at a glance.
 *
 * Intl gives "Thu, Oct 2, 6:00 PM"; the last comma becomes "at".
 */
function whenIn(iso: string, timezone: string | null | undefined) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      timeZone: timezone || 'America/Los_Angeles',
    }).format(new Date(iso)).replace(/,([^,]*)$/, ' at$1');
  } catch {
    return new Date(iso).toUTCString();
  }
}

const msg = (
  to: string, title: string, body: string, data: Record<string, unknown>,
  priority: 'default' | 'high' = 'default',
): Msg => ({ to, title, body, data, sound: 'default', priority, channelId: 'default' });

export const handler = async () => {
  const now = Date.now();
  const horizon = now - BACKFILL_HORIZON_MS;
  const tokens = await listAll(db.models.PushToken.list);
  const summary: Record<string, number> = {
    invitations: 0, moved: 0, cancelled: 0, reminders: 0, notes: 0, episodes: 0,
    devices: tokens.length,
  };

  if (tokens.length === 0) {
    console.log(JSON.stringify({ outbox: 'no devices registered' }));
    return summary;
  }

  const profiles = await listAll(db.models.Profile.list);
  const activeById = new Map(
    profiles.filter((p) => p.status === 'active').map((p) => [p.id, p]),
  );

  /* ---------------------------------------------- 1. session invitations */

  const recordings = await listAll(db.models.Recording.list);
  const published = recordings.filter((r) => r.publishedAt);

  for (const rec of published) {
    const publishedMs = Date.parse(String(rec.publishedAt));
    const startsMs = Date.parse(String(rec.scheduledAt));
    // Not for archaeology, and not for a session that has already happened.
    if (!(publishedMs >= horizon) || !(startsMs > now)) continue;

    if (rec.cancelledAt) continue;

    const audience = [...activeById.keys()];
    const byProfile = pickTokens(tokens, 'wantsSessions', new Set(audience));
    const owedIds = audience.filter((id) => byProfile.has(id));
    const { owed, claim: c } = await claim(
      'session_invite', 'recording', rec.id, owedIds, 'broadcast',
    );

    const messages: Msg[] = [];
    for (const pid of owed) {
      const p = activeById.get(String(pid));
      for (const to of byProfile.get(String(pid)) ?? []) {
        messages.push(msg(
          to,
          'New recording scheduled',
          `${rec.title} — ${whenIn(String(rec.scheduledAt), p?.timezone)}. Tap to reply.`,
          { type: 'session', id: rec.id },
        ));
      }
    }
    summary.invitations += await deliver(messages, c);

    /*
     * Remember WHICH start time they were told about.
     *
     * Written after the send, not before: if delivery failed the claim was
     * released and this run will try again, and a time recorded for an
     * invitation that never arrived would make the next section announce a
     * move nobody needs to hear about.
     */
    if (rec.announcedFor !== rec.scheduledAt) {
      await db.models.Recording.update({ id: rec.id, announcedFor: rec.scheduledAt });
    }
  }

  /* ------------------------------------------- 1b. a session that MOVED */

  /*
   * Derived, not pushed. The app compares the time the cohort was told with
   * the time the session now starts, so a move announces itself however it
   * was made — the admin form, a script, a row edited by hand. Nothing has to
   * remember to send anything at the moment of the edit.
   *
   * The new time is part of the dedupe key, so a session moved twice is
   * announced twice, and a session moved back to a time already announced is
   * not announced again.
   */
  for (const rec of published) {
    if (rec.cancelledAt) continue;
    if (!rec.announcedFor) continue;                       // never invited yet
    if (rec.announcedFor === rec.scheduledAt) continue;    // has not moved
    if (!(Date.parse(String(rec.scheduledAt)) > now)) continue;

    const audience = [...activeById.keys()];
    const byProfile = pickTokens(tokens, 'wantsSessions', new Set(audience));
    const owedIds = audience.filter((id) => byProfile.has(id));
    const { owed, claim: c } = await claim(
      `session_moved:${rec.scheduledAt}`, 'recording', rec.id, owedIds, 'time_sensitive',
    );

    const messages: Msg[] = [];
    for (const pid of owed) {
      const p = activeById.get(String(pid));
      for (const to of byProfile.get(String(pid)) ?? []) {
        messages.push(msg(
          to,
          'A recording has moved',
          `${rec.title} is now ${whenIn(String(rec.scheduledAt), p?.timezone)}.`,
          { type: 'session', id: rec.id },
        ));
      }
    }
    summary.moved += await deliver(messages, c);
    await db.models.Recording.update({ id: rec.id, announcedFor: rec.scheduledAt });
  }

  /* --------------------------------------- 1c. a session that was CALLED OFF */

  /*
   * Only for sessions the cohort was actually told about. A draft is deleted
   * outright by admin-api and never reaches here, which is right: announcing
   * the cancellation of something nobody knew existed is worse than silence.
   */
  for (const rec of recordings) {
    if (!rec.cancelledAt || !rec.announcedFor) continue;

    const audience = [...activeById.keys()];
    const byProfile = pickTokens(tokens, 'wantsSessions', new Set(audience));
    const owedIds = audience.filter((id) => byProfile.has(id));
    const { owed, claim: c } = await claim(
      'session_cancelled', 'recording', rec.id, owedIds, 'time_sensitive',
    );

    const messages: Msg[] = [];
    for (const pid of owed) {
      const p = activeById.get(String(pid));
      for (const to of byProfile.get(String(pid)) ?? []) {
        messages.push(msg(
          to,
          'A recording is off',
          `${rec.title} on ${whenIn(String(rec.scheduledAt), p?.timezone)} has been called off.`,
          { type: 'session', id: rec.id },
        ));
      }
    }
    summary.cancelled += await deliver(messages, c);
  }

  /* --------------------------------------------------- 2. reminders */

  for (const rec of published) {
    if (rec.cancelledAt) continue;      // called off: no 24h, no 1h
    const startsMs = Date.parse(String(rec.scheduledAt));
    if (!(startsMs > now)) continue;

    // Only people who said yes. Attendee rows exist only for 'yes', which is
    // the same asymmetry the rest of the app relies on: a decline leaves no
    // record, so a decliner cannot be reminded by accident.
    const attendees = await listAll(db.models.Attendee.list, {
      filter: { recordingId: { eq: rec.id } },
    });
    if (attendees.length === 0) continue;

    for (const { kind, leadMs } of REMINDERS) {
      // Due once the lead time has arrived. No upper window: a run that was
      // skipped still sends, as long as the session has not started.
      if (startsMs - now > leadMs) continue;

      const audience = attendees
        .map((a) => String(a.profileId))
        .filter((id) => activeById.has(id));
      const byProfile = pickTokens(tokens, 'wantsReminders', new Set(audience));
      const owedIds = audience.filter((id) => byProfile.has(id));
      const { owed, claim: c } = await claim(
        kind, 'recording', rec.id, owedIds, 'time_sensitive',
      );

      const messages: Msg[] = [];
      for (const pid of owed) {
        const p = activeById.get(String(pid));
        const when = whenIn(String(rec.scheduledAt), p?.timezone);
        for (const to of byProfile.get(String(pid)) ?? []) {
          messages.push(msg(
            to,
            kind === 'reminder_1h' ? 'Recording in about an hour' : 'Recording tomorrow',
            `${rec.title} — ${when}`,
            { type: 'session', id: rec.id },
            'high',
          ));
        }
      }
      summary.reminders += await deliver(messages, c);
    }
  }

  /* ------------------------------------------------------- 3. new notes */

  const notes = await listAll(db.models.Note.list);
  const memberships = await listAll(db.models.Membership.list);
  const cohortIds = new Set(memberships.filter((m) => m.kind === 'cohort').map((m) => m.profileId));
  const alumIds = new Set(memberships.filter((m) => m.kind === 'alum').map((m) => m.profileId));

  for (const note of notes) {
    if (!note.publishedAt) continue;
    if (!(Date.parse(String(note.publishedAt)) >= horizon)) continue;

    // Same audience rules as myNotes in member-api. If one changes the other
    // must: a notification for a note the person cannot open is worse than no
    // notification at all.
    const audience = [...activeById.keys()].filter((id) =>
      note.audience === 'all' ||
      (note.audience === 'cohort' && cohortIds.has(id)) ||
      (note.audience === 'alumni' && alumIds.has(id)) ||
      (note.audience === 'custom' && (note.recipientIds ?? []).includes(id)));

    const byProfile = pickTokens(tokens, 'wantsNotes', new Set(audience));
    const owedIds = audience.filter((id) => byProfile.has(id));
    const { owed, claim: c } = await claim('note', 'note', note.id, owedIds, 'broadcast');

    const messages: Msg[] = [];
    for (const pid of owed) {
      for (const to of byProfile.get(String(pid)) ?? []) {
        messages.push(msg(
          to, 'A note from Janell', note.title, { type: 'note', id: note.id },
        ));
      }
    }
    summary.notes += await deliver(messages, c);
  }

  /* --------------------------------------------------- 4. new episodes */

  const episodes = await listAll(db.models.PublicEpisode.list);
  for (const ep of episodes) {
    // Shorts are frequent and low-stakes. Only full episodes are worth a
    // lock screen.
    if (ep.kind === 'short') continue;
    if (!(Date.parse(String(ep.publishedAt)) >= horizon)) continue;

    const byProfile = pickTokens(tokens, 'wantsEpisodes', null);
    const all = [...byProfile.values()].flat();
    if (all.length === 0) continue;

    // One claim for the whole audience — this is public information going to
    // everybody, so there is nothing per-person to remember.
    const { owed, claim: c } = await claim(
      'episode', 'episode', ep.videoId, [null], 'broadcast',
    );
    if (owed.length === 0) continue;

    const messages = all.map((to) => msg(
      to, 'New episode', ep.title, { type: 'episode', id: ep.videoId, url: ep.url },
    ));
    summary.episodes += await deliver(messages, c);
  }

  console.log(JSON.stringify({ outbox: summary }));
  return summary;
};
