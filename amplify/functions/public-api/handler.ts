import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/public-api';
import { createHash } from 'node:crypto';
import { problems, tidy, LIMITS } from '../../../lib/interest';

/**
 * THE PUBLIC HALF'S ONLY WRITE.
 *
 * One mutation: a woman who is not a co-host leaves her name and email
 * because she would like to be one. She has no account, so there is no
 * identity to check — which means every guarantee this function makes has to
 * come from what it refuses to do, not from who is calling.
 *
 * WHAT A CALLER CANNOT DO, and why each one matters:
 *
 *   · Reach any model but Inquiry — AS A MATTER OF CODE, not of IAM, and the
 *     difference is worth stating. Amplify grants data access per function,
 *     not per model (the attempt and the compiler error are recorded on the
 *     Inquiry model in data/resource.ts), so this function's role can read
 *     every table. Nothing below asks it to. That is a weaker guarantee than
 *     the rest of this backend gives, which is exactly why this file is short
 *     and why its surface is one mutation.
 *   · Set `source`, `handled`, `handledAt` or the row id. All four are set
 *     here. A caller who could set `handled: true` could file a submission
 *     that Janell's screen never surfaces, which is worse than not receiving
 *     it — it would look like nobody had asked.
 *   · Grow the table by resubmitting. The id is a hash of the email, so the
 *     second submission from an address updates the first.
 *   · Store arbitrary text. Every field is length-capped by lib/interest.ts,
 *     and the caps are enforced HERE as well as on the form, because the form
 *     is not the only thing that can call this.
 *   · Learn anything. The reply is `{ok: true}` whatever happened. It does
 *     not say whether the address was already on file, because that would
 *     turn this into a way to test whether a given woman has been in touch
 *     with the ministry.
 *
 * WHAT IT CANNOT STOP, stated plainly: a caller with a thousand made-up
 * addresses makes a thousand rows. Nothing expressible in this file prevents
 * that — it is a rate limit, it belongs in AWS WAF in front of the AppSync
 * endpoint, and it is written down as an open item in
 * docs/APP-STORE-DECISIONS.md. Leadership's screen shows the count, so the
 * failure is at least visible.
 *
 * The validation rules themselves are in lib/interest.ts, imported rather
 * than restated, so the form and the handler cannot drift apart.
 */

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const db = generateClient<Schema>({ authMode: 'iam' });

type Ctx = {
  arguments?: Record<string, unknown>;
  identity?: { sub?: string };
  info?: { fieldName?: string };
  fieldName?: string;
};

const fieldOf = (c: Ctx) => c.info?.fieldName ?? c.fieldName ?? '';
const str = (v: unknown, cap: number) =>
  (typeof v === 'string' ? v : '').slice(0, cap * 2);

/** The row id: sha256 of the lowercased email. Never the email itself. */
const idFor = (email: string) =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

export const handler = async (ctx: Ctx) => {
  const field = fieldOf(ctx);
  if (field !== 'submitInterest') {
    // Not reachable through the schema. If it ever is, that is a wiring
    // mistake and it should be loud rather than silently doing nothing.
    throw new Error(`public-api does not handle ${field || '(no field)'}`);
  }

  const a = ctx.arguments ?? {};
  // Sliced to twice the cap before validation, so a megabyte of text is
  // discarded rather than measured.
  const raw = {
    name: str(a.name, LIMITS.name),
    email: str(a.email, LIMITS.email),
    phone: str(a.phone, LIMITS.phone) || undefined,
    note: str(a.note, LIMITS.note) || undefined,
  };

  const bad = problems(raw);
  if (Object.keys(bad).length) {
    // The form already said this, in her words. This is the second line of
    // defence, so the reply is deliberately terse and names the fields
    // without echoing what was sent back to the caller.
    return { ok: false, invalid: Object.keys(bad) };
  }

  const v = tidy(raw);
  const id = idFor(v.email);

  const existing = await db.models.Inquiry.get({ id });
  if (existing.data) {
    /*
     * She has written before. Update rather than insert — and deliberately
     * do NOT touch `handled`: if Janell has already replied and this woman
     * writes again, the new note should reopen it. So handled is cleared,
     * but handledAt is left as the record of when the first reply went.
     */
    await db.models.Inquiry.update({
      id,
      name: v.name,
      phone: v.phone ?? null,
      note: v.note ?? null,
      handled: false,
    });
    return { ok: true };
  }

  await db.models.Inquiry.create({
    id,
    name: v.name,
    email: v.email,
    phone: v.phone ?? null,
    note: v.note ?? null,
    source: 'app',
    handled: false,
    handledAt: null,
  });

  return { ok: true };
};
