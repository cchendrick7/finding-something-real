# Supabase setup — step by step

Written for someone who has never used Supabase. Roughly 25 minutes.

**What Supabase actually is,** in one line: hosted Postgres with authentication,
file storage, and an auto-generated REST API bolted on. If you know Postgres, you
know 90% of it. There's no proprietary query language and no lock-in — it's a
real Postgres database you can `pg_dump` and move to RDS whenever you want.

You will not need to write any code. You'll paste four SQL files, copy two
values into a text file, and run a couple of commands.

---

## Part 1 — Create the project (5 min)

1. Go to **supabase.com** → **Start your project** → sign in with GitHub.
2. Click **New project**.
3. Fill in:
   - **Name:** `finding-something-real`
   - **Database Password:** click Generate, then **save it in your password
     manager.** You will not be shown it again. You won't need it for this app
     (the app connects with an API key), but you'll want it if you ever connect
     with `psql`.
   - **Region:** `West US (North California)` or `West US (Oregon)` — closest to
     most of the cohort. This affects latency slightly and nothing else.
   - **Plan:** Free.
4. Click **Create new project** and wait ~2 minutes while it provisions.

You get two free projects per organization. This uses one.

---

## Part 2 — Apply the schema (5 min)

In the left sidebar, click the **SQL Editor** icon (looks like a terminal
prompt). You'll paste four files, **in this exact order**. Order matters — later
files modify what earlier ones create.

For each file: open it from the `supabase/migrations/` folder in the project I
sent you, copy the entire contents, paste into the editor, click **Run**
(or Cmd/Ctrl+Enter). Then click **New query** and do the next one.

| # | File | What it does |
|---|---|---|
| 1 | `20260814000100_init.sql` | Tables, types, triggers |
| 2 | `20260814000200_rls.sql` | Row-level security policies |
| 3 | `20260814000300_grants.sql` | Privilege model |
| 4 | `20260814000400_security_fixes.sql` | Hardening from the security review |

**Expected result each time:** "Success. No rows returned." That's what success
looks like for DDL — it's not an error.

**One harmless warning** you'll see on file 4:

```
NOTICE: constraint "receipts_target_type_ck" of relation "receipts"
        does not exist, skipping
```

That's a `drop constraint if exists` doing its job on a fresh database. Ignore it.

**To confirm it worked,** run this in a new query. It must be a *single*
statement — the SQL Editor only displays the result of the last statement you
run, so two `select`s means you only ever see the second one:

```sql
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE') as tables,
  (select count(*) from pg_policies where schemaname='public') as policies,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_on;
```

Expected: **tables 18, policies 57, rls_on 18.**

If `policies` is 0, file 2 didn't run. If `rls_on` is less than 18, something is
unprotected — re-run file 2.

> **"I already turned on RLS myself"** — no problem. The migrations run
> `alter table ... enable row level security` on all 18 tables anyway, and
> enabling it twice is a no-op. Enabling RLS without policies simply denies
> everything; the policies are what grant access back. If `rls_on` is 18, you're
> in the right state however you got there.

---

## Part 3 — Connect the app (3 min)

You need two values, and **they now live on two different pages.**

**The publishable key:** Settings (gear icon) → **API Keys**. Starts with
`sb_publishable_`. *(An older project may show a legacy **anon** key starting
with `eyJ` instead — that works too.)*

**The Project URL:** not on that page. Try Settings → **Data API**, or
Settings → **API**. Supabase has been moving this around.

**If you can't find it, derive it — this always works.** Look at your browser's
address bar while you're in the dashboard:

```
https://supabase.com/dashboard/project/abcdefghijklmnop/...
                                       ^^^^^^^^^^^^^^^^
                                       this is your project ref
```

Your Project URL is that ref with `.supabase.co` on the end:

```
https://abcdefghijklmnop.supabase.co
```

That's all the Project URL has ever been. No menu required.

### Now write them into `.env`

**The file does not exist yet — you create it.** The repo ships `.env.example`
as a template; nothing reads that file. Also, `.env` begins with a dot, which
makes it invisible in macOS Finder and Windows Explorer by default — so even
once it exists you may not see it. Use the terminal and both problems go away.

