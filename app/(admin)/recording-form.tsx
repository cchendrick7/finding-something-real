import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/lib/session';
import {
  listRecordings, listGuests, listMembers, createRecording, updateRecording, createGuest,
} from '@/lib/data';
import {
  formatTime, zoneAbbr, isUnsociable, zonedToUtcIso, utcIsoToZonedFields,
} from '@/lib/tz';
import {
  Screen, Display, Body, Small, Tiny, Card, Eyebrow, Rule, Button, Field, Row, Wrap,
} from '@/components/ui';
import { space, color } from '@/lib/theme';
import type { Guest, Profile } from '@/lib/types';
import { onLoadError } from '@/lib/loadError';
import { STUDIO_URL } from '@/lib/ministry';

/**
 * Create or edit a session.
 *
 * Times are entered as WALL CLOCK in the admin's own zone and converted on
 * save — never typed as UTC. The live preview below the fields shows what the
 * slot becomes for every overseas co-host, because the whole point of the
 * time-zone work is that a 6pm Pacific booking is 2am in London and the person
 * scheduling it should find that out here, not after someone misses it.
 *
 * Saving never publishes. Publishing is what notifies co-hosts and it stays a
 * separate, deliberate action on the Recordings screen.
 */
export default function RecordingForm() {
  const { profile } = useSession();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = Boolean(id);

  const [guests, setGuests] = useState<Guest[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState('90');
  const [guestId, setGuestId] = useState<string | null>(null);
  const [newGuest, setNewGuest] = useState('');
  const [topic, setTopic] = useState('');
  const [questions, setQuestions] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  // True when the join link below was filled in for her rather than loaded
  // from the session, so the hint can say so.
  const [prefilled, setPrefilled] = useState(false);

  const tz = profile?.timezone ?? 'America/Los_Angeles';

  useFocusEffect(useCallback(() => {
    (async () => {
      setGuests(await listGuests());
      setMembers((await listMembers()).filter((m) => m.role === 'member'));
      if (id) {
        const rec = (await listRecordings(true)).find((r) => r.id === id);
        if (rec) {
          const f = utcIsoToZonedFields(rec.scheduled_at, tz);
          setTitle(rec.title);
          setDate(f.date);
          setTime(f.time);
          setDuration(String(rec.duration_minutes ?? 90));
          setGuestId(rec.guest_id);
          setTopic(rec.topic ?? '');
          setQuestions(rec.questions_covered ?? '');
          setJoinUrl(rec.join_url ?? '');
        }
      } else {
        // Default to a fortnight out at the usual slot, so the common case is
        // two taps rather than typing a date from scratch.
        const d = new Date(Date.now() + 14 * 864e5);
        setDate(utcIsoToZonedFields(d.toISOString(), tz).date);
        // The studio is the same room every time. Start from the link the most
        // recent session used, or the ministry's studio (lib/ministry) if none
        // has one yet, so "Join on Riverside" has somewhere to go.
        const latest = (await listRecordings(true))
          .filter((r) => r.join_url)
          .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))[0];
        setJoinUrl(latest?.join_url || STUDIO_URL);
        setPrefilled(true);
      }
      setLoaded(true);
    })().catch(onLoadError);
  }, [id, tz]));

  if (!profile) return null;

  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const canSave = title.trim().length > 1 && dateOk && timeOk && !busy;

  let previewIso: string | null = null;
  if (dateOk && timeOk) {
    try { previewIso = zonedToUtcIso(date, time, tz); } catch { previewIso = null; }
  }
  const clashes = previewIso
    ? members.filter((m) => isUnsociable(previewIso as string, m.timezone))
    : [];

  async function save() {
    setErr(null); setBusy(true);
    try {
      let gid = guestId;
      if (!gid && newGuest.trim()) gid = await createGuest(newGuest.trim());
      const draft = {
        title: title.trim(),
        scheduled_at: zonedToUtcIso(date, time, tz),
        duration_minutes: Number(duration) || 90,
        guest_id: gid,
        topic: topic.trim() || null,
        questions_covered: questions.trim() || null,
        join_url: joinUrl.trim() || null,
      };
      if (editing && id) await updateRecording(id, draft);
      else await createRecording(draft);
      router.replace('/(admin)/recordings');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Tiny testID="form-back" onPress={() => router.back()} style={{ marginBottom: space.sm }}>
        ← Back
      </Tiny>
      <Eyebrow>{editing ? 'Editing' : 'New session'}</Eyebrow>
      <Display style={{ fontSize: 30, lineHeight: 34 }}>
        {editing ? 'Edit session' : 'Add a session'}
      </Display>
      <Rule style={{ marginVertical: space.md }} />

      {!loaded ? <Body>Loading…</Body> : (
        <>
          <Field label="Title" value={title} onChangeText={setTitle} testID="f-title"
                 placeholder="Why does God allow suffering?" />

          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1.4 }}>
              <Field label="Date" value={date} onChangeText={setDate} testID="f-date"
                     placeholder="2026-09-10" autoCapitalize="none"
                     hint={dateOk ? undefined : 'YYYY-MM-DD'} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Start" value={time} onChangeText={setTime} testID="f-time"
                     placeholder="18:00" autoCapitalize="none"
                     hint={timeOk ? undefined : '24h, HH:MM'} />
            </View>
            <View style={{ flex: 0.9 }}>
              <Field label="Minutes" value={duration} onChangeText={setDuration}
                     testID="f-duration" keyboardType="numeric" />
            </View>
          </Row>

          <Tiny style={{ marginTop: -6, marginBottom: space.md }}>
            Entered in your zone — {zoneAbbr(previewIso ?? new Date().toISOString(), tz)}.
          </Tiny>

          {/* What this slot actually costs the people who have to show up. */}
          {previewIso ? (
            <Card tone={clashes.length ? 'gold' : 'wash'} style={{ marginBottom: space.md }}>
              <Eyebrow tone={clashes.length ? '#8A6D28' : undefined}>
                {clashes.length
                  ? `${clashes.length} would be woken up`
                  : 'Works for everyone'}
              </Eyebrow>
              {clashes.length ? (
                <>
                  <Body testID="clash-list">
                    {clashes.map((m) =>
                      `${m.display_name} — ${formatTime(previewIso as string, m.timezone)} ${zoneAbbr(previewIso as string, m.timezone)}`,
                    ).join(' · ')}
                  </Body>
                  <Tiny style={{ marginTop: 6 }}>
                    That is between 10pm and 6am where they live. They can still send a
                    question instead of attending.
                  </Tiny>
                </>
              ) : (
                <Small>
                  No co-host is between 10pm and 6am at this time.
                </Small>
              )}
            </Card>
          ) : null}

          <Rule style={{ marginVertical: space.md }} />
          <Eyebrow>Guest</Eyebrow>
          <Wrap>
            <Tiny
              testID="guest-none"
              onPress={() => { setGuestId(null); setNewGuest(''); }}
              style={chip(guestId === null && !newGuest)}
            >No guest</Tiny>
            {guests.map((g) => (
              <Tiny key={g.id} testID={`guest-${g.id}`}
                    onPress={() => { setGuestId(g.id); setNewGuest(''); }}
                    style={chip(guestId === g.id)}>{g.name}</Tiny>
            ))}
          </Wrap>
          <View style={{ height: space.md }} />
          <Field label="Or add a new guest" value={newGuest} testID="f-newguest"
                 onChangeText={(v) => { setNewGuest(v); if (v) setGuestId(null); }}
                 placeholder="Dr. Rachel Kwon" />

          <Rule style={{ marginVertical: space.md }} />
          <Field label="Topic" value={topic} onChangeText={setTopic} testID="f-topic"
                 placeholder="The problem of evil, honestly"
                 hint="One line. Co-hosts see this on the session card." />
          <Field label="What we'll cover" value={questions} onChangeText={setQuestions}
                 testID="f-questions" multiline
                 placeholder={'If God is good, why is there so much pain?\nIs suffering evidence against God?'}
                 hint="One question per line." />
          <Field label="Join link" value={joinUrl} onChangeText={setJoinUrl} testID="f-joinurl"
                 autoCapitalize="none" placeholder="https://riverside.com/studio/…"
                 hint={prefilled
                   ? 'The FSR studio link, filled in for you. Change it only if this session is somewhere else.'
                   : 'The studio link is the same every time. Leave it as it is unless this session is somewhere else.'} />

          {err ? <Tiny style={{ color: color.danger, marginBottom: 10 }} testID="form-error">{err}</Tiny> : null}

          <Button
            testID="f-save"
            label={busy ? 'Saving…' : editing ? 'Save changes' : 'Create as draft'}
            onPress={save}
            disabled={!canSave}
          />
          <Tiny style={{ textAlign: 'center', marginTop: space.md }}>
            {editing
              ? 'Saving does not change who has been notified.'
              : 'Saved as a draft. Nothing reaches the co-hosts until you publish it.'}
          </Tiny>
        </>
      )}
    </Screen>
  );
}

/** Selected/unselected chip. Same shape as the assign chips on Intake. */
function chip(active: boolean) {
  return {
    borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12,
    borderColor: active ? color.ink : color.line,
    color: active ? color.ink : color.muted,
  } as const;
}
