/**
 * A WEB BUILD THAT TALKS TO THE TEST BACKEND.
 *
 *   node scripts/build-test-web.mjs        # writes dist-test/
 *
 * The app reads its backend from amplify_outputs.json at build time
 * (lib/amplify.ts), and that file is production — it has to be, because it is
 * what the App Store build and the hosted web app ship with. The browser
 * suites (ui-test, safearea-test) sign in as seeded people who now exist only
 * in the test backend, so they need a build pointed there.
 *
 * This swaps the test config in, exports to dist-test/, and puts production
 * back — in a `finally`, and verified afterwards by comparing bytes, because
 * the failure this guards against is shipping a production web build that
 * silently talks to the test backend. dist/ is never touched.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';

const PROD = new URL('../amplify_outputs.json', import.meta.url);
const TEST = new URL('../test-backend/amplify_outputs.json', import.meta.url);
const SAVED = new URL('../.amplify_outputs.production.bak', import.meta.url);

if (!existsSync(TEST)) {
  console.error('test-backend/amplify_outputs.json is missing — deploy the test backend first.');
  process.exit(2);
}

const original = readFileSync(PROD);
copyFileSync(PROD, SAVED);
try {
  writeFileSync(PROD, readFileSync(TEST));
  console.log('building against the TEST backend → dist-test/');
  execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-test'], {
    stdio: ['ignore', 'ignore', 'inherit'],
    cwd: new URL('..', import.meta.url).pathname,
  });
} finally {
  writeFileSync(PROD, original);
}

if (!readFileSync(PROD).equals(original)) {
  console.error('PRODUCTION amplify_outputs.json WAS NOT RESTORED. Restore it from .amplify_outputs.production.bak before building anything.');
  process.exit(1);
}
console.log('production amplify_outputs.json restored and verified byte-for-byte.');

