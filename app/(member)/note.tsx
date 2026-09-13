import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { unreadNoteFor, listNotesFor, markRead, renderNoteBody } from '@/lib/data';
import { formatDate } from '@/lib/tz';
import { Screen, H1, Body, Small, Tiny, Card, Eyebrow, Rule } from '@/components/ui';
import { space } from '@/lib/theme';
import type { Note } from '@/lib/types';
import { onLoadError } from '@/lib/loadError';

export default function NoteScreen() {
  const { profile } = useSession();
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [archive, setArchive] = useState<Note[]>([]);

  useFocusEffect(useCallback(() => {
    if (!profile) return;
    (async () => {
      const unread = await unreadNoteFor(profile.id);
      const all = await listNotesFor(profile.id);
      const shown = unread ?? all[0] ?? null;
      setNote(shown);
      if (shown) await markRead(profile.id, 'note', shown.id);
      setArchive(all.filter((n) => n.id !== shown?.id));
    })().catch(onLoadError);
  }, [profile]));

  if (!profile || !note) return <Screen><Body>No notes yet.</Body></Screen>;
  return (
    <Screen>
      <Tiny onPress={() => router.back()} style={{ marginBottom: space.md }}>← Back</Tiny>
      <Eyebrow>From Janell · {note.published_at ? formatDate(note.published_at, profile.timezone) : ''}</Eyebrow>
      <H1>{note.title}</H1>
      <Rule />
      {renderNoteBody(note.body, profile.display_name).split('\n\n').map((p, i) => (
        <Body key={i} style={{ marginBottom: space.md }}>{p}</Body>
      ))}
      {note.link_label ? (
        <Card tone="wash" style={{ marginTop: space.md }}>
          <Eyebrow>Linked</Eyebrow>
          <Small>{note.link_label}</Small>
        </Card>
      ) : null}
      {archive.length ? (
        <>
          <Rule />
          <Eyebrow>Earlier notes</Eyebrow>
          {archive.map((n) => (
            <Card key={n.id} tone="wash">
              <Small>{n.title}</Small>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
