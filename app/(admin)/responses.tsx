import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSession } from '@/lib/session';
import { listRecordings, rsvpRoster, rsvpCounts, listQuestions, type PushReach } from '@/lib/data';
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
 * Every session leadership can ask about, in the order they matter: upcoming
 * soonest first, then past ones most recent first. The screen opens on the
 * first — the next session, or the latest if none is scheduled.
 *
 * Until 9 Nov 2026 the screen showed one session only, with no way to see
 * the replies to any other (Lauren: "how do we know which ones they can and
 * can't attend?").
 */
function order(recs: Recording[]): { upcoming: Recording[]; past: Recording[] } {
  const published = recs.filter((r) => r.published_at && !r.cancelled_at);
  const now = Date.now();
  return {
    upcoming: published.filter((r) => Date.parse(r.scheduled_at) > now),
    past: published.filter((r) => Date.parse(r.scheduled_at) <= now).reverse(),
  };
}

type Counts = Map<string, { yes: number; no: number }>;

/** One session in the picker: its date, and where the replies stand. */
function SessionChip({ rec, counts, selected, tz, onPress }: {
  rec: Recording; counts: Counts; selected: boolean; tz: string; onPress: () => void;
}) {
  const c = counts.get(rec.id) ?? { yes: 0, no: 0 };
  const fg = selected ? color.white : color.ink;
  return (
    <Pressable
      testID={`session-${rec.id}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${rec.title}, ${formatDate(rec.scheduled_at, tz)}: ${c.yes} yes, ${c.no} can't make it`}
      onPress={onPress}
      style={{
        paddingVertical: 10, paddingHorizontal: 14, marginRight: 8, borderRadius: 14,
        borderWidth: 1, borderColor: selected ? color.ink : color.line,
        backgroundColor: selected ? color.ink : color.card, maxWidth: 190,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: fg }}>{formatDate(rec.scheduled_at, tz)}</Text>
      <Text numberOfLines={1} style={{ fontSize: 12, color: selected ? color.white : color.muted, marginTop: 2 }}>
        {rec.title}
      </Text>
      <Text style={{ fontSize: 12, marginTop: 4, color: selected ? color.white : c.yes ? color.sage : color.faint }}>
        {c.yes} yes · {c.no} can't
      </Text>
    </Pressable>
  );
}

export default function Responses() {
  const { profile } = useSession();
  const [rec, setRec] = useState<Recording | null>(null);
  const [sessions, setSessions] = useState<{ upcoming: Recording[]; past: Recording[] }>({ upcoming: [], past: [] });
  const [counts, setCounts] = useState<Counts>(new Map());
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [qs, setQs] = useState<(Question & { author?: Profile })[]>([]);
  const shownId = useRef<string | null>(null);

  const show = useCallback(async (r: Recording | null) => {
    shownId.current = r?.id ?? null;
    setRec(r);
    setRoster([]);
    if (r) {
      const rows = await rsvpRoster(r.id);
      // Who is coming first, then who can't, then who hasn't answered.
      const rank = (x: RosterRow) => (x.response === 'yes' ? 0 : x.response === 'no' ? 1 : 2);
      rows.sort((x, y) => rank(x) - rank(y) || x.member.display_name.localeCompare(y.member.display_name));
      // A slower answer for a session that is no longer selected is dropped.
      if (shownId.current === r.id) setRoster(rows);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    (async () => {
      const ordered = order(await listRecordings(true));
      setSessions(ordered);
      setCounts(await rsvpCounts());
      // Coming back to the screen keeps the session that was being looked at.
      const all = [...ordered.upcoming, ...ordered.past];
      const keep = all.find((r) => r.id === shownId.current) ?? all[0] ?? null;
      await show(keep);
      setQs(await listQuestions());
    })().catch(onLoadError);
  }, []));

  if (!profile) return null;
  const tz = profile.timezone;

  return (
    <Screen>
      <Eyebrow>Notified · responded</Eyebrow>
      <Display>Responses</Display>
      {sessions.upcoming.length + sessions.past.length > 1 ? (
        <View style={{ marginTop: space.md }}>
          {([['Coming up', sessions.upcoming], ['Past', sessions.past]] as const).map(([label, list]) =>
            list.length ? (
              <View key={label} style={{ marginBottom: 10 }}>
                <Tiny style={{ marginBottom: 6 }}>{label}</Tiny>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {list.map((r) => (
                    <SessionChip key={r.id} rec={r} counts={counts} tz={tz} selected={r.id === rec?.id}
                      onPress={() => { show(r).catch(onLoadError); }} />
                  ))}
                </ScrollView>
              </View>
            ) : null)}
        </View>
      ) : null}
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
