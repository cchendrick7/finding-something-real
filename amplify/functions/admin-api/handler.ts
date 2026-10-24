import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/admin-api';
import { randomInt } from 'node:crypto';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminSetUserPasswordCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminListGroupsForUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

/**
 * PROVISIONING. The most dangerous function in this backend.
 *
 * It holds the four Cognito powers member-api is deliberately denied —
 * AdminCreateUser, AdminAddUserToGroup, AdminSetUserPassword and
 * AdminDisableUser — because a function that can do those can promote someone
 * into the leadership group, which reads every prayer request and every email
 * address in the ministry.
 *
 * THREE INVARIANTS. All three are enforced here, in code, and proved by
 * scripts/admin-test.mjs. None of them can be expressed in IAM: an IAM policy
 * can allow or deny cognito-idp:AdminAddUserToGroup, but it cannot say "only
 * the cohost group". So this file IS the boundary.
 *
 *   1. ONLY LEADERSHIP MAY CALL ANYTHING HERE. Checked below, and again by the
 *      schema's allow.group('leadership'). Two locks on the same door because
 *      the cost of this one being wrong is the whole ministry's data.
 *
 *   2. THE GROUP IS ALWAYS 'cohost' AND THE ROLE IS ALWAYS 'member'. Both are
 *      constants, not arguments. There is no input to this function — none —
 *      that can produce a leadership account. Making a leader stays a
 *      deliberate act outside the app, so a stolen leadership login cannot
 *      mint more of itself.
 *
 *   3. LEADERSHIP ACCOUNTS ARE NOT TARGETS. Resetting or disabling is refused
 *      when the target is in the leadership group. Otherwise one leader could
 *      lock another out — or take over her account by resetting her password
 *      and reading the new one off the screen.
 */

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const db = generateClient<Schema>({ authMode: 'iam' });
const cognito = new CognitoIdentityProviderClient({});

/** Constants, never arguments. See invariant 2. */
const COHORT_GROUP = 'cohost';
const LEADERSHIP_GROUP = 'leadership';
const MEMBER_ROLE = 'member';

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

const fieldOf = (c: Ctx) => c.info?.fieldName ?? c.fieldName ?? '';
const argsOf = (c: Ctx) => c.arguments ?? {};

