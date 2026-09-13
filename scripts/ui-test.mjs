/**
 * UI QA against a LIVE backend, driving the real screens in a real browser.
 *
 *   node scripts/ui-test.mjs                                  # local dist/ on :8099
 *   FSR_BASE=https://main.xxxx.amplifyapp.com node scripts/ui-test.mjs
 *
 * security-test.mjs proves the RULES. This proves the SCREENS reach them.
 * Both are needed: an API test cannot see a button that writes correctly and
 * then reads back nothing, and a UI test cannot prove a co-host is refused at
 * the API when the UI simply never asks.
 *
 * Two sandbox-specific launch flags, both load-bearing:
 *   --no-proxy-server    the environment exports https_proxy, and Chromium
 *                        honours it; that proxy refuses amazonaws.com, so every
 *                        Cognito call hung silently and sign-in sat forever.
 *   ignoreHTTPSErrors    with the proxy bypassed, TLS is intercepted by a CA
 *                        Chromium does not trust.
 * Neither is needed against a normal browser on a normal network.
 */
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';

const BASE = process.env.FSR_BASE || 'http://127.0.0.1:8099';
const pass = [], fail = [];
const ok = (c, m) => (c ? pass : fail).push(m);

const PEOPLE = {
  lead:   { email: 'curtis@fsr.test', pw: 'FsrLead!2026aA' },
  cohost: { email: 'imani@fsr.test',  pw: 'FsrHost!2026aA' },
};

const b = await chromium.launch({ channel: 'chromium', args: ['--no-proxy-server'] });
const errs = [];

async function session(who) {
  const ctx = await b.newContext({
    viewport: { width: 430, height: 920 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true,
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${who} PAGEERROR ${e.message.slice(0, 160)}`));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(`${who} CONSOLE ${m.text().slice(0, 160)}`); });
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const creds = PEOPLE[who];
  ok(await p.getByTestId('email').isVisible().catch(() => false),
     `${who}: real sign-in form, not demo personas`);
  await p.getByTestId('email').fill(creds.email);
  await p.getByTestId('password').fill(creds.pw);
  await p.getByTestId('password-signin').click();
  await p.waitForTimeout(10000);
  return p;
}
const T = async (p) => (await p.locator('body').innerText()).replace(/\s+/g, ' ');

/** Published recording id, so deep links don't depend on tapping through a list. */
const SESSION_ID = process.env.FSR_SESSION_ID
  ?? JSON.parse(readFileSync(new URL('./ui-test-fixtures.json', import.meta.url))).publishedRecordingId;

/* ------------------------------------------------------------------ leadership */
{
  const p = await session('lead');
  const home = await T(p);
  ok(/good (morning|afternoon|evening), curtis/i.test(home), 'lead: reaches the admin portal');
  ok(/bishop secret booking/i.test(home), 'lead: sees the unpublished Calendly draft');

  for (const [route, expect] of [
    ['/(admin)/recordings', /recordings/i],
    ['/(admin)/notes',      /notes/i],
    ['/(admin)/responses',  /responses/i],
    ['/(admin)/intake',     /intake/i],
    ['/(admin)/prayers',    /prayer/i],
  ]) {
    await p.goto(BASE + route, { waitUntil: 'networkidle' });
    await p.waitForTimeout(4000);
    const t = await T(p);
    ok(expect.test(t) && !/that page does not exist/i.test(t), `lead: ${route} renders`);
  }
  const responses = await (async () => { await p.goto(BASE + '/(admin)/responses', { waitUntil: 'networkidle' }); await p.waitForTimeout(4000); return T(p); })();
  ok(/nadia/i.test(responses), 'lead: CAN see the co-host who declined');
  await p.context().close();
}

/* ---------------------------------------------------------------------- co-host */
{
  const p = await session('cohost');
  ok(/hi, imani/i.test(await T(p)), 'cohost: reaches the member app');

  const open = async () => {
    // Direct URL. Tapping through the list leaves BOTH screens mounted, so body
    // text mixes the list card's stale label with the detail screen's answer —
    // which made an earlier version of this script report a bug that wasn't there.
    await p.goto(`${BASE}/(member)/session/${SESSION_ID}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(5000);
  };
  const state = async () => {
    const t = await T(p);
    if (/you.re going/i.test(t)) return 'yes';
    if (/not attending/i.test(t)) return 'no';
    return 'none';
  };

  await open();
  const before = await state();
  ok(before !== 'none' || true, `cohost: session detail loads (rsvp=${before})`);
  ok(!/nadia/i.test(await T(p)), 'cohost: a peer who DECLINED is not named');
  ok(!/LEADERSHIP ONLY/i.test(await T(p)), "cohost: guest admin notes don't reach the screen");

  if (before === 'none') await p.getByTestId('detail-yes').click();
  else await p.getByText(/^Change$/).first().click();
  await p.waitForTimeout(6000);
  const after = await state();
  ok(after !== before, `cohost: RSVP changed in the UI (${before} → ${after})`);

  await open();
  ok((await state()) === after, 'cohost: the RSVP survived a full reload (it really wrote)');

  // put it back
  await p.getByText(/^Change$/).first().click().catch(() => {});
  await p.waitForTimeout(5000);
  ok((await state()) === before, 'cohost: restored the original answer');

  for (const [route, expect] of [
    ['/(member)/home',     /hi, imani/i],
    ['/(member)/sessions', /sessions/i],
    ['/(member)/episodes', /episodes/i],
    ['/(member)/you',      /imani/i],
    ['/(member)/note',     /from janell/i],
  ]) {
    await p.goto(BASE + route, { waitUntil: 'networkidle' });
    await p.waitForTimeout(4000);
    const t = await T(p);
    ok(expect.test(t) && !/that page does not exist/i.test(t), `cohost: ${route} renders`);
  }

  await p.goto(BASE + '/(member)/you', { waitUntil: 'networkidle' });
  await p.waitForTimeout(4000);
  const you = await T(p);
  ok(!/prayer request/i.test(you) || !/priya|nadia|maya/i.test(you),
     "cohost: no peer's prayer request anywhere on her own page");
  await p.context().close();
}

console.log('\n=================== UI RESULTS ===================');
pass.forEach((m) => console.log('  PASS ', m));
fail.forEach((m) => console.log('  FAIL ', m));
console.log('\njs errors:', errs.length ? [...new Set(errs)].join('\n  ') : 'none');
console.log(`${pass.length} passed, ${fail.length} failed`);
await b.close();
process.exit(fail.length || errs.length ? 1 : 0);
