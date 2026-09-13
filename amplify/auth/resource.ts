import { defineAuth } from '@aws-amplify/backend';

/**
 * Cognito user pool.
 *
 * Email + password for now — deliberate. Passwordless OTP is the target
 * (spec §5.1) but it needs SES out of sandbox and a verified domain, neither
 * of which is available yet. Password auth unblocks everything else and the
 * app already supports it. Switching later is a change here plus re-enabling
 * the OTP path in app/index.tsx.
 *
 * Two groups:
 *   leadership — Janell, Lauren, Reina. Full access to every model.
 *   cohost     — everyone else. NO direct model access; reads go through the
 *                member-api Lambda, which is where the privacy rules live.
 */
export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailSubject: 'Your Finding Something Real code',
      verificationEmailBody: (code: () => string) =>
        `Welcome. Your code is ${code()} — enter it in the app to finish setting up.`,
    },
  },
  groups: ['leadership', 'cohost'],
  // Time zone (spec §5.15) lives on the Profile model, not as a Cognito
  // attribute — the app reads it from there and it needs to be queryable.
});