const isLeadership = (c: Ctx) => {
  const g = c.identity?.groups
    ?? (c.identity?.claims?.['cognito:groups'] as string[] | undefined)
    ?? [];
  return Array.isArray(g) && g.includes(LEADERSHIP_GROUP);
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyList = (a?: any) => Promise<{ data?: any[] | null; nextToken?: string | null }>;

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
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * A temporary password a person can be told over the phone.
 *
 * Two words and four digits, because this gets read aloud at a retreat or
 * typed from a text message, and a random string of symbols gets transcribed
 * wrong and then blamed on the app. The trailing "!" is there to satisfy
 * Cognito's symbol requirement without adding a character anyone has to
 * describe.
 *
 * `randomInt` rather than Math.random: this is a credential, briefly, and the
 * difference costs nothing. The word list avoids anything that sounds like
 * another word out loud.
 */
const WORDS = [
  'anchor', 'meadow', 'harbor', 'lantern', 'cedar', 'willow', 'copper', 'ember',
  'pebble', 'marble', 'thistle', 'juniper', 'compass', 'garnet', 'quarry', 'bramble',
  'saffron', 'hollow', 'trellis', 'vellum', 'cobalt', 'mosaic', 'plateau', 'sable',
];
const cap = (w: string) => w[0].toUpperCase() + w.slice(1);

function temporaryPassword() {
  const a = WORDS[randomInt(WORDS.length)];
  let b = WORDS[randomInt(WORDS.length)];
  while (b === a) b = WORDS[randomInt(WORDS.length)];
  return `${cap(a)}-${cap(b)}-${randomInt(1000, 10000)}!`;
}

/** Cognito's own view of a person, by email. */
async function cognitoUser(email: string) {
  const r = await cognito.send(new ListUsersCommand({
    UserPoolId: env.FSR_USER_POOL_ID,
    Filter: `email = "${email.replace(/"/g, '')}"`,
    Limit: 1,
  }));
  return r.Users?.[0] ?? null;
}

async function groupsFor(username: string) {
  const r = await cognito.send(new AdminListGroupsForUserCommand({
    UserPoolId: env.FSR_USER_POOL_ID, Username: username,
  }));
  return (r.Groups ?? []).map((g) => g.GroupName);
}

/**
 * Resolve a target profile and refuse if it is a leader. Invariant 3.
 *
 * Checks the Cognito group, not Profile.role — role is a display field on a
 * row this function could in principle write, while group membership is what
 * actually grants access. Asking the thing that grants the power is the only
 * check worth making.
 */
async function cohostTarget(profileId: string) {
  const { data: profile } = await db.models.Profile.get({ id: profileId });
  if (!profile) return { error: 'not_found' as const };
  const user = await cognitoUser(profile.email);
  if (!user?.Username) return { error: 'no_login' as const, profile };
  const groups = await groupsFor(user.Username);
  if (groups.includes(LEADERSHIP_GROUP)) return { error: 'is_leadership' as const, profile };
  return { profile, username: user.Username };
}

/** Everything a Profile needs that the caller does not get to choose. */
async function createProfileFor(sub: string, email: string, displayName: string, timezone: string) {
  const r = await db.models.Profile.create({
    owner: sub,
    email,
    displayName,
    // Constants. See invariant 2 — a client cannot reach these.
    role: MEMBER_ROLE,
    status: 'active',
    timezone,
  });
  if (r.errors?.length) throw new Error(JSON.stringify(r.errors));
  return r.data;
}

/** Put her in this season's cohort, so cohort-only notes reach her. */
async function addToCurrentSeason(profileId: string) {
  const seasons = await listAll(db.models.Season.list);
  const current = seasons.find((s) => s.isCurrent) ?? seasons[0];
  if (!current) return null;
  const r = await db.models.Membership.create({
    profileId, seasonId: current.id, kind: 'cohort',
  });
  return r.data ? current.name : null;
}

export const handler = async (ctx: Ctx) => {
  // Lock one. The schema's allow.group('leadership') is lock two.
  if (!isLeadership(ctx)) {
    console.log(JSON.stringify({ reject: 'not leadership', sub: ctx.identity?.sub, field: fieldOf(ctx) }));
    throw new Error('Leadership only');
  }

  const args = argsOf(ctx);
  const field = fieldOf(ctx);

  switch (field) {
    /**
     * Add a co-host. Note what is NOT an argument: role, group, status.
     */
    case 'provisionCohost': {
      const email = String(args.email ?? '').trim().toLowerCase();
      const displayName = String(args.displayName ?? '').trim();
      const timezone = String(args.timezone ?? 'America/Los_Angeles').trim();

      if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) return { ok: false, error: 'invalid_email' };
      if (displayName.length < 1 || displayName.length > 60) return { ok: false, error: 'invalid_name' };

      if (await cognitoUser(email)) return { ok: false, error: 'already_exists' };

      const password = temporaryPassword();
      let emailed = true;
      let created;
      try {
        created = await cognito.send(new AdminCreateUserCommand({
          UserPoolId: env.FSR_USER_POOL_ID,
          Username: email,
          TemporaryPassword: password,
          UserAttributes: [
            { Name: 'email', Value: email },
            // Verified so that "forgot password" works later — Cognito will not
            // send a reset to an address it does not consider verified, and the
            // invitation below already proves the address reaches her.
            { Name: 'email_verified', Value: 'true' },
          ],
          DesiredDeliveryMediums: ['EMAIL'],
        }));
      } catch (err) {
        const e = err as { name?: string; message?: string };
        // The invitation email is best-effort. If Cognito cannot send it — the
        // default sender caps at 50 a day — the account should still exist,
        // because leadership has the password on screen and that is the path
        // that actually works.
        if (e.name === 'InvalidParameterException' || e.name === 'LimitExceededException'
            || e.name === 'TooManyRequestsException') {
          console.log(JSON.stringify({ provisionCohost: 'email suppressed', reason: e.name }));
          emailed = false;
          created = await cognito.send(new AdminCreateUserCommand({
            UserPoolId: env.FSR_USER_POOL_ID,
            Username: email,
            TemporaryPassword: password,
            UserAttributes: [
              { Name: 'email', Value: email },
              { Name: 'email_verified', Value: 'true' },
            ],
            MessageAction: 'SUPPRESS',
          }));
        } else {
          throw err;
        }
      }

      const sub = created.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
      if (!sub) throw new Error('Cognito created the user but returned no sub');

      // cohost, always. Never args.
      await cognito.send(new AdminAddUserToGroupCommand({
        UserPoolId: env.FSR_USER_POOL_ID, Username: email, GroupName: COHORT_GROUP,
      }));

      const profile = await createProfileFor(sub, email, displayName, timezone);
      const season = profile ? await addToCurrentSeason(profile.id) : null;

      console.log(JSON.stringify({
        provisionCohost: 'ok', by: ctx.identity?.sub, email, profileId: profile?.id, emailed,
      }));
      return {
        ok: true,
        profileId: profile?.id ?? null,
        temporaryPassword: password,
        emailed,
        season,
      };
    }

    /**
     * A new temporary password for someone locked out.
     *
     * Permanent: false, so Cognito forces a change at next sign-in — the
     * password leadership reads out is never the one the co-host keeps. The
     * sign-in screen already handles that challenge.
     */
    case 'resetCohostPassword': {
      const target = await cohortOrError(String(args.profileId ?? ''));
      if ('error' in target) return { ok: false, error: target.error };

      const password = temporaryPassword();
      await cognito.send(new AdminSetUserPasswordCommand({
        UserPoolId: env.FSR_USER_POOL_ID,
        Username: target.username,
        Password: password,
        Permanent: false,
      }));
      console.log(JSON.stringify({
        resetCohostPassword: 'ok', by: ctx.identity?.sub, profileId: target.profile.id,
      }));
      return { ok: true, temporaryPassword: password };
    }

    /**
     * Turn an account off at the end of a season, or back on.
     *
     * Both halves matter. Profile.status is what member-api checks on every
     * call; disabling the Cognito user is what stops her getting a token at
     * all. Doing only the first leaves a valid login against a backend that
     * will refuse it, which reads to the person as the app being broken.
     */
    case 'setCohostActive': {
      const active = args.active === true;
      const target = await cohortOrError(String(args.profileId ?? ''));
      if ('error' in target) return { ok: false, error: target.error };

      const r = await db.models.Profile.update({
        id: target.profile.id, status: active ? 'active' : 'removed',
      });
      if (r.errors?.length) throw new Error(JSON.stringify(r.errors));

      await cognito.send(active
        ? new AdminEnableUserCommand({ UserPoolId: env.FSR_USER_POOL_ID, Username: target.username })
        : new AdminDisableUserCommand({ UserPoolId: env.FSR_USER_POOL_ID, Username: target.username }));

      console.log(JSON.stringify({
        setCohostActive: active, by: ctx.identity?.sub, profileId: target.profile.id,
      }));
      return { ok: true, status: active ? 'active' : 'removed' };
    }

    /**
     * Withdraw a session invitation, and everything hanging off it.
     *
     * SIX TABLES POINT AT A RECORDING. Deleting only the Recording row leaves
     * RSVPs, attendee rows, questions and intake links pointing at an id that
     * no longer resolves — and an orphaned QuestionLink is not merely untidy:
     * `coverageStatus` counts a co-host as covered because her question is
     * "assigned", so she silently drops off the list of people who still need
     * to be asked something. That is the failure worth preventing, and it is
     * why this runs server-side in one invocation rather than as a loop on a
     * phone that can lose signal halfway.
     *
     * ORDER MATTERS, and it is children first, parent last. If this dies part
     * way, what survives is a recording that still exists and can be deleted
     * again — recoverable. The other order leaves a deleted session with live
     * children, which is the state nothing can clean up because there is
     * nothing left to find them by.
     *
     * NOTIFICATION LOGS ARE DELIBERATELY KEPT. They are the record of what was
     * already sent, and their dedupe keys are what stop a resurrected id being
     * announced to everyone a second time. Deleting them is the risky
     * direction, not keeping them.
     */
    case 'withdrawRecording': {
      const recordingId = String(args.recordingId ?? '');
      if (!recordingId) return { ok: false, error: 'not_found' };

      const rec = await db.models.Recording.get({ id: recordingId });
      if (!rec.data) return { ok: false, error: 'not_found' };

      /*
       * A PUBLISHED SESSION IS CANCELLED, NOT ERASED.
       *
       * Janell withdrew one in testing and watched it disappear from the
       * co-host side with nothing sent and no trace — "the entire recording
       * info just disappeared". Deleting a session people were invited to
       * destroys the only thing that can explain where it went, and leaves
       * push-outbox nothing to find and announce.
       *
       * So a published session gets a cancelledAt and keeps everything:
       * push-outbox announces it on its next run, the co-host screen shows it
       * struck through instead of 404ing, and the RSVPs survive in case it
       * comes back. A DRAFT is different — nobody was ever told it existed —
       * and is still deleted outright, below.
       */
      if (rec.data.publishedAt && !rec.data.cancelledAt) {
        const off = await db.models.Recording.update({
          id: recordingId, cancelledAt: new Date().toISOString(),
        });
        if (off.errors?.length) throw new Error(JSON.stringify(off.errors));
        console.log(JSON.stringify({
          withdrawRecording: 'cancelled', by: ctx.identity?.sub, recordingId,
        }));
        return { ok: true, cancelled: true };
      }

      const removed: Record<string, number> = {};
      /** Same shape as member-api's deleteMyAccount, for the same reasons. */
      const wipe = async (label: string, rows: { id: string }[], del: (id: string) => Promise<unknown>) => {
        for (const r of rows) await del(r.id);
        removed[label] = rows.length;
      };
      const by = { filter: { recordingId: { eq: recordingId } } };

      await wipe('rsvps', await listAll(db.models.Rsvp.list, by),
        (id) => db.models.Rsvp.delete({ id }));
      await wipe('attendees', await listAll(db.models.Attendee.list, by),
        (id) => db.models.Attendee.delete({ id }));
      await wipe('questions', await listAll(db.models.Question.list, by),
        (id) => db.models.Question.delete({ id }));
      // The link only — the intake question itself is hers and outlives any
      // session it was going to be asked on, and goes back to "waiting".
      await wipe('questionLinks', await listAll(db.models.QuestionLink.list, by),
        (id) => db.models.QuestionLink.delete({ id }));
      await wipe('receipts', await listAll(db.models.Receipt.list, {
        filter: { targetId: { eq: recordingId }, targetType: { eq: 'recording' } },
      }), (id) => db.models.Receipt.delete({ id }));

      const gone = await db.models.Recording.delete({ id: recordingId });
      if (gone.errors?.length) throw new Error(JSON.stringify(gone.errors));

      console.log(JSON.stringify({
        withdrawRecording: 'deleted', by: ctx.identity?.sub, recordingId,
        wasCancelled: Boolean(rec.data.cancelledAt), removed,
      }));
      return { ok: true, deleted: true, removed };
    }

    default:
      throw new Error(`admin-api: unknown field ${field}`);
  }
};

/** Named for what it guarantees: the target is a co-host, or you get nothing. */
async function cohortOrError(profileId: string) {
  if (!profileId) return { error: 'not_found' as const };
  const t = await cohostTarget(profileId);
  if ('error' in t) return { error: t.error };
  return t as { profile: { id: string; email: string }; username: string };
}
