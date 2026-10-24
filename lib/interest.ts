/**
 * The public interest form's rules: what is tidied, what is refused, and how
 * long anything may be. No React, so the same rules can be checked outside
 * the app.
 */

export type InterestInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  note?: string | null;
};

export type Interest = {
  name: string;
  email: string;
  phone?: string;
  note?: string;
};

export type Problems = Partial<Record<keyof Interest, string>>;

/** Longest value we store for each field. */
export const LIMITS = { name: 80, email: 254, phone: 32, note: 1000 };

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[A-Za-z]{2,}$/;
const DIGIT = /\d/g;

/** Collapse runs of whitespace and trim; an empty optional field becomes undefined. */
export function tidy(input: InterestInput): Interest {
  const clean = (s?: string | null) => {
    const t = (s ?? '').replace(/\s+/g, ' ').trim();
    return t.length ? t : undefined;
  };
  return {
    name: clean(input.name) ?? '',
    email: (clean(input.email) ?? '').toLowerCase(),
    phone: clean(input.phone),
    note: clean(input.note),
  };
}

/** One message per field that is wrong, in the form's voice. Empty = fine to send. */
export function problems(input: InterestInput): Problems {
  const v = tidy(input);
  const out: Problems = {};
  if (!v.name) out.name = 'We need something to call you.';
  else if (v.name.length > LIMITS.name) out.name = 'That is longer than we can store — a first name is plenty.';

  if (!v.email) out.email = 'We need an email address to reply to.';
  else if (v.email.length > LIMITS.email) out.email = 'That address is too long to be real.';
  else if (!EMAIL.test(v.email)) out.email = 'That does not look like an email address.';

  // Phone is optional; if it is there it should at least be a phone number.
  if (v.phone) {
    const digits = (v.phone.match(DIGIT) ?? []).length;
    if (v.phone.length > LIMITS.phone) out.phone = 'That is longer than a phone number.';
    else if (digits < 7) out.phone = 'That does not look like a phone number. You can leave it blank.';
  }

  if (v.note && v.note.length > LIMITS.note) {
    out.note = 'A bit long for this box — say the short version and we will ask the rest.';
  }
  return out;
}

export const isValid = (input: InterestInput) => Object.keys(problems(input)).length === 0;

/**
 * The Inquiry id is derived from the email, so a repeat submission is
 * byte-identical to a first — and the form cannot be used to ask whether a
 * woman has been in touch. The hash function is passed in rather than
 * imported; trimming and lower-casing first means "Anna@x.com " and
 * "anna@x.com" give the same id.
 */
export async function idForEmail(email: string, hash: (s: string) => Promise<string>): Promise<string> {
  return hash(email.trim().toLowerCase());
}
