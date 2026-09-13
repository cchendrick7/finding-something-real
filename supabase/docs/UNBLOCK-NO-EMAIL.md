# Getting in when email isn't working

You're rate-limited (Supabase's built-in sender allows 2 messages/hour) and you
can't set up a proper sender yet because domain verification needs someone
else's DNS access. Three ways through, best first.

---

## Option 1 — Skip email entirely (5 minutes) ← do this

You don't actually need to *receive* anything to have an account. Create the
user directly in the dashboard with a password, then sign in with it. **Zero
emails sent.**

### 1. Create your account in Supabase

**Authentication** → **Users** → **Add user** → **Create new user**

- Email: `cchendrick7@gmail.com`
- Password: pick something and save it
- ✅ **Check "Auto Confirm User"** — this is the important box. It marks the
  address confirmed without sending anything.

Click Create.

### 2. Make yourself admin and seed the season

One block in the SQL Editor. Substitute your email if different:

```sql
-- Promote yourself. The signup trigger created you as 'pending' by design.
update profiles
   set role = 'admin', status = 'active', display_name = 'Curtis'
 where email = 'cchendrick7@gmail.com';

-- The current season.
insert into seasons (name, is_current, starts_at, ends_at)
values ('Fall 2026', true, '2026-08-23', '2027-05-31')
on conflict do nothing;

-- Give yourself a membership too, so you also pass the co-host checks.
insert into memberships (profile_id, season_id, kind)
select p.id, s.id, 'cohort'
  from profiles p, seasons s
 where p.email = 'cchendrick7@gmail.com' and s.is_current
on conflict do nothing;

-- Confirm it worked.
select display_name, role, status from profiles
 where email = 'cchendrick7@gmail.com';
```

Expect one row: `Curtis | admin | active`.

### 3. Sign in

Start the app, and on the sign-in screen tap **"Use a password instead"** below
the button. Enter your email and the password you just set.

> **Why this exists.** Co-hosts stay passwordless — that's the whole point of the
> auth design and it's what Janell liked. But email can fail: rate limits,
> unverified domains, provider outages. An admin locked out of the portal because
> an SMTP quota ran out is a bad afternoon during a live cohort. Passwords are set
> by an admin in the dashboard and never created inside the app, so no co-host is
> ever asked to invent one.

You can now build out the whole season, test every screen, and hand Lauren
something real — all before anyone touches DNS.

---

## Option 2 — Gmail SMTP as a bridge (10 minutes)

If you want working email *today* without waiting for the domain owner, point
Supabase at your own Gmail. Any custom SMTP unlocks template editing, so this
also gets you the branded code emails.

1. Your Google account needs 2-Step Verification on.
2. Create an **App Password**: Google Account → Security → 2-Step Verification →
   App passwords. You'll get a 16-character string.
3. Supabase → **Authentication** → **Emails** → **SMTP Settings**:

   | Field | Value |
   |---|---|
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | your full Gmail address |
   | Password | the 16-character app password |
   | Sender email | your Gmail address |
   | Sender name | `Finding Something Real` |

4. Template editing is now unlocked — paste in the two files from
   `docs/email-templates/`.

**Honest limits.** Emails come from your personal Gmail rather than an FSR
address, which is fine for testing and a little odd for a cohort. Google caps
around 500/day, which is plenty. Deliverability is decent but not as good as a
proper transactional provider.

Treat this as a bridge. Move to Resend on `findingsomethingreal.com` once you can
reach the domain owner — the switch is just changing these same five fields.

---

## Option 3 — Wait

The built-in limit is 2 messages per hour and it rolls. If you only need one more
code, waiting an hour costs nothing. Not a plan for the cohort, obviously.

---

## What to ask the domain owner

When you reach them, this is the whole request:

> To send sign-in emails from an FSR address, I need to add three DNS records to
> `findingsomethingreal.com` — an SPF record, a DKIM record, and a return-path
> subdomain. They only affect email authentication and won't touch the website.
> Can you give me access to the DNS settings, or add the records I send you?

Whoever hosts the site — Squarespace, Wix, GoDaddy, Cloudflare — will have a DNS
panel. Resend generates the exact records once you add the domain, so you can
send them a copy-paste list.
