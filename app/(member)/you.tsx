import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { COMMON_ZONES } from '@/lib/tz';
import { Screen, Display, H3, Small, Tiny, Card, Eyebrow, Rule, Pill, Row, Button, Wrap } from '@/components/ui';
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

      <Card>
        <Eyebrow>Notifications</Eyebrow>
        <Row style={{ justifyContent: 'space-between' }}>
          <Small>Push notifications</Small><Pill label="On" tone="ink" />
        </Row>
        <Rule style={{ marginVertical: space.md }} />
        <Tiny>
          Quiet hours 9pm–8am your time for general messages. Reminders before a recording
          always come through. Janell and Lauren can see when you open a message.
        </Tiny>
      </Card>

      {isAdmin ? (
        <Button label="Open admin portal" variant="outline" onPress={() => router.replace('/(admin)/overview')} />
      ) : null}
      <View style={{ height: 10 }} />
      {/* outline, not quiet: this is the only way out of the app, and at `quiet`
          it read as a footnote. signOut is awaited — navigating first left the
          Cognito session half-cleared. */}
      <Button
        testID="signout"
        label="Sign out"
        variant="outline"
        onPress={async () => { await signOut(); router.replace('/'); }}
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
