import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { onLoadError } from '@/lib/loadError';
import { COMMON_ZONES } from '@/lib/tz';
import { Screen, Display, H3, Small, Tiny, Card, Eyebrow, Rule, Row, Button, Wrap } from '@/components/ui';
import { NotificationSettings } from '@/components/notifications';
import { space, color } from '@/lib/theme';

export default function You() {
  const { profile, isAdmin, signOut, setTimezone } = useSession();
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  if (!profile) return null;

  return (
    <Screen>
      <Eyebrow>Co-host · Fall 2026</Eyebrow>
      <Display>{profile.display_name}</Display>
      <Rule style={{ marginVertical: space.md }} />

      <Card tone="blush" onPress={() => router.push('/(member)/prayer')}>
        <Eyebrow>This week</Eyebrow>
        <H3 style={{ marginBottom: 4 }}>Anything we can pray for?</H3>
        <Small>Goes only to Janell and the team →</Small>
      </Card>

      {/* A Message, beside prayer requests rather than a kind of one: pastorally
          different. Goes to leadership only, and deliberately one way. */}
      <Card testID="open-reach-out" onPress={() => router.push('/(member)/reach-out')}>
        <Eyebrow>Anything else</Eyebrow>
        <H3 style={{ marginBottom: 4 }}>Reach out to us</H3>
        <Small>Send us a note here →</Small>
      </Card>

      <Card onPress={() => router.push('/(member)/note')}>
        <Eyebrow>Your notes</Eyebrow>
        <H3 style={{ marginBottom: 4 }}>Everything we've sent</H3>
        <Small>Kept here so you can come back to it →</Small>
      </Card>

      <Card>
        <Eyebrow>Time zone</Eyebrow>
        <Row style={{ justifyContent: 'space-between' }}>
          <Small>{profile.timezone.replace('_', ' ')}</Small>
          <Tiny style={{ textDecorationLine: 'underline' }} onPress={() => setPicking(!picking)}>
            {picking ? 'Close' : 'Change'}
          </Tiny>
        </Row>
        {picking ? (
          <View style={{ marginTop: space.md }}>
            <Wrap>
              {COMMON_ZONES.map((z) => (
                <View key={z.id} testID={`tz-${z.id}`}>
                  <Tiny
                    onPress={() => { setTimezone(z.id); setPicking(false); }}
                    style={{
                      borderWidth: 1, borderColor: profile.timezone === z.id ? color.ink : color.line,
                      borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12,
                      color: profile.timezone === z.id ? color.ink : color.muted,
                    }}
                  >
                    {z.label}
                  </Tiny>
                </View>
              ))}
            </Wrap>
          </View>
        ) : null}
        <Rule style={{ marginVertical: space.md }} />
        <Tiny>Every time in the app is shown in this zone.</Tiny>
      </Card>

      <NotificationSettings />

      {isAdmin ? (
        <Button label="Open admin portal" variant="outline" onPress={() => router.replace('/(admin)/overview')} />
      ) : null}
      <View style={{ height: 10 }} />
      {/* outline, not quiet: this is the only way out of the app, and at `quiet`
          it read as a footnote. signOut clears the session state and then
          rethrows if Amplify failed; leave for the start screen either way. */}
      <Button
        testID="signout"
        label="Sign out"
        variant="outline"
        onPress={() => {
          signOut().catch(onLoadError).finally(() => router.replace('/'));
        }}
      />
      {/* Was underlined text with no handler — it promised something the app
          could not do, which is a Guideline 2.1 problem on its own. */}
      <Tiny
        testID="open-delete-account"
        onPress={() => router.push('/(member)/delete-account')}
        style={{ textAlign: 'center', marginTop: space.lg, textDecorationLine: 'underline' }}
      >
        Delete my account and data
      </Tiny>
    </Screen>
  );
}
