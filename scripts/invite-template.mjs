/**
 * THE INVITATION EMAIL — the one Cognito sends with a temporary password.
 *
 *   FSR_TARGET=production node scripts/invite-template.mjs           # apply
 *   FSR_TARGET=production node scripts/invite-template.mjs --check   # show, change nothing
 *
 * WHY A SCRIPT AND NOT ONLY amplify/auth/resource.ts. The text in auth/resource.ts
 * was written when every account was a co-host's. Since October 2026 leaders
 * are invited by email too (make-leader.mjs), so the wording had to stop saying
 * "co-host account". This applies the role-neutral version to the pool
 * directly. A deploy of the auth stack puts the auth/resource.ts text back —
 * re-run this afterwards.
 *
 * UpdateUserPool is a FULL REPLACE: any setting not passed is reset to its
 * default. So this reads the pool first and sends every setting back
 * unchanged except the invitation, then checks that the password policy, MFA
 * and account recovery survived. Cognito requires {username} and {####} in
 * the message; it refuses the update without them.
 */
if (!process.env.FSR_TARGET) {
  console.error('Set FSR_TARGET=production (or =test).');
  process.exit(2);
}
const { outputs, announce } = await import('./target.mjs');
const {
  CognitoIdentityProviderClient, DescribeUserPoolCommand, UpdateUserPoolCommand,
} = await import('@aws-sdk/client-cognito-identity-provider');

const CHECK = process.argv.includes('--check');

export const SUBJECT = 'Your Finding Something Real account';
export const MESSAGE =
  '<p>The Finding Something Real team has set up an account for you in the app.</p>'
  + '<p>Open the app, tap <strong>Co-hosts</strong>, and sign in with:</p>'
  + '<p>Email: <strong>{username}</strong><br />Temporary password: <strong>{####}</strong></p>'
  + '<p>You will be asked to choose your own password straight away. The temporary one only works once and expires after 7 days.</p>'
  + '<p>If you were not expecting this you can ignore it — the account does nothing until someone signs in.</p>';

announce('invite-template');
const POOL = outputs.auth.user_pool_id;
const cog = new CognitoIdentityProviderClient({ region: outputs.auth.aws_region });
const before = (await cog.send(new DescribeUserPoolCommand({ UserPoolId: POOL }))).UserPool;

console.log(`user pool: ${POOL}`);
console.log(`invitation subject now: ${before.AdminCreateUserConfig?.InviteMessageTemplate?.EmailSubject}`);
if (CHECK) {
  const same = before.AdminCreateUserConfig?.InviteMessageTemplate?.EmailMessage === MESSAGE
    && before.AdminCreateUserConfig?.InviteMessageTemplate?.EmailSubject === SUBJECT;
  console.log(same ? '  up to date' : '  DIFFERS from this script — run without --check to apply');
  process.exit(0);
}

await cog.send(new UpdateUserPoolCommand({
  UserPoolId: POOL,
  Policies: before.Policies,
  DeletionProtection: before.DeletionProtection,
  LambdaConfig: before.LambdaConfig,
  AutoVerifiedAttributes: before.AutoVerifiedAttributes,
  SmsVerificationMessage: before.SmsVerificationMessage,
  EmailVerificationMessage: before.EmailVerificationMessage,
  EmailVerificationSubject: before.EmailVerificationSubject,
  VerificationMessageTemplate: before.VerificationMessageTemplate,
  SmsAuthenticationMessage: before.SmsAuthenticationMessage,
  UserAttributeUpdateSettings: before.UserAttributeUpdateSettings,
  MfaConfiguration: before.MfaConfiguration,
  DeviceConfiguration: before.DeviceConfiguration,
  EmailConfiguration: before.EmailConfiguration,
  SmsConfiguration: before.SmsConfiguration,
  UserPoolTags: before.UserPoolTags,
  UserPoolAddOns: before.UserPoolAddOns,
  AccountRecoverySetting: before.AccountRecoverySetting,
  UserPoolTier: before.UserPoolTier,
  AdminCreateUserConfig: {
    ...before.AdminCreateUserConfig,
    InviteMessageTemplate: {
      ...before.AdminCreateUserConfig?.InviteMessageTemplate,
      EmailSubject: SUBJECT,
      EmailMessage: MESSAGE,
    },
  },
}));

const after = (await cog.send(new DescribeUserPoolCommand({ UserPoolId: POOL }))).UserPool;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
console.log('\n  applied');
console.log(`  subject: ${after.AdminCreateUserConfig.InviteMessageTemplate.EmailSubject}`);
console.log(`  policy preserved: ${same(before.Policies, after.Policies)}`);
console.log(`  MFA preserved: ${after.MfaConfiguration}${after.MfaConfiguration === before.MfaConfiguration ? '' : '  ← CHANGED'}`);
console.log(`  recovery preserved: ${same(before.AccountRecoverySetting, after.AccountRecoverySetting)}`);
console.log(`  admin-create-only preserved: ${after.AdminCreateUserConfig.AllowAdminCreateUserOnly === before.AdminCreateUserConfig.AllowAdminCreateUserOnly}`);
