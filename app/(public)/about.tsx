import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen, Display, H3, Body, Small, Tiny, Card, Eyebrow, Rule,
} from '@/components/ui';
import { space, color } from '@/lib/theme';
import { onLoadError } from '@/lib/loadError';

const open = (url: string) => { Linking.openURL(url).catch(onLoadError); };

/**
 * What the ministry is, for someone who has never heard of it.
 *
 * Deliberately not a wall of copy: a stranger who installed the app off a
 * YouTube link needs to know who is talking, who it is for, and what happens
 * if they want in. Everything longer lives on the website.
 */
export default function About() {
  const router = useRouter();
  return (
    <Screen>
      <Eyebrow>A 501(c)(3) ministry</Eyebrow>
      <Display style={{ fontSize: 32, lineHeight: 36 }}>What this is</Display>
      <Rule style={{ marginVertical: space.md }} />

      <Body>
        Finding Something Real is a podcast and ministry for young women working out
        what they actually believe. Each season, a cohort of women in their late teens
        and twenties co-host alongside Janell Wood — asking about identity, doubt,
        church hurt, relationships and what following Jesus looks like now.
      </Body>

      <Card tone="sage" style={{ marginTop: space.lg }}>
        <Eyebrow>The format</Eyebrow>
        <Body>
          Nothing is scripted and nobody is handed an answer. The questions come from
          the co-hosts themselves, collected before the season starts, and each one gets
          its own episode.
        </Body>
      </Card>

      <H3 style={{ marginTop: space.xl }}>Who it is for</H3>
      <Body style={{ marginTop: 6 }}>
        Anyone with real questions and no interest in being managed. You do not have to
        believe anything to listen, and you will not be asked to.
      </Body>

      <H3 style={{ marginTop: space.lg }}>Retreats</H3>
      <Body style={{ marginTop: 6 }}>
        Each cohort begins with a few days together near Chelan, Washington. No pressure
        to speak, no pressure to share.
      </Body>

      <H3 style={{ marginTop: space.lg }}>Becoming a co-host</H3>
      <Body style={{ marginTop: 6 }}>
        Cohorts are small and invited a season at a time. If that is something you would
        want, the way in is to get in touch — not to apply through an app.
      </Body>

      <Card tone="wash" style={{ marginTop: space.xl }}>
        <Eyebrow>Find the ministry</Eyebrow>
        {[
          ['The website', 'https://www.findingsomethingreal.com/'],
          ['YouTube', 'https://www.youtube.com/@findingsomethingreal'],
        ].map(([label, url]) => (
          <Tiny
            key={url}
            onPress={() => open(url)}
            style={{ marginTop: 10, textDecorationLine: 'underline', color: color.ink }}
          >
            {label}
          </Tiny>
        ))}
      </Card>

      <Tiny
        onPress={() => router.push('/(public)/privacy')}
        style={{ textAlign: 'center', marginTop: space.xl, textDecorationLine: 'underline' }}
      >
        Privacy
      </Tiny>

      <Small style={{ textAlign: 'center', marginTop: space.md, color: color.faint }}>
        Finding Something Real Ministry · EIN 39-4515803
      </Small>
    </Screen>
  );
}
