/**
 * Time-zone conversion tests. Pure logic, no AWS, no browser:
 *   node scripts/tz-test.mjs
 *
 * These exist because a wall-clock -> UTC conversion that is one hour out
 * around a DST boundary is invisible in every normal test and lands on
 * exactly the overseas co-hosts the time-zone feature is for.
 */
function zoneOffsetMs(utcMs, tz) {
  const p = {};
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  for (const x of fmt.formatToParts(new Date(utcMs))) p[x.type] = x.value;
  const hour = p.hour === '24' ? '00' : p.hour;
  const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +hour, +p.minute, +p.second);
  return asIfUtc - utcMs;
}
function zonedToUtcIso(date, time, tz) {
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(naive)) throw new Error(`Bad date/time: ${date} ${time}`);
  const first = naive - zoneOffsetMs(naive, tz);
  return new Date(naive - zoneOffsetMs(first, tz)).toISOString();
}
function utcIsoToZonedFields(iso, tz) {
  const p = {};
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  for (const x of fmt.formatToParts(new Date(iso))) p[x.type] = x.value;
  const hour = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}` };
}

const pass = [], fail = [];
const ok = (c, m) => (c ? pass : fail).push(m);

// --- absolute correctness against known offsets ---
ok(zonedToUtcIso('2026-09-10', '18:00', 'America/Los_Angeles') === '2026-09-11T01:00:00.000Z',
   'PDT (UTC-7): 6pm Sep 10 -> 01:00Z Sep 11');
ok(zonedToUtcIso('2026-12-10', '18:00', 'America/Los_Angeles') === '2026-12-11T02:00:00.000Z',
   'PST (UTC-8): 6pm Dec 10 -> 02:00Z Dec 11');
ok(zonedToUtcIso('2026-09-10', '18:00', 'Europe/London') === '2026-09-10T17:00:00.000Z',
   'BST (UTC+1): 6pm -> 17:00Z');
ok(zonedToUtcIso('2026-01-10', '18:00', 'Europe/London') === '2026-01-10T18:00:00.000Z',
   'GMT (UTC+0): 6pm -> 18:00Z');
ok(zonedToUtcIso('2026-09-10', '18:00', 'Australia/Sydney') === '2026-09-10T08:00:00.000Z',
   'AEST (UTC+10): 6pm -> 08:00Z same day');

// --- the DST boundary, both directions, both hemispheres ---
// US spring forward 2026-03-08 02:00 PST -> 03:00 PDT
ok(zonedToUtcIso('2026-03-07', '18:00', 'America/Los_Angeles') === '2026-03-08T02:00:00.000Z',
   'day BEFORE US spring-forward is still PST');
ok(zonedToUtcIso('2026-03-08', '18:00', 'America/Los_Angeles') === '2026-03-09T01:00:00.000Z',
   'day OF US spring-forward is PDT');
// US fall back 2026-11-01
ok(zonedToUtcIso('2026-10-31', '18:00', 'America/Los_Angeles') === '2026-11-01T01:00:00.000Z',
   'day before US fall-back is PDT');
ok(zonedToUtcIso('2026-11-01', '18:00', 'America/Los_Angeles') === '2026-11-02T02:00:00.000Z',
   'day of US fall-back is PST');

// --- round trip across many zones and dates ---
let rt = 0, rtBad = [];
for (const tz of ['America/Los_Angeles', 'America/New_York', 'Europe/London',
                  'Europe/Amsterdam', 'Africa/Nairobi', 'Asia/Manila', 'Australia/Sydney']) {
  for (const date of ['2026-01-15', '2026-03-08', '2026-06-21', '2026-10-25', '2026-11-01', '2026-12-31']) {
    for (const time of ['00:30', '09:00', '18:00', '23:45']) {
      const back = utcIsoToZonedFields(zonedToUtcIso(date, time, tz), tz);
      rt++;
      if (back.date !== date || back.time !== time) rtBad.push(`${tz} ${date} ${time} -> ${back.date} ${back.time}`);
    }
  }
}
ok(rtBad.length === 0, `round trip holds for all ${rt} zone/date/time combinations`);
if (rtBad.length) rtBad.slice(0, 5).forEach((b) => console.log('   mismatch:', b));

console.log('\n============ TIME ZONE ============');
pass.forEach((m) => console.log('  PASS ', m));
fail.forEach((m) => console.log('  FAIL ', m));
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