From inside the project folder, paste this as one block, substituting your two
values:

```bash
cat > .env <<'EOF'
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOURKEY
EOF
```

If your dashboard gave you a legacy `anon` key instead, use this line in place of
the publishable one — the app accepts either:

```
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

Confirm it exists and reads back correctly:

```bash
ls -la .env && cat .env
```

Plain `ls` will not show it — you need `-a`. In Finder, **Cmd+Shift+.** toggles
hidden files. VS Code shows them by default.

> **On key safety.** This key ships inside the app bundle on every phone. That is
> fine and by design — it's meant to be public. Row-level security is what
> protects the data, which is why so much of my effort went there. **Never** put
> the *secret* / `service_role` key in this file; it bypasses every policy.

### Start it

```bash
npm install
npx expo start --web
```

The sign-in screen should now ask for an **email** instead of offering demo
personas. That's how you know it picked up the config.

---

## Part 4 — Make yourself an admin (5 min)

New accounts are created **pending** on purpose — that was one of the security
fixes. Nobody becomes a member just by signing up. So you need to bootstrap
yourself.

### About the email template — read this before you try

You'll find that Supabase won't let you edit the auth email templates. That is
not a misconfiguration. **Supabase changed this on 3 June 2026:** new free-tier
projects using Supabase's built-in email sender can no longer customise auth
templates at all. It was an anti-phishing measure — people were using free
projects to send convincing fake emails. Existing projects kept their templates;
new ones are locked to the defaults.

The default template sends a **clickable magic link**, not the 6-digit code this
app asks for. To change that you must connect your own SMTP provider, which also
unlocks template editing.

**You are not blocked today.** Three paths — and if you're rate-limited or can't
reach the domain owner, see **[UNBLOCK-NO-EMAIL.md](./UNBLOCK-NO-EMAIL.md)**,
which skips email entirely by creating your account in the dashboard with a
password. That's the fastest route and needs nobody else.

The other two:

#### Path A — keep going right now (0 minutes)

Leave the default template alone and use the link. In the app's code box,
**paste the entire link from the email** — it extracts the token. Everything else
works normally. This is fine for your own testing and for getting the rest of the
setup finished tonight.

#### Path B — connect Resend (15 minutes, needed before the cohort)

You need this regardless. Supabase's built-in sender is rate-limited to a couple
of emails per hour, so the moment twelve people try to sign in at the retreat,
most get nothing. Doing it now just also happens to unlock branded templates.

1. Sign up at **resend.com**. Free plan: 100 emails/day, 3,000/month, 1 verified
   domain — far more than 21 people need.
2. **Add and verify `findingsomethingreal.com`.** Resend gives you DNS records
   (SPF, DKIM, and a return-path) to add at whoever hosts the domain's DNS.
   Verification usually completes within minutes.
   > **This is the dependency to check first.** If Janell or a web designer
   > controls FSR's DNS, you'll need them for this step. Worth asking before you
   > start rather than halfway through.
3. Create an **API key** in Resend.
4. In Supabase: **Authentication** → **Emails** → **SMTP Settings** → enable
   custom SMTP:

   | Field | Value |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | your Resend API key |
   | Sender email | `hello@findingsomethingreal.com` |
   | Sender name | `Finding Something Real` |

5. Template editing is now unlocked. Paste in
   `docs/email-templates/magic-link.html` and
   `docs/email-templates/confirm-signup.html`.

**Do both templates.** A first-time user hits **Confirm signup**, not Magic Link.
Fix only one and every new co-host still gets a link — which you would discover
at the retreat, in front of everyone.

The `{{ .Token }}` variable is the part that matters; it's what makes Supabase
send a code instead of a link. Both files are written in FSR's voice and colours,
because this email is the first thing a co-host ever receives from the ministry
and the Supabase default is generic boilerplate.

### Then sign in

**Sign in through the app once** with your real email. Enter the code. You'll
land in a fairly empty app — that's expected, you're still pending.

**Then, back in the SQL Editor:**

```sql
update profiles
   set role = 'admin', status = 'active'
 where email = 'cchendrick7@gmail.com';
