import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSession } from '@/lib/session';
import {
  getRecording, getGuest, listAttendees, getMyRsvp, setRsvp, submitQuestion,
  myQuestionForRecording, guestIsReturning, markRead,
} from '@/lib/data';
import { formatDate, formatTime, zoneAbbr, isUnsociable } from '@/lib/tz';
import {
  Screen, H1, H3, Body, Small, Tiny, Card, Eyebrow, Rule, Button, Pill, Row, Wrap, Field, Avatar,
} from '@/components/ui';
import { color, space } from '@/lib/theme';
import type { Recording, Guest, Profile, Rsvp, IntakeQuestion } from '@/lib/types';
import { onLoadError } from '@/lib/loadError';

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useSession();
  const router = useRouter();

  const [rec, setRec] = useState<Recording | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [returning, setReturning] = useState(false);
  const [attendees, setAttendees] = useState<Profile[]>([]);
  const [rsvp, setRsvpState] = useState<Rsvp | null>(null);
  const [mine, setMine] = useState<IntakeQuestion | null>(null);
  const [q, setQ] = useState('');
  const [sent, setSent] = useState(false);

  const load = useCallback(() => {
    if (!profile || !id) return;
    (async () => {
      const r = await getRecording(id);
      setRec(r);
      if (!r) return;
      await markRead(profile.id, 'recording', r.id);
      const g = await getGuest(r.guest_id);
      setGuest(g);
      if (g) setReturning(await guestIsReturning(g));
      setAttendees(await listAttendees(r.id));
      setRsvpState(await getMyRsvp(r.id, profile.id));
      setMine(await myQuestionForRecording(profile.id, r.id));
    })().catch(onLoadError);
  }, [id, profile]);

  useFocusEffect(load);
  if (!profile || !rec) return <Screen><Body>Loading…</Body></Screen>;
  const tz = profile.timezone;

  async function answer(response: 'yes' | 'no') {
    if (!profile || !rec) return;
    setRsvpState(await setRsvp(rec.id, profile.id, response));
    setAttendees(await listAttendees(rec.id));
  }

  async function sendQuestion() {
    if (!profile || !rec || !q.trim()) return;
    await submitQuestion(profile.id, rec.id, q.trim());
    setSent(true); setQ('');
  }

  return (
    <Screen>
      <Tiny onPress={() => router.back()} style={{ marginBottom: space.md }}>← Back</Tiny>

      <Row style={{ marginBottom: 8 }}>
        <Small>{formatDate(rec.scheduled_at, tz)}</Small><Small>·</Small>
        <Small>{formatTime(rec.scheduled_at, tz)} {zoneAbbr(rec.scheduled_at, tz)}</Small>
      </Row>
      <H1>{rec.title}</H1>
      <Small style={{ marginBottom: space.lg }}>
        Remote recording · about {rec.duration_minutes} minutes
      </Small>

      {mine ? (
        <Card tone="blush">
          <Eyebrow>Why this one matters</Eyebrow>
          <H3 style={{ marginBottom: 6 }}>This came from your question</H3>
          <Body style={{ fontStyle: 'italic' }}>&ldquo;{mine.body}&rdquo;</Body>
        </Card>
      ) : null}

      {guest ? (
        <Card>
          <Eyebrow>Guest</Eyebrow>
          <Row>
            <Avatar label={guest.name.split(' ').map((w) => w[0]).slice(-2).join('')} />
            <View style={{ flex: 1 }}>
              <H3>{guest.name}</H3>
              {guest.blurb ? <Small style={{ marginTop: 2 }}>{guest.blurb}</Small> : null}
            </View>
          </Row>
          {returning ? (
            <View style={{ marginTop: space.md }}><Pill label="Returning guest" tone="blue" /></View>
          ) : null}
        </Card>
      ) : null}

      {rec.questions_covered ? (
        <Card>
          <Eyebrow>What we'll cover</Eyebrow>
          {rec.questions_covered.split('\n').filter(Boolean).map((line, i) => (
            <Body key={i} style={{ marginBottom: 6 }}>— {line}</Body>
          ))}
        </Card>
      ) : null}

      {/* SPEC §5.3 — only the people who said yes are listed. */}
      <Card tone="sage">
        <Eyebrow>Who's coming</Eyebrow>
        <Body style={{ marginBottom: 10 }}>
          {attendees.length} {attendees.length === 1 ? 'co-host' : 'co-hosts'} attending
        </Body>
        <Wrap>
          {attendees.map((a) => (
            <Pill key={a.id} label={a.id === profile.id ? 'You' : a.display_name}
                  tone={a.id === profile.id ? 'sage' : 'plain'} />
          ))}
        </Wrap>
        <Rule style={{ marginVertical: space.md }} />
        <Tiny>
          Only co-hosts who said yes appear here. If you can't make it, that stays between
          you and the team.
        </Tiny>
      </Card>

      {isUnsociable(rec.scheduled_at, tz) ? (
        <Card tone="gold">
          <Eyebrow tone="#8A6D28">Heads up</Eyebrow>
          <Body>
            This lands in the middle of the night where you are. Janell knows — say no and send
            a question instead if that is easier.
          </Body>
        </Card>
      ) : null}

      <Rule />

      {!rsvp ? (
        <>
          <Eyebrow>Can you make it?</Eyebrow>
          <Row>
            <View style={{ flex: 1 }}>
              <Button testID="detail-yes" label="Yes, I'll be there" onPress={() => answer('yes')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button testID="detail-no" label="Can't make it" variant="outline" onPress={() => answer('no')} />
            </View>
          </Row>
        </>
      ) : rsvp.response === 'yes' ? (
        <Card tone="sage">
          <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
            <Pill label="You're going" tone="sage" />
            <Tiny style={{ textDecorationLine: 'underline' }} onPress={() => answer('no')}>Change</Tiny>
          </Row>
          <Button label="Join on Riverside" />
          <Tiny style={{ textAlign: 'center', marginTop: 10 }}>
            Link opens 10 minutes before we start
          </Tiny>
          <Rule style={{ marginVertical: space.md }} />
          <Tiny style={{ textAlign: 'center' }}>
            We'll remind you 24 hours and 1 hour before — no texts needed.
          </Tiny>
          <Tiny style={{ textAlign: 'center', marginTop: 8, textDecorationLine: 'underline' }}>
            Add to my calendar
          </Tiny>
        </Card>
      ) : (
        <Card>
          <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
            <Pill label="Not attending" tone="muted" />
            <Tiny style={{ textDecorationLine: 'underline' }} onPress={() => answer('yes')}>Change</Tiny>
          </Row>
          {sent ? (
            <>
              <Eyebrow>Sent</Eyebrow>
              <Body>We'll ask it for you. You'll get a note when the episode is up.</Body>
            </>
          ) : (
            <>
              <H3 style={{ marginBottom: 6 }}>Still want to be part of it?</H3>
              <Small style={{ marginBottom: space.md }}>
                Send a question and we'll ask {guest?.name ?? 'our guest'} on your behalf.
              </Small>
              <Field value={q} onChangeText={setQ} multiline testID="question"
                     placeholder="What would you want to ask?" />
              <Button testID="send-question" label="Send my question" onPress={sendQuestion} disabled={!q.trim()} />
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}
