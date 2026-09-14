import { useCallback, useState } from 'react';
import { View, Image, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { listPublicEpisodes } from '@/lib/data';
import { formatDate } from '@/lib/tz';
import { detectZone } from '@/lib/tz';
import {
  Screen, Display, H3, Body, Small, Tiny, Card, Eyebrow, Rule, Row, Wrap,
} from '@/components/ui';
import { space, color, radius } from '@/lib/theme';
import type { PublicEpisode } from '@/lib/types';
import { onLoadError } from '@/lib/loadError';

/**
 * Every episode, free, no account.
 *
 * Shorts and full episodes share one YouTube feed, and the shorts outnumber
 * the episodes roughly four to one — listed together they bury the thing most
 * people came for, so the filter defaults to full episodes.
 */
export default function Listen() {
  const [rows, setRows] = useState<PublicEpisode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<'episode' | 'short'>('episode');
  const tz = detectZone();

  useFocusEffect(useCallback(() => {
    (async () => {
      setRows(await listPublicEpisodes());
      setLoaded(true);
    })().catch(onLoadError);
  }, []));

  const shown = rows.filter((r) => r.kind === filter);
  const counts = {
    episode: rows.filter((r) => r.kind === 'episode').length,
    short: rows.filter((r) => r.kind === 'short').length,
  };

  const open = (url: string) => { Linking.openURL(url).catch(onLoadError); };

  return (
    <Screen>
      <Eyebrow>New every Wednesday</Eyebrow>
      <Display>Finding{'\n'}Something{'\n'}Real</Display>
      <Body style={{ marginTop: space.md }}>
        Honest conversations about faith, doubt and identity — hosted by Janell Wood
        with a cohort of young women asking the questions they actually have.
      </Body>
      <Rule style={{ marginVertical: space.lg }} />

      <Wrap>
        {(['episode', 'short'] as const).map((k) => (
          <Tiny
            key={k}
            testID={`filter-${k}`}
            onPress={() => setFilter(k)}
            style={{
              borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 13,
              borderColor: filter === k ? color.ink : color.line,
              color: filter === k ? color.ink : color.muted,
            }}
          >
            {k === 'episode' ? `Episodes ${counts.episode}` : `Clips ${counts.short}`}
          </Tiny>
        ))}
      </Wrap>
      <View style={{ height: space.lg }} />

      {!loaded ? <Body>Loading…</Body> : null}

      {loaded && shown.length === 0 ? (
        <Card tone="wash">
          <Eyebrow>Nothing here yet</Eyebrow>
          <Small>
            New episodes appear automatically. In the meantime the whole back catalogue
            is on YouTube.
          </Small>
        </Card>
      ) : null}

      {shown.map((e) => (
        <Card key={e.id} testID={`ep-${e.video_id}`} onPress={() => open(e.url)}>
          {e.thumbnail_url ? (
            <Image
              source={{ uri: e.thumbnail_url }}
              style={{
                width: '100%', aspectRatio: 16 / 9, maxWidth: '100%',
                borderRadius: radius.sm, marginBottom: space.md,
                backgroundColor: color.wash,
              }}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <Row style={{ justifyContent: 'space-between' }}>
            <Small>{formatDate(e.published_at, tz)}</Small>
            <Tiny style={{ color: color.blue }}>Watch ▸</Tiny>
          </Row>
          <H3 style={{ marginTop: 4 }}>{e.title}</H3>
        </Card>
      ))}

      <Card tone="wash" style={{ marginTop: space.md }}>
        <Eyebrow>Everything else</Eyebrow>
        <Small>
          Retreats near Chelan, speaking dates and the full archive live on the website.
        </Small>
        <Tiny
          testID="open-site"
          onPress={() => open('https://www.findingsomethingreal.com/')}
          style={{ marginTop: 10, textDecorationLine: 'underline', color: color.ink }}
        >
          findingsomethingreal.com
        </Tiny>
      </Card>
    </Screen>
  );
}
