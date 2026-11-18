import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { listRecordings, listGuests, listCohosts, publishRecording, withdrawRecording } from '@/lib/data';
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
  // Which card has its withdraw confirmation open, which one is in flight, and
  // what went wrong if it failed. One at a time.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const load = useCallback(() => {
    (async () => {
      setRecs(await listRecordings(true));
      setGuests(await listGuests());
      setMembers(await listCohosts());
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
        const cancelled = Boolean(r.cancelled_at);
        // A draft goes in one step because nobody was told it existed. A
        // published session is called off, not erased (cancelledAt; RSVPs and
        // questions kept) and everyone invited is told once. Withdrawing one
        // that is already called off deletes it for good.
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
              {cancelled ? <Pill label="Called off" tone="muted" /> : null}
              <Tiny
                testID={`withdraw-${r.id}`}
                onPress={() => { setWithdrawError(null); setConfirming(confirming === r.id ? null : r.id); }}
                style={{
                  borderWidth: 1, borderColor: color.line, borderRadius: 999,
                  paddingVertical: 6, paddingHorizontal: 12, color: color.muted,
                }}
              >{cancelled ? 'Delete for good' : isDraft ? 'Delete' : 'Call it off'}</Tiny>
            </Row>

            {confirming === r.id ? (
              <Card tone="blush" testID={`confirm-withdraw-${r.id}`} style={{ marginTop: space.sm }}>
                <Eyebrow tone={color.danger}>
                  {isDraft || cancelled ? 'This cannot be undone' : 'The cohort will be told'}
                </Eyebrow>
                <Body style={{ marginBottom: 6 }}>
                  {isDraft || cancelled
                    ? cancelled
                      ? 'This one is already called off and the cohort has been told. Removing it now deletes it for good, along with every reply and question attached to it.'
                      : 'This session has not been announced, so nobody has seen it. It will simply go.'
                    : 'The cohort has already been invited to this one, so it will be marked called off rather than deleted — they will be told, and it stays on their schedule struck through. Nothing else is lost.'}
                </Body>
                {/* withdrawRecording in admin-api clears the children first: six
                    tables point at a recording and none cascade. A QuestionLink
                    left behind would silently mark someone "covered". */}
                <Tiny style={{ marginBottom: space.md }}>
                  Questions co-hosts sent in FOR this session go with it. Questions from the intake
                  form or the retreat are not deleted — they go back to waiting, so nobody silently
                  stops being asked.
                </Tiny>
                <Row>
                  <View style={{ flex: 1 }}>
                    <Button
                      testID={`confirm-delete-${r.id}`}
                      label={withdrawing === r.id ? 'Withdrawing…' : isDraft || cancelled ? 'Yes, delete it' : 'Yes, call it off'}
                      disabled={withdrawing === r.id}
                      onPress={async () => {
                        setWithdrawing(r.id);
                        try {
                          const res = await withdrawRecording(r.id);
                          if (!res.ok) {
                            setWithdrawError(res.error === 'not_found'
                              ? 'That session is already gone — pull to refresh.'
                              : 'Something went wrong. Nothing was deleted.');
                            return;
                          }
                          setConfirming(null);
                          load();
                        } finally {
                          setWithdrawing(null);
                        }
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="Keep it" variant="quiet" disabled={withdrawing === r.id}
                            onPress={() => setConfirming(null)} />
                  </View>
                </Row>
                {withdrawError ? (
                  <Small style={{ marginTop: space.md, color: color.ink }}>{withdrawError}</Small>
                ) : null}
              </Card>
            ) : null}

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
