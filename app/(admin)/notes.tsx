import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSession } from '@/lib/session';
import { createNote, listAllNotes, listMembers, readStats, renderNoteBody } from '@/lib/data';
import { Screen, Display, H3, Body, Small, Tiny, Card, Eyebrow, Rule, Pill, Row, Button, Field, Wrap } from '@/components/ui';
import { space, color } from '@/lib/theme';
import type { Note, Profile, NoteAudience } from '@/lib/types';
import { onLoadError } from '@/lib/loadError';

const AUDIENCES: { id: NoteAudience; label: string }[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'cohort', label: 'Current cohort' },
  { id: 'alumni', label: 'Alumni only' },
  { id: 'custom', label: 'Specific people' },
];

export default function Notes() {
  const { profile } = useSession();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<NoteAudience>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [sentMsg, setSentMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    (async () => {
      setMembers((await listMembers()).filter((m) => m.role === 'member'));
      setNotes(await listAllNotes());
    })().catch(onLoadError);
  }, []);
  useFocusEffect(load);
  if (!profile) return null;

  const count = audience === 'custom' ? picked.length
    : audience === 'alumni' ? 1 : members.length;

  async function send() {
    await createNote({
      title: title || 'Untitled', body, audience,
      recipient_ids: audience === 'custom' ? picked : [],
      author_id: profile!.id, published_at: new Date().toISOString(),
      link_url: null, link_label: null,
    });
    setSentMsg(`Sent to ${count} ${count === 1 ? 'person' : 'people'}.`);
    setTitle(''); setBody(''); load();
  }

  return (
    <Screen>
      <Eyebrow>Write</Eyebrow>
      <Display>Notes</Display>
      <Rule style={{ marginVertical: space.md }} />

      <Field label="Title" value={title} onChangeText={setTitle} testID="note-title"
             placeholder="Week one — you made it" />
      <Field label="Note" value={body} onChangeText={setBody} multiline testID="note-body"
             placeholder="Short and warm."
             hint="Type {first_name} and each co-host sees her own name." />

      <Eyebrow>Send to</Eyebrow>
      <Wrap>
        {AUDIENCES.map((a) => (
          <Tiny key={a.id} testID={`aud-${a.id}`} onPress={() => setAudience(a.id)}
            style={{
              borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12,
              borderColor: audience === a.id ? color.ink : color.line,
              color: audience === a.id ? color.ink : color.muted,
            }}>{a.label}</Tiny>
        ))}
      </Wrap>

      {audience === 'custom' ? (
        <View style={{ marginTop: space.md }}>
          <Wrap>
            {members.map((m) => {
              const on = picked.includes(m.id);
              return (
                <Tiny key={m.id} testID={`pick-${m.id}`}
                  onPress={() => setPicked(on ? picked.filter((x) => x !== m.id) : [...picked, m.id])}
                  style={{
                    borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12,
                    borderColor: on ? color.ink : color.line,
                    backgroundColor: on ? color.ink : 'transparent',
                    color: on ? color.white : color.muted,
                  }}>{m.display_name}</Tiny>
              );
            })}
          </Wrap>
        </View>
      ) : null}

      {body.includes('{first_name}') && members[0] ? (
        <Card tone="wash" style={{ marginTop: space.md }}>
          <Eyebrow>Preview as {members[0].display_name}</Eyebrow>
          <Small>{renderNoteBody(body, members[0].display_name).slice(0, 160)}…</Small>
        </Card>
      ) : null}

      <View style={{ marginTop: space.md }}>
        <Button testID="note-send" label={`Send to ${count} ${count === 1 ? 'person' : 'people'}`}
                onPress={send} disabled={!body.trim() || (audience === 'custom' && !picked.length)} />
        <View style={{ height: 8 }} />
        <Button label="Send a test to me" variant="outline"
                onPress={() => setSentMsg('Test sent to your device only.')} />
      </View>
      {sentMsg ? <Tiny style={{ marginTop: 10, color: color.sage }}>{sentMsg}</Tiny> : null}

      <Rule />
      <Eyebrow>Sent</Eyebrow>
      {notes.filter((n) => n.published_at).map((n) => (
        <SentNote key={n.id} note={n} />
      ))}
    </Screen>
  );
}

function SentNote({ note }: { note: Note }) {
  const [s, setS] = useState({ total: 0, opened: 0, undelivered: 0 });
  useFocusEffect(useCallback(() => { readStats(note.id).then(setS); }, [note.id]));
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <H3>{note.title}</H3>
        <Pill label={note.audience} tone="plain" />
      </Row>
      <Small style={{ marginTop: 6 }}>
        {s.opened} of {s.total} opened{s.undelivered ? ` · ${s.undelivered} never delivered` : ''}
      </Small>
    </Card>
  );
}
