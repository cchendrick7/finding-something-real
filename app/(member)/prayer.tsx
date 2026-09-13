import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { submitPrayer } from '@/lib/data';
import { Screen, H1, H2, Body, Tiny, Rule, Button, Field, Eyebrow } from '@/components/ui';
import { space } from '@/lib/theme';

export default function Prayer() {
  const { profile } = useSession();
  const router = useRouter();
  const [body, setBody] = useState('');
  const [done, setDone] = useState(false);
  if (!profile) return null;

  if (done) {
    return (
      <Screen>
        <Eyebrow>Received</Eyebrow>
        <H1>Thank you for telling us.</H1>
        <Rule />
        <Body style={{ marginBottom: space.lg }}>We're praying this week.</Body>
        <Button label="Back to home" variant="outline" onPress={() => router.replace('/(member)/home')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Tiny onPress={() => router.back()} style={{ marginBottom: space.md }}>← Back</Tiny>
      <H2>Anything we can be praying for this week?</H2>
      <Body style={{ marginBottom: space.lg }}>
        This goes to Janell and the Finding Something Real team. No one else sees it — not other
        co-hosts, not the group.
      </Body>
      <Field value={body} onChangeText={setBody} multiline testID="prayer-body"
             placeholder="However you want to say it." />
      <Button testID="prayer-send" label="Send" disabled={!body.trim()}
              onPress={async () => { await submitPrayer(profile.id, body.trim()); setDone(true); }} />
      <Tiny style={{ textAlign: 'center', marginTop: space.md }}>
        You can skip this. It comes around again next week.
      </Tiny>
    </Screen>
  );
}
