# Finding Something Real — App v1 Spec

**Version:** 1.1
**Author:** Curtis Hendrick
**Date:** August 14, 2026
**Sources:** Discovery call with Janell Wood, Lauren Fricke, Ana Torres, Frankie (Aug 2026) · Janell's written feedback on prototype v0.2 · FSR Branding.pdf

### Changelog — v1.0 → v1.1

Driven by Janell's review of the prototype. Her feedback resolved four open questions and added six requirements.

| Change | Section |
|---|---|
| Real brand tokens replace placeholders; Codec Pro licensing flagged | §10 |
| Attendee **names** visible to co-hosts — decliners still private | §5.3 |
| Notes can target everyone, a segment, or individuals; merge fields | §5.6 |
| **Intake questions promoted from open question to built feature** | §5.4 |
| Calendly webhook → auto-drafted recording | §5.14 |
| Time zones: captured at onboarding, plus admin scheduling warnings | §5.15 |
| Reminders at 24h and 1h, exempt from cap and quiet hours | §6 |
| Publish and announce separated for far-out bookings | §5.3 |
| Guest notes field and returning-guest flag | §5.5 |
| "Send a test to myself" in admin | §5.11 |
| Push notification styling constraints documented | §5.16 |

---

## 1. Why we're building this

The problem is not that Finding Something Real lacks a place to put information. It's that the channels currently in use — mass email, individual email, mass text, individual text — **do not reach the people they're aimed at.** Janell described spending one to two hours preparing information for a cohort and having no idea whether anyone read it. Ana confirmed the receiving end: *"whenever I see, like, anything on my inbox, it starts to, like, pile up, and then I just, like, don't check it."*

Three things justify building rather than adopting an off-the-shelf tool:

1. **Channel.** A push notification is in-your-face in a way email and group text are not. If cohort members are required to enable notifications as a condition of participating, FSR gets a channel that actually lands.
2. **The trail.** Janell was explicit that some participants won't be ready at the time — *"maybe they're like, oh, this really isn't for me right now"* — and the value is that months later they can open the app and everything is still there. Ephemeral channels don't do this. A durable, browsable record does.
3. **Community beyond the cohort, eventually.** The cohort is the wedge. Janell's stated ambition is larger: *"ideally it would be something that we could create community with for people beyond the cohort."*

When features compete for time, resolve in that order: channel first, trail second, community third.

**What this is not, for v1:** a group chat. Curtis raised Slack, Teams, and Discord on the call as existing tools for coordination problems. FSR's immediate need is broadcast-with-lightweight-response from a small, known group, plus a permanent record — not many-to-many conversation. Note this is a v1 scoping call, not a rejection of community features; see §12.

---

## 2. Terminology

Used consistently in code, UI, and this document. Confirm these match how the team actually talks.

| Term | Meaning |
|---|---|
| **Season** | A program year. Contains one or more cohorts. |
| **Cohort** | The group of young women onboarded together for a season. Max ~12. |
| **Co-host** | An individual participant. Janell said "cohort or co-hosts, either one" — picking co-host for UI copy, `member` in code. |
| **Alum** | A co-host from a prior season. Retains full access. |
| **Guest** | An outside speaker on a recording. **Content, not a user.** No login. |
| **Recording** | A scheduled podcast session with a guest. |
| **Event** | A non-recording gathering: retreat, live event, fundraiser. |
| **Love note** | A short broadcast message from leadership to all members. |
| **Leadership** | The FSR team with admin access. |

---

## 3. Users and roles

**Member** (co-host or alum — identical permissions)
Receives notifications, RSVPs, submits questions and prayer requests, reads love notes, browses past recordings and guests.

**Admin** (leadership)
Everything a member can do, plus the admin portal. Lauren will be the primary daily operator; she should also hold a member account so she sees exactly what participants see.

**Public / unauthenticated**
Can open the app and see the about page, episode list, and links out. Cannot see anything cohort-related.

There is no guest role in v1. Guests continue booking through Calendly; Lauren enters their details as content.

**Decision made:** alumni see the same information as current co-hosts, regardless of season. No walled gardens per season. This came directly from Janell — an alum seeing that only one person signed up for a recording and deciding to show up is a feature, not a leak.

---

## 4. Scope

### In scope for v1

