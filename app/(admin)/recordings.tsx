import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { listRecordings, listGuests, listMembers, publishRecording } from '@/lib/data';
import { formatDate, formatTime, zoneAbbr, isUnsociable } from '@/lib/tz';
import { Screen, Display, H3, Body, Small, Tiny, Card, Eyebrow, Rule, Pill, Row, Button, Field } from '@/components/ui';
import { space, color } from '@/lib/theme';
import type { Recording, Guest, Profile } from '@/lib/types';
import { onLoadError } from '@/lib/loadError';

export default function Recordings() {
  const { profile } = useSession();
  const router = useRouter();
  const [recs, setRecs] = useState<Recording[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [defer, setDefer] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    (async () => {
      setRecs(await listRecordings(true));
      setGuests(await listGuests());
      setMembers((await listMembers()).filter((m) => m.role === 'member'));
    })().catch(onLoadError);
  }, []);
  useFocusEffect(load);
  if (!profile) return null;
  const tz = profile.timezone;

  /** SPEC §5.15 — who is this slot brutal for? */
  const clashes = (iso: string) => members.filter((m) => isUnsociable(iso, m.timezone));

  return (
    <Screen>
      <Eyebrow>Fall 2026</Eyebrow>
      <Display>Recordings</Display>
      <Rule style={{ marginVertical: space.md }} />

      <Button
        testID="new-recording"
        label="Add a session"
        onPress={() => router.push('/(admin)/recording-form')}
      />
      <Tiny style={{ marginTop: 8, marginBottom: space.lg }}>
        Sessions you add start as drafts. Calendly bookings land here as drafts too —
        either way nothing reaches the co-hosts until you publish it.
      </Tiny>

      {recs.length === 0 ? (
        <Card tone="wash">
          <Eyebrow>Nothing scheduled</Eyebrow>
          <Small>Add the first session of the season and it will appear here as a draft.</Small>
        </Card>
      ) : null}

      {recs.map((r) => {
        const g = guests.find((x) => x.id === r.guest_id);
        const bad = clashes(r.scheduled_at);
        const isDraft = !r.published_at;
        return (
          <Card key={r.id}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <Small>{formatDate(r.scheduled_at, tz)} · {formatTime(r.scheduled_at, tz)} {zoneAbbr(r.scheduled_at, tz)}</Small>
              <Pill
                label={isDraft ? (r.source === 'calendly' ? 'Calendly draft' : 'Draft') : 'Published'}
                tone={isDraft ? (r.source === 'calendly' ? 'blue' : 'plain') : 'ink'}
              />
            </Row>
            <H3>{r.title}</H3>
            {g ? <Small style={{ marginTop: 2 }}>{g.name}</Small> : null}
            {g?.admin_notes ? (
              <Card tone="wash" style={{ marginTop: space.md, marginBottom: 0 }}>
                <Eyebrow>Guest notes — leadership only</Eyebrow>
                <Small>{g.admin_notes}</Small>
              </Card>
            ) : null}

            {/* Was labelled "Late for 3", which a tester had to ask about. Say the
                thing instead: these people are asleep at this hour. */}
            {bad.length ? (
              <Card tone="gold" style={{ marginTop: space.md, marginBottom: 0 }}>
                <Eyebrow tone="#8A6D28">
                  {bad.length === 1 ? '1 co-host would be woken up' : `${bad.length} co-hosts would be woken up`}
                </Eyebrow>
                <Body>
                  {bad.map((m) => `${m.display_name} — ${formatTime(r.scheduled_at, m.timezone)} ${zoneAbbr(r.scheduled_at, m.timezone)}`).join(' · ')}
                </Body>
                <Tiny style={{ marginTop: 6 }}>
                  That is between 10pm and 6am where they live. They can send a question
                  instead of attending.
                </Tiny>
              </Card>
            ) : null}

            <Row style={{ marginTop: space.md }}>
              <Tiny
                testID={`edit-${r.id}`}
                onPress={() => router.push(`/(admin)/recording-form?id=${r.id}`)}
                style={{
                  borderWidth: 1, borderColor: color.line, borderRadius: 999,
                  paddingVertical: 6, paddingHorizontal: 12, color: color.ink,
                }}
              >{isDraft ? 'Edit details' : 'Edit'}</Tiny>
            </Row>

            {isDraft ? (
              <View style={{ marginTop: space.md }}>
                <Rule style={{ marginVertical: space.sm }} />
                <Eyebrow>Announce to co-hosts</Eyebrow>
                <Row style={{ marginBottom: 10 }}>
                  <Tiny
                    testID={`announce-now-${r.id}`}
                    onPress={() => setDefer({ ...defer, [r.id]: false })}
                    style={{
                      borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12,
                      borderColor: defer[r.id] ? color.line : color.ink,
                      color: defer[r.id] ? color.muted : color.ink,
                    }}
                  >Right away</Tiny>
                  <Tiny
                    testID={`announce-later-${r.id}`}
                    onPress={() => setDefer({ ...defer, [r.id]: true })}
                    style={{
                      borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12,
                      borderColor: defer[r.id] ? color.ink : color.line,
                      color: defer[r.id] ? color.ink : color.muted,
                    }}
                  >Schedule it</Tiny>
                </Row>
                <Tiny style={{ marginBottom: 10 }}>
                  {defer[r.id]
                    ? 'Session appears in the app now; the push waits. Useful when a guest books months out.'
                    : `Publishing now notifies ${members.length} co-hosts.`}
                </Tiny>
                <Button
                  testID={`publish-${r.id}`}
                  label={defer[r.id] ? 'Publish, announce later' : 'Publish & announce'}
                  onPress={async () => {
                    const when = defer[r.id]
                      ? new Date(Date.now() + 7 * 864e5).toISOString() : null;
                    await publishRecording(r.id, when);
                    load();
                  }}
                />
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
