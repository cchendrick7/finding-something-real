# Store submission pack

Everything the two consoles ask for, answered. The privacy answers are derived
from `amplify/data/resource.ts` and a dependency audit, not from memory — if a
field is added to a model that holds personal data, this file is part of that
change.

**Bundle identifier (both stores):** `com.findingsomethingreal.app`
**Privacy policy URL:** `https://<host>/(public)/privacy`
**Account deletion URL:** `https://<host>/(public)/delete-request`
**Support email:** `hello@findingsomethingreal.com`

---

## Listing copy

**App name (30 char max):** `Finding Something Real`
**Subtitle (30 char max):** `Honest questions about faith`

**Promotional text (170 max, changeable without review):**

> New episodes every Wednesday. Season 8 is out now — real conversations with
> young women working out what they actually believe.

**Description:**

> Finding Something Real is a podcast and ministry for young women working out
> what they actually believe.
>
> Each season a cohort of women in their late teens and twenties co-hosts
> alongside Janell Wood, asking about identity, doubt, church hurt,
> relationships, and what following Jesus looks like now. Nothing is scripted
> and nobody is handed an answer — the questions come from the co-hosts
> themselves, and each one gets its own episode.
>
> In the app:
>
> • Every episode, free, no account needed
> • Short clips when you have two minutes instead of an hour
> • Who we are, who it is for, and how the cohorts work
>
> Co-hosts for the current season can sign in to see their recording schedule,
> reply to invitations, send in questions, and read notes from Janell. Accounts
> are issued by the ministry — there is nothing to sign up for, and everything
> else in the app is open to everyone.
>
> Finding Something Real Ministry is a registered 501(c)(3) nonprofit.

**Keywords (100 char, comma separated, no spaces):**

`faith,podcast,christian,apologetics,doubt,women,bible,jesus,devotional,questions,ministry,belief`

**Category:** Primary *Education*, Secondary *Lifestyle*.
Not "Reference". Education fits a discussion podcast better and is a less
crowded chart.

**Age rating:** 12+. The podcast discusses church hurt, doubt and relationships
frankly. Answer Apple's questionnaire as *Infrequent/Mild — Mature/Suggestive
Themes*; everything else None.

---

## App Review notes (paste into App Store Connect)

> Finding Something Real is the app for a Christian podcast ministry.
>
> **No account is needed for the main content.** The app opens on the episode
> library, which is public and requires no sign-in. About and the privacy
> policy are also open. Please review these first.
>
> **The Co-hosts tab is for a small invited group** — the women who co-host the
> current season. The ministry creates those accounts; there is no public
> sign-up, by design. A demo co-host account is below so you can see what is
> behind it.
>
> Demo co-host: `imani@fsr.test` / `FsrHost!2026aA`
> Demo leadership: `curtis@fsr.test` / `FsrLead!2026aA`
>
> Account deletion is in the app at You → "Delete my account and data", and
> also at <https://HOST/(public)/delete-request> for anyone who has
> uninstalled. Please do not delete the demo accounts — they are shared.
>
> The app contains no advertising, no analytics, and no third-party tracking.

---

## Apple — App Privacy

Answer **Yes** to collecting data, then:

| Data type | Collected | Linked to identity | Used for tracking | Purpose |
|---|---|---|---|---|
| Email address | Yes | Yes | No | App Functionality |
| Name | Yes | Yes | No | App Functionality |
| User Content — *Other* (prayer requests, questions, notes to leadership) | Yes | Yes | No | App Functionality |
| Other Usage Data (whether a message was opened) | Yes | Yes | No | App Functionality |

Everything else: **Not Collected.** Specifically not collected — location,
contacts, photos, health, financial info, browsing history, search history,
identifiers, purchases, diagnostics, advertising data.

**Tracking: No.** Verified by dependency audit — the app has no analytics,
advertising, attribution or crash-reporting SDK of any kind.

Time zone is stored but is not one of Apple's data types; it is not precise or
coarse location and should not be declared as such.

---

## Google Play — Data safety

- **Does your app collect or share any of the required user data types?** Yes
- **Is all of the user data collected by your app encrypted in transit?** Yes
- **Do you provide a way for users to request that their data is deleted?**
  Yes — and give the deletion URL above.

| Data type | Collected | Shared | Optional | Purpose |
|---|---|---|---|---|
| Personal info → Email address | Yes | No | Required | App functionality, Account management |
| Personal info → Name | Yes | No | Required | App functionality |
| Personal info → Other info (time zone) | Yes | No | Required | App functionality |
| Messages → Other in-app messages (prayer requests, questions) | Yes | No | Optional | App functionality |
| App activity → Other actions (message opened) | Yes | No | Required | App functionality |

Not collected: location, financial, health, photos, audio, files, contacts,
calendar, app activity beyond the above, web browsing, device identifiers.

**Data is not shared with any third party.** Amazon Web Services hosts it as a
processor, which Google does not count as sharing.

---

## Assets

| Asset | Where |
|---|---|
| iOS screenshots, 1320×2868 (6.9") | `store/ios/` |
| Play screenshots, 1080×1920 | `store/android/` |
| App icon 1024×1024 | `assets/icon.png` |
| Play icon 512×512 | `assets/android-icon-background.png` composited with foreground — or export from `assets/mkicon.py` |
| Play feature graphic 1024×500 | **Still to make** |

The app is **iPhone only** (`ios.supportsTablet: false`), so no iPad
screenshots are required. Reasoning in `docs/APP-STORE-DECISIONS.md`.

---

## Still outstanding

- Play feature graphic, 1024×500.
- Apple: the app record itself, and the two IDs that go in `eas.json`'s submit
  block (`ascAppId`, `appleTeamId`).
- Google Play: developer account. **Register as an organization** — new
  personal accounts must run a closed test with 12 testers for 14 continuous
  days before they can publish, and organizations are exempt.
- A real support page or inbox behind `hello@findingsomethingreal.com`. Apple
  checks that the support URL resolves.
