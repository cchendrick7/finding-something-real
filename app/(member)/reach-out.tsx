import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { sendMessage } from '@/lib/data';
import { Screen, H1, H2, Body, Small, Tiny, Rule, Button, Field, Eyebrow } from '@/components/ui';
import { space } from '@/lib/theme';
import { onLoadError } from '@/lib/loadError';

// "Reach out" — a note to leadership. A Message is its own model beside
// PrayerRequest, not a kind of one: pastorally they are different things.
// Leadership only, and deliberately one way: there is no thread to reply in,
// and the screen says how an answer would come instead.
export default function ReachOut() {
  const { profile } = useSession();
  const router = useRouter();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  if (!profile) return null;

  async function send() {
    if (!profile || !body.trim()) return;
    setSending(true);
    try {
      await sendMessage(profile.id, body.trim());
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <Screen>
        <Eyebrow>Sent</Eyebrow>
        <H1>What you share matters.</H1>
        <Rule />
        <Body style={{ marginBottom: space.lg }}>
          Thanks for taking the time to share this with us. Janell will see your note, and if a
          response is needed she'll come back to you — as a note here in the app, by text or phone,
          or at an upcoming recording. Either way, know it has been received and read.
        </Body>
        <Button label="Back" variant="outline" onPress={() => router.replace('/(member)/you')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Tiny onPress={() => router.back()} style={{ marginBottom: space.md }}>← Back</Tiny>
      <H2>Need to reach one of us?</H2>
      <Body style={{ marginBottom: space.md }}>
        Anything at all — a scheduling problem, something you'd rather say before a recording than
        during one, or just checking in.
      </Body>
      <Small style={{ marginBottom: space.lg }}>
        This goes to Janell and the Finding Something Real team. No other co-host sees it.
      </Small>
      <Field value={body} onChangeText={setBody} multiline testID="message-body"
             placeholder="However you want to say it." />
      <Button
        testID="message-send"
        label={sending ? 'Sending…' : 'Send'}
        disabled={sending || !body.trim()}
        onPress={() => { send().catch(onLoadError); }}
      />
      <Tiny style={{ textAlign: 'center', marginTop: space.md }}>
        If something is urgent, text Janell — she'd rather you did.
      </Tiny>
    </Screen>
  );
}
