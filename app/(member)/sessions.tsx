import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { listRecordings, listEvents, getMyRsvp, listGuests } from '@/lib/data';
import { formatDate, formatTime, zoneAbbr } from '@/lib/tz';
import { Screen, Display, H3, Small, Tiny, Card, Eyebrow, Rule, Pill, Row } from '@/components/ui';
import { space } from '@/lib/theme';
import type { Recording, FsrEvent, Guest } from '@/lib/types';
import { onLoadError } from '@/lib/loadError';

export default function Sessions() {
  const { profile } = useSession();
  const router = useRouter();
  const [recs, setRecs] = useState<Recording[]>([]);
  const [events, setEvents] = useState<FsrEvent[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [mine, setMine] = useState<Record<string, string | null>>({});

  const load = useCallback(() => {
    if (!profile) return;
    (async () => {
      const r = await listRecordings(false);
      setRecs(r); setGuests(await listGuests()); setEvents(await listEvents());
      const m: Record<string, string | null> = {};
      for (const rec of r) m[rec.id] = (await getMyRsvp(rec.id, profile.id))?.response ?? null;
      setMine(m);
    })().catch(onLoadError);
  }, [profile]);
  useFocusEffect(load);
  if (!profile) return null;
  const tz = profile.timezone;
  const now = Date.now();
  const upcoming = recs.filter((r) => new Date(r.scheduled_at).getTime() > now);
  const past = recs.filter((r) => new Date(r.scheduled_at).getTime() <= now);

  const label = (v: string | null) =>
    v === 'yes' ? { l: "You're going", t: 'sage' as const }
    : v === 'no' ? { l: 'Not attending', t: 'muted' as const }
    : { l: 'Awaiting your reply', t: 'plain' as const };

  return (
    <Screen>
      <Eyebrow>Fall 2026</Eyebrow>
      <Display>Sessions</Display>
      <Rule style={{ marginVertical: space.md }} />
      {upcoming.map((r) => {
        const g = guests.find((x) => x.id === r.guest_id);
        const st = label(mine[r.id] ?? null);
        return (
          <Card key={r.id} testID={`session-${r.id}`} onPress={() => router.push(`/(member)/session/${r.id}`)}>
            <Row style={{ marginBottom: 6 }}>
              <Small>{formatDate(r.scheduled_at, tz)}</Small><Small>·</Small>
              <Small>{formatTime(r.scheduled_at, tz)} {zoneAbbr(r.scheduled_at, tz)}</Small>
            </Row>
            {/* A published session is called off, not erased: it stays in the list, struck through. */}
            <H3 style={r.cancelled_at ? { textDecorationLine: 'line-through' } : undefined}>{r.title}</H3>
            {g ? <Small style={{ marginTop: 2, marginBottom: 10 }}>{g.name}</Small> : <View style={{ height: 10 }} />}
            {r.cancelled_at
              ? <Pill label="Called off" tone="muted" />
              : <Pill label={st.l} tone={st.t} />}
          </Card>
        );
      })}
      {events.length ? <><Eyebrow>Gatherings</Eyebrow>
        {events.map((e) => (
          <Card key={e.id} tone="wash">
            <Small>{formatDate(e.starts_at, tz)}</Small>
            <H3 style={{ marginTop: 4 }}>{e.title}</H3>
            {e.location ? <Small style={{ marginTop: 2 }}>{e.location}</Small> : null}
          </Card>
        ))}</> : null}
      {past.length ? <><Eyebrow>Past</Eyebrow>
        {past.map((r) => (
          <Card key={r.id} testID={`session-${r.id}`} onPress={() => router.push(`/(member)/session/${r.id}`)}>
            <Small>{formatDate(r.scheduled_at, tz)}</Small>
            <H3 style={{ marginTop: 4 }}>{r.title}</H3>
          </Card>
        ))}</> : null}
      <Tiny style={{ textAlign: 'center', marginTop: space.lg }}>
        All times shown in your zone ({tz.replace('_', ' ')}).
      </Tiny>
    </Screen>
  );
}
