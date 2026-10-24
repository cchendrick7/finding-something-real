import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { listPublicEpisodes } from '@/lib/data';
import { useSession } from '@/lib/session';
import { EpisodeCard } from '@/components/episode-card';
import { Screen, Display, Body, Small, Card, Eyebrow, Rule } from '@/components/ui';
import { space } from '@/lib/theme';
import type { PublicEpisode } from '@/lib/types';
import { onLoadError } from '@/lib/loadError';

// Co-host episodes read the same YouTube-synced PublicEpisode rows the public
// Listen tab does and open the same in-app player: a co-host should not get
// less than a stranger who installed the app.
export default function Episodes() {
  const { profile } = useSession();
  const router = useRouter();
  const [eps, setEps] = useState<PublicEpisode[]>([]);
  const [loaded, setLoaded] = useState(false);
  useFocusEffect(useCallback(() => {
    (async () => {
      setEps(await listPublicEpisodes());
      setLoaded(true);
    })().catch(onLoadError);
  }, []));
  const tz = profile?.timezone ?? 'America/Los_Angeles';
  const episodes = eps.filter((r) => r.kind === 'episode');
  return (
    <Screen>
      <Eyebrow>New every Wednesday</Eyebrow>
      <Display>Episodes</Display>
      <Rule style={{ marginVertical: space.md }} />
      {loaded ? null : <Body>Loading…</Body>}
      {loaded && episodes.length === 0 ? (
        <Card tone="wash">
          <Eyebrow>Nothing here yet</Eyebrow>
          <Small>New episodes appear here automatically the day they go up.</Small>
        </Card>
      ) : null}
      {episodes.map((e) => (
        <EpisodeCard key={e.id} episode={e} tz={tz} onOpen={(ep) => router.push(`/episode/${ep.video_id}`)} />
      ))}
    </Screen>
  );
}