1. Invite-gated account creation, with time zone captured at onboarding
2. Push notifications, required at onboarding
3. Member dashboard
4. Recordings — list, detail, RSVP yes/no, attendee names, deferred announcement
5. Session questions, per recording
6. **Intake questions, admin-assignable to recordings**
7. Guest profiles with notes and returning-guest flag
8. Love notes with audience targeting and merge fields
9. Events — invite and RSVP
10. New episode notifications
11. Prayer requests → leadership only, weekly prompt
12. Read receipts, per person
13. Reminders at 24h and 1h
14. **Calendly webhook → auto-drafted recording**
15. Admin portal (responsive web), including send-a-test-to-myself
16. Public shell for app store review

### Explicitly out of v1

- Member-to-member posting, forum, or comments — carries moderation burden and Apple UGC requirements. Curtis's position on the call was *"maybe we start small with that"* — deferred, not rejected. This is the most likely v2 feature.
- In-app messaging or DMs
- Direct Calendly API integration (see open question)
- In-app audio player for episodes
- Member profiles and photos — guest profiles only
- Formal reschedule negotiation. Janell did ask for "maybe an option there" for the rare back-and-forth case; v1 covers it with a free-text note on the RSVP rather than a scheduling flow. **Confirm this is acceptable.**
- Season-scoped visibility

### Deliberately deferred, not decided

**Intake questions.** See §5.13 — this is the largest open scoping question in the document.

---

## 5. Features

### 5.1 Onboarding and accounts

Random people must not be able to create accounts. Flow:

1. Lauren adds a co-host in the admin portal (name, email).
2. System emails an invite with a one-time link and a fallback code.
3. Member opens the link, enters their email, receives a 6-digit code, and is in.

> **Change from the call.** The meeting assumed a conventional username and password — *"it's just like the normal username password construct."* This spec proposes **passwordless email OTP instead**, which eliminates the largest ongoing source of support requests Lauren would otherwise absorb, and removes password reset entirely. Email-only, no phone numbers: Curtis confirmed on the call that FSR already has everyone's cell number, so there's nothing gained by collecting it. Flagging both as departures rather than burying them.
4. **Consent screen** — plain language, before the OS prompt:
   - what FSR will send and roughly how often
   - that leadership can see when you open messages and how you RSVP
   - that prayer requests go only to the FSR team
5. **Why-we-need-this screen**, then the OS push permission prompt. Never trigger the OS prompt cold — asking permission to ask roughly doubles accept rates, and if someone declines the OS prompt on iOS you cannot ask again in-app.
6. On the web build: Add to Home Screen instructions (required for push on iOS).
7. Land on the dashboard with a welcome love note already waiting.

*Acceptance:* an un-invited email cannot create an account. A member who declines push sees a persistent, dismissible banner explaining what they're missing and how to turn it on in Settings.

### 5.2 Dashboard

The home surface. Priority order, top to bottom:

1. Unread love note card, if any — visually prominent, marked read on open
2. Next recording or event, with RSVP state and a one-tap RSVP if unanswered
3. Latest episode
4. Anything awaiting a response (unanswered RSVP, open prayer request prompt)

Janell's constraint governs this screen: *"keeping this as simple as possible for the user is really the key… it to be a gift to them."* If the dashboard has more than four things on it, cut something.

### 5.3 Recordings and RSVP

The guest sets the time via Calendly. Lauren then creates the recording in the admin portal with: guest, date and time, topic, the questions being covered, description, and the Riverside join link.

Publishing a recording fires a push to all members. The detail view shows everything above plus the guest profile and an RSVP control.

**RSVP is yes/no.** No availability polling — the guest sets the time and members respond to it, which was clear on the call. A member answering "no" is immediately offered a question prompt (proposed copy: "Have a question you'd like us to ask on your behalf?"). An optional free-text note is available on either response.

One caveat: Janell described real cases where a co-host asked to reschedule because the topic mattered to her personally, and said *"so maybe, like, an option there, but for the most part, it's always a yes or no."* The free-text note is my proposed minimum viable answer to that. If she wants an actual reschedule request flow, say so — it's small but it's not free.

**Attendance visibility — revised in v1.1.** Janell asked for co-hosts to see *who* is attending, not just a count. Building it, with one asymmetry:

