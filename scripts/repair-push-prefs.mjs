/**
 * ONE-TIME REPAIR: co-host devices left on listener preferences.
 *
 *   node scripts/repair-push-prefs.mjs          # report only
 *   node scripts/repair-push-prefs.mjs --fix    # write
 *
 * WHY THIS EXISTS. registerPushToken used to patch only profileId, platform
 * and deviceLabel. A device that had registered as a LISTENER first —
 * through the "Notify me about new episodes" card on the Listen screen, which
 * is the app's landing tab — carried `wantsSessions/Reminders/Notes: false`,
 * correctly, because a listener has none of those. Signing in re-pointed the
 * device at her profile and left those three flags alone.
 *
 * The result was silent and total: notifications visibly on, device correctly
 * linked to her account, and no invitations, no reminders, no notes — including
 * the cancellation and reschedule notices the whole outbox exists to send.
 *
 * The handler fix only helps on PROMOTION, and a device already in this state
 * is never promoted again — every later launch sees a profileId and leaves the
 * flags alone, forever. So the rows already broken had to be repaired by hand.
 * They were, on 27 Sep 2026: Curtis's iPhone 16 Pro and Lauren's iPhone 15,
 * both of which had been re-registering daily and receiving nothing.
 *
 * WHAT IT WILL NOT TOUCH. Only the exact signature the bug leaves — attached
 * to a profile, not retired, and all three co-host categories off. A co-host
 * who switched ONE of them off made a choice, and a repair script that
 * overrules choices is worse than the fault it fixes. It reports without
 * writing unless given --fix.
 *
 * Kept rather than deleted: if a device surfaces later from an old install
 * that has not launched since, this is what to run.
 */
/*
 * Reads and writes the tables directly (scripts/ddb.mjs) rather than signing
 * in as the seeded curtis@fsr.test, which no longer exists in production.
 */
if (!process.env.FSR_TARGET) {
  console.error('Set FSR_TARGET=production (or =test).');
  process.exit(2);
}
const { outputs, announce } = await import('./target.mjs');
const { tables } = await import('./ddb.mjs');
announce('repair-push-prefs');
const db = await tables(outputs);

const WRITE = process.argv.includes('--fix');

const profiles = await db.scan('Profile');
const named = (id) => profiles.find((p) => p.id === id)?.displayName ?? '(no account)';
const rows = await db.scan('PushToken');

const affected = rows.filter((t) => t.profileId && !t.retiredAt
  && t.wantsSessions === false && t.wantsReminders === false && t.wantsNotes === false);

console.log(`${rows.length} device rows, ${affected.length} matching the bug's signature\n`);

if (affected.length === 0) {
  console.log('Nothing to repair.');
  process.exit(0);
}

for (const t of affected) {
  const who = `${named(t.profileId).padEnd(9)} ${String(t.deviceLabel ?? '').slice(0, 26).padEnd(26)}`;
  if (!WRITE) {
    console.log(`  WOULD FIX  ${who} last seen ${(t.lastSeenAt ?? '').slice(0, 10)}`);
    continue;
  }
  await db.patch('PushToken', t.id, { wantsSessions: true, wantsReminders: true, wantsNotes: true });
  console.log(`  FIXED      ${who}`);
}

if (!WRITE) console.log('\nReport only. Re-run with --fix to write.');

