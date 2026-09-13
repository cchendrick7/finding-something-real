# Porting the security model to Amplify Gen 2

## The core problem

Amplify Gen 2 authorization is **identity-based**: owner, group, authenticated,
or a Lambda that returns yes/no. Confirmed against the current docs — there is
no way to express a rule that depends on the **value of a field**.

Every one of these requirements is value-based:

| Requirement | Rule needed |
|---|---|
| Peers see attendance only for people who said **yes** | depends on `response` |
| Draft recordings invisible until **published** | depends on `publishedAt` |
| Notes visible only to the **targeted audience** | depends on `audience` |
| Unpublished episodes hidden | depends on `publishedAt` |
| Guests attached only to drafts stay hidden | depends on the parent's state |

Postgres RLS expresses all five in one line each. That's what the 57 policies
were. AppSync cannot express any of them declaratively.

Lambda authorizers don't rescue this either: an AppSync Lambda authorizer
returns `isAuthorized` and optionally `deniedFields`. It cannot return a row
filter. So it can gate a whole operation, not filter a result set.

## The design that does work

**Members never read models directly. They read through Lambda-backed queries.**

- Every model is locked to `allow.owner()` + `allow.group('leadership')`.
  Simple, identity-based, airtight — exactly what AppSync is good at.
- Member-facing reads go through a small set of custom queries backed by a
  Lambda that runs with elevated access and applies the value-based filtering in
  trusted server code.
- That Lambda becomes the single place the privacy rules live. It is the direct
  analogue of the RLS policy file, and it is testable the same way.

Roughly six queries cover the whole member app:

```
listSessions()        published only
getSession(id)        published only
listAttendees(id)     response === 'yes' only, names only
listNotes()           audience match for the caller
listEpisodes()        published only
myIntakeQuestions()   caller's own, linked to published recordings only
```

### Attendance gets a structural fix

Rather than filtering RSVPs on read, split them:

- **`Rsvp`** — owner + leadership only. Holds the actual yes/no and any note.
  Never readable by peers under any circumstance.
- **`Attendee`** — exists **only** when someone said yes. Readable by members.
  Written exclusively by the Lambda (`allow.resource(fn)`), never by clients, so
  attendance can't be forged.

Changing an answer to "no" deletes the `Attendee` row.

This is stronger than the Postgres version. There, a decline existed in a table
and a policy prevented reading it — one bad policy edit away from exposure.
Here, **a decline has no record to leak.** The guarantee is structural rather
than enforced.

### Drafts

`Recording` is leadership-only. Members reach published sessions solely through
`listSessions` / `getSession`, which filter on `publishedAt`. A draft is not
"hidden from" members; it is simply never returned by anything they can call.

Same shape for episodes and guests.

### Notes

Audience targeting moves into `listNotes`, which resolves the caller's cohort
and alumni membership and returns only matching notes. `recipientIds` for custom
sends is checked there too.

## What this costs

- **Six Lambda functions** (or one with a switch) plus their tests. At 21 users
  the invocation cost rounds to zero.
- **The 52-test SQL suite does not port.** It tested Postgres policies against a
  live database. The equivalent has to be rewritten as integration tests that
  call the API as different Cognito users and assert what comes back. That is
  the honest replacement, and I would want to write it before trusting any of
  this — it is what caught nine real vulnerabilities last time.
- **A day of work, not an hour.** The schema is quick; the resolvers and the new
  test suite are not.

## The recommendation I owe you

This works, it costs about $1–3/month, and it's idiomatic AWS. But it is worth
seeing plainly: we are reintroducing, in Lambda code, the filtering that Postgres
did declaratively — and starting the security guarantees over as unproven.

**RDS Postgres on AWS would keep all of it.** Same Cognito, same CDK, same
ownership, same AWS console. The schema, the 57 policies, and the 52 passing
tests port essentially unchanged, because the `set_config('request.jwt.claim.sub', …)`
pattern I built for local testing is exactly how a thin API hands identity to
Postgres. Cost is roughly $15–20/month on `db.t4g.micro` — inside the stated
budget.

The tradeoff is genuinely: **~$15/month, or a day of rebuilding plus starting
the security proofs from zero.**

I'll build whichever you want. Amplify is a legitimate choice and this document
is the plan for it. But given that the nine vulnerabilities found last time were
all in exactly this layer, I'd rather say it clearly once than discover it in
September.


---

## Postscript, 17 Aug 2026 — built, deployed, and attacked

The recommendation above (that RDS Postgres would preserve the 57 policies and
the 52 passing tests, for ~$15/month) still stands on its merits. Curtis chose
Amplify explicitly to keep the run rate near zero, and said he did not mind the
rework. So this is what actually happened.

**It was built and it works.** Live at a `*.amplifyapp.com` URL, running about
$1–3/month. 53 adversarial API tests and 23 browser checks pass against the
deployment.

**The prediction in "What this costs" was correct, and the reason matters.**
The section above says the security guarantees start over as unproven, and that
the nine Postgres vulnerabilities were all in exactly this layer. Re-running the
adversarial pass on the AWS build found **five more**, and the first of them was
*the same defect as the worst Postgres bug* — a pending account granting itself
full member access — arrived at by a completely different mechanism. Postgres
got there through a signup trigger; AppSync got there because
`allow.ownerDefinedIn('owner')` grants the owner writes on every field of the
row, `status` included.

That is the concrete case for adversarial testing over review-by-reading. Both
implementations were written carefully, by someone who knew about the other
bug, and both shipped the same hole.

**The rule that came out of it**, and the thing to hold onto if this is ever
ported again:

> On a member path, no model writes. Ever. Member writes go through a Lambda
> mutation whose arguments are an allow-list, and identity fields — `profileId`,
> `owner`, `role`, `status` — come from the verified caller, never the client.

Postgres expressed this with `with check` clauses. AppSync cannot express it at
all, which is why it has to live in the Lambda and be enforced by tests.

Details in [SECURITY-REVIEW.md](./SECURITY-REVIEW.md).
