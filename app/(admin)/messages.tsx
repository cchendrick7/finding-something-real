import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { listMessages } from '@/lib/data';
import { formatDate, formatTime } from '@/lib/tz';
import { Screen, Display, Body, Small, Tiny, Card, Eyebrow, Rule, Button } from '@/components/ui';
import { space, color } from '@/lib/theme';
import { onLoadError } from '@/lib/loadError';
import type { Profile } from '@/lib/types';

type MessageRow = {
  id: string;
  profile_id: string;
  body: string;
  submitted_at: string;
  author?: Profile;
};

/**
 * "Reach out" messages from co-hosts.
 *
 * A Message model of its own beside PrayerRequest, not a kind field on it: a
 * prayer request and "can one of you call me" are pastorally different things
 * and are read differently. Leadership only in both directions, like prayer.
 *
 * Deliberately one way, and her screen says so: there is no conversation
 * thread. The answer goes back as an ordinary note, by text, or in person.
 */
export default function Messages() {
  const { profile } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<MessageRow[]>([]);
  // Separate from rows.length so "Nothing waiting" never flashes before the load.
  const [loaded, setLoaded] = useState(false);
  useFocusEffect(useCallback(() => {
    listMessages()
      .then((r) => { setRows(r); setLoaded(true); })
      .catch(onLoadError);
  }, []));
  if (!profile) return null;
  const tz = profile.timezone;

  return (
    <Screen>
      <Eyebrow>Leadership only</Eyebrow>
      <Display style={{ fontSize: 32, lineHeight: 36 }}>Messages</Display>
      <Rule style={{ marginVertical: space.md }} />
      <Card tone="wash">
        <Eyebrow>How these work</Eyebrow>
        <Small>
          A co-host tapped "Reach out to one of us". Reply here and she gets it as a note in the
          app — or answer by text or at the next recording, whichever fits. For anything
          time-sensitive, text her: a note only reaches her when she opens the app.
        </Small>
      </Card>

      {loaded ? null : <Body>Loading…</Body>}
      {loaded && rows.length === 0 ? (
        <Card tone="wash" testID="messages-empty">
          <Eyebrow>Nothing waiting</Eyebrow>
          <Small>When someone reaches out, it appears here.</Small>
        </Card>
      ) : null}

      {rows.map((m) => (
        <Card key={m.id} testID={`message-${m.id}`}>
          <Eyebrow>
            {m.author?.display_name ?? 'Unknown'} · {formatDate(m.submitted_at, tz)} ·{' '}
            {formatTime(m.submitted_at, tz)}
          </Eyebrow>
          <Body style={{ marginBottom: space.md }}>{m.body}</Body>
          {/* A reply is an ordinary note addressed to her alone: Notes opens
              with "Specific people" and just her picked. */}
          <Button
            testID={`reply-${m.id}`}
            label="Reply with a note"
            variant="outline"
            onPress={() => router.push(`/(admin)/notes?to=${m.profile_id}`)}
          />
        </Card>
      ))}

      {/* Not a tab, so there is no tab to go back to. */}
      <Tiny
        onPress={() => router.replace('/(admin)/overview')}
        style={{ textAlign: 'center', marginTop: space.xl, textDecorationLine: 'underline', color: color.muted }}
      >
        ← Back to overview
      </Tiny>
    </Screen>
  );
}
