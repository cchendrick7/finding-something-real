import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { listEpisodes } from '@/lib/data';
import { useSession } from '@/lib/session';
import { formatDate } from '@/lib/tz';
import { Screen, Display, H3, Tiny, Card, Eyebrow, Rule } from '@/components/ui';
import { space } from '@/lib/theme';
import type { Episode } from '@/lib/types';
import { onLoadError } from '@/lib/loadError';

export default function Episodes() {
  const { profile } = useSession();
  const [eps, setEps] = useState<Episode[]>([]);
  useFocusEffect(useCallback(() => { listEpisodes().then(setEps).catch(onLoadError); }, []));
  const tz = profile?.timezone ?? 'America/Los_Angeles';
  return (
    <Screen>
      <Eyebrow>New every Wednesday</Eyebrow>
      <Display>Episodes</Display>
      <Rule style={{ marginVertical: space.md }} />
      {eps.map((e) => (
        <Card key={e.id}>
          <H3>{e.title}</H3>
          <Tiny style={{ marginTop: 4 }}>
            Episode {e.number}{e.published_at ? ` · ${formatDate(e.published_at, tz)}` : ''}
          </Tiny>
        </Card>
      ))}
    </Screen>
  );
}