- **Attending co-hosts are listed by name.** This is what she's actually after — an alum opens a thin session, sees only two names, and decides to show up.
- **Decliners and non-responders are not listed.** Absence stays private.
- Leadership continues to see everything: names, responses, timestamps, and who never replied.

The asymmetry is deliberate. If attendance is fully public then so is absence, and this cohort includes people who are tentative about being there at all. The RSVP has to remain a safe "no" or co-hosts will simply not answer — which is the original problem. Listing only the yeses delivers the benefit without publishing anyone's decline. Revisit after one season if Janell wants full transparency.

**Publish vs. announce — new in v1.1.** Guests book anywhere from a few days to several months ahead. Publishing a recording three months out and pushing a notification immediately wastes the notification on something nobody can act on yet. So the two are separate actions: Lauren publishes whenever the booking is confirmed, then either announces now or schedules the announcement for a chosen date. The session appears in the app either way; only the push is deferred.

The Riverside link is the same every time but should surface on the recording detail regardless — the point of the app is that members stop hunting through email.

*Acceptance:* a member can go from push notification to RSVP'd in two taps.

### 5.4 Questions

Two distinct kinds. Both live here; they behave differently.

**Session questions.** Per recording. Submitted by any co-host, most often prompted after a "no" RSVP but available to anyone before the recording. Visible to leadership only, grouped by recording with the submitter's name.

**Intake questions — promoted to a built feature in v1.1.** In v1.0 this was the largest open question in the document. Janell resolved it: she wants the season-building questions in the app, visible to admins and assignable to recordings.

This is the content engine of the ministry. Co-hosts arrive with questions and objections; the season's episodes are built to answer them, each one tied back to a specific young woman's question. Today those questions come from **co-host Google Forms and the retreat recordings, then get manually keyed into Trello.** That manual step is the overhead the app can remove.

How it works:

- Intake questions are captured per co-host, per season, tagged as a question or an objection.
- Admins see them in one place, filterable by co-host and by whether they've been addressed yet.
- An admin can **assign an intake question to a recording.** One recording can address several; one question can span recordings.
- Once assigned and the episode airs, the co-host who asked it sees *"this one came from your question."* That's the mission expressed in software — the whole premise is making these young women feel seen and heard.
- Leadership gets a coverage view: which co-hosts have questions still unanswered as the season progresses. Ana described the season as curated so each girl's question gets its own dedicated moment; this makes that trackable instead of remembered.

**On Trello — recommend no integration in v1.** Two-way sync between an app and a Trello board is a maintenance burden that outlives its usefulness, and Janell herself is unsure how the two should fit together. Let the app own questions → recordings, leave Trello running as-is for everything else, and reassess after one season. Her instinct to figure it out by trial and error is the right one.

**Where intake questions enter the app** depends on timing — see §12.

### 5.5 Guest profiles

Deliberately lightweight — Janell flagged that assembling full bios "would take a lot of time." Fields: name, photo, one or two sentences, one external link.

**Added in v1.1:** an optional free-text notes line, and a **returning guest** flag. The flag auto-derives from whether the guest has prior recordings in the system, with a manual override for guests who appeared before the app existed. When true, co-hosts see a "returning guest" marker linking to the earlier episode — which feeds the trail rather than just being metadata.

Guest profiles persist and are browsable after the recording airs. This is a core piece of the trail: *"later they can go, oh, this is who was talking about this, and here's the information."*

### 5.6 Love notes

Short broadcast messages from leadership. Janell's framing: *"it's like a love note, really — hey, we care about you, here's what's going on right now, here's a link to this week's episode."* Typically weekly, but sent whenever there's something to say.

Composed in the admin portal: title, body, optional link. Sends a push; the note lives on the dashboard as a card until read; after reading it moves to a simple archive so the trail persists.

**Audience targeting — new in v1.1.** Janell asked whether notes can go to individuals as well as the group. Yes. Every note picks one audience:

- Everyone (current cohort + alumni)
- Current cohort only
- Alumni only
- Hand-picked individuals

**Merge fields.** The prototype's example note opened with "Imani —", which is why it read as a personal message. That was a merge field, not an individual send. Group notes support `{first name}` so a broadcast still reads as addressed to the person. Worth confirming Janell wants this — a note opening with the reader's own name lands very differently from "Hi everyone," and that difference is most of the point.

Ana's point drove this design: an inbox that accumulates unread items gets abandoned. So the dashboard shows **one** unread note at a time, prominently. It is not an inbox.

