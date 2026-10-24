import {
  AmplifyClient, CreateAppCommand, ListAppsCommand, CreateBranchCommand,
  CreateDeploymentCommand, StartDeploymentCommand, GetJobCommand, UpdateAppCommand,
} from '@aws-sdk/client-amplify';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const c = new AmplifyClient({ region: 'us-west-2' });
const APP = 'finding-something-real';
const BRANCH = 'main';

/**
 * Amplify's documented SPA rewrite: any path with no real file extension is
 * rewritten to index.html with a **200**.
 *
 * `html` is in the pass-through list on purpose (build 10): public/player.html
 * is the page the in-app player loads. Without it this rule answers that URL
 * with the React app — status 200, so nothing looks wrong — and every episode
 * fails to play with no clue why.
 *
 * Not `404-200`. That variant serves the right HTML but with a 404 status, and
 * combined with Amplify's trailing-slash redirect a deep link ended up as
 * 301 → 404. Expo Router's group segments — /(member)/home — are exactly the
 * paths that go through this, so getting it wrong breaks every link that is
 * not the root.
 */
const SPA_RULES = [
  {
    source: '</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webmanifest|html)$)([^.]+$)/>',
    target: '/index.html',
    status: '200',
  },
];

/**
 * Zip dist/ HERE. An earlier version read a /tmp/site.zip that some previous
 * run had left behind, so it cheerfully redeployed a stale bundle and reported
 * SUCCEED — the deploy passed while shipping old code. Build the artifact you
 * are about to ship, every time.
 */
const ZIP = '/tmp/fsr-site.zip';
if (!existsSync('dist/index.html')) {
  throw new Error('dist/ is missing or empty — run `npx expo export --platform web` first');
}
execFileSync('rm', ['-f', ZIP]);
execFileSync('zip', ['-qr', ZIP, '.'], { cwd: 'dist' });
console.log('zipped dist ->', ZIP);

let app = (await c.send(new ListAppsCommand({}))).apps?.find((a) => a.name === APP);
if (!app) {
  app = (await c.send(new CreateAppCommand({
    name: APP,
    description: 'Finding Something Real — co-host app and admin portal',
    platform: 'WEB',
    customRules: SPA_RULES,
  }))).app;
  console.log('created app', app.appId);
} else {
  await c.send(new UpdateAppCommand({ appId: app.appId, customRules: SPA_RULES }));
  console.log('reusing app', app.appId);
}

try {
  await c.send(new CreateBranchCommand({ appId: app.appId, branchName: BRANCH, stage: 'PRODUCTION' }));
  console.log('created branch', BRANCH);
} catch (e) {
  if (e.name !== 'BadRequestException') throw e;
  console.log('branch exists');
}

const dep = await c.send(new CreateDeploymentCommand({ appId: app.appId, branchName: BRANCH }));
console.log('uploading bundle…');
const zip = readFileSync(ZIP);
const put = await fetch(dep.zipUploadUrl, {
  method: 'PUT',
  body: zip,
  headers: { 'Content-Type': 'application/zip' },
});
if (!put.ok) throw new Error(`upload failed ${put.status} ${await put.text()}`);

await c.send(new StartDeploymentCommand({
  appId: app.appId, branchName: BRANCH, jobId: dep.jobId,
}));

process.stdout.write('deploying');
let job;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  job = (await c.send(new GetJobCommand({
    appId: app.appId, branchName: BRANCH, jobId: dep.jobId,
  }))).job;
  const s = job.summary.status;
  if (['SUCCEED', 'FAILED', 'CANCELLED'].includes(s)) break;
  process.stdout.write('.');
}
console.log('\nstatus:', job.summary.status);
console.log('URL: https://' + BRANCH + '.' + app.appId + '.amplifyapp.com');
if (job.summary.status !== 'SUCCEED') {
  console.log(JSON.stringify(job.steps?.map((s) => ({ name: s.stepName, status: s.status })), null, 1));
}
