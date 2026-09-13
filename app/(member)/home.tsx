import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import {
  listRecordings, unreadNoteFor, listEpisodes, getGuest, getMyRsvp, setRsvp,
} from '@/lib/data';
import { formatDate, formatTime, zoneAbbr, isUnsociable } from '@/lib/tz';
import {
  Screen, Display, H2, H3, Body, Small, Tiny, Card, Eyebrow, Rule, Button, Pill, Row,
} from '@/components/ui';
import { color, space } from '@/lib/theme';
import type { Recording, Note, Episode, Guest, Rsvp } from '@/lib/types';
import { onLoadError } from '@/lib/loadError';

export default function Home() {
  const { profile } = useSession();
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [next, setNext] = useState<Recording | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [rsvp, setRsvpState] = useState<Rsvp | null>(null);
  const [ep, setEp] = useState<Episode | null>(null);

  const load = useCallback(() => {
    if (!profile) return;
    (async () => {
      setNote(await unreadNoteFor(profile.id));
      const recs = (await listRecordings(false)).filter((r) => new Date(r.scheduled_at) > new Date());
      const n = recs[0] ?? null;
      setNext(n);
      if (n) {
        setGuest(await getGuest(n.guest_id));
        setRsvpState(await getMyRsvp(n.id, profile.id));
      }
      setEp((await listEpisodes())[0] ?? null);
    })().catch(onLoadError);
  }, [profile]);

  useFocusEffect(load);
  if (!profile) return null;
  const tz = profile.timezone;

  async function answer(response: 'yes' | 'no') {
    if (!next || !profile) return;
    setRsvpState(await setRsvp(next.id, profile.id, response));
    if (response === 'no') router.push(`/(member)/session/${next.id}`);
  }

  return (
    <Screen>
      <Eyebrow>{formatDate(new Date().toISOString(), tz)}</Eyebrow>
      <Display>Hi, {profile.display_name}</Display>
      <Rule style={{ marginVertical: space.md }} />

      {note ? (
        <Card tone="ink" onPress={() => router.push('/(member)/note')}>
          <Row style={{ marginBottom: 10 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color.gold }} />
            <Text_ eyebrow>A note for you</Text_>
          </Row>
          <H2 style={{ color: color.white }}>{note.title}</H2>
          <Small style={{ color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>From Janell</Small>
        </Card>
      ) : null}

      {next ? (
        <>
          <Eyebrow>Next recording</Eyebrow>
          <Card>
            <Row style={{ marginBottom: 8 }}>
              <Small>{formatDate(next.scheduled_at, tz)}</Small>
              <Small>·</Small>
              <Small>{formatTime(next.scheduled_at, tz)} {zoneAbbr(next.scheduled_at, tz)}</Small>
            </Row>
            <H3>{next.title}</H3>
            {guest ? <Small style={{ marginTop: 4 }}>with {guest.name}</Small> : null}

            {isUnsociable(next.scheduled_at, tz) ? (
              <Card tone="gold" style={{ marginTop: space.md, marginBottom: 0 }}>
                <Small style={{ color: color.inkSoft }}>
                  That is the middle of the night where you are. Saying no is completely fine —
                  send a question instead.
                </Small>
              </Card>
            ) : null}

            <View style={{ marginTop: space.md }}>
              {rsvp ? (
                <Row style={{ justifyContent: 'space-between' }}>
                  <Pill label={rsvp.response === 'yes' ? "You're going" : 'Not attending'}
                        tone={rsvp.response === 'yes' ? 'sage' : 'muted'} />
                  <Tiny style={{ textDecorationLine: 'underline' }}
                        onPress={() => router.push(`/(member)/session/${next.id}`)}>
                    View
                  </Tiny>
                </Row>
              ) : (
                <>
                  <Tiny style={{ marginBottom: 10 }}>Can you make it?</Tiny>
                  <Row>
                    <View style={{ flex: 1 }}>
                      <Button testID="rsvp-yes" label="Yes" onPress={() => answer('yes')} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button testID="rsvp-no" label="Can't make it" variant="outline" onPress={() => answer('no')} />
                    </View>
                  </Row>
                </>
              )}
            </View>
          </Card>
        </>
      ) : null}

      {ep ? (
        <>
          <Eyebrow>Latest episode</Eyebrow>
          <Card onPress={() => router.push('/(member)/episodes')}>
            <H3>{ep.title}</H3>
            <Tiny style={{ marginTop: 4 }}>Episode {ep.number}</Tiny>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

/** Small helper so the ink card can use eyebrow styling with a light colour. */
function Text_({ children, eyebrow }: { children: React.ReactNode; eyebrow?: boolean }) {
  return (
    <Small style={eyebrow ? {
      color: 'rgba(255,255,255,0.7)', fontSize: 10, letterSpacing: 1.8,
      textTransform: 'uppercase',
    } : undefined}>
      {children}
    </Small>
  );
}