### 5.7 Events

Retreats, live events, gatherings. Same mechanics as recordings — publish, push, RSVP yes/no — with location and date range instead of a join link.

### 5.8 New episode notifications

Episodes publish Wednesdays. When one goes live, all members get a push linking to it. Whether this is automated from an RSS feed or posted manually by Lauren depends on where episodes are hosted — see open questions. Build the manual path first; add RSS polling if a feed exists.

### 5.9 Prayer requests

A weekly push asks whether there's anything the team can be praying for this week — Janell confirmed in her v1.1 feedback that she wants this as a recurring notification, not just a screen people have to find. Submissions go **only to the FSR leadership team** — never to other members. Janell was explicit about this and it is not negotiable in implementation.

**Adaptive cadence.** If a co-host doesn't respond for several weeks running, quietly step the prompt down to monthly for that person. A recurring ask that's always ignored stops reading as care and starts reading as automated nagging — the opposite of the intent.

Treat these as the most sensitive data in the system. Encrypt at rest, restrict to the defined leadership list, log access, and set a retention policy. The recipient list needs to be named explicitly before launch.

### 5.10 Read receipts

**Decided: per-person.** Leadership sees who opened each love note and notification, and when.

This directly answers Janell's stated pain — putting in two hours and not knowing if anyone looked. Two implementation requirements that come with it:

- **Disclose it clearly** at onboarding and in the co-host agreement. Not buried in a policy document — a plain sentence on the consent screen. This cohort includes several agnostics, a Muslim participant, and others who are tentative; FSR's stated posture is hospitality regardless of background, and a participant discovering tracking after the fact would undercut that.
- **Distinguish delivered / opened / responded.** A push that never arrived and a push that was ignored are different problems and should not look the same in the admin view.

### 5.11 Admin portal

Responsive web — Lauren wants to compose on a laptop but check on her phone, and she specifically raised wanting to see how content renders on the member side. Give her a **preview-as-member** view in addition to her own member account.

Functions: manage members and invites; create and publish recordings, events, and guests; compose and send love notes and ad-hoc notifications; view RSVPs, session questions, intake questions, prayer requests, and read receipts; manage seasons.

**Confirmed for Janell:** this is a website. Nothing to install, works on a laptop or a phone browser, same URL either way.

**Send a test to myself — new in v1.1.** Janell asked whether "Send test push" was an admin feature. In the prototype it's scaffolding (see §5.16), but the underlying idea is worth building: a button that delivers the note Lauren is composing to her own device only, so she can see how it actually lands before it reaches twelve people. Cheap, and it prevents a typo going out to the whole cohort.

### 5.12 Public shell

Unauthenticated: about the ministry, episode list, links to the website and YouTube, and a way to express interest in a future cohort.

**This matters for more than politeness.** Apple's minimum-functionality guideline rejects apps that are primarily a login gate or a repackaged website.

> **Change from the call.** Curtis's plan on the call was for the public side to represent *"at least the website right now, and links to the content… your guys's website and the YouTube pages."* On reflection that's likely to be rejected under Apple guideline 4.2 — a wrapper around a website reads as a wrapper around a website. The public side needs enough native substance to stand on its own: a real episode list and guest directory rather than a stack of outbound links. This is more work than the call assumed and is the main reason the store path lags the web path.

### 5.13 Intake questions — RESOLVED in v1.1

*Retained as a decision record. The built behaviour is specified in §5.4.*

This was the gap I was least comfortable with in v1.0, because it looked like the actual heart of the ministry's workflow and no one had raised it as an app feature.

Janell: *"we intentionally curate every episode, according to the questions that they brought up or the objections that they brought up, regardless of where they're at with faith."*
Ana: *"the season is curated to answer their specific questions… each one of their questions is also kind of dedicated to a girl."*

So the content engine works like this: co-hosts arrive at the retreat with questions and objections, FSR collects them, and the season's episodes are built to answer them — each recording tied back to a specific young woman's question. The app as specced has **no mechanism for any of this.** `Question` is per-recording only, meaning it captures "I can't make it, ask this for me" but not the foundational intake that determines what the season is even about.

Three options:

