import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSession } from '@/lib/session';
import { listRecordings, rsvpRoster, listQuestions } from '@/lib/data';
import { formatDate, formatTime, zoneAbbr } from '@/lib/tz';
import { Screen, Display, H3, Body, Small, Tiny, Card, Eyebrow, Rule, Pill, Row } from '@/components/ui';
import { space, color } from '@/lib/theme';
import type { Recording, Question, Profile } from '@/lib/types';
import { onLoadError } from '@/lib/loadError';

type RosterRow = {
  member: Profile; response: string | null; respondedAt: string | null;
  note: string | null; deliveredAt: string | null; openedAt: string | null;
};

export default function Responses() {
  const { profile } = useSession();
  const [rec, setRec] = useState<Recording | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [qs, setQs] = useState<(Question & { author?: Profile })[]>([]);

  useFocusEffect(useCallback(() => {
    (async () => {
      const recs = await listRecordings(true);
      const next = recs.find((r) => r.published_at) ?? null;
      setRec(next);
      if (next) setRoster(await rsvpRoster(next.id));
      setQs(await listQuestions());
    })().catch(onLoadError);
  }, []));

  if (!profile) return null;
  const tz = profile.timezone;

  return (
    <Screen>
      <Eyebrow>Delivered · opened · responded</Eyebrow>
      <Display>Responses</Display>
      {rec ? (
        <Small style={{ marginTop: 4 }}>
          {rec.title} — {formatDate(rec.scheduled_at, tz)} {formatTime(rec.scheduled_at, tz)} {zoneAbbr(rec.scheduled_at, tz)}
        </Small>
      ) : null}
      <Rule style={{ marginVertical: space.md }} />

      {roster.map((r) => (
        <Card key={r.member.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <H3>{r.member.display_name}</H3>
            <Pill
              label={r.response === 'yes' ? 'Yes' : r.response === 'no' ? "Can't make it" : 'No reply'}
              tone={r.response === 'yes' ? 'sage' : r.response === 'no' ? 'muted' : 'plain'}
            />
          </Row>
          <Row style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <Tiny style={{ color: r.deliveredAt ? color.muted : color.gold }}>
              {r.deliveredAt ? 'Delivered' : 'NOT DELIVERED'}
            </Tiny>
            <Tiny>·</Tiny>
            <Tiny style={{ color: r.openedAt ? color.sage : color.faint }}>
              {r.openedAt ? `Opened ${formatTime(r.openedAt, tz)}` : 'Not opened'}
            </Tiny>
          </Row>
          {r.note ? <Small style={{ marginTop: 8, fontStyle: 'italic' }}>&ldquo;{r.note}&rdquo;</Small> : null}
          {!r.deliveredAt ? (
            <Card tone="gold" style={{ marginTop: space.md, marginBottom: 0 }}>
              <Tiny>Push is off — she never received it. That's a phone call, not a nudge.</Tiny>
            </Card>
          ) : null}
        </Card>
      ))}

      <Rule />
      <Eyebrow>Questions from co-hosts who can't attend</Eyebrow>
      {qs.length === 0 ? <Small>None yet.</Small> : qs.map((q) => (
        <Card key={q.id}>
          <Eyebrow>{q.author?.display_name ?? 'Unknown'}</Eyebrow>
          <Body>{q.body}</Body>
        </Card>
      ))}
    </Screen>
  );
}
