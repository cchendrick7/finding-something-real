# Getting Finding Something Real onto Google Play

Written 27 Sep 2026, against the Play Console rules as they stand today.
Every requirement below was checked against Google's own documentation, not
from memory — the policy changed in April, May and July 2026 and a plan
written from a 2025 tutorial would be wrong in at least three places.

**Realistic timeline: three to five weeks**, and almost all of that is waiting
on other people. The engineering is about a day and a half.

---

## The one thing to start today

**Get a D-U-N-S number for the ministry.** It is free, it comes from Dun &
Bradstreet rather than Google, and D&B say it **can take up to 30 days**. A
Play *organization* account cannot be created without one, and everything else
in this document waits behind that account.

Google's own verification, once you have the number, is quick by comparison —
they say up to 5 days.

> Organization account required fields: developer name, organization name,
> address, **D-U-N-S number**, organization phone, organization website,
> contact name/email/phone.
> <https://support.google.com/googleplay/android-developer/answer/13628312>

### Register as an ORGANIZATION, not a personal account

This is the single biggest schedule decision and it is easy to get wrong,
because the personal account is faster to open.

A **personal** developer account created after 13 Nov 2023 must run a closed
test with **12 testers opted in continuously for 14 days** before it may
publish to production at all, then apply for production access and wait up to
another 7 days for that application to be reviewed. It must also complete
device verification by signing in to the Play Console app on a physical
Android device.

The policy article naming that requirement is titled *"App testing
requirements for **new personal developer accounts**"* and its scope sentences
name personal accounts only.
<https://support.google.com/googleplay/android-developer/answer/14151465>

