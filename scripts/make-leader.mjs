/**
 * MAKE A LEADERSHIP ACCOUNT. The one thing the app cannot do.
 *
 *   FSR_TARGET=production node scripts/make-leader.mjs "lauren@example.com" "Lauren"
 *   FSR_TARGET=production node scripts/make-leader.mjs "…" "…" --print   # no email; show the password once
 *   FSR_TARGET=production node scripts/make-leader.mjs "…" "…" --dry-run
 *
 * Nothing inside the app can create a leader, and that is deliberate rather
 * than unfinished: admin-api's provisioning holds the group name as a constant
 * (`cohost`) with no argument that can change it, so a stolen leadership login
 * cannot mint more of itself. A leadership account reads every prayer request,
 * every message and every co-host's email address in the ministry — the whole
 * point of that restriction is that adding one has to be a deliberate act by
 * someone with the AWS account, outside the app.
 *
 * This script IS that deliberate act.
 *
 * WHAT CHANGED IN OCTOBER 2026, and why.
 *
 *   · IT EMAILS THE INVITATION BY DEFAULT. Cognito generates the temporary
 *     password and sends it straight to the person, so the password never
 *     passes through this terminal, this repository or anyone's chat window.
 *     She must choose her own on first sign-in. `--print` keeps the old
 *     behaviour for when email is not an option.
 *
 *   · IT NO LONGER SIGNS IN AS A SEEDED USER to write the Profile row. The old
 *     version borrowed curtis@fsr.test's token, which worked only because the
 *     test logins lived in production — and the point of the October clean-up
 *     was that they no longer do. The Profile is written directly with the
 *     deployer's AWS credentials (scripts/ddb.mjs), which is also the more
 *     honest shape of "done from outside the app".
 *
 *   · IT TARGETS PRODUCTION ONLY WHEN TOLD TO. Like every script here it
 *     follows FSR_TARGET; unlike the test suites it refuses to guess, because
 *     creating a leader in the wrong backend is not a harmless mistake.
 *
 * Safe to re-run against the same email:
 *   never signed in      → the invitation is re-sent with a fresh password
 *                          (the old one expires after 7 days anyway)
 *   already signed in    → her password is left alone; group and profile are
 *                          checked and repaired if needed
 */
if (!process.env.FSR_TARGET) {
  console.error('Set FSR_TARGET=production (or =test). make-leader will not guess which backend to give leadership access to.');
  process.exit(2);
}

const { outputs, announce, isProduction } = await import('./target.mjs');
const { tables } = await import('./ddb.mjs');
const {
  CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand, ListUsersCommand, AdminListGroupsForUserCommand,
} = await import('@aws-sdk/client-cognito-identity-provider');
const { randomInt } = await import('node:crypto');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [rawEmail, displayName, tz = 'America/Los_Angeles'] = args.filter((a) => !a.startsWith('--'));
if (!rawEmail || !displayName) {
  console.error('usage: FSR_TARGET=production node scripts/make-leader.mjs "<email>" "<Display Name>" [timezone] [--print] [--dry-run]');
  process.exit(1);
}
const email = rawEmail.trim().toLowerCase();
const PRINT = flags.has('--print');
const DRY = flags.has('--dry-run');

announce('make-leader');
const POOL = outputs.auth.user_pool_id;
const cog = new CognitoIdentityProviderClient({ region: outputs.auth.aws_region });
const db = await tables(outputs);

const findUser = async () => (await cog.send(new ListUsersCommand({
  UserPoolId: POOL, Filter: `email = "${email}"`, Limit: 1,
}))).Users?.[0];

/** Matches the pool's policy: upper, lower, number, symbol, 8+. Readable down a phone. */
const WORDS = ['Harbor', 'Meadow', 'Lantern', 'Cobalt', 'Willow', 'Ember', 'Quartz', 'Juniper', 'Cedar', 'Saffron'];
const readable = () =>
  `${WORDS[randomInt(WORDS.length)]}-${WORDS[randomInt(WORDS.length)]}-${randomInt(1000, 9999)}!`;

