/**
 * Exercises the YouTube feed parser against the LIVE channel feed.
 *
 *   node scripts/feed-test.mjs
 *
 * No AWS credentials needed. It transpiles the real parse.ts rather than
 * keeping a second copy of the logic, so a change to the Lambda's parser is a
 * change to what this tests.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHANNEL_ID = 'UCbsn5KFfTCfyLztOJIA-a7w';
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

const dir = mkdtempSync(join(tmpdir(), 'fsr-feed-'));
const js = join(dir, 'parse.mjs');
execFileSync('npx', ['esbuild', 'amplify/functions/youtube-sync/parse.ts',
  '--format=esm', '--platform=node', `--outfile=${js}`], { stdio: 'pipe' });
const { parseFeed } = await import(js);

const pass = [], fail = [];
const ok = (c, m) => (c ? pass : fail).push(m);

const res = await fetch(FEED, { headers: { 'user-agent': 'fsr-app/1.0' } });
ok(res.ok, `channel feed reachable (${res.status})`);
const xml = await res.text();
const rows = parseFeed(xml);

ok(rows.length > 0, `feed parses to ${rows.length} entries`);
ok(rows.every((r) => r.videoId && r.title && r.url && r.publishedAt),
   'every row has an id, title, url and date');
ok(rows.every((r) => /^https:\/\/www\.youtube\.com\/watch\?v=/.test(r.url)),
   'every url is a real watch link');
ok(rows.every((r) => !/#shorts/i.test(r.title)), 'the #shorts tag is stripped from titles');
ok(rows.every((r) => !!r.thumbnailUrl), 'every row has a thumbnail');
ok(rows.some((r) => r.kind === 'episode'), 'full episodes are identified');
ok(new Set(rows.map((r) => r.videoId)).size === rows.length, 'no duplicate video ids');
ok(rows.every((r) => !Number.isNaN(Date.parse(r.publishedAt))), 'every date parses');

// Dates must come from inside each entry. Pairing titles and dates by index
// across the whole document looks right and attaches the wrong date to every
// row — that bug was live in an earlier throwaway version of this parser.
const byId = Object.fromEntries(rows.map((r) => [r.videoId, r.publishedAt]));
const firstId = (xml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) ?? [])[1];
const firstBlock = xml.split('<entry>')[1] ?? '';
const firstPublished = (firstBlock.match(/<published>([^<]+)<\/published>/) ?? [])[1];
ok(firstId && byId[firstId] === firstPublished,
   "the first entry's date matches the date inside its own block");

// Anything more than a day in the future means we misread the field.
const future = rows.filter((r) => Date.parse(r.publishedAt) > Date.now() + 864e5);
ok(future.length === 0, 'no entry is dated in the future');

console.log('\n=============== YOUTUBE FEED ===============');
pass.forEach((m) => console.log('  PASS ', m));
fail.forEach((m) => console.log('  FAIL ', m));
const eps = rows.filter((r) => r.kind === 'episode');
console.log(`\n${eps.length} episodes, ${rows.length - eps.length} shorts. Most recent:`);
rows.slice(0, 3).forEach((r) => console.log(`  ${r.publishedAt.slice(0, 10)}  ${r.title.slice(0, 58)}`));
console.log(`\n${pass.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
