import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { listInquiries, markInquiryHandled } from '@/lib/data';
import { formatDate } from '@/lib/tz';
import { Screen, Display, Body, Small, Tiny, Card, Eyebrow, Rule, Pill, Button } from '@/components/ui';
import { space, color } from '@/lib/theme';
import { onLoadError } from '@/lib/loadError';
import type { Inquiry } from '@/lib/types';

/**
 * Interest-form submissions: women asking about a future cohort.
 *
 * She has no account, so this list is the only way back to her — the form
 * itself will not say whether someone has been in touch (the id is derived
 * from her email, so a repeat looks exactly like a first). That is why the
 * Overview card says she is waiting on a reply.
 *
 * "Mark answered" is a flag, not a delete, and it can be undone. Retention is
 * the two-year line in the privacy screen, not this button.
 */
export default function Inquiries() {
  const { profile } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<Inquiry[]>([]);
  // Separate from rows.length so "Nothing yet" never flashes before the load.
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(() => {
    listInquiries()
      .then((r) => { setRows(r); setLoaded(true); })
      .catch(onLoadError);
  }, []);
  useFocusEffect(load);
  if (!profile) return null;
  const tz = profile.timezone;
  const waiting = rows.filter((i) => !i.handled).length;

  async function mark(i: Inquiry) {
    await markInquiryHandled(i.id, !i.handled);
    load();
  }

  return (
    <Screen>
      <Eyebrow>Leadership only</Eyebrow>
      <Display style={{ fontSize: 32, lineHeight: 36 }}>Interested</Display>
      <Rule style={{ marginVertical: space.md }} />
      <Card tone="wash">
        <Eyebrow>Where these come from</Eyebrow>
        <Small>
          The end of the About screen, and the co-host sign-in. Anyone can send one — they have no
          account and cannot see anything else in the app. Marking one answered keeps it here;
          nothing is deleted.
        </Small>
      </Card>

      {loaded ? null : <Body>Loading…</Body>}
      {loaded && rows.length === 0 ? (
        <Card tone="wash" testID="inquiries-empty">
          <Eyebrow>Nothing yet</Eyebrow>
          <Small>When someone asks about a future cohort, she appears here.</Small>
        </Card>
      ) : null}
      {loaded && rows.length > 0 ? (
        <Small style={{ marginTop: space.md, marginBottom: space.sm, color: color.faint }}>
          {waiting === 0
            ? `${rows.length} in total, all answered.`
            : `${waiting} waiting on a reply, ${rows.length} in total.`}
        </Small>
      ) : null}

      {/* Unanswered first, then newest — listInquiries sorts. */}
      {rows.map((i) => (
        <Card key={i.id} testID={`inquiry-${i.id}`} tone={i.handled ? 'wash' : 'plain'}>
          <Eyebrow>
            {formatDate(i.submitted_at, tz)}
            {i.source === 'website' ? ' · from the website' : ''}
          </Eyebrow>
          <Body style={{ marginBottom: 4 }}>{i.name}</Body>
          <Tiny
            testID={`inquiry-email-${i.id}`}
            onPress={() => { Linking.openURL(`mailto:${i.email}`).catch(onLoadError); }}
            style={{ textDecorationLine: 'underline', color: color.ink }}
          >
            {i.email}
          </Tiny>
          {i.phone ? (
            <Tiny
              testID={`inquiry-phone-${i.id}`}
              onPress={() => { Linking.openURL(`tel:${i.phone}`).catch(onLoadError); }}
              style={{ marginTop: 4, textDecorationLine: 'underline', color: color.ink }}
            >
              {i.phone}
            </Tiny>
          ) : null}
          {i.note ? <Body style={{ marginTop: space.sm }}>{i.note}</Body> : null}
          <Small style={{ marginTop: space.md, marginBottom: 8 }}>
            {i.handled && i.handled_at
              ? <Pill label={`Answered ${formatDate(i.handled_at, tz)}`} tone="sage" />
              : <Pill label="Waiting" tone="gold" />}
          </Small>
          <Button
            testID={`inquiry-mark-${i.id}`}
            label={i.handled ? 'Move back to waiting' : 'Mark answered'}
            variant="outline"
            onPress={() => { mark(i).catch(onLoadError); }}
          />
        </Card>
      ))}

      {/* Not a tab, so there is no tab to go back to. */}
      <Tiny
        onPress={() => router.replace('/(admin)/overview')}
        style={{ textAlign: 'center', marginTop: space.xl, textDecorationLine: 'underline', color: color.muted }}
      >
        ← Back to overview
      </Tiny>
    </Screen>
  );
}
