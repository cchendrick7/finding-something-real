import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSession } from '@/lib/session';
import { listRecordings, rsvpRoster, listQuestions, type PushReach } from '@/lib/data';
import { formatDate, formatTime, zoneAbbr } from '@/lib/tz';
import { Screen, Display, H3, Body, Small, Tiny, Card, Eyebrow, Rule, Pill, Row } from '@/components/ui';
import { space, color } from '@/lib/theme';
import type { Recording, Question, Profile } from '@/lib/types';
import { onLoadError } from '@/lib/loadError';

type RosterRow = {
  member: Profile; response: string | null; respondedAt: string | null;
  note: string | null; notifiedAt: string | null; push: PushReach;
};

/**
 * The session this screen is about: the next one coming up, or — when none is
 * scheduled — the most recent. (It used to take the first published session in
 * date order, which after the first week was always one in the past.)
 */
function pick(recs: Recording[]): Recording | null {
  const published = recs.filter((r) => r.published_at && !r.cancelled_at);
  const now = Date.now();
  return published.find((r) => Date.parse(r.scheduled_at) > now) ?? published[published.length - 1] ?? null;
}

export default function Responses() {
  const { profile } = useSession();
  const [rec, setRec] = useState<Recording | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [qs, setQs] = useState<(Question & { author?: Profile })[]>([]);

  useFocusEffect(useCallback(() => {
    (async () => {
      const recs = await listRecordings(true);
      const next = pick(recs);
      setRec(next);
      if (next) setRoster(await rsvpRoster(next.id));
      setQs(await listQuestions());
    })().catch(onLoadError);
  }, []));

  if (!profile) return null;
  const tz = profile.timezone;

  return (
    <Screen>
      <Eyebrow>Notified · responded</Eyebrow>
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
          {/* From NotificationLog (what the outbox sent) and PushToken (her
              phones) — the two records of what actually happened. */}
          <Row style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <Tiny style={{ color: r.notifiedAt ? color.muted : color.gold }}>
              {r.notifiedAt
                ? `Notified ${formatDate(r.notifiedAt, tz)} ${formatTime(r.notifiedAt, tz)}`
                : 'NOT NOTIFIED'}
            </Tiny>
          </Row>
          {r.note ? <Small style={{ marginTop: 8, fontStyle: 'italic' }}>&ldquo;{r.note}&rdquo;</Small> : null}
          {!r.notifiedAt && r.push === 'off' ? (
            <Card tone="gold" style={{ marginTop: space.md, marginBottom: 0 }}>
              <Tiny>
                Notifications aren't set up on her phone — the app isn't installed, or she never
                tapped "Turn on notifications". That's a phone call, not a nudge.
              </Tiny>
            </Card>
          ) : !r.notifiedAt && r.push === 'muted' ? (
            <Card tone="gold" style={{ marginTop: space.md, marginBottom: 0 }}>
              <Tiny>She has switched off new-recording notifications in the app.</Tiny>
            </Card>
          ) : !r.notifiedAt ? (
            <Small style={{ marginTop: 8 }}>
              Her notifications are on now — this invitation went out before her phone was set up.
            </Small>
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
