import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import {
  Screen, Display, Body, Small, Tiny, Card, Eyebrow, Rule, Button,
} from '@/components/ui';
import { space, color } from '@/lib/theme';

/**
 * The door to the private half — a door, not a wall.
 *
 * A stranger who lands here should understand in one screen that this part is
 * not for them yet, and that nothing they came for is behind it. Someone who
 * IS a co-host should find the way in immediately.
 */
export default function CoHost() {
  const { profile, isAdmin, loading } = useSession();
  const router = useRouter();

  return (
    <Screen>
      <Eyebrow>For this season's cohort</Eyebrow>
      <Display style={{ fontSize: 32, lineHeight: 36 }}>Co-hosts</Display>
      <Rule style={{ marginVertical: space.md }} />

      {loading ? <Body>Loading…</Body> : profile ? (
        <>
          <Card tone="sage">
            <Eyebrow>Signed in as {profile.display_name}</Eyebrow>
            <Body>You're already in.</Body>
          </Card>
          <Button
            testID="go-to-app"
            label={isAdmin ? 'Open the leadership portal' : 'Open my co-host app'}
            onPress={() => router.replace(isAdmin ? '/(admin)/overview' : '/(member)/home')}
          />
        </>
      ) : (
        <>
          <Body>
            If you're co-hosting this season, this is where you'll find your recording
            schedule, the questions going out, and notes from Janell.
          </Body>

          <Card tone="wash" style={{ marginTop: space.lg }}>
            <Eyebrow>Invitation only</Eyebrow>
            <Small>
              Accounts are set up by the ministry when a cohort starts — there's nothing
              to sign up for here. Everything else in the app is open to everyone,
              no account needed.
            </Small>
          </Card>

          <Button
            testID="go-sign-in"
            label="Sign in"
            variant="outline"
            onPress={() => router.push('/sign-in')}
          />
          <Tiny style={{ textAlign: 'center', marginTop: space.md, color: color.faint }}>
            Invited and can't get in? Ask Janell or Lauren to re-send your details.
          </Tiny>
        </>
      )}
    </Screen>
  );
}