let user = await findUser();
const state = user ? user.UserStatus : 'MISSING';
console.log(`${email}: ${state}`);

if (DRY) {
  const plan = !user
    ? (PRINT ? 'create, set a temporary password, print it' : 'create and EMAIL an invitation')
    : state === 'FORCE_CHANGE_PASSWORD'
      ? (PRINT ? 'set a fresh temporary password and print it' : 'RE-SEND the invitation email with a fresh password')
      : 'leave the password alone; check group and profile';
  console.log(`dry run — would: ${plan}; ensure group "leadership"; ensure an admin Profile.`);
  process.exit(0);
}

let printed = null;
if (!user) {
  await cog.send(new AdminCreateUserCommand({
    UserPoolId: POOL,
    Username: email,
    UserAttributes: [{ Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' }],
    ...(PRINT ? { MessageAction: 'SUPPRESS' } : { DesiredDeliveryMediums: ['EMAIL'] }),
  }));
  user = await findUser();
  console.log(PRINT ? 'created (no email sent)' : 'created — invitation emailed by Cognito');
} else if (state === 'FORCE_CHANGE_PASSWORD' && !PRINT) {
  // The EMAIL, not user.Username: the pool signs in by email, its internal
  // usernames are subs, and RESEND rejects a sub with "Username should be an
  // email". (Found re-sending Janell's invitation, 3 Oct 2026.)
  await cog.send(new AdminCreateUserCommand({
    UserPoolId: POOL, Username: email, MessageAction: 'RESEND', DesiredDeliveryMediums: ['EMAIL'],
  }));
  console.log('invitation RE-SENT with a fresh temporary password');
}

if (PRINT && (state === 'MISSING' || state === 'FORCE_CHANGE_PASSWORD')) {
  printed = readable();
  await cog.send(new AdminSetUserPasswordCommand({
    UserPoolId: POOL, Username: user.Username, Password: printed, Permanent: false,
  }));
}

const groups = (await cog.send(new AdminListGroupsForUserCommand({
  UserPoolId: POOL, Username: user.Username,
}))).Groups.map((g) => g.GroupName);
if (!groups.includes('leadership')) {
  await cog.send(new AdminAddUserToGroupCommand({ UserPoolId: POOL, Username: user.Username, GroupName: 'leadership' }));
  console.log('added to the leadership group');
} else {
  console.log('already in the leadership group');
}

/*
 * The Profile. Without it the login works and the app shows nothing —
 * member-api refuses any sub with no Profile row, which is the check that
 * makes a stray Cognito user harmless.
 */
const sub = user.Attributes.find((a) => a.Name === 'sub').Value;
const profiles = await db.scan('Profile');
const mine = profiles.find((p) => p.owner === sub || p.email === email);
if (!mine) {
  const p = await db.create('Profile', {
    owner: sub, email, displayName, role: 'admin', status: 'active', timezone: tz,
  });
  console.log(`created profile ${p.id}`);
} else if (mine.role !== 'admin' || mine.status !== 'active' || mine.owner !== sub) {
  await db.patch('Profile', mine.id, { role: 'admin', status: 'active', owner: sub });
  console.log(`profile ${mine.id} repaired to admin/active`);
} else {
  console.log(`profile ${mine.id} already admin/active`);
}

console.log(printed
  ? `\n  ${displayName}: ${email} / ${printed}\n  Shown once, not stored. Hand it over in person or by text, not by email.\n`
  : `\n  ${displayName} will get an email from no-reply@verificationemail.com with a temporary\n  password. It expires in 7 days. If it is not in the inbox, check spam.\n`);
if (isProduction) {
  console.log('  This account can read every prayer request, every message and every co-host\'s email address.');
}

