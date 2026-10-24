/**
 * Sign-in helpers, kept apart from the screen so the rules can be read (and
 * tested) without React.
 *
 * The bug this file exists for: "There is already a signed in user". Amplify
 * refuses signIn while it still holds a session — a stale one left on the
 * phone counts — and the person typing a perfectly good password was shown an
 * error she could do nothing about. signInFresh signs the stale session out
 * first and tries once more.
 */

export type SignInInput = { username: string; password: string };

/** The two Amplify calls signInFresh needs, passed in rather than imported. */
export interface AuthCalls<R> {
  signIn: (input: SignInInput) => Promise<R>;
  signOut: () => Promise<void>;
}

const errName = (err: unknown): string => {
  if (typeof err !== 'object' || err === null) return '';
  const name = (err as { name?: unknown }).name;
  return typeof name === 'string' ? name : '';
};

const errMessage = (err: unknown): string => {
  if (typeof err !== 'object' || err === null) return '';
  const m = (err as { message?: unknown }).message;
  return typeof m === 'string' ? m : '';
};

/** Amplify's "There is already a signed in user", by name or by wording. */
export function isAlreadySignedIn(err: unknown): boolean {
  return (
    errName(err) === 'UserAlreadyAuthenticatedException' ||
    /already\s+a?\s*signed[- ]in user/i.test(errMessage(err))
  );
}

/**
 * The nextStep a co-host gets on her first sign-in with the temporary
 * password leadership issued her: she has to choose her own before going on.
 */
export const NEW_PASSWORD_STEP = 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED';

/**
 * What to tell the person, in words she can act on. Cognito's own messages
 * are written for developers.
 */
export function friendlyAuthError(err: unknown): string {
  const name = errName(err);
  if (name === 'NotAuthorizedException' || name === 'UserNotFoundException') {
    return 'That email and password don’t match an account. Passwords are case-sensitive, and it is the email your invitation came to.';
  }
  if (name === 'UserNotConfirmedException') {
    return 'This account has not been finished yet. Ask Janell to send the invitation again.';
  }
  if (name === 'PasswordResetRequiredException') {
    return 'This account needs a new password. Ask Janell to reset it for you.';
  }
  if (
    name === 'TooManyRequestsException' ||
    name === 'LimitExceededException' ||
    name === 'TooManyFailedAttemptsException'
  ) {
    return 'Too many tries in a row. Wait a few minutes and try again — nothing is locked permanently.';
  }
  if (name === 'NetworkError' || /network/i.test(errMessage(err))) {
    return 'Could not reach the server. Check your signal or Wi‑Fi and try again.';
  }
  if (name === 'InvalidPasswordException') {
    return 'That password is too short or too simple. Use at least 8 characters.';
  }
  if (isAlreadySignedIn(err)) {
    // signInFresh already tried signing the old session out; this is what is
    // left if even that failed.
    return 'Someone is already signed in on this phone and we could not sign them out. Close the app completely and open it again.';
  }
  return errMessage(err) || 'Could not sign in. Try again in a moment.';
}

/**
 * Sign in; if Amplify says someone is already signed in, sign that stale
 * session out and try once more. Any other error goes back to the caller.
 * Emails are matched lower-case and trimmed — a phone keyboard capitalises
 * the first letter.
 */
export async function signInFresh<R>(email: string, password: string, auth: AuthCalls<R>): Promise<R> {
  const input = { username: email.trim().toLowerCase(), password };
  try {
    return await auth.signIn(input);
  } catch (e) {
    if (!isAlreadySignedIn(e)) throw e;
    await auth.signOut();
    return auth.signIn(input);
  }
}
