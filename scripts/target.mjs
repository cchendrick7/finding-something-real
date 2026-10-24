/**
 * WHICH BACKEND A SCRIPT TALKS TO.
 *
 *   node scripts/security-test.mjs                         # the TEST backend
 *   FSR_TARGET=production node scripts/make-leader.mjs …   # production, on purpose
 *
 * WHY THIS EXISTS. Until October 2026 there was one backend, and every test
 * suite in this folder ran against it — signing in as seeded people called
 * Imani and Priya, submitting interest forms, registering fake push tokens,
 * creating and withdrawing sessions. That was the production backend. The
 * costs were concrete, not theoretical:
 *
 *   · guest-test's interest-form submissions landed in the real Inquiry
 *     table and lit up the card on Janell's Overview that says a woman is
 *     waiting on a reply.
 *   · the "demo" leadership logins became the real ones by accident — Lauren's
 *     actual iPhone was registered to lauren@fsr.test, whose password is in
 *     this repository.
 *   · production could not be cleaned, because cleaning it would break every
 *     suite, and re-running a suite would quietly re-create the test accounts.
 *
 * So there are two backends now, deployed from the same code:
 *
 *   production   amplify_outputs.json               (what the app ships with)
 *   test         test-backend/amplify_outputs.json  (`ampx sandbox --identifier fsrtest`)
 *
 * THE DEFAULT IS TEST, and that direction matters. A script run with no
 * thought should do no harm; reaching production takes a word typed on
 * purpose. The scripts whose whole job is production — make-leader,
 * invite-template, repair-push-prefs — set FSR_TARGET themselves and say so.
 *
 * `isProduction` compares pool ids rather than trusting the variable, so a
 * test-backend file that somehow came to point at production is caught too.
 */
import { readFileSync, existsSync } from 'node:fs';

const PROD_FILE = new URL('../amplify_outputs.json', import.meta.url);
const TEST_FILE = new URL('../test-backend/amplify_outputs.json', import.meta.url);

export const TARGET = process.env.FSR_TARGET === 'production' ? 'production' : 'test';

if (TARGET === 'test' && !existsSync(TEST_FILE)) {
  console.error(
    'test-backend/amplify_outputs.json is missing.\n'
    + 'Deploy the test backend first:\n'
    + '  npx ampx sandbox --once --identifier fsrtest --outputs-out-dir test-backend\n'
    + 'or, if you really mean production, set FSR_TARGET=production.',
  );
  process.exit(2);
}

export const outputs = JSON.parse(readFileSync(TARGET === 'production' ? PROD_FILE : TEST_FILE));
const productionPool = JSON.parse(readFileSync(PROD_FILE)).auth.user_pool_id;

/** True when this process is about to touch the backend real people use. */
export const isProduction = outputs.auth.user_pool_id === productionPool;

/**
 * The Amplify sandbox identifier each backend was deployed under. Deployed
 * resource names start `amplify-fsr-<identifier>-`, which is the only reliable
 * way to tell the two backends' Lambdas apart: their GraphQL endpoint is
 * resolved at runtime from SSM, so it is not in the function's configuration.
 *
 * production = "root" because it was first deployed from a container whose
 * user was root. If production is ever redeployed under another identifier,
 * that is a NEW backend, and this line changes along with amplify_outputs.json.
 */
export const BACKEND_ID = isProduction ? 'root' : 'fsrtest';

/** One line at the top of every run, so nobody has to wonder. */
export function announce(scriptName) {
  const where = isProduction ? 'PRODUCTION' : 'test backend';
  console.log(`[${scriptName}] → ${where} (${outputs.auth.user_pool_id})`);
}

/**
 * For scripts that create throwaway accounts or data. Production refuses.
 *
 * There is deliberately no override flag. A seeded account in production is
 * exactly how the "demo" logins ended up being people's real ones.
 */
export function refuseProduction(what) {
  if (!isProduction) return;
  console.error(
    `Refusing: ${what} would write test data into PRODUCTION `
    + `(${outputs.auth.user_pool_id}).\nRun it against the test backend — unset FSR_TARGET.`,
  );
  process.exit(3);
}

