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
      /**
       * The email Cognito sends when an account is made for someone — by
       * provisionCohost in the app, or by scripts/make-leader.mjs. It carries the
       * temporary password, so the password never passes through leadership's
       * screen unless she chooses to read it out.
       *
       * NOTE: scripts/invite-template.mjs applies a role-neutral version of this
       * text directly to the pool (leaders get it too). A deploy puts THIS text
       * back, so re-run that script after deploying auth changes.
       */
      userInvitation: {
        emailSubject: 'Your Finding Something Real co-host account',
        emailBody: (username: () => string, code: () => string) =>
          `<p>Someone from the Finding Something Real team has set up a co-host account for you.</p>`
          + `<p>Open the app, choose <strong>Co-hosts</strong>, and sign in with:</p>`
          + `<p>Email: <strong>${username()}</strong><br />Temporary password: <strong>${code()}</strong></p>`
          + `<p>You will be asked to choose your own password straight away.</p>`
          + `<p>If you were not expecting this you can ignore it — the account does nothing until someone signs in, and it can be removed.</p>`,
      },
    },
  },
  groups: ['leadership', 'cohost'],
  // member-api needs cognito-idp:AdminDeleteUser to finish an account
  // deletion. That grant is NOT made here: defineAuth's `access` callback
  // makes the auth stack reference the function's stack, and since data
  // already depends on auth that is a circular dependency CloudFormation
  // refuses. It is attached as a one-way IAM policy in backend.ts instead.
  // Time zone (spec §5.15) lives on the Profile model, not as a Cognito
  // attribute — the app reads it from there and it needs to be queryable.
});