**A 501(c)(3) running a branded app is an organization by Google's own
definition** ("commercial, industrial, professional, or governmental
activities"), so this is the honest answer as well as the faster one.

> **Caveat, stated plainly:** no Google page says in so many words that
> organization accounts are *exempt* from the 12-tester rule. The conclusion
> rests on the policy's scope naming personal accounts. The only text
> asserting exemption outright is a community-written guide, not Google. Treat
> it as well-supported but confirm in the Console once the account is verified
> — if the gate is active, the Dashboard shows an "Apply for production" card.

Fee either way: **US$25, one-time.** No non-profit waiver that I could find.

---

## What is already done

More than you'd think. The Android side of the app was built alongside iOS.

| | |
|---|---|
| Android build | **Works.** One AAB already built on EAS (`a8f76066`, versionCode 1) |
| Play App Signing | Automatic on the new-app flow; an upload keystore already exists on EAS |
| Package name | `com.findingsomethingreal.app` |
| Adaptive icon | Foreground / background / **monochrome** all generated from Janell's emblem |
| Screenshots | 8 phone screenshots at 1080×1920 in `store/android/` — Play wants 2 minimum, 4+ recommended |
| Feature graphic | `store/feature-graphic.png`, 1024×500, no alpha ✓ |
| Listing copy | Written, in `docs/STORE-SUBMISSION.md` — needs trimming to Play's limits, see below |
| Privacy policy URL | Live at `/privacy` |
| **Account deletion URL** | Live at `/delete-request` — **required** since the app has accounts, enforced since May 2024 |
| Data safety answers | Drafted in `docs/STORE-SUBMISSION.md`, including the phone number added for the interest form |

---

## Engineering, about a day and a half

### 1. Push notifications do not work on Android at all. (half a day)

> **Done 25 Oct 2026, build 3.** Firebase project `finding-something-real`
> (curtis@meritdigitalgroup.com, Analytics off), google-services.json in the
> repo, FCM V1 key on EAS, 'default' channel created in lib/push.tsx. Step 5
> was unnecessary: Expo push tokens have the same form on both platforms.
> Not yet tested on a real Android phone.

The largest real gap, and it matters more after this week: the co-host
notification work — invitations, reminders, notes, the cancelled-session
notices — is the whole reason a co-host opens this app.

`lib/push.tsx` excludes Android on purpose and says why:

> Android is excluded deliberately: remote push there needs a Firebase project
> and a google-services.json, and asking `getExpoPushTokenAsync` without one
> throws "Default FirebaseApp is not initialized". The Android build is
> otherwise complete — when FCM is set up, delete the platform check and
> nothing else changes.

What it takes:

1. Create a Firebase project for the ministry, add an Android app with the
   package name above, download `google-services.json`.
2. Add it to `app.json` as `android.googleServicesFile`.
3. Upload the **FCM v1 service account key** to EAS credentials (the legacy
   server key is retired).
4. Delete the `Platform.OS === 'ios'` check in `lib/push.tsx`.
5. Extend `scripts/push-test.mjs` to cover an Android token — the token format
   differs, and `TOKEN_RE` in the push-api handler must accept it.

No backend change. The outbox already sends to whatever Expo tokens exist.

### 2. Confirm the target API level. (10 minutes, but do not skip)

**A new app submitted today must target Android 16 (API 36) or higher** —
effective 31 Aug 2026, four weeks ago.
<https://support.google.com/googleplay/android-developer/answer/11926878>

Expo SDK 57 almost certainly targets 36, but "almost certainly" is not a
thing to submit on. Build an AAB and read the manifest before uploading.

### 3. Check the merged manifest for AD_ID. (10 minutes)

The app has no ads and no analytics, so
`com.google.android.gms.permission.AD_ID` should be **absent**. The trap is
that some SDKs declare it in their own library manifest and it is merged into
yours silently — and then the Data safety declaration ("no advertising ID
collected") is quietly false. If it appears, strip it with
`tools:node="remove"`.
<https://support.google.com/googleplay/android-developer/answer/6048248>

### 4. Produce the 512×512 store icon. (10 minutes)

Play's store listing icon is **512×512, 32-bit PNG with alpha, under 1024 KB**
— a different asset from the adaptive icon layers we already generate.
`assets/mkicon.py` can emit it; it does not today.

### 5. Back up the upload keystore. (10 minutes)

Long overdue and on the outstanding list since August. Losing it is
recoverable — Google holds the real app signing key and an upload key can be
reset — but a reset is a support round-trip, and the ministry should hold its
own copy either way.

---

## Play Console declarations

Everything in **App content → Needs attention** must be cleared before a first
production release.

| Section | Answer |
|---|---|
| Privacy policy | `https://main.d1jiok92baqhp9.amplifyapp.com/privacy` |
| **Ads** | No |
| **App access** | Restricted. Give the reviewer the demo co-host login and instructions — **broken or missing demo credentials is one of Google's named top rejection causes** |
| **Content ratings (IARC)** | Questionnaire. As of the **15 Jul 2026** policy update, unrated apps are no longer permitted at all |
| **Target audience and content** | Ages 16-17 **and** 18+. See the note below |
| **Data safety** | Personal info: Name, Email address, **Phone number (Optional)**, Other info (time zone). Encrypted in transit: Yes. Deletion available: Yes, with the URL |
| **Financial features** | "My app doesn't provide any financial features" — required of every published app |
| **News and magazine apps** | No |
| **COVID-19 contact tracing** | None apply |
| Government apps | Not applicable |
| Health apps | Not applicable |
| Permissions declaration | Not applicable — no SMS, call log or all-files access |

Order matters: target audience must be answered *after* ads, app access and
the privacy policy.

### The 16-17 bracket, and the honest uncertainty in it

Google's own note on that age group: *"Note that this age group **may be
considered to include children in some locales**."* The Families Policy
triggers when a target audience "includes children", and Google explicitly
declines to fix an age — *"The word 'children' can mean different things in
different locales and in different contexts. It is important that you consult
with your legal counsel."*
<https://support.google.com/googleplay/android-developer/answer/9893335>

Two things that definitely apply:

1. Google names **name and email address** as personal and sensitive when
   collected from children, and says such collection *"should be collected
   with parental consent if required."* The interest form takes exactly that
   from an audience that includes 17-year-olds. It is disclosed in the privacy
   policy and will be in the Data safety form; whether consent is *required*
   is a question for the ministry's counsel, not for Google's documentation
   and not for me.
2. **The store listing art is judged independently of the declaration.**
   Google: an app not designed for under-13s whose listing has "youthful
   animation or young characters in the graphic assets" may be rejected.
   Our screenshots are photographs of adults and the icon is a serif
   monogram, so this is fine — but it is a reason not to make the art more
   playful later.

Do **not** enable Restrict Minor Access: that requires declaring 18+ as the
only audience, which would be untrue.

---

## Store listing — trim the copy

Play's limits differ from Apple's and the current copy does not fit.

| Field | Play limit | Status |
|---|---|---|
| App name | 30 | "Finding Something Real" = 22 ✓ |
| **Short description** | **80** | **Needs writing** — Apple's 30-char subtitle is too short, the 170-char promo text too long |
| Full description | 4000 | The App Store description fits ✓ |
| Support email | required | `janell@findingsomethingreal.com` |

Play forbids in the short description: "Best", "#1", "Top", "New", "Free",
"Download now", emoji, stars, repeated punctuation, and capitals for emphasis.

---

## Two things worth a legal read, not an engineering fix

1. **US state age-verification law.** Texas SB2420 is in force; Play's Age
   Signals API began returning signals for eligible Texas users on 28 May
   2026, with other states following. Google's framing is that the *laws*
   impose the obligation and Play merely provides the signal. A US-wide app
   with teen users needs someone to say whether integration is required.
   <https://developer.android.com/google/play/age-signals/overview>
2. **Android developer verification.** Package names must be registered;
   Google says ~99% were handled automatically and Play developers who
   completed identity verification are largely covered. There is nothing to
   remove for an app that is not published yet, so this is not a fire — but
   confirm it in the Console during account setup rather than assuming.
   <https://support.google.com/googleplay/android-developer/answer/17125096>

---

## Suggested order

1. **Today:** apply for the D-U-N-S number.
2. **While waiting:** FCM push, the target-API check, the AD_ID check, the
   512 icon, the keystore backup, the 80-character short description.
3. **D-U-N-S arrives:** create the organization account, pay the $25, submit
   verification.
4. **Account verified:** create the app, upload the AAB to internal testing,
   put Janell and Lauren on it, and confirm push actually arrives on an
   Android phone. Nobody on the team has one — this may need borrowing.
5. **Then:** the App content declarations, the listing, and promote to
   production.

The iOS submission is independent of all of this and is already in review.
