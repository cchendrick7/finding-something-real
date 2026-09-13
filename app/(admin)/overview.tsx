import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { listRecordings, rsvpRoster, readStats, listAllNotes, coverageGaps, listGuests } from '@/lib/data';
import { formatDate, formatTime, zoneAbbr } from '@/lib/tz';
import { Screen, Display, H2, H3, Body, Small, Tiny, Card, Eyebrow, Rule, Pill, Row, Button } from '@/components/ui';
import { space, color, type } from '@/lib/theme';
import type { Recording, Profile, Guest } from '@/lib/types';
import { onLoadError } from '@/lib/loadError';

function Stat({ n, label, sub, tone }: { n: string; label: string; sub?: string; tone?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 150 }}>
      <Body style={{ fontFamily: type.h1.fontFamily, fontSize: 30, color: tone ?? color.ink, marginBottom: 4 }}>{n}</Body>
      <Eyebrow>{label}</Eyebrow>
      {sub ? <Tiny>{sub}</Tiny> : null}
    </Card>
  );
}

export default function Overview() {
  const { profile } = useSession();
  const router = useRouter();
  const [recs, setRecs] = useState<Recording[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [stats, setStats] = useState({ total: 0, opened: 0, undelivered: 0 });
  const [yes, setYes] = useState(0);
  const [silent, setSilent] = useState(0);
  const [gaps, setGaps] = useState<Profile[]>([]);

  useFocusEffect(useCallback(() => {
    (async () => {
      const r = await listRecordings(true);
      setRecs(r); setGuests(await listGuests());
      const notes = await listAllNotes();
      const published = notes.find((n) => n.published_at);
      if (published) setStats(await readStats(published.id));
      const next = r.find((x) => x.published_at && new Date(x.scheduled_at) > new Date());
      if (next) {
        const roster = await rsvpRoster(next.id);
        setYes(roster.filter((x) => x.response === 'yes').length);
        setSilent(roster.filter((x) => !x.response).length);
      }
      setGaps(await coverageGaps());
    })().catch(onLoadError);
  }, []));

  if (!profile) return null;
  const tz = profile.timezone;
  const drafts = recs.filter((r) => !r.published_at);
  const scheduled = recs.filter((r) => r.published_at && r.announce_at && !r.announced_at);

  return (
    <Screen>
      <Eyebrow>{formatDate(new Date().toISOString(), tz)}</Eyebrow>
      <Display>Good morning, {profile.display_name}</Display>
      <Rule style={{ marginVertical: space.md }} />

      {drafts.map((d) => {
        const g = guests.find((x) => x.id === d.guest_id);
        return (
          <Card key={d.id} tone="blue">
            <Eyebrow>From Calendly</Eyebrow>
            <H3 style={{ marginBottom: 6 }}>
              {g?.name ?? 'A guest'} booked {formatDate(d.scheduled_at, tz)}
            </H3>
            <Small style={{ marginBottom: space.md }}>
              A draft is waiting. Add the topic and questions, then publish — nothing has
              reached the co-hosts.
            </Small>
            <Button label="Open draft" onPress={() => router.push('/(admin)/recordings')} />
          </Card>
        );
      })}

      <Row style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
        <Stat n={`${stats.opened}`} label="Opened" sub={`of ${stats.total} · latest note`} />
        <Stat n={`${yes}`} label="RSVP'd yes" sub="next recording" />
      </Row>
      <Row style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
        <Stat n={`${silent}`} label="No reply" sub="nudge goes out tonight" />
        <Stat n={`${gaps.length}`} label="Uncovered co-hosts" sub="no question answered yet"
              tone={gaps.length ? color.gold : undefined} />
      </Row>

      {stats.undelivered > 0 ? (
        <Card tone="gold">
          <Eyebrow tone="#8A6D28">Push is off for {stats.undelivered}</Eyebrow>
          <Body>
            They won't receive recording invitations at all. This is the one failure the app
            can't fix on its own — worth a text.
          </Body>
        </Card>
      ) : null}

      {scheduled.length ? (
        <Card tone="wash">
          <Eyebrow>Announcement scheduled</Eyebrow>
          {scheduled.map((s) => (
            <Small key={s.id}>
              {s.title} — announcing {s.announce_at ? formatDate(s.announce_at, tz) : ''}
            </Small>
          ))}
        </Card>
      ) : null}

      <Eyebrow>Coming up</Eyebrow>
      {recs.filter((r) => new Date(r.scheduled_at) > new Date()).map((r) => (
        <Card key={r.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Small>{formatDate(r.scheduled_at, tz)} · {formatTime(r.scheduled_at, tz)} {zoneAbbr(r.scheduled_at, tz)}</Small>
            <Pill label={r.published_at ? 'Published' : 'Draft'} tone={r.published_at ? 'ink' : 'plain'} />
          </Row>
          <H3 style={{ marginTop: 6 }}>{r.title}</H3>
        </Card>
      ))}
    </Screen>
  );
}
