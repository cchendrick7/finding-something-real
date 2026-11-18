/**
 * NOTIFICATION SWITCHES STAY WHERE PEOPLE PUT THEM.
 *
 *   node scripts/push-prefs-test.mjs        # test backend only
 *
 * Written for the report of 8 Nov 2026: people were getting notifications they
 * had turned off in the app. Two causes, both in what registration did to an
 * existing device row (amplify/functions/push-api):
 *
 *   1. registerListenerPushToken set wantsEpisodes: true on every call, and the
 *      app calls it on every launch, before the session loads — so "New
 *      episodes" switched itself back on each time a co-host opened the app.
 *   2. unregisterPushToken ("Stop notifications on this phone") deleted the
 *      row; the next launch re-registered the phone as new, with everything on.
 *
 * Each case replays what the app actually sends, in the order it sends it.
 * Needs the deployer's AWS credentials (Cognito admin sign-in, and DynamoDB to
 * remove the test rows afterwards).
 */
import { createHash, randomBytes } from 'node:crypto';
import { outputs, announce, refuseProduction } from './target.mjs';
import { PEOPLE, token as signIn, gql } from './seed.mjs';
import { tables } from './ddb.mjs';

refuseProduction('creating and changing test device rows');
announce('push-prefs-test');

const pass = [], fail = [];
const ok = (c, m) => (c ? pass : fail).push(m);

const imani = PEOPLE.find((p) => p.name === 'Imani');
const id = await signIn(imani);

const fresh = () => `ExponentPushToken[pptest${randomBytes(9).toString('hex')}]`;
const made = [];

const call = async (op, kind, args) => {
  const decl = Object.keys(args).map((k) => `$${k}: ${typeof args[k] === 'boolean' ? 'Boolean' : 'String'}${k === 'token' ? '!' : ''}`).join(', ');
  const use = Object.keys(args).map((k) => `${k}: $${k}`).join(', ');
  const r = await gql(id, `${kind} Q(${decl}) { ${op}(${use}) }`, args);
  if (r.errors?.length) throw new Error(`${op}: ${JSON.stringify(r.errors)}`);
  const v = r.data[op];
  return typeof v === 'string' ? JSON.parse(v) : v;
};
const asMember = (t) => call('registerPushToken', 'mutation', { token: t, platform: 'ios', deviceLabel: 'push-prefs-test' });
const asListener = (t) => call('registerListenerPushToken', 'mutation', { token: t, platform: 'ios' });
const setPrefs = (t, p) => call('setPushPrefs', 'mutation', { token: t, ...p });
const stop = (t) => call('unregisterPushToken', 'mutation', { token: t });
const prefs = (t) => call('myPushPrefs', 'query', { token: t });
const off = (p) => !p.wantsSessions && !p.wantsReminders && !p.wantsNotes && !p.wantsEpisodes;

/** What the app sends when it starts on a phone that already allows notifications. */
const launch = async (t) => { await asListener(t); await asMember(t); };

try {
  /* 1. A co-host turns "New episodes" and "Notes" off, then opens the app twice. */
  {
    const t = fresh(); made.push(t);
    await asMember(t);
    await setPrefs(t, { wantsEpisodes: false, wantsNotes: false });
    await launch(t);
    await launch(t);
    const p = await prefs(t);
    ok(p.wantsEpisodes === false, `co-host: "New episodes" stays off across launches (got ${p.wantsEpisodes})`);
    ok(p.wantsNotes === false, `co-host: "Notes" stays off across launches (got ${p.wantsNotes})`);
    ok(p.wantsSessions === true && p.wantsReminders === true, 'co-host: the switches she left on stay on');
    ok(p.linkedToAccount === true, 'co-host: device still linked to her account');
  }

  /* 2. "Stop notifications on this phone", then the app is opened again. */
  {
    const t = fresh(); made.push(t);
    await asMember(t);
    await stop(t);
    let p = await prefs(t);
    ok(p.registered && off(p), 'stop: row kept with every category off');
    await launch(t);
    p = await prefs(t);
    ok(off(p), `stop: still all off after the next launch (got ${JSON.stringify(p)})`);
    ok(p.linkedToAccount === true, 'stop: still linked to her account');
    // "Turn on notifications" — the new app switches on what the button offers.
    await asMember(t);
    p = await setPrefs(t, { wantsSessions: true, wantsReminders: true, wantsNotes: true, wantsEpisodes: true });
    ok(p.wantsSessions && p.wantsReminders && p.wantsNotes && p.wantsEpisodes, 'stop: turning back on works');
  }

  /* 3. A listener's new phone, and a listener who turns episodes off. */
  {
    const t = fresh(); made.push(t);
    let p = await asListener(t).then(() => prefs(t));
    ok(p.wantsEpisodes === true && !p.wantsSessions && !p.wantsReminders && !p.wantsNotes,
      'listener: a new phone gets episodes only');
    await setPrefs(t, { wantsEpisodes: false });
    await asListener(t);
    p = await prefs(t);
    ok(p.wantsEpisodes === false, 'listener: episodes stays off when the app registers again');
  }

  /* 4. Promotion still works: a listener's phone becomes a co-host's. */
  {
    const t = fresh(); made.push(t);
    await asListener(t);
    const r = await asMember(t);
    const p = await prefs(t);
    ok(r.promoted === true && p.wantsSessions && p.wantsReminders && p.wantsNotes,
      'promotion: listener → co-host turns the co-host categories on');
  }
} catch (e) {
  fail.push(`crashed: ${e.message}`);
} finally {
  const db = await tables(outputs);
  for (const t of made) await db.remove('PushToken', createHash('sha256').update(t).digest('hex')).catch(() => {});
}

for (const m of pass) console.log(`  PASS  ${m}`);
for (const m of fail) console.log(`  FAIL  ${m}`);
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
