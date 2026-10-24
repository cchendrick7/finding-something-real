/**
 * Put the demo data back to its seeded shape.
 *
 * The demo is meant to be clicked through, and clicking through it changes it —
 * publishing the Calendly draft, flipping RSVPs, leaving test prayer requests
 * behind. That is fine, and this undoes it without re-running the seed (which
 * would duplicate every row).
 *
 *   node scripts/reset-demo.mjs
 */
import { PEOPLE, token, gql } from './seed.mjs';
import { refuseProduction } from './target.mjs';
refuseProduction('resetting the demo data');

const lead = await token(PEOPLE.find((p) => p.name === 'Curtis'));
const log = (m, r) => console.log(m.padEnd(46), r?.errors ? JSON.stringify(r.errors[0]?.message) : 'ok');

// 1. The Calendly booking must be a DRAFT again — half the security suite needs
//    an unpublished recording, and the title says so out loud.
const recs = (await gql(lead, `query { listRecordings { items { id title publishedAt } } }`))
  .data.listRecordings.items;
for (const r of recs.filter((x) => /UNPUBLISHED/i.test(x.title) && x.publishedAt)) {
  log(`unpublishing "${r.title.slice(0, 28)}"`,
    await gql(lead, `mutation { updateRecording(input: { id: "${r.id}", publishedAt: null }) { id } }`));
}
// Probe fixtures left by the suites and by production smoke checks.
for (const r of recs.filter((x) => /UNPUBLISHED probe|PROBE from suite|PROD CHECK|^QA /i.test(x.title))) {
  log(`deleting probe recording`,
    await gql(lead, `mutation { deleteRecording(input: { id: "${r.id}" }) { id } }`));
}

// 2. Profiles: Stranger stays pending, everyone else active and a member.
const profs = (await gql(lead, `query { listProfiles { items { id displayName role status timezone } } }`))
  .data.listProfiles.items;
const WANT = {
  Curtis: { role: 'admin',  status: 'active',  tz: 'America/Los_Angeles' },
  Lauren: { role: 'admin',  status: 'active',  tz: 'America/Los_Angeles' },
  Imani:  { role: 'member', status: 'active',  tz: 'America/Los_Angeles' },
  Priya:  { role: 'member', status: 'active',  tz: 'America/New_York' },
  Nadia:  { role: 'member', status: 'active',  tz: 'Europe/London' },
  Maya:   { role: 'member', status: 'active',  tz: 'America/Los_Angeles' },
  Stranger: { role: 'member', status: 'pending', tz: 'America/Los_Angeles' },
};
for (const p of profs) {
  const want = WANT[p.displayName];
  if (!want) continue;
  if (p.role === want.role && p.status === want.status && p.timezone === want.tz) continue;
  log(`resetting ${p.displayName}`, await gql(lead, `mutation {
    updateProfile(input: { id: "${p.id}", role: ${want.role}, status: ${want.status}, timezone: "${want.tz}" }) { id }
  }`));
}

// 3. Prayer requests left behind by tests.
const prayers = (await gql(lead, `query { listPrayerRequests { items { id body } } }`))
  .data.listPrayerRequests.items;
for (const pr of prayers.filter((x) => /UI-TEST|FORGED|probe|legit via lambda/i.test(x.body))) {
  log(`deleting test prayer`,
    await gql(lead, `mutation { deletePrayerRequest(input: { id: "${pr.id}" }) { id } }`));
}

console.log('\ndemo reset. run `node scripts/security-test.mjs` to confirm.');
