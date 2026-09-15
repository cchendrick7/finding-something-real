import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen, Display, H3, Body, Small, Tiny, Card, Eyebrow, Rule,
} from '@/components/ui';
import { space, color } from '@/lib/theme';
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
      <Eyebrow>Last updated 15 September 2026</Eyebrow>
      <Display style={{ fontSize: 30, lineHeight: 34 }}>Privacy</Display>
      <Rule style={{ marginVertical: space.md }} />

      <Card tone="sage">
        <Eyebrow>The short version</Eyebrow>
        <Body>
          If you are here to listen, we collect nothing about you at all — no account,
          no analytics, no advertising, no tracking. Only invited co-hosts have
          accounts, and what we hold for them is listed below.
        </Body>
      </Card>

      <H3 style={{ marginTop: space.xl }}>If you only listen</H3>
      <Body style={{ marginTop: 6 }}>
        The episode list is public information from our YouTube channel. The app does
        not create an identifier for you, does not track you across apps or websites,
        and contains no advertising or analytics software of any kind. Tapping an
        episode opens YouTube, and from that point YouTube's own privacy policy
        applies.
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
        The podcast is made for adults and co-hosts are adults. The app is not directed
        at children and we do not knowingly collect information from anyone under 13.
      </Body>

      <H3 style={{ marginTop: space.lg }}>Asking us</H3>
      <Body style={{ marginTop: 6 }}>
        For a copy of what we hold, a correction, or anything else:
      </Body>
      <Tiny
        onPress={() => open('mailto:hello@findingsomethingreal.com?subject=Privacy')}
        style={{ marginTop: 10, textDecorationLine: 'underline', color: color.ink }}
      >
        hello@findingsomethingreal.com
      </Tiny>

      <Small style={{ textAlign: 'center', marginTop: space.xxl, color: color.faint }}>
        Finding Something Real Ministry · EIN 39-4515803
      </Small>
    </Screen>
  );
}
