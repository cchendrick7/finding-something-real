/**
 * "WE'D GENUINELY LOVE TO HEAR FROM YOU" — the rules behind the form.
 *
 * Janell asked for a way for an interested woman to leave her details at the
 * end of ABOUT, and at the co-host sign-in. This module holds what counts as
 * a valid submission, and it is imported by BOTH the screen and the Lambda
 * that receives it.
 *
 * That is the whole point of the file. A form that validates on the client
 * and a handler that validates differently is two rules, and the one that
 * matters is the one nobody reads. Here there is one rule, the screen uses it
 * to decide whether the button is live, the handler uses it to decide whether
 * to write a row, and scripts/interest-test.mjs runs it directly.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * No date of birth, and no age question. The audience is women in their late
 * teens and twenties, so some submitters are 16 or 17. COPPA stops at 13, so
 * they are outside it — but asking for a birthdate is exactly what would give
 * the ministry actual knowledge of an under-13 submitter and pull it inside.
 * Not asking is the safer answer as well as the kinder one.
 *
 * Phone is OPTIONAL. Guideline 5.1.1(iii) is data minimisation, and of the
 * three fields the phone number is the one a reviewer could argue with. It is
 * also the one a sixteen-year-old is most likely to hesitate over.
 */

/** What the form collects. `phone` may be omitted entirely. */
export interface Interest {
  name: string;
  email: string;
  phone?: string;
  note?: string;
}

/**
 * Length caps. These are not UI niceties — they are the only thing standing
 * between an unauthenticated mutation and someone storing a novel in the
 * ministry's DynamoDB table one call at a time.
 */
export const LIMITS = { name: 80, email: 254, phone: 32, note: 1000 } as const;

/**
 * Email, pragmatically.
 *
 * Not RFC 5322. Nothing here needs to accept a quoted local part with a
 * comment in it, and every regex that tries is either wrong or unreadable.
 * This rejects the mistakes people actually make on a phone — no @, no dot in
 * the domain, a trailing comma, a space in the middle.
 */
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[A-Za-z]{2,}$/;

/**
 * Phone, permissively.
 *
 * International, extensions, dashes, dots, brackets and the word "ext" all
 * arrive in real submissions. A human reads this field, not a dialler, so the
 * check is only "could this plausibly be a phone number": enough digits, and
 * nothing that looks like prose.
 */
const PHONE_DIGITS = /\d/g;

export type Field = keyof Interest;

/** Trimmed, collapsed whitespace, and empty strings turned into undefined. */
export function tidy(raw: Interest): Interest {
  const s = (v?: string) => {
    const t = (v ?? '').replace(/\s+/g, ' ').trim();
    return t.length ? t : undefined;
  };
  return {
    name: s(raw.name) ?? '',
    email: (s(raw.email) ?? '').toLowerCase(),
    phone: s(raw.phone),
    note: s(raw.note),
  };
}

/**
 * What is wrong with this submission, keyed by field. Empty object = valid.
 *
 * Messages are written for the woman filling the form in, not for a log. She
 * is the only one who will ever read them.
 */
export function problems(raw: Interest): Partial<Record<Field, string>> {
  const v = tidy(raw);
  const out: Partial<Record<Field, string>> = {};

  if (!v.name) out.name = 'We need something to call you.';
  else if (v.name.length > LIMITS.name) out.name = 'That is longer than we can store — a first name is plenty.';

  if (!v.email) out.email = 'We need an email address to reply to.';
  else if (v.email.length > LIMITS.email) out.email = 'That address is too long to be real.';
  else if (!EMAIL_RE.test(v.email)) out.email = 'That does not look like an email address.';

  if (v.phone) {
    const digits = (v.phone.match(PHONE_DIGITS) ?? []).length;
    if (v.phone.length > LIMITS.phone) out.phone = 'That is longer than a phone number.';
    else if (digits < 7) out.phone = 'That does not look like a phone number. You can leave it blank.';
  }

  if (v.note && v.note.length > LIMITS.note) {
    out.note = 'A bit long for this box — say the short version and we will ask the rest.';
  }
  return out;
}

export const isValid = (raw: Interest) => Object.keys(problems(raw)).length === 0;

/**
 * The row id: the email, lowercased and hashed.
 *
 * Same trick as PushToken, for the same reason. This mutation is callable by
 * someone with no account, so the question "how many rows can a caller
 * create?" has to have a bounded answer. With the id derived from the email,
 * a thousand calls from one address make one row — a second submission
 * updates the first rather than filling the table.
 *
 * It does NOT stop a thousand made-up addresses. Nothing in the schema can;
 * that is a rate limit, and a rate limit on AppSync means AWS WAF in front of
 * the endpoint. Named as a gap in docs/APP-STORE-DECISIONS.md rather than
 * pretended away here.
 *
 * Hashing rather than storing the email as the key also means the id itself
 * is not a personal identifier, so it can appear in a log line safely.
 */
export async function idForEmail(
  email: string,
  digest: (s: string) => Promise<string> | string,
): Promise<string> {
  return digest(email.trim().toLowerCase());
}
