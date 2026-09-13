import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSession } from '@/lib/session';
import { listPrayers } from '@/lib/data';
import { formatDate } from '@/lib/tz';
import { Screen, Display, Body, Small, Card, Eyebrow, Rule } from '@/components/ui';
import { space } from '@/lib/theme';
import { onLoadError } from '@/lib/loadError';
import type { PrayerRequest, Profile } from '@/lib/types';

export default function Prayers() {
  const { profile } = useSession();
  const [rows, setRows] = useState<(PrayerRequest & { author?: Profile })[]>([]);
  useFocusEffect(useCallback(() => { listPrayers().then(setRows).catch(onLoadError); }, []));
  if (!profile) return null;

  return (
    <Screen>
      <Eyebrow>Leadership only</Eyebrow>
      <Display>Prayer requests</Display>
      <Rule style={{ marginVertical: space.md }} />
      <Card tone="wash">
        <Eyebrow>Restricted</Eyebrow>
        <Small>
          Enforced in the database, not just this screen — a co-host querying the API directly
          cannot read these. They were told at signup that only the team sees them.
        </Small>
      </Card>
      {rows.map((p) => (
        <Card key={p.id}>
          <Eyebrow>
            {p.author?.display_name ?? 'Unknown'} · {formatDate(p.submitted_at, profile.timezone)}
          </Eyebrow>
          <Body>{p.body}</Body>
        </Card>
      ))}
    </Screen>
  );
}