1. **Out of scope.** Intake stays on paper at the retreat. The app is purely a communication layer. Simplest, and defensible for v1.
2. **Capture only.** Add an intake form — co-hosts submit questions and objections at onboarding, leadership sees them in one place. Small build, replaces whatever manual collection happens today.
3. **Capture and link.** Intake questions become first-class objects that can be attached to a recording, so a co-host can open a session and see *"this one is answering your question."* Meaningfully more work, but it makes the app express what the ministry actually does — and it's the kind of thing that would make a participant feel seen, which is the stated mission.

**Resolved in v1.1.** Janell chose the fullest option — intake questions in the app, admin-assignable to recordings. Specified in §5.4; this section is retained as a record of the decision.

### 5.14 Calendly integration — new in v1.1

The highest-value request in Janell's feedback, because it removes a scramble she described directly: after a guest books, she has to get the details to co-hosts "as soon as possible," and on busy weeks that's a struggle.

Today's flow: guest gets an emailed Calendly link → books → Janell receives an automated confirmation and a calendar entry → she manually relays the details to co-hosts and tries to add them to a Google Calendar event.

Proposed flow:

1. Guest books through Calendly, unchanged. Nothing about the guest's experience changes.
2. Calendly fires an `invitee.created` webhook to the app.
3. The app creates a **draft** recording, pre-filled with guest name, email, date, and time.
4. Lauren and Janell get an in-app notification that a booking landed.
5. Lauren opens the draft, adds the topic, the questions being covered, and links any intake questions it addresses.
6. She publishes — and chooses whether to announce now or schedule it (§5.3).

Nothing reaches co-hosts automatically. A booking creates a draft, never a published session; a human always reviews before twelve people get notified.

**Dependency:** Calendly webhooks require a **paid plan (Standard or above)**. Need to know which tier FSR is on before committing. If they're on the free tier, the fallback is polling an ICS feed or manual entry, both meaningfully worse.

**On Google Calendar.** Rather than having the app manage Google Calendar guest lists, put an **"add to calendar" action on the RSVP-yes confirmation** — a standard `.ics` download that works with Google, Apple, or Outlook. Same outcome, far less integration surface, and it works with whatever calendar each co-host actually uses instead of assuming Google.

### 5.15 Time zones — new in v1.1

Several co-hosts this season are overseas. This is more than a formatting concern.

- **Capture at onboarding.** Auto-detect from the device, show it, let the co-host correct it.
- **Render in the viewer's own zone,** everywhere, with the zone labelled. A co-host in the Netherlands sees their local time, not Pacific.
- **Warn the admin at scheduling time.** When Lauren picks a slot, the form flags who it lands badly for: *"6:00pm PT — that's 3:00am for Nadia and 4:00am for Fena."*

That last one is the real feature. Without it, a co-host quietly misses a recording that was scheduled for the middle of their night, and it reads as disengagement rather than as a scheduling mistake nobody caught. For a ministry whose stated posture is hospitality, silently scheduling over someone's sleep is exactly the failure worth engineering against.

### 5.16 What we can and cannot style in a notification

Janell asked about adding color to push notifications. Worth stating plainly, because the prototype is misleading here.

**We do not control how a push notification looks.** The banner is drawn by iOS and Android in system colors and system fonts. What we supply is an app icon, a title, and body text. The dark rounded card in the prototype is a *mock-up* of an iOS notification — real ones will look like every other notification on the phone.

What does carry the brand:

- **The app icon**, which appears on every notification and is entirely ours.
- **Rich notifications** on iOS can attach an image — usable for episode artwork or a guest photo.
- **Everything inside the app**, which is fully ours to design.

So the honest answer is: the notification chrome belongs to Apple and Google, but the icon is FSR's and the app is FSR's. Colour belongs inside the app.

---

## 6. Notification catalog

| # | Trigger | Audience | Class | Deep link |
|---|---|---|---|---|
| 1 | Recording announced (immediate or scheduled, §5.3) | All members | Broadcast | Recording detail |
| 2 | RSVP nudge — 48h after invite, no response | Non-responders | Broadcast | Recording detail |
| 3 | Reminder — 24h prior | Everyone who said yes | **Time-sensitive** | Recording detail |
| 4 | Reminder — 1h prior | Everyone who said yes | **Time-sensitive** | Recording detail |
| 5 | Love note published | Targeted (§5.6) | Broadcast | Dashboard |
| 6 | New episode live | All members | Broadcast | Episode |
| 7 | Event published | All members | Broadcast | Event detail |
| 8 | Weekly prayer prompt | All members, adaptive | Broadcast | Prayer form |
| 9 | Ad-hoc broadcast | Admin-selected | Broadcast | Admin-set |
| 10 | Guest booked via Calendly | Admins only | Internal | Draft recording |

