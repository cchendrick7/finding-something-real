/**
 * THE TWO TEST ACCOUNTS THAT LIVE IN PRODUCTION, ON PURPOSE.
 *
 *   FSR_TARGET=production node scripts/ensure-test-accounts.mjs            # check, change nothing
 *   FSR_TARGET=production node scripts/ensure-test-accounts.mjs --reset    # (re)create + new passwords
 *
 * Everything else seeded lives in the test backend (scripts/target.mjs). These
 * two stay in production because some things can only be checked against the
 * real thing — the App Store build, App Review's sign-in, a push to a real
 * phone — and doing that with a leader's own login means testing with access
 * to every prayer request in the ministry.
 *
 *   testcohost@fsr.test   an ordinary co-host: group `cohost`, active member
 *                         profile, cohort membership in the current season.
 *                         This is the App Review demo account. NOTE: real
 *                         co-hosts see it in a session's roster if it RSVPs.
 *   stranger@fsr.test     a sign-in with NO group and a PENDING profile — what
 *                         anyone who signs up on their own gets. Confirms the
 *                         app shows such a person nothing.
 *
 * Neither can ever be leadership; this script will not make one, and it
 * removes the group if it finds one.
 *
 * --reset sets new PERMANENT passwords (no forced change, so App Review is not
 * stopped at a new-password screen) and prints them ONCE. They are not written
 * anywhere. Keep them in a password manager; re-run --reset if they are lost.
 */
if (!process.env.FSR_TARGET) {
  console.error('Set FSR_TARGET=production (or =test).');
  process.exit(2);
}
const { outputs, announce } = await import('./target.mjs');
const { tables } = await import('./ddb.mjs');
const {
  CognitoIdentityProviderClient, ListUsersCommand, AdminCreateUserCommand, AdminSetUserPasswordCommand,
  AdminListGroupsForUserCommand, AdminAddUserToGroupCommand, AdminRemoveUserFromGroupCommand,
} = await import('@aws-sdk/client-cognito-identity-provider');
const { randomInt } = await import('node:crypto');

const RESET = process.argv.includes('--reset');
const ACCOUNTS = [
  { email: 'testcohost@fsr.test', name: 'Test Co-host', group: 'cohost', role: 'member', status: 'active', cohort: true },
  { email: 'stranger@fsr.test', name: 'Stranger', group: null, role: 'member', status: 'pending', cohort: false },
];

announce('ensure-test-accounts');
console.log(RESET ? 'MODE: reset — passwords will change\n' : 'MODE: check only\n');
const POOL = outputs.auth.user_pool_id;
const cog = new CognitoIdentityProviderClient({ region: outputs.auth.aws_region });
const db = await tables(outputs);

/** Three words, four digits, a symbol: meets the pool policy and reads aloud. ~33 bits + length. */
const WORDS = ['Harbor', 'Meadow', 'Lantern', 'Cobalt', 'Willow', 'Ember', 'Quartz', 'Juniper', 'Cedar',
  'Saffron', 'Granite', 'Orchard', 'Falcon', 'Thistle', 'Copper', 'Indigo', 'Summit', 'Prairie'];
const password = () => [0, 1, 2].map(() => WORDS[randomInt(WORDS.length)]).join('-') + `-${randomInt(1000, 9999)}!`;

const find = async (email) => (await cog.send(new ListUsersCommand({
  UserPoolId: POOL, Filter: `email = "${email}"`, Limit: 1,
}))).Users?.[0];

const seasons = await db.scan('Season');
const current = seasons.find((s) => s.isCurrent) ?? seasons[0];
const printed = [];

for (const a of ACCOUNTS) {
  let user = await find(a.email);
  console.log(`${a.email}: ${user ? user.UserStatus : 'MISSING'}`);
  if (!RESET && !user) continue;

  if (!user) {
    await cog.send(new AdminCreateUserCommand({
      UserPoolId: POOL, Username: a.email, MessageAction: 'SUPPRESS',
      UserAttributes: [{ Name: 'email', Value: a.email }, { Name: 'email_verified', Value: 'true' }],
    }));
    user = await find(a.email);
    console.log('  created (no email sent)');
  }
  if (RESET) {
    const pw = password();
    await cog.send(new AdminSetUserPasswordCommand({ UserPoolId: POOL, Username: user.Username, Password: pw, Permanent: true }));
    printed.push([a.email, pw]);
  }

  // Groups: exactly the intended one, and never leadership.
  const groups = (await cog.send(new AdminListGroupsForUserCommand({ UserPoolId: POOL, Username: user.Username })))
    .Groups.map((g) => g.GroupName);
  for (const g of groups.filter((g) => g !== a.group)) {
    if (RESET) await cog.send(new AdminRemoveUserFromGroupCommand({ UserPoolId: POOL, Username: user.Username, GroupName: g }));
    console.log(`  ${RESET ? 'removed from' : 'WRONG: in'} group ${g}`);
  }
  if (a.group && !groups.includes(a.group)) {
    if (RESET) await cog.send(new AdminAddUserToGroupCommand({ UserPoolId: POOL, Username: user.Username, GroupName: a.group }));
    console.log(`  ${RESET ? 'added to' : 'MISSING:'} group ${a.group}`);
  }

  // Profile.
  const sub = user.Attributes.find((x) => x.Name === 'sub').Value;
  const profile = (await db.scan('Profile')).find((p) => p.owner === sub || (p.email ?? '').toLowerCase() === a.email);
  let profileId = profile?.id;
  if (!profile) {
    if (RESET) profileId = (await db.create('Profile', {
      owner: sub, email: a.email, displayName: a.name, role: a.role, status: a.status, timezone: 'America/Los_Angeles',
    })).id;
    console.log(`  ${RESET ? 'created' : 'MISSING:'} profile (${a.role}/${a.status})`);
  } else if (profile.owner !== sub || profile.role !== a.role || profile.status !== a.status) {
    if (RESET) await db.patch('Profile', profile.id, { owner: sub, role: a.role, status: a.status });
    console.log(`  ${RESET ? 'repaired' : 'WRONG:'} profile → ${a.role}/${a.status}`);
  } else {
    console.log(`  profile ok (${a.role}/${a.status})`);
  }

  // Membership in the current season, for the co-host only.
  if (profileId && current) {
    const mine = (await db.scan('Membership')).filter((m) => m.profileId === profileId);
    if (a.cohort && !mine.some((m) => m.seasonId === current.id)) {
      if (RESET) await db.create('Membership', { profileId, seasonId: current.id, kind: 'cohort' });
      console.log(`  ${RESET ? 'joined' : 'MISSING: membership in'} ${current.name}`);
    }
    if (!a.cohort && mine.length) {
      if (RESET) for (const m of mine) await db.remove('Membership', m.id);
      console.log(`  ${RESET ? 'removed' : 'WRONG:'} ${mine.length} membership(s)`);
    }
  }
}

if (printed.length) {
  console.log('\nNEW PASSWORDS — shown once, stored nowhere:');
  for (const [e, p] of printed) console.log(`  ${e.padEnd(22)} ${p}`);
}
