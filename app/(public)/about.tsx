import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen, Display, H3, Body, Small, Tiny, Card, Eyebrow, Rule, Strong,
} from '@/components/ui';
import { space, color } from '@/lib/theme';
import { onLoadError } from '@/lib/loadError';

const open = (url: string) => { Linking.openURL(url).catch(onLoadError); };

/**
 * What the ministry is, for someone who has never heard of it.
 *
 * The words are Janell's own (build 15) — keep them exactly as she wrote them,
 * including REAL in capitals and the acrostic picked out with Strong. A
 * stranger who installed the app off a YouTube link should hear who is
 * talking, who it is for, and how to get in touch; everything longer lives on
 * the website.
 */
export default function About() {
  const router = useRouter();
  return (
    <Screen>
      <Eyebrow>A 501(c)(3) ministry</Eyebrow>
      <Display style={{ fontSize: 30, lineHeight: 36 }}>Finding Something REAL</Display>
      <Rule style={{ marginVertical: space.md }} />

      <Body>
        Finding Something REAL is a podcast and ministry creating space for young women to
        ask honest questions about faith, life, identity, and what they actually believe.
      </Body>
      <Body style={{ marginTop: space.md }}>
        Each season, a small cohort of young women in their late teens and twenties joins
        Janell Wood as co-hosts. They come from different backgrounds and different places
        spiritually — some deeply committed to their Christian faith, some questioning, some
        skeptical, and some still figuring out what they believe.
      </Body>
      <Body style={{ marginTop: space.md }}>
        Their stories and questions shape the conversations we have throughout the season:
        questions about God, identity, doubt, relationships, church hurt, suffering, culture,
        purpose, and what it really means to follow Jesus.
      </Body>

      <H3 style={{ marginTop: space.xl }}>The Format</H3>
      <Body style={{ marginTop: 6 }}>Nothing is scripted.</Body>
      <Body style={{ marginTop: space.sm }}>
        Our co-hosts bring the questions they are genuinely wrestling with, and those
        questions help shape each season. Janell is joined by Christian thinkers, authors,
        pastors, apologists, and other guests who bring their own experience and expertise
        to the conversation.
      </Body>

      <Card tone="sage" style={{ marginTop: space.lg }}>
        <Body>
          We believe that <Strong>R</Strong>estoration, <Strong>E</Strong>ternity,{' '}
          <Strong>A</Strong>uthenticity, and <Strong>L</Strong>ove are ultimately found in
          Jesus Christ. But honest questions are welcome here. So are disagreement,
          uncertainty, and doubt.
        </Body>
      </Card>
      <Body style={{ marginTop: space.lg }}>
        This isn't about winning arguments. It's about making room for conversations that
        are thoughtful, compassionate, and real.
      </Body>

      <H3 style={{ marginTop: space.xl }}>Who Is It For?</H3>
      <Body style={{ marginTop: 6 }}>
        FSR is especially for young women who are asking big questions.
      </Body>
      <Body style={{ marginTop: space.sm }}>
        Maybe you love Jesus and want to know Him more deeply. Maybe you grew up around
        Christianity but aren't sure what you believe anymore. Maybe you've been hurt by the
        church. Maybe you don't consider yourself religious at all.
      </Body>
      <Body style={{ marginTop: space.sm }}>
        You don't have to have your faith figured out before you listen.
      </Body>
      <Display style={{ fontSize: 26, lineHeight: 32, marginTop: space.md }}>Come curious.</Display>

      <H3 style={{ marginTop: space.xl }}>The Cohort Experience</H3>
      <Body style={{ marginTop: 6 }}>
        Each season begins with a small group of young women gathering in person near
        Chelan, Washington, for a few days together before the podcast season begins.
      </Body>
      <Body style={{ marginTop: space.sm }}>
        We eat together, laugh, talk, ask questions, and get to know one another before
        microphones ever become the focus.
      </Body>

      {/* The way in is to get in touch — not to apply through an app. */}
      <Card tone="wash" style={{ marginTop: space.lg }}>
        <Body>
          Cohorts are intentionally small and invited one season at a time. If being part of
          a future FSR cohort sounds like something you'd be interested in, we'd genuinely
          love to hear from you.
        </Body>
        <Tiny
          testID="about-interest"
          onPress={() => router.push('/(public)/interest')}
          style={{ marginTop: 12, textDecorationLine: 'underline', color: color.ink }}
        >
          Get in touch →
        </Tiny>
      </Card>

      <Card tone="wash" style={{ marginTop: space.lg }}>
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
