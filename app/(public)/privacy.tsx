import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen, Display, H3, Body, Small, Tiny, Card, Eyebrow, Rule,
} from '@/components/ui';
import { space, color } from '@/lib/theme';
import { SUPPORT_EMAIL } from '@/lib/ministry';
import { onLoadError } from '@/lib/loadError';

const open = (url: string) => { Linking.openURL(url).catch(onLoadError); };

/**
 * The privacy policy, at a URL that always works.
 *
 * Both stores require a reachable privacy policy before a listing can be
 * submitted, and it has to describe what the app ACTUALLY collects. Hosting it
 * inside the app's own public tier means the URL can never drift from the
 * build the way a page on a separate website can:
 *
 *   https://<host>/(public)/privacy
 *
 * Every claim below is checked against amplify/data/resource.ts. If a field is
 * added to a model that holds personal data, this page is part of the change.
 */
export default function Privacy() {
  const router = useRouter();

  return (
    <Screen>
      <Tiny onPress={() => router.replace('/(public)/listen')} style={{ marginBottom: space.sm }}>
        ← Back to the podcast
      </Tiny>
      <Eyebrow>Last updated 26 September 2026</Eyebrow>
      <Display style={{ fontSize: 30, lineHeight: 34 }}>Privacy</Display>
      <Rule style={{ marginVertical: space.md }} />

      <Card tone="sage">
        <Eyebrow>The short version</Eyebrow>
        <Body>
          If you are here to listen, we collect nothing about you at all — no account,
          no analytics, no advertising, no tracking. The only thing the app ever asks a
          listener for is contact details, and only if you choose to tell us you are
          interested in a future cohort. Beyond that, only invited co-hosts have
          accounts, and what we hold for them is listed below.
        </Body>
      </Card>

      <H3 style={{ marginTop: space.xl }}>If you only listen</H3>
      <Body style={{ marginTop: 6 }}>
        The episode list is public information from our YouTube channel. The app does
        not create an identifier for you, does not track you across apps or websites,
        and contains no advertising or analytics software of any kind.
      </Body>

      {/* Build 8: episodes play in the app now, so this is no longer "tapping opens YouTube". */}
      <H3 style={{ marginTop: space.lg }}>When you play an episode</H3>
      <Body style={{ marginTop: 6 }}>
        Episodes play inside the app using YouTube's own embedded player, because the
        episodes live on YouTube and their terms allow no other player. That player is
        YouTube's software running inside a window here, so while an episode is playing
        YouTube can see what a visit to youtube.com would show them — and from that point
        their privacy policy applies, not ours. We are not told what you played, and we
        receive nothing back from it.
      </Body>

      {/* lib/library.tsx: on the device only. A new phone starts empty, and we say so. */}
      <H3 style={{ marginTop: space.lg }}>What the app remembers for you</H3>
      <Body style={{ marginTop: 6 }}>
        The app keeps the episodes you save, the ones you have finished and how far into
        each one you got. All of it is stored on your phone and nowhere else. It is never
        sent to us, we have no way to read it, and no account is involved — which also
        means it does not follow you to a new phone, and deleting the app deletes it.
      </Body>

      {/* Build 18: listeners can opt in to new-episode announcements, stored against no profile. */}
      <H3 style={{ marginTop: space.lg }}>If you turn on episode notifications</H3>
      <Body style={{ marginTop: 6 }}>
        You can ask to be told when a new episode goes up without having an account. If
        you do, we store one thing: a notification token issued by Apple for that phone.
        It is not linked to a name, an email address or anything else, it is used for
        nothing but sending you that announcement, and switching notifications off in
        the app deletes it.
      </Body>

      {/* Build 15: the interest form (lib/interest.ts, Inquiry model). Two-year retention. */}
      <H3 style={{ marginTop: space.lg }}>If you ask about a future cohort</H3>
      <Body style={{ marginTop: 6 }}>
        The About screen and the co-host sign-in both offer a way to tell us you would
        like to be part of a future cohort. If you use it, we receive your name, your
        email address, a phone number if you chose to give one, and anything you wrote.
        The phone number is optional and nothing is worse for leaving it out.
      </Body>
      <Body style={{ marginTop: space.sm }}>
        It is used for one thing: so Janell or someone on the team can get back to you
        about a cohort. It is not added to a mailing list, not used for advertising, not
        shared with anyone outside the ministry, and not sold to anybody, ever. No account
        is created for you and nothing else in the app changes.
      </Body>
      <Body style={{ marginTop: space.sm }}>
        We keep it for up to two years, because cohorts are invited a season at a time
        and the next one may not be the right one. After that it is deleted. You can ask
        us to delete it sooner at any point, for any reason or none, by emailing the
        address at the bottom of this page — and we will, without asking you why.
      </Body>

      <H3 style={{ marginTop: space.lg }}>If you are a co-host</H3>
      <Body style={{ marginTop: 6 }}>
        Accounts are created by the ministry for invited co-hosts. There is no public
        sign-up. We store:
      </Body>
      {[
        ['Your name and email address', 'so we can identify you and sign you in'],
        ['Your time zone', 'so session times are shown in your own, and so we can see when a recording falls in the middle of your night'],
        ['Your replies to session invitations', 'yes, no, and any note you add'],
        ['Questions you submit', 'the ones that shape the season, and any you ask for a session you cannot attend'],
        ['Prayer requests you send', 'in your own words'],
        ['Which messages you have opened', 'so leadership knows whether an announcement reached people'],
        ['A notification token for your phone', 'only if you turn notifications on — it is what lets us reach your lock screen, and turning them off deletes it'],
      ].map(([what, why]) => (
        <Small key={what} style={{ marginTop: 8 }}>
          <Small style={{ color: color.ink }}>{what}</Small> — {why}
        </Small>
      ))}

      <Card tone="gold" style={{ marginTop: space.lg }}>
        <Eyebrow tone="#8A6D28">Prayer requests</Eyebrow>
        <Body>
          These are read by Janell and the leadership team, and by nobody else. Other
          co-hosts cannot see them — not through the app, and not by asking it
          differently. That restriction is enforced by the server, not by the screens,
          and it is tested on every change.
        </Body>
      </Card>

      <H3 style={{ marginTop: space.xl }}>What other co-hosts can see</H3>
      <Body style={{ marginTop: 6 }}>
        Only your name, and only on sessions you said yes to. If you decline, or never
        reply, no other co-host is shown anything. Your email address, your time zone,
        your prayer requests and your notes are never visible to your peers.
      </Body>

      <H3 style={{ marginTop: space.lg }}>What we never do</H3>
      <Body style={{ marginTop: 6 }}>
        We do not sell or share your information. We do not use it for advertising.
        There are no third-party analytics, advertising or tracking tools in this app.
        We do not collect your location, contacts, photos, or anything from your device.
      </Body>

      <H3 style={{ marginTop: space.lg }}>Where it is held</H3>
      <Body style={{ marginTop: 6 }}>
        On Amazon Web Services in the United States, in an account controlled by the
        ministry. Data is encrypted in transit and at rest.
      </Body>
      <Body style={{ marginTop: 10 }}>
        One exception, and it is the only time anything leaves that account: sending a
        notification means handing your phone's notification token, the title and the
        line of text to Expo, who pass it to Apple. Nothing else goes with it — not your
        name, not your email, and never the contents of a prayer request. If you have
        notifications switched off, this never happens at all.
      </Body>

      <H3 style={{ marginTop: space.lg }}>Deleting it</H3>
      <Body style={{ marginTop: 6 }}>
        Open the app, go to You, and tap "Delete my account and data". Everything above
        is removed immediately, including your sign-in, and it cannot be recovered. If
        you have already uninstalled the app, email us and we will do it for you.
      </Body>
      <Tiny
        onPress={() => router.push('/(public)/delete-request')}
        style={{ marginTop: 10, textDecorationLine: 'underline', color: color.ink }}
      >
        How to delete your account →
      </Tiny>

      <H3 style={{ marginTop: space.lg }}>Children</H3>
      <Body style={{ marginTop: 6 }}>
        The podcast and the app are made for adults and for young women in their late
        teens. They are not directed at children, the app never asks anyone's age, and
        we do not knowingly collect information from anyone under 13. If you believe a
        child under 13 has sent us something, email us and we will delete it.
      </Body>

      <H3 style={{ marginTop: space.lg }}>Asking us</H3>
      <Body style={{ marginTop: 6 }}>
        For a copy of what we hold, a correction, or anything else:
      </Body>
      <Tiny
        onPress={() => open(`mailto:${SUPPORT_EMAIL}?subject=Privacy`)}
        style={{ marginTop: 10, textDecorationLine: 'underline', color: color.ink }}
      >
        {SUPPORT_EMAIL}
      </Tiny>

      <Small style={{ textAlign: 'center', marginTop: space.xxl, color: color.faint }}>
        Finding Something Real Ministry · EIN 39-4515803
      </Small>
    </Screen>
  );
}
