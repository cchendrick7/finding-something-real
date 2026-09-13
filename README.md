# Finding Something Real — app

Co-host mobile app and leadership admin portal. One Expo codebase, three targets
(iOS, Android, web), on AWS.

**Runs with no setup.** Without `amplify_outputs.json` it boots in demo mode
against in-memory fixtures, so anyone can clone and click through it:

```bash
npm install
npx expo start --web
```

---

## Architecture

| Piece | Service |
|---|---|
| Auth | Cognito user pool, groups `leadership` / `cohost` |
| API | AppSync (GraphQL) |
| Data | DynamoDB, 17 tables |
| Privacy rules | `member-api` Lambda |
| Infra | Amplify Gen 2 (CDK under the hood) |

Running cost at 21 users is roughly **$1–3/month** — DynamoDB on-demand, Lambda
inside the free tier, Cognito free under 50k MAU.

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

## Deploying

Needs AWS credentials with permission to deploy CDK stacks.

```bash
npx cdk bootstrap aws://<account>/us-west-2   # once per account+region
npx ampx sandbox --once                        # backend
node scripts/seed.mjs                          # users + a season of data
node scripts/security-test.mjs                 # MUST pass before trusting it

npx expo export --platform web                 # build
node scripts/host.mjs                          # deploy to Amplify Hosting
node scripts/ui-test.mjs                       # drive the real screens
```

`ampx sandbox` refuses to bootstrap non-interactively, which is why the `cdk
bootstrap` line is separate.

`host.mjs` zips `dist/` itself rather than reusing an artifact — an earlier
version read a leftover zip and cheerfully redeployed stale code while
reporting SUCCEED. It also installs Amplify's documented SPA rewrite at status
**200**, not `404-200`: the latter serves the right HTML with a 404 status, and
combined with Amplify's trailing-slash redirect every deep link resolved
`301 → 404`. Expo Router's group segments (`/(member)/home`) are exactly the
paths that go through that rule.

---

## Security

**54 adversarial tests against the live API**, signing in as real Cognito users
and trying to break the promises made to co-hosts at onboarding — plus **23 UI
checks** that drive the real screens in a real browser, because an API test
cannot see a button that writes correctly and reads back nothing:

```bash
node scripts/security-test.mjs   # 54 passed, 0 failed
node scripts/ui-test.mjs         # 23 passed, 0 failed
node scripts/reset-demo.mjs      # put the demo data back after clicking around
FSR_BASE=https://main.<appid>.amplifyapp.com node scripts/ui-test.mjs
```

They verify, among other things, that a co-host cannot read prayer requests,
cannot see who declined, cannot list the roster or peer emails, cannot reach a
draft recording, cannot see an alumni-only note, cannot forge attendance, and
cannot promote themselves to admin — and that a *pending* account gets nothing
at all.

Four rules that must never be relaxed:

- **No model writes on a member path.** See above. Five confirmed escalations
  came from relaxing this, including a pending account activating itself —
  the same defect as the worst Postgres bug, reached by a different route.
- **Prayer requests** are leadership-only, in both directions. There is no
  member-facing query and no owner rule. Don't add either.
- **Attendance is structural.** `Rsvp` holds the real yes/no and is private;
  `Attendee` exists only for a yes and is written solely by the Lambda. A
  decline has no record to leak.
- **Drafts are indistinguishable from nonexistent ids.** `getSession` returns
  `null` for both, so there's no existence oracle.

The demo is meant to be clicked through, and clicking through it changes the
data — publishing the Calendly draft, flipping RSVPs. Several attacks need an
unpublished recording, so the suite now **creates its own draft** if none
exists rather than dying on a missing fixture. `reset-demo.mjs` puts everything
back.

Run both suites after any change to `amplify/data/resource.ts` or the Lambda.
Full write-up of what was found and fixed: [docs/SECURITY-REVIEW.md](./docs/SECURITY-REVIEW.md).

---

## Layout

```
app/                     screens (expo-router)
  index.tsx              sign-in — Cognito email + password (SRP)
  (member)/              co-host app
  (admin)/               leadership portal
lib/
  theme.ts               brand tokens from FSR Branding.pdf
  data.ts                data layer — demo + AWS backends, one API
  amplify.ts             Amplify client wiring
  session.tsx            Cognito identity joined to the Profile model
  tz.ts                  time zones and the unsociable-hour rule
amplify/
  auth/resource.ts       Cognito
  data/resource.ts       models + authorization  ← read the design doc first
  functions/member-api/  THE PRIVACY BOUNDARY
scripts/
  seed.mjs               users + demo season
  security-test.mjs      54 adversarial API tests
  reset-demo.mjs         undo demo drift (re-drafts the Calendly booking, etc.)
  ui-test.mjs            23 browser checks against the live deployment
  host.mjs               build + deploy the web app to Amplify Hosting
```

---

## Known gaps

| Area | State |
|---|---|
| Auth email | Password only for now. OTP needs SES out of sandbox + a verified domain. Passwords are set by an admin; the app never creates an account. |
| Native SRP | Web sign-in is verified. iOS/Android need `@aws-amplify/react-native` and its crypto polyfills before SRP works there. |
| Push delivery | Model and registration built; needs APNs/FCM credentials. |
| Calendly webhook | Draft-recording flow works; inbound webhook needs a paid Calendly plan. |
| Scheduled reminders | 24h/1h logic in the schema; needs an EventBridge rule. |
| Codec Pro | Body text falls back to system stack pending the licence decision. |
| App icon | Needs a square mark legible at 60px — not in the brand PDF. |
| Load failures | Screens catch load errors so a dropped connection can't crash the app, but there is no error UI — a failed load renders empty rather than saying so. See `lib/loadError.ts`. |

The previous Postgres implementation is preserved under `supabase/` for
reference, including its 52-assertion SQL suite. It is not used at runtime.
