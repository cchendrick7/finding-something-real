import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen, Display, Body, Small, Tiny, Card, Eyebrow, Rule,
} from '@/components/ui';
import { space, color } from '@/lib/theme';
import { onLoadError } from '@/lib/loadError';

const open = (url: string) => { Linking.openURL(url).catch(onLoadError); };

/**
 * The public account-deletion page.
 *
 * Google Play requires BOTH an in-app deletion path and a publicly reachable
 * web URL where deletion can be requested — the web one because someone who
 * has already uninstalled the app has no in-app path left. This is that URL:
 *
 *   https://<host>/(public)/delete-request
 *
 * It lives under (public) on purpose. A deletion page behind a login is not a
 * deletion page.
 */
export default function DeleteRequest() {
  const router = useRouter();

  return (
    <Screen>
      <Tiny onPress={() => router.replace('/(public)/listen')} style={{ marginBottom: space.sm }}>
        ← Back to the podcast
      </Tiny>
      <Eyebrow>Finding Something Real</Eyebrow>
      <Display style={{ fontSize: 30, lineHeight: 34 }}>Delete your account</Display>
      <Rule style={{ marginVertical: space.md }} />

      <Body>
        Only co-hosts have accounts. If you have only ever listened to the podcast,
        there is nothing to delete — the app stores nothing about you.
      </Body>

      <Card tone="wash" style={{ marginTop: space.lg }}>
        <Eyebrow>If you still have the app</Eyebrow>
        <Small>
          Open the app, go to <Small style={{ color: color.ink }}>You</Small>, and tap
          “Delete my account and data”. It happens immediately and needs nobody's
          approval.
        </Small>
      </Card>

      <Card tone="gold" style={{ marginTop: space.md }}>
        <Eyebrow tone="#8A6D28">If you have already uninstalled it</Eyebrow>
        <Small>
          Email the address below from the account you signed up with. Your data is
          removed within 30 days, and usually the same week.
        </Small>
        <Tiny
          onPress={() => open('mailto:hello@findingsomethingreal.com?subject=Delete%20my%20account')}
          style={{ marginTop: 10, textDecorationLine: 'underline', color: color.ink }}
        >
          hello@findingsomethingreal.com
        </Tiny>
      </Card>

      <Eyebrow style={{ marginTop: space.xl }}>What is removed</Eyebrow>
      {[
        'Your profile, name and email address',
        'Your sign-in',
        'Every session reply you have given',
        'Your prayer requests',
        'Questions you submitted',
        'Which notes you have opened',
      ].map((t) => <Small key={t} style={{ marginTop: 5 }}>· {t}</Small>)}

      <Eyebrow style={{ marginTop: space.lg }}>What is kept</Eyebrow>
      <Small style={{ marginTop: 5 }}>
        Published episodes and the ministry's own recordings and notes. None of that
        identifies you.
      </Small>

      <Small style={{ textAlign: 'center', marginTop: space.xl, color: color.faint }}>
        Finding Something Real Ministry · EIN 39-4515803
      </Small>
    </Screen>
  );
}