**Two classes, two rule sets — clarified in v1.1.**

*Broadcast* messages obey the guardrails: quiet hours (nothing 9pm–8am **in the recipient's own zone**), a soft cap of three per member per week, and batching when several things publish together. Admins get a warning before exceeding the cap, not a hard block.

*Time-sensitive* reminders are **exempt from both the cap and quiet hours.** This matters more than it sounds. A 1-hour reminder before an early recording would be suppressed by a 9pm–8am quiet window, and a co-host in Europe would never receive reminders at all, since their waking hours sit inside Pacific quiet hours. Applying one rule set to both classes silently breaks reminders for exactly the overseas co-hosts §5.15 exists to protect.

Janell's note that guests book anywhere from days to months out is handled by the announce scheduling in §5.3 rather than by the cap.

---

## 7. Data model

```
Season          id, name, starts_at, ends_at
User            id, email, display_name, role, status,
                timezone, created_at                            [tz new in 1.1]
Membership      user_id, season_id, type (cohort | alum)
Invite          code, email, season_id, sent_at, redeemed_at, expires_at
PushToken       user_id, platform, token, enabled, updated_at

Guest           id, name, photo_url, blurb, external_url,
                admin_notes, returning_override                 [new in 1.1]
Recording       id, season_id, guest_id, title, topic, questions_covered,
                description, scheduled_at, join_url,
                published_at, announce_at, announced_at,        [new in 1.1]
                calendly_event_id, source (manual|calendly)     [new in 1.1]
RSVP            user_id, recording_id, response (yes|no), note, responded_at

Event           id, title, type, starts_at, ends_at, location,
                description, published_at
EventRSVP       user_id, event_id, response, note, responded_at

Question        id, user_id, recording_id, body, submitted_at
IntakeQuestion  id, user_id, season_id, body, kind (question|objection),
                source (form|retreat|app), submitted_at, status  [§5.4]
QuestionLink    intake_question_id, recording_id, assigned_at    [new in 1.1]
PrayerRequest   id, user_id, body, submitted_at, status          [restricted]

LoveNote        id, title, body, link_url, author_id,
                audience (all|cohort|alumni|custom),             [new in 1.1]
                recipient_ids, published_at
Receipt         user_id, target_type, target_id,
                delivered_at, opened_at                          [per-person]
NotificationLog user_id, type, class (broadcast|time_sensitive),
                sent_at, suppressed_reason                       [new in 1.1]

Episode         id, title, url, artwork_url, published_at, source
```

`Receipt` is deliberately generic so read tracking works uniformly across love notes, recordings, and events. `QuestionLink` is a join table rather than a column on `IntakeQuestion` because one recording can address several questions and one question can span recordings. `announce_at` separate from `published_at` is what makes §5.3's deferred announcement work. `NotificationLog.class` is what enforces the two rule sets in §6 — without it, cap and quiet-hour logic can't tell a reminder from a broadcast.

All timestamps stored UTC, rendered per-user from `User.timezone`.

---

## 8. Architecture

**Decided: one Expo codebase, shipped to web first and to both app stores after.** This avoids a rewrite while getting something installable early.

- **Client** — Expo (React Native) with Expo Router, targeting iOS, Android, and web via `react-native-web`. Same components, three targets.
- **Push** — `expo-notifications` → APNs/FCM on native. On web, a service worker with the Web Push API. **iOS web push requires the user to Add to Home Screen first** — that step must be walked through, ideally in person, or the entire premise of the app fails silently for iPhone users.
- **Over-the-air updates** — Expo's OTA channel lets fixes ship mid-cohort without a store review cycle. Given the plan is to iterate on Lauren's feedback while a live cohort is using it, this is the single most valuable property of the stack.
- **Backend** — AWS. Recommend Amplify Gen 2 (Cognito + AppSync + DynamoDB, defined in TypeScript) for speed; the alternative is API Gateway + Lambda + DynamoDB assembled by hand, which is more portable and slower to build. At this scale either costs single-digit dollars a month.
- **Auth** — Cognito, passwordless email OTP, gated on a valid invite.
- **Media** — S3 + CloudFront for guest photos.
- **Scheduled work** — EventBridge → Lambda for RSVP nudges, recording reminders, the weekly prayer prompt, and RSS polling if applicable.

### A note on Unity

Unity came up on the call as a possible multi-platform approach. Recommend against it: no first-class push notification support, large binaries, poor form and text input ergonomics, and no meaningful web target for this kind of app. Expo covers the same multi-platform need and is built for exactly this shape of product.

---

## 9. Privacy, policy, and ownership

**Required before either app store will accept a submission:**

- A published privacy policy at a stable URL
- In-app account deletion
- Data-collection disclosures (App Store privacy nutrition labels, Play Data Safety form)
- An age rating, which depends on whether any participants are minors

**Recommendations beyond the minimum:**

- **Revisit account ownership.** The call already settled this for now: Curtis asked whether he could publish under his personal developer account to save the $100/year Apple fee (Google Play is a one-time $25), and Janell approved — *"No idea what that even means. You can, whatever. We're trusting you."* That's a reasonable call for a prototype. But "we're trusting you" is consent given without technical context, which is a reason to be more careful on her behalf, not less. Recommend either moving to FSR-owned Apple, Google, and AWS accounts before public launch, or documenting the transfer path in writing now. Practical note: Apple developer account transfers are possible but slow and constrained, so deciding before submission is much cheaper than deciding after.
- **Name the leadership list explicitly** for prayer request access, and revisit it each season.
- **Set retention policies**, particularly for prayer requests and read receipts.
- **Strengthen the co-host agreement.** Janell said she wrote *"download an app if we have one"* into this season's agreement — a soft ask, not a requirement. The app's whole premise depends on push actually being enabled, and per-person read receipts should be disclosed in writing. Both belong in the agreement as explicit terms before the retreat.

---

## 10. Design direction

Superseded in v1.1 by the actual brand guide (FSR Branding.pdf). The guide's own positioning line — **modern · editorial · approachable** — matches the direction already built.

### Palette

| Token | Hex | Use |
|---|---|---|
| Ink | `#000000` | Text, primary buttons, the note card |
| Paper | `#FFFFFF` | Backgrounds |
| Sage | `#556F5A` | Attending / confirmed / success |
| Blue | `#5C7688` | Informational, links, guest metadata |
| Gold | `#D1A84E` | Unread markers, "new," gentle attention |
| Blush | `#C79C8E` | Warmth — prayer, love notes, retreat |

Black and white stays the base. The accents are **functional, not decorative** — sage means confirmed, gold means unread. Used that way they add meaning and the editorial feel survives. Sprayed around as decoration they'd destroy the thing Janell likes about it.

Accessibility note: gold `#D1A84E` and blush `#C79C8E` do not meet 4.5:1 contrast on white, so neither is used for body text — only for fills, indicators, and rules. Sage and blue pass for text.

### Type

| Role | Face | Notes |
|---|---|---|
| Headings | Noto Serif Display | Freely licensable. Italics for emphasis, per the guide. |
| Subheads | Glacial Indifference | Free. Bold for emphasis. |
| Body | Codec Pro | **Commercial license required** |

> **Flag: Codec Pro.** It's a paid font, and app embedding is licensed separately from web use. Needs pricing before we commit, or a substitute. Closest free alternatives with a similar geometric-humanist feel are Inter, Figtree, or Hanken Grotesk. Prototype v0.3 uses a fallback stack so the layout is correct either way — swapping in the real face later is a one-line change.

### Principles

- Editorial rather than utilitarian. Generous whitespace, strong typographic hierarchy, large photography.
- Guest and co-host photography in black and white, per the brand guide's Instagram direction.
- Minimal chrome. No badge counts, no red dots beyond the single unread indicator.
- Fast. Skeleton states, no spinners where a placeholder will do.

### Logo

Janell asked about using the FSR logo in-app. Yes — needed as **SVG or high-resolution transparent PNG**, in the stacked lockup and a single-line variant. Also required, and not in the brand PDF: a **square app icon** that stays legible at 60×60px. The full stacked wordmark won't reduce to that size; this usually means a monogram or a cropped mark. Worth asking the designer who produced the guide.

---

## 11. Success measures

After one cohort, this is working if:

- **RSVP response rate** is meaningfully above the near-zero baseline of mass text and email
- **Love note read rate** is high enough that Janell stops wondering whether anyone saw it
- **Lauren's weekly time on communication** goes down, not up
- **Questions submitted by people who couldn't attend** — proof the app is creating participation that didn't previously exist

---

## 12. Open questions

### Closed by Janell's v1.1 feedback

Intake questions (§5.4) · attendance visibility (§5.3) · the Calendly workflow (§5.14) · the Trello relationship (§5.4) · admin portal is a website (§5.11). Reina is confirmed as a real team member — spelled with an i.

### New in v1.1

1. **Which Calendly plan is FSR on?** Webhooks need Standard or above. Blocks §5.14.
2. **License Codec Pro, or substitute?** Cost and legal question, not a technical one. Blocks final typography.
3. **What else lives on the Trello board** besides questions? If it's operations we aren't touching, the two coexist fine. If it substantially overlaps the app, the recommendation in §5.4 changes.
4. **Do co-hosts fill the Google Form before they'd have app accounts?** If yes, keep the Form and import from it. If it happens at or after the retreat, in-app intake can replace it. Determines where §5.4 intake actually enters the system.
5. **Logo files and a square app icon** — see §10.
5a. **Who controls DNS for findingsomethingreal.com?** Sending auth emails from
    an FSR address requires adding SPF/DKIM records at the domain's DNS host.
    Blocks branded email and, more importantly, blocks getting off Supabase's
    rate-limited default sender before the retreat.
6. **Confirm merge fields** on group notes (§5.6).

### Still open from v1.0

7. **"Eight cohorts" or eight co-hosts?** Ana said *"we usually have like one or two or three cohorts for the season… this time we had eight,"* which conflicts with the max-12-per-cohort framing everywhere else. Determines whether the data model needs real multi-cohort support.
8. **Who is "the FSR team"** for prayer request access — names, please.
9. **Are all participants 18+?** Affects age rating, consent, and what can be collected.
10. **Where do episodes publish,** and is there an RSS feed?
11. **Do alumni get every recording announcement,** or opt in per season?
12. **How far does "community beyond the cohort" go, and when?**
13. **Who writes the privacy policy?** And who owns the Apple, Google, and AWS accounts (§9)?

Lower priority:

14. Janell's ChatGPT-generated feature list — she offered to send it and it may contain items that never came up out loud.
15. Frankie left within days of the call; confirm she's not a long-term admin stakeholder.

### Confirm the changes from the call

Three places where this spec deliberately departs from what was said in the meeting. Each is flagged inline; listing them together so none slips through:

- **Passwordless email OTP** instead of username and password (§5.1)
- **Public side must be substantively native**, not a wrapper around the website and YouTube (§5.12)
- **Expo rather than Unity** (§8)

---

## 13. Build sequence

Order by dependency, not by date.

**Foundation** — Expo project, AWS backend, Cognito auth, invite flow, push registration on all three targets. Nothing else works without this, and push on iOS web is the highest-risk piece; prove it early.

**Core loop** — Recordings, RSVP, questions, guest profiles, love notes, dashboard. This is the product. Everything above is plumbing.

**Admin** — The portal. Can lag the member app slightly since content can be seeded directly at first, but Lauren cannot QA meaningfully until she can create things herself.

**Complete v1** — Events, episode notifications, prayer requests, read receipt reporting, notification guardrails.

**Store readiness** — Public shell with real native content, privacy policy, account deletion, store listings and screenshots. Budget real time here; the last App Store submission took eight days of back-and-forth.

### Running alongside the build: process migration

Lauren's first question on the call was not about the app. It was: *"could I be trained on exactly what the system looks like before we switch onto the new platform? So when we move over… if we're disorganized over there, we don't want to bring it to the new app."*

That's the right instinct and it's a real work item, not just courtesy. Her action items — meeting with Anna and Reyna about the current process, and reviewing the Trello board — should happen in parallel with the build, not after it, for two reasons. First, the current process is the requirements document for the admin portal; if it's disorganized, that disorganization gets encoded. Second, Lauren can't QA meaningfully against a process she hasn't learned.

Concretely, this should produce a short written description of how communication works today — who does what, in what order, in which tool — before the admin portal design is locked. If the answer is that the current process is a mess, that's useful information and the app should not reproduce it.
