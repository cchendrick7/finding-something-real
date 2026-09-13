# Adversarial security review — 14 Aug 2026

An independent reviewer was given the schema and a live Postgres instance and
asked to break it. Not to review it — to break it, with working SQL. Nine
vulnerabilities were confirmed by demonstration. All are fixed in
`20260814000400_security_fixes.sql` and covered by regression tests.

## Confirmed and fixed

**1. Any signup granted full co-host access.** `is_active_member()` tested only
`profiles.status='active'`, and the signup trigger created an active profile for
every new `auth.users` row regardless of invite. So anyone who could create an
account could read the full roster, every published session including join URLs,
attendee lists, notes and guests. The same defect meant removing someone's
membership revoked nothing. *Fixed:* membership is now required, and profiles
start `pending` until an invite is redeemed.

**2. Invite redemption on unverified email.** Knowing an invitee's email address
was enough to claim their cohort seat and burn the real invite. *Fixed:*
activation happens only through invite redemption, and the profile stays pending
otherwise. In practice passwordless OTP also means an attacker must control the
mailbox.

**3. Draft-event guest lists leaked.** `ersvp_peer_yes` omitted the published
check that the recording equivalent had, so an unpublished event was hidden but
its attendee list and free-text notes were not.

**4. Unpublished episodes were world-readable** to anyone logged in — including
deactivated accounts — because the policy was `using (true)`.

**5. Nothing could be deleted.** DELETE was granted at table level on
`prayer_requests`, `receipts` and `event_rsvps` but no DELETE policy existed, so
it silently affected zero rows for everyone including admins. A co-host could not
retract a prayer request and leadership could not honour a deletion request —
which also breaks the account-deletion path both app stores require.

**6. Guests attached only to drafts were visible,** leaking bookings the draft
was meant to keep quiet.

**7. `question_links` leaked draft recording UUIDs** through a co-host's own
intake question.

**8. `grant insert on profiles` covered `role` and `status`.** Only the absence
of an INSERT policy prevented self-escalation to admin. The grant was
unnecessary — the signup trigger is SECURITY DEFINER. *Fixed:* revoked.

**9. `display_name` defaulted to the email local-part,** and display names are
peer-readable, so it leaked part of every co-host's address to the roster.

## Attacks attempted and correctly blocked

Worth recording, because these are the ones people usually get wrong. Column-grant
bypass on `guests.admin_notes` and `profiles.email` via `to_jsonb(g)`,
`row_to_json(g)`, bare whole-row references, `g.*`, `count(col)`, `ORDER BY col`,
`WHERE col`, and `ctid` projection. `UPDATE … RETURNING`. Upsert with an arbiter
on `email`. Email-existence oracle via unique violation. `MERGE` content oracles.
Error-based qual-reordering oracles. `is_admin()` subversion via a shadowing
`pg_temp.profiles` and via session `search_path`. Data-modifying CTEs,
`query_to_xml`, cursors, `FOR UPDATE`. Cross-user writes to twelve tables.
Calling `set_member_role()` and `handle_new_user()` directly. The full `anon`
surface.

## Standing rules

- Prayer requests have **no peer-read policy**. Do not add one.
- RSVPs are peer-visible **only** when `response='yes'`. Declines stay private —
  if saying no is public, co-hosts stop answering, which is the original problem.
- `admin` is a row value, not a database role. Both co-hosts and leadership
  connect as `authenticated`; RLS is the only thing separating them.

---

# Adversarial review, round two — the AWS build, 17 Aug 2026

The Postgres findings above are history: that implementation is retired under
`supabase/`. This round attacked the Amplify/AppSync build, live, as real
Cognito users. Five were confirmed by demonstration and are fixed. All five had
the same root cause, and it is worth naming: **`allow.ownerDefinedIn('owner')`
grants the owner writes on every field of the row, including the ones that
decide what they are allowed to do.**

CDK says so out loud, and it took a while to hear it:

> WARNING: owners may reassign ownership for the following model(s) and
> role(s): Profile: [owner], Rsvp: [owner], Receipt: [owner].

## Confirmed and fixed

**1. A pending account could activate itself.** `Profile` allowed the owner to
`update`. A pending account owns its own Profile row, so:

```graphql
mutation { updateProfile(input: { id: "<own id>", status: active }) { status } }
```

…and the next `listSessions` returned the season. This is *the same bug as
Postgres finding #1*, arrived at by a completely different route — which is the
argument for re-running the adversarial pass after a rewrite rather than
trusting that the fix carried over. *Fixed:* the owner rule on `Profile` is now
`['read']`. Name and time zone go through `updateMyProfile` on the Lambda,
which accepts those two fields and nothing else.

**2. A co-host could promote herself to admin.** Same rule, `role: admin`.
AppSync still gated the models on the Cognito `leadership` group, so this did
not by itself hand over the data — but it flipped the app into the leadership
portal, which is not a distinction worth relying on. *Fixed with #1.*

**3. A co-host could write records under a peer's name.** `Rsvp`, `Question`,
`PrayerRequest` and `Receipt` all allowed owner `create`, and `profileId` was a
client-supplied field. So a co-host could file a prayer request as Priya, RSVP
"no" on her behalf, or fabricate read receipts that leadership reads as
engagement. Nothing marked the row as forged; `owner` was the attacker and
`profileId` was the victim, and no screen shows `owner`. *Fixed:* every one of
those is `['read']` now, and the matching Lambda mutations (`submitRsvp`,
`submitQuestion`, `submitPrayerRequest`, `markRead`) set `profileId` from the
verified caller.

**4. Direct RSVP writes could desynchronise attendance.** `Rsvp` holds the real
answer and `Attendee` exists only for a yes — the asymmetry that makes a
decline unleakable (spec §5.3). A client that can write `Rsvp` directly can
break that pairing. *Fixed with #3: `submitRsvp` is the only writer.*

**5. `listPrayerRequests` returned rows to a co-host.** Only her own, so not a
leak of anyone else's — but co-hosts were told the FSR team is the only
audience, and the tightest reading is that the model is not addressable from a
member session in any direction. *Fixed:* `PrayerRequest` is leadership-only,
with no owner rule at all.

## The test that was asserting nothing

The previous suite contained:

```js
updateProfile(input: { id: "x", role: admin })
```

It passed. It passed because there is no row with id `"x"` — not because
authorization refused. Every attack in this round is now in
`scripts/security-test.mjs` **using real row ids**, which is the only version
that means anything. That is the second false-passing test found in this
project; both looked green and proved nothing.

## The standing rule this produces

> On a member path, no model writes. Ever.
>
> If a co-host needs to change something, it goes through a Lambda mutation
> whose arguments are an allow-list. The client never supplies `profileId`,
> `owner`, `role`, or `status` — those come from the verified caller.

Current state: **53 API attacks and 23 UI checks, all passing** against the live
deployment.