```

Create the season:

```sql
insert into seasons (name, is_current, starts_at)
values ('Fall 2026', true, '2026-08-23');
```

Refresh the app. You should now land in the **admin portal**.

---

## Part 5 — Invite a co-host (2 min)

This is the flow Lauren will eventually use from the portal, but here's the SQL
so you can test it end to end:

```sql
insert into invites (email, season_id, code)
select 'someone@example.com', id, encode(gen_random_bytes(6), 'hex')
  from seasons where is_current;
```

When that person signs in with that exact email, the trigger automatically
activates their profile and adds them to the cohort. Nothing else needed.

To watch it work:

```sql
select p.display_name, p.email, p.status, m.kind
  from profiles p
  left join memberships m on m.profile_id = p.id;
```

---

## Part 6 — Email, revisited

If you took Path A in Part 4, this is the step you still owe. See **Path B**
above — connect Resend, then paste in the two templates.

Two reasons it is not optional:

1. **Rate limits.** Supabase's built-in sender allows only a couple of messages
   per hour. Twelve people signing in at the retreat will not work.
2. **Codes instead of links.** Magic links need deep-link configuration to work
   inside a native iOS/Android app. Codes work everywhere with no setup.

## Part 7 — Put it on the internet (5 min)

```bash
npx expo export --platform web
```

That writes a `dist/` folder. Then either:

**Netlify (easiest):** go to app.netlify.com/drop and drag the `dist` folder onto
the page. You get a URL in about thirty seconds.

**Vercel:** `npx vercel deploy dist --prod`

**One required setting.** The app does client-side routing, so the host must
serve `index.html` for any path it doesn't recognise. Otherwise the home page
works and every deep link 404s. For Netlify, add a file `dist/_redirects`
containing:

```
/*  /index.html  200
```

For Vercel, add `vercel.json` with a rewrite of `/(.*)` to `/index.html`.

---

## Things that will confuse you later

**Your project will pause.** On the free plan, a project with low activity over
any 7-day window gets paused automatically. Since the cohort doesn't start until
September, this *will* happen between now and then. Nothing is lost — data and
config are preserved for a year. To restore: open the dashboard, select the
project, click **Resume project**. Once the cohort is actually using it daily
this stops being an issue. Upgrading to Pro ($25/mo) prevents pausing entirely,
but there's no reason to pay that yet.

**"Success. No rows returned" is success.** It trips people up on the SQL Editor.

**RLS means you'll sometimes see nothing when you expect data.** If a query
returns empty in the app but the row is clearly there in the Table Editor, the
policies are doing their job — you're querying as someone who isn't allowed to
see it. The Table Editor bypasses RLS; the app does not. That difference is the
whole security model.

**Don't disable RLS to debug.** It's tempting when something returns empty. Every
privacy promise made to these young women is enforced by those policies, and
turning them off on a table with prayer requests in it is how that promise gets
quietly broken. If you need to check what a specific person can see, use the
test harness in `supabase/test/` instead — it impersonates users properly.

---

## Verifying the security still holds after you change anything

You have a real test suite. If you have Postgres locally:

```bash
./supabase/test/run.sh
```

Expected output:

```
20_attack: 24 passed, 0 failed
30_regression: 28 passed, 0 failed
ALL SECURITY TESTS PASSED
```

Run this after any schema change. It's the cheapest insurance in the project —
it already caught nine real vulnerabilities.

---

## If you get stuck

The three most likely failure points, in order:

1. **Migrations run out of order** → policies missing. Drop everything and redo
   Part 2 in order. To start clean: `drop schema public cascade; create schema public;`
   then re-run all four.
2. **`.env` not picked up** → still shows demo personas instead of an email
   field. Three causes, in order of likelihood: the file is named `.env.txt`
   (Windows/TextEdit does this silently — check with `ls -la`); it's not in the
   project root next to `package.json`; or the dev server was already running.
   Expo reads env vars at startup only, so stop it and start it again.
3. **OTP email never arrives** → check spam, then check the rate limit. This is
   Part 6.
