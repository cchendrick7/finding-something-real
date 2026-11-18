# Finding Something Real — app

The ministry's app: a public half anyone can open (the episode library, about,
an interest form) and an invitation-only half for each season's co-hosts, with a
leadership portal. One Expo codebase (SDK 57, Expo Router) for iOS, Android and
the web, on AWS Amplify Gen 2.

- iOS: on the App Store (build 17 approved; build 18 on TestFlight)
- Web: <https://main.d1jiok92baqhp9.amplifyapp.com>
- Android: not yet published — see docs/PLAY-STORE-PLAN.md

**Runs with no setup.** Without `amplify_outputs.json` it boots in demo mode
against in-memory fixtures:

```bash
npm install
npx expo start --web
```

---

## Where this code came from (read once)

Builds 2–18 were developed in a cloud workspace that was reset in October 2026,
and that work existed nowhere else. On 24 Oct it was **recovered and proven
against what is running**, not rewritten from memory:

- **App:** every one of the 51 app modules compiles to a web module
  byte-identical to the live site's; 153 app functions compile to Hermes
  bytecode identical to build 18's. Comments did not survive and were rewritten
  from the commit messages Expo keeps per build.
- **Backend handlers:** verbatim from the source maps inside the deployed Lambdas.
- **Backend definitions:** rebuilt, then checked — the generated schema is
  byte-identical to the deployed one and the synthesized templates match.

The commit messages from 0f0d793 onward give the detail. **Lost for good:** most
of the test suites written after 15 Sep (push, outbox, admin, auth, interest,
player, render, icon, safe-area) and `shots.mjs`. The suites that remain are the
15 Sep versions.

Keep this repository on GitHub. That is the whole lesson.

---

## Architecture

| Piece | Service |
|---|---|
| Auth | Cognito user pool, groups `leadership` / `cohost`; identity pool for guests |
| API | AppSync (GraphQL) |
| Data | DynamoDB, 21 models |
| Functions | `member-api` (co-hosts — THE PRIVACY BOUNDARY), `admin-api` (leadership actions), `push-api` (devices, preferences), `push-outbox` (sends what is due, every 5 min), `public-api` (the interest form), `youtube-sync` (every 2 h) |
| Push | Expo push service via `expo-notifications` |
| Web hosting | Amplify Hosting, deployed by `scripts/host.mjs` |

### The one thing to understand before changing anything

AppSync authorization is **identity-based only**. It cannot express "readable
when `publishedAt` is set" or "readable when `response` is yes". Those rules are
most of this product's privacy promises.

So: **co-hosts have no direct model access.** Every model is locked to
`allow.ownerDefinedIn(...)` plus `allow.group('leadership')`. Member-facing
reads go through custom queries backed by `amplify/functions/member-api`, which
applies the value-based filtering in trusted server code.

That Lambda is the privacy boundary. It replaces what 57 Postgres RLS policies
did in the previous design. Full reasoning in
[docs/AWS-AUTHZ-DESIGN.md](./docs/AWS-AUTHZ-DESIGN.md).

If you find yourself adding a `client.models.*` call on a co-host path, stop —
that's the mistake the whole design exists to prevent.

And more specifically, the rule that came out of the second security review:

> **On a member path, no model writes. Ever.**
>
> `allow.ownerDefinedIn('owner')` grants writes on *every* field of the row,
> including `role` and `status`. A pending account used that to activate
> itself. Owner rules here are `['read']`; member writes go through Lambda
> mutations whose arguments are an allow-list, and `profileId` / `owner` come
> from the verified caller, never the client.

---

## Two backends

| | outputs file | sandbox identifier |
|---|---|---|
| **production** — what the app ships with | `amplify_outputs.json` | `root` |
| **test** — every suite and the seed data | `test-backend/amplify_outputs.json` | `fsrtest` |

Scripts default to **test**. Production takes `FSR_TARGET=production`, typed on
purpose; `seed.mjs` and `reset-demo.mjs` refuse it outright. Production holds
real people only, plus two deliberate test sign-ins kept by
`scripts/ensure-test-accounts.mjs` (`testcohost@fsr.test`, `stranger@fsr.test`).

```bash
npx cdk bootstrap aws://<account>/us-west-2   # once per account+region

# test backend
npx ampx sandbox --once --identifier fsrtest --outputs-out-dir test-backend
node scripts/seed.mjs                          # seeded people + a season (test only)

# production — same code, once test is right
npx ampx sandbox --once --identifier root      # writes amplify_outputs.json
FSR_TARGET=production node scripts/invite-template.mjs   # a deploy resets the invite text
npx expo export --platform web && node scripts/host.mjs  # web app
```

**Production drift, on purpose (8 Nov 2026).** Production's push-api Lambda
runs the code in this repo (the push-preferences fix, commit ac8e6fb), put
there with `UpdateFunctionCode` from the asset tested on fsrtest — not by a
full deploy, so production's CloudFormation template still names the older
code. Lambda version 1 of that function is the code it replaced (rollback).
The next `ampx sandbox --identifier root` reconciles it, and also refreshes the
other five functions' bundled libraries, which have not been redeployed since
the source was recovered.

Leaders are added with
`FSR_TARGET=production node scripts/make-leader.mjs "<email>" "<name>"`, which
emails the invitation; nobody sees the temporary password.

---

## Native builds

```bash
eas build --profile production --platform ios       # App Store
eas build --profile production --platform android   # Play Store (.aab)
```

`ios/` and `android/` are gitignored — EAS runs prebuild itself. Bundle id
`com.findingsomethingreal.app` on both stores. `app.json` is build 18's exactly
(read back from the shipped app). Two details that are easy to lose:

- `lib/amplify.ts` imports `react-native-get-random-values` and
  `@aws-amplify/react-native` **before** anything from `aws-amplify` — SRP sign-in
  needs `crypto.getRandomValues()`, which React Native lacks.
- `assets/mkicon.py` regenerates every icon from `assets/fsr-emblem.png`.

A production bundle is Hermes bytecode, which stores any string containing a
non-ASCII character as UTF-16 — grep both encodings before believing a zero.

---

## Scripts

```
target.mjs               which backend a script talks to (test unless FSR_TARGET=production)
ddb.mjs                  direct table access for the production-side scripts
build-test-web.mjs       web build pointed at the test backend → dist-test/
seed.mjs                 seeded people + demo season (test only)
reset-demo.mjs           undo demo drift (test only)
make-leader.mjs          the one thing the app cannot do — see its header
ensure-test-accounts.mjs the two test sign-ins kept in production (--reset = new passwords)
invite-template.mjs      the role-neutral invitation email (re-run after an auth deploy)
repair-push-prefs.mjs    one-time repair for the listener-to-co-host bug
production-reset.mjs     one-time record: what was cleared from production, 3 Oct 2026
host.mjs                 deploy dist/ to Amplify Hosting
security-test.mjs, guest-test.mjs, deletion-test.mjs, ui-test.mjs,
feed-test.mjs, tz-test.mjs   15 Sep versions — older than the app; expect gaps
```
