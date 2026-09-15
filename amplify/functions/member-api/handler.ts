import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/member-api';
import {
  CognitoIdentityProviderClient, AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';

/**
 * THE PRIVACY BOUNDARY.
 *
 * This file is the direct replacement for the 57 Postgres RLS policies.
 * AppSync authorization cannot filter on field values, so every rule that
 * depends on one lives here — running with elevated access, on the server,
 * where a client cannot reach around it.
 *
 * Three rules that must never be relaxed:
 *   1. Only recordings with publishedAt set are ever returned to a co-host.
 *   2. listAttendees returns people whose response was 'yes'. Decliners and
 *      non-responders are never named. Spec §5.3.
 *   3. Nothing here returns a PrayerRequest, a peer's Question, or any email
 *      address. Prayer requests have no member-facing query at all.
 */

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

// MUST be iam. The schema default is userPool, and server-side there is no
// user token — so every model read silently returned empty and the caller
// looked like a non-member. The function's IAM access comes from the
// schema-level allow.resource(memberApi) grant.
const db = generateClient<Schema>({ authMode: 'iam' });

/**
 * AppSync hands direct Lambda resolvers the field name in `info.fieldName`,
 * but some invocation paths surface it at the top level instead. Read both
 * rather than assume — guessing here cost a debugging cycle.
 */
type Ctx = {
  arguments?: Record<string, unknown>;
  identity?: {
    sub?: string;
    username?: string;
    claims?: Record<string, unknown>;
    groups?: string[] | null;
  };
  info?: { fieldName?: string };
  fieldName?: string;
};

const fieldOf = (ctx: Ctx) => ctx.info?.fieldName ?? ctx.fieldName ?? '';
const argsOf = (ctx: Ctx) => ctx.arguments ?? {};

const isLeadership = (ctx: Ctx) => {
  const g = ctx.identity?.groups
    ?? (ctx.identity?.claims?.['cognito:groups'] as string[] | undefined)
    ?? [];
  return Array.isArray(g) && g.includes('leadership');
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyList = (a?: any) => Promise<{ data?: any[] | null; nextToken?: string | null }>;

/**
 * Paginating list. DynamoDB's Limit caps rows SCANNED, not rows returned after
 * the filter — so a filtered `.list()` can come back empty while the row
 * exists, and a short page is not proof there is nothing more. Every filtered
 * read in this file goes through here. Do not call `.list()` with a filter
 * directly.
 */
async function listAll<F extends AnyList>(
  fn: F,
  args: Omit<NonNullable<Parameters<F>[0]>, 'nextToken'> = {} as any,
): Promise<NonNullable<Awaited<ReturnType<F>>['data']>> {
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
/* eslint-enable @typescript-eslint/no-explicit-any */

async function callerProfile(sub: string) {
  const rows = await listAll(db.models.Profile.list, { filter: { owner: { contains: sub } } });
  return rows[0] ?? null;
}

/** Cohort + alum membership for the caller — drives note targeting. */
async function callerMemberships(profileId: string) {
  const data = await listAll(db.models.Membership.list, { filter: { profileId: { eq: profileId } } });
  return {
    isCohort: data.some((m) => m.kind === 'cohort'),
    isAlum: data.some((m) => m.kind === 'alum'),
  };
}

/** Every published recording. The single place publishedAt is enforced. */
async function publishedRecordings() {
  const data = await listAll(db.models.Recording.list);
  return data.filter((r) => Boolean(r.publishedAt));
}

async function toSessionView(
  rec: NonNullable<Awaited<ReturnType<typeof publishedRecordings>>[number]>,
  profileId: string | null,
) {
  let guest = null;
  if (rec.guestId) {
    const { data } = await db.models.Guest.get({ id: rec.guestId });
    guest = data;
  }

  const attendees = await listAll(db.models.Attendee.list, { filter: { recordingId: { eq: rec.id } } });

  // "This one came from your question" — only ever the caller's own.
  let yourQuestion: string | null = null;
  if (profileId) {
    const links = await listAll(db.models.QuestionLink.list, { filter: { recordingId: { eq: rec.id } } });
    for (const link of links) {
      const { data: iq } = await db.models.IntakeQuestion.get({ id: link.intakeQuestionId });
      if (iq && iq.profileId === profileId) { yourQuestion = iq.body; break; }
    }
  }

  let guestReturning = guest?.returningOverride ?? null;
  if (guest && guestReturning === null) {
    const all = await publishedRecordings();
    guestReturning = all.filter((r) => r.guestId === guest!.id).length > 1;
  }

  return {
    id: rec.id,
    title: rec.title,
    topic: rec.topic ?? null,
    questionsCovered: rec.questionsCovered ?? null,
    scheduledAt: rec.scheduledAt,
    durationMinutes: rec.durationMinutes ?? 90,
    joinUrl: rec.joinUrl ?? null,
    guestName: guest?.name ?? null,
    guestBlurb: guest?.blurb ?? null,
    guestUrl: guest?.externalUrl ?? null,
    // NOTE: guest.adminNotes is deliberately not copied. Leadership-only.
    guestReturning: Boolean(guestReturning),
    attendeeCount: attendees.length,
    yourQuestion,
  };
}

export const handler = async (ctx: Ctx) => {
  const sub = ctx.identity?.sub;
  if (!sub) throw new Error('Unauthenticated');

  const me = await callerProfile(sub);
  // Pending accounts get nothing. This is the equivalent of the Postgres fix
  // that stopped any signup from becoming a member.
  if (!me) {
    console.log(JSON.stringify({ reject: 'no profile for sub', sub, field: fieldOf(ctx) }));
    throw new Error('Not an active member');
  }
  if (me.status !== 'active' && !isLeadership(ctx)) {
    console.log(JSON.stringify({ reject: 'profile not active', sub, status: me.status }));
    throw new Error('Not an active member');
  }
  const profileId = me.id;

  switch (fieldOf(ctx)) {
    /* ------------------------------------------------------------ reads */

    case 'listSessions': {
      const recs = await publishedRecordings();
      recs.sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
      return Promise.all(recs.map((r) => toSessionView(r, profileId)));
    }

    case 'getSession': {
      const id = String(argsOf(ctx).id);
      const { data: rec } = await db.models.Recording.get({ id });
      // A draft is indistinguishable from a nonexistent id. No oracle.
      if (!rec || !rec.publishedAt) return null;
      return toSessionView(rec, profileId);
    }

    case 'sessionAttendees': {
      const recordingId = String(argsOf(ctx).recordingId);
      const { data: rec } = await db.models.Recording.get({ id: recordingId });
      if (!rec || !rec.publishedAt) return [];

      // Attendee rows exist only for 'yes'. Nothing to filter, nothing to leak.
      const rows = await listAll(db.models.Attendee.list, { filter: { recordingId: { eq: recordingId } } });
      return rows.map((r) => ({
        id: r.profileId,
        displayName: r.displayName,
        timezone: null,
      }));
    }

    case 'myNotes': {
      const { isCohort, isAlum } = await callerMemberships(profileId);
      const notes = await listAll(db.models.Note.list);
      const receipts = await listAll(db.models.Receipt.list, {
        filter: { profileId: { eq: profileId }, targetType: { eq: 'note' } },
      });
      const readIds = new Set(receipts.filter((r) => r.openedAt).map((r) => r.targetId));

      return notes
        .filter((n) => Boolean(n.publishedAt))
        .filter((n) =>
          n.audience === 'all' ||
          (n.audience === 'cohort' && isCohort) ||
          (n.audience === 'alumni' && isAlum) ||
          (n.audience === 'custom' && (n.recipientIds ?? []).includes(profileId)))
        .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
        .map((n) => ({
          id: n.id, title: n.title, body: n.body,
          linkUrl: n.linkUrl ?? null, linkLabel: n.linkLabel ?? null,
          publishedAt: n.publishedAt, read: readIds.has(n.id),
        }));
    }

    case 'publishedEpisodes': {
      const data = await listAll(db.models.Episode.list);
      return data
        .filter((e) => Boolean(e.publishedAt))
        .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
        .map((e) => ({
          id: e.id, title: e.title, url: e.url ?? null,
          number: e.number ?? null, publishedAt: e.publishedAt,
        }));
    }

    /* ----------------------------------------------------------- writes */

    case 'submitRsvp': {
      const recordingId = String(argsOf(ctx).recordingId);
      const response: 'yes' | 'no' = String(argsOf(ctx).response) === 'yes' ? 'yes' : 'no';
      const note = argsOf(ctx).note ? String(argsOf(ctx).note) : null;

      const { data: rec } = await db.models.Recording.get({ id: recordingId });
      if (!rec || !rec.publishedAt) throw new Error('No such session');

      const existing = await listAll(db.models.Rsvp.list, {
        filter: { profileId: { eq: profileId }, recordingId: { eq: recordingId } },
      });

      const respondedAt = new Date().toISOString();
      const payload = { profileId, recordingId, response, note, respondedAt, owner: sub };
      if (existing[0]) await db.models.Rsvp.update({ id: existing[0].id, ...payload });
      else await db.models.Rsvp.create(payload);

      // Keep the public half in step. A 'no' must leave NO attendee row.
      const att = await listAll(db.models.Attendee.list, {
        filter: { profileId: { eq: profileId }, recordingId: { eq: recordingId } },
      });
      if (response === 'yes' && !att[0]) {
        await db.models.Attendee.create({
          recordingId, profileId, displayName: me.displayName,
        });
      } else if (response === 'no' && att[0]) {
        await db.models.Attendee.delete({ id: att[0].id });
      }

      /**
       * Return the resulting row so the client does not have to re-read it.
       * AppSync list reads are eventually consistent, so a read-back issued
       * immediately after this write can legitimately return the PREVIOUS
       * answer. Answering from the write path removes that window (and a
       * round trip). Not a bug that was observed in the wild — a race that
       * did not need to exist.
       */
      return { ok: true, profileId, recordingId, response, note, respondedAt };
    }

    case 'markRead': {
      const targetType = String(argsOf(ctx).targetType);
      const targetId = String(argsOf(ctx).targetId);
      const existing = await listAll(db.models.Receipt.list, {
        filter: {
          profileId: { eq: profileId },
          targetType: { eq: targetType as 'note' | 'recording' | 'event' },
          targetId: { eq: targetId },
        },
      });
      const now = new Date().toISOString();
      if (existing[0]) await db.models.Receipt.update({ id: existing[0].id, openedAt: now });
      else await db.models.Receipt.create({
        profileId, owner: sub,
        targetType: targetType as 'note' | 'recording' | 'event',
        targetId, deliveredAt: now, openedAt: now,
      });
      return { ok: true };
    }

    /**
     * Profile edits. The allow-list is the point: role, status and owner are
     * not reachable from here, so a pending account cannot activate itself and
     * a co-host cannot promote herself. Both were possible when the client
     * updated the Profile model directly.
     */
    case 'updateMyProfile': {
      const a = argsOf(ctx);
      const patch: { displayName?: string; timezone?: string } = {};
      if (typeof a.displayName === 'string' && a.displayName.trim()) {
        patch.displayName = a.displayName.trim().slice(0, 80);
      }
      if (typeof a.timezone === 'string' && a.timezone.trim()) {
        patch.timezone = a.timezone.trim().slice(0, 64);
      }
      if (!Object.keys(patch).length) return { ok: false, reason: 'nothing to change' };
      await db.models.Profile.update({ id: profileId, ...patch });
      return { ok: true };
    }

    case 'submitQuestion': {
      const recordingId = String(argsOf(ctx).recordingId);
      const body = String(argsOf(ctx).body ?? '').trim();
      if (!body) throw new Error('Empty question');

      // Only against a session she can actually see. Otherwise this doubles as
      // an existence oracle for drafts.
      const { data: rec } = await db.models.Recording.get({ id: recordingId });
      if (!rec || !rec.publishedAt) throw new Error('No such session');

      // profileId from the caller, NEVER from the client.
      await db.models.Question.create({
        profileId, recordingId, body: body.slice(0, 2000), owner: sub,
      });
      return { ok: true };
    }

    case 'submitPrayerRequest': {
      const body = String(argsOf(ctx).body ?? '').trim();
      if (!body) throw new Error('Empty request');
      await db.models.PrayerRequest.create({
        profileId, body: body.slice(0, 4000), status: 'open', owner: sub,
      });
      return { ok: true };
    }

    /**
     * Erase the caller. Required by Google Play, expected by App Review, and
     * the right thing for an app that carries prayer requests.
     *
     * Note what this does NOT take: an id. The only account it can delete is
     * the one that holds the token, so there is no way to aim it at someone
     * else.
     *
     * Order matters. Rows first, Cognito user last — a crash midway leaves an
     * account that can still sign in and see a half-empty app, which is
     * recoverable. The reverse leaves orphaned rows belonging to a login that
     * no longer exists, which is not.
     */
    case 'deleteMyAccount': {
      const deleted: Record<string, number> = {};
      const wipe = async (label: string, rows: { id: string }[], del: (id: string) => Promise<unknown>) => {
        for (const r of rows) await del(r.id);
        deleted[label] = rows.length;
      };

      // Everything keyed to this person. Recordings, Notes and Episodes are
      // ministry content, not personal data, and stay.
      await wipe('rsvps', await listAll(db.models.Rsvp.list, { filter: { profileId: { eq: profileId } } }),
        (id) => db.models.Rsvp.delete({ id }));
      await wipe('attendance', await listAll(db.models.Attendee.list, { filter: { profileId: { eq: profileId } } }),
        (id) => db.models.Attendee.delete({ id }));
      await wipe('receipts', await listAll(db.models.Receipt.list, { filter: { profileId: { eq: profileId } } }),
        (id) => db.models.Receipt.delete({ id }));
      await wipe('prayerRequests', await listAll(db.models.PrayerRequest.list, { filter: { profileId: { eq: profileId } } }),
        (id) => db.models.PrayerRequest.delete({ id }));
      await wipe('questions', await listAll(db.models.Question.list, { filter: { profileId: { eq: profileId } } }),
        (id) => db.models.Question.delete({ id }));
      await wipe('memberships', await listAll(db.models.Membership.list, { filter: { profileId: { eq: profileId } } }),
        (id) => db.models.Membership.delete({ id }));

      // Intake questions may be linked to a recording; drop the links first so
      // the season planner is not left pointing at rows that no longer exist.
      const intake = await listAll(db.models.IntakeQuestion.list, { filter: { profileId: { eq: profileId } } });
      let links = 0;
      for (const q of intake) {
        const ls = await listAll(db.models.QuestionLink.list, { filter: { intakeQuestionId: { eq: q.id } } });
        for (const l of ls) { await db.models.QuestionLink.delete({ id: l.id }); links++; }
        await db.models.IntakeQuestion.delete({ id: q.id });
      }
      deleted.intakeQuestions = intake.length;
      deleted.questionLinks = links;

      await db.models.Profile.delete({ id: profileId });
      deleted.profile = 1;

      // The login goes last. Without this the person is erased and can still
      // sign in.
      const userPoolId = process.env.FSR_USER_POOL_ID;
      if (!userPoolId) {
        // Rows are already gone. Say so loudly rather than reporting success:
        // a login that outlives its data is the one outcome worse than either.
        console.log(JSON.stringify({ deleteMyAccount: 'ROWS DELETED BUT LOGIN REMAINS', sub, deleted }));
        throw new Error('Account data removed, but the login could not be deleted. Contact the ministry.');
      }
      const cognito = new CognitoIdentityProviderClient({});
      await cognito.send(new AdminDeleteUserCommand({
        UserPoolId: userPoolId,
        Username: ctx.identity?.username ?? sub,
      }));

      console.log(JSON.stringify({ deleteMyAccount: 'complete', sub, deleted }));
      return { ok: true, deleted };
    }

    default:
      throw new Error(`Unhandled field: ${fieldOf(ctx)}`);
  }
};
