import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/push-api';
import { createHash } from 'node:crypto';

/**
 * DEVICE REGISTRATION.
 *
 * Kept out of member-api on purpose — see the comment on pushApi in
 * amplify/data/resource.ts. The short version: one field here is callable
 * without an account, and the privacy boundary should not have a caller it
 * cannot identify.
 *
 * This function reaches exactly one model. If a future change needs it to read
 * Profile, Rsvp or anything else, that is the signal the work belongs in
 * member-api instead.
 */

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const db = generateClient<Schema>({ authMode: 'iam' });

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

/**
 * Expo's token format, and the only thing accepted as a token anywhere.
 *
 * This is the whole input validation story for the guest-callable path, so it
 * is strict: literal prefix, closing bracket, and a bounded body of characters
 * Expo actually uses. A caller cannot store arbitrary text in the table by
 * calling it a token.
 */
const TOKEN_RE = /^ExponentPushToken\[[A-Za-z0-9_-]{6,64}\]$/;

/** The row id IS the token, hashed. Registration is therefore idempotent. */
const idFor = (token: string) => createHash('sha256').update(token).digest('hex');

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyList = (a?: any) => Promise<{ data?: any[] | null; nextToken?: string | null }>;

async function listAll<F extends AnyList>(
  fn: F,
  args: Record<string, unknown> = {},
): Promise<any[]> {
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
 * The caller's profile id, or null if there is no verified user.
 *
 * Note what is NOT here: any way for the client to supply a profile id. The
 * guest path forces null, and the authenticated path derives it from the token
 * subject. Those are the only two possibilities.
 */
async function callerProfileId(ctx: Ctx): Promise<string | null> {
  const sub = ctx.identity?.sub;
  if (!sub) return null;
  const rows = await listAll(db.models.Profile.list, {
    filter: { owner: { contains: sub } },
  });
  const p = rows[0];
  // A profile that is pending or removed still gets a row — it just will not
  // be selected by the outbox, which filters on status through Rsvp and
  // Membership. Registering early means notifications work the moment
  // leadership activates the account.
  return p?.id ?? null;
}

/**
 * May this caller change this row?
 *
 * A device that belongs to nobody is fair game — the person holding the phone
 * is the only one who can know its token, and they have no account to prove
 * anything with. A device attached to a co-host is hers: the caller has to BE
 * her.
 *
 * Without this, setPushPrefs and unregisterPushToken were reachable by a guest
 * against any token, so anyone who learned a co-host's push token could
 * silence her recording reminders. Push tokens are not secrets in the way a
 * password is, and an authorization rule should not assume they are.
 */
async function mayTouch(ctx: Ctx, row: { profileId?: string | null }) {
  if (!row.profileId) return true;
  const mine = await callerProfileId(ctx);
  return mine !== null && mine === row.profileId;
}

async function getByToken(token: string) {
  const r = await db.models.PushToken.get({ id: idFor(token) });
  return r?.data ?? null;
}

async function upsert(token: string, profileId: string | null, patch: Record<string, unknown>) {
  const id = idFor(token);
  const existing = await getByToken(token);
  const now = new Date().toISOString();
  if (existing) {
    const r = await db.models.PushToken.update({
      id, profileId, lastSeenAt: now, retiredAt: null, ...patch,
    });
    if (r.errors?.length) throw new Error(JSON.stringify(r.errors));
    return r.data;
  }
  const r = await db.models.PushToken.create({
    id, token, profileId, lastSeenAt: now,
    wantsSessions: true, wantsReminders: true, wantsNotes: true, wantsEpisodes: true,
    ...patch,
  });
  if (r.errors?.length) throw new Error(JSON.stringify(r.errors));
  return r.data;
}

const prefsOf = (row: Record<string, unknown> | null) => ({
  registered: !!row,
  linkedToAccount: !!row?.profileId,
  wantsSessions: row?.wantsSessions ?? true,
  wantsReminders: row?.wantsReminders ?? true,
  wantsNotes: row?.wantsNotes ?? true,
  wantsEpisodes: row?.wantsEpisodes ?? true,
});

export const handler = async (ctx: Ctx) => {
  const field = fieldOf(ctx);
  const args = argsOf(ctx);
  const token = String(args.token ?? '');

  if (!TOKEN_RE.test(token)) {
    // Same message for every field. A caller probing the shape of the table
    // learns only that its token was malformed.
    return { ok: false, error: 'invalid_token' };
  }

  switch (field) {
    /* A co-host's device: attached to whoever holds the token. */
    case 'registerPushToken': {
      const profileId = await callerProfileId(ctx);
      if (!profileId) return { ok: false, error: 'no_profile' };
      const existing = await getByToken(token);

      /*
       * PROMOTION. A device that was a listener's had the three co-host
       * categories switched OFF — correctly, because a listener has no
       * sessions, no reminders and no notes to receive. This is the moment
       * that stops being true.
       *
       * The bug this fixes was silent and complete. A woman installs the app,
       * taps "Notify me about new episodes" on the Listen screen, and is
       * later made a co-host. Signing in re-pointed her device at her profile
       * — that part always worked — but only patched profileId, platform and
       * deviceLabel, so `wantsSessions: false` survived. She then had
       * notifications visibly ON, a device correctly linked to her account,
       * and received no invitations, no reminders and no notes, including the
       * cancellation and reschedule notices the whole outbox exists for.
       * Nothing anywhere told her. Given the Listen tab is the app's landing
       * screen, that is not an edge case — it is the likely path.
       *
       * ONLY ON PROMOTION, and this is the part worth being careful about. A
       * co-host who deliberately turned reminders off has her device
       * re-registered on EVERY launch; flipping her choice back on each time
       * would be worse than the bug. So the categories are only turned on
       * when the row was not already a member's — a new row, or one whose
       * profileId was null. An existing co-host's preferences are never
       * touched here.
       */
      const promoting = !existing?.profileId;
      await upsert(token, profileId, {
        platform: args.platform ? String(args.platform).slice(0, 16) : null,
        deviceLabel: args.deviceLabel ? String(args.deviceLabel).slice(0, 64) : null,
        ...(promoting
          ? { wantsSessions: true, wantsReminders: true, wantsNotes: true }
          : {}),
      });
      return { ok: true, linkedToAccount: true, promoted: promoting };
    }

    /**
     * A listener's device. profileId is hard-coded null rather than taken from
     * the caller even when the caller happens to be signed in: this field
     * exists for the public tier, and a co-host who lands on it should not
     * silently have her session notifications rebound. She registers through
     * registerPushToken, which the app calls on sign-in.
     */
    case 'registerListenerPushToken': {
      const existing = await getByToken(token);
      // Do not downgrade a device that is already attached to an account —
      // that would silently unsubscribe a co-host from her own invitations.
      if (existing?.profileId) {
        await upsert(token, existing.profileId, { wantsEpisodes: true });
        return { ok: true, linkedToAccount: true };
      }
      await upsert(token, null, {
        platform: args.platform ? String(args.platform).slice(0, 16) : null,
        // A listener asked for episodes and nothing else exists for them.
        wantsSessions: false, wantsReminders: false, wantsNotes: false,
        wantsEpisodes: true,
      });
      return { ok: true, linkedToAccount: false };
    }

    case 'setPushPrefs': {
      const existing = await getByToken(token);
      if (!existing) return { ok: false, error: 'not_registered' };
      if (!(await mayTouch(ctx, existing))) return { ok: false, error: 'not_yours' };
      const patch: Record<string, unknown> = {};
      for (const k of ['wantsSessions', 'wantsReminders', 'wantsNotes', 'wantsEpisodes'] as const) {
        if (typeof args[k] === 'boolean') patch[k] = args[k];
      }
      const row = await upsert(token, existing.profileId ?? null, patch);
      return { ok: true, ...prefsOf(row as Record<string, unknown>) };
    }

    case 'unregisterPushToken': {
      const existing = await getByToken(token);
      if (!existing) return { ok: true };
      if (!(await mayTouch(ctx, existing))) return { ok: false, error: 'not_yours' };
      await db.models.PushToken.delete({ id: idFor(token) });
      return { ok: true };
    }

    case 'myPushPrefs': {
      const row = await getByToken(token);
      // A row that belongs to someone else reads as "not registered" rather
      // than as a denial. There is nothing to learn from the difference.
      if (row && !(await mayTouch(ctx, row))) return prefsOf(null);
      return prefsOf(row as Record<string, unknown> | null);
    }

    default:
      throw new Error(`push-api: unknown field ${field}`);
  }
};
