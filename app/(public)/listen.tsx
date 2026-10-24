import { useCallback, useMemo, useState } from 'react';
import { View, Image, Linking, TextInput } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { listPublicEpisodes } from '@/lib/data';
import { detectZone } from '@/lib/tz';
import { useLibrary, fractionOf, remainingLabel } from '@/lib/library';
import {
  Screen, Display, H2, Body, Small, Tiny, Card, Eyebrow, Rule, Row, Wrap,
} from '@/components/ui';
import { EpisodeAlertsCard } from '@/components/notifications';
import { EpisodeCard } from '@/components/episode-card';
import { space, color, radius, type } from '@/lib/theme';
import type { PublicEpisode } from '@/lib/types';
import { onLoadError } from '@/lib/loadError';

type Filter = 'episode' | 'short' | 'saved';

/**
 * Every episode, free, no account.
 *
 * Shorts and full episodes share one YouTube feed, and the shorts outnumber
 * the episodes roughly four to one — listed together they bury the thing most
 * people came for, so the filter defaults to full episodes.
 *
 * Since build 8 an episode opens in the app (app/episode/[id].tsx) rather than
 * handing off to YouTube, and the list gained search, a year filter, a "Keep
 * listening" card and a Saved list. Saved and progress come from lib/library,
 * which lives on this device only.
 */
export default function Listen() {
  const router = useRouter();
  const library = useLibrary();
  const [rows, setRows] = useState<PublicEpisode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>('episode');
  const [year, setYear] = useState<string>('all');
  const [query, setQuery] = useState('');
  const tz = detectZone();

  useFocusEffect(useCallback(() => {
    (async () => {
      setRows(await listPublicEpisodes());
      setLoaded(true);
    })().catch(onLoadError);
  }, []));

  const episodeCount = rows.filter((r) => r.kind === 'episode').length;
  const shortCount = rows.filter((r) => r.kind === 'short').length;
  const savedCount = rows.filter((r) => library.isSaved(r.video_id)).length;

  // Years present in the current list, newest first. One year is no filter at all.
  const years = useMemo(() => {
    const inList = filter === 'saved'
      ? rows.filter((r) => library.isSaved(r.video_id))
      : rows.filter((r) => r.kind === filter);
    return [...new Set(inList.map((r) => r.published_at.slice(0, 4)))].sort().reverse();
  }, [rows, filter, library]);

  const q = query.trim().toLowerCase();
  const shown = rows
    .filter((r) => (filter === 'saved' ? library.isSaved(r.video_id) : r.kind === filter))
    .filter((r) => year === 'all' || r.published_at.startsWith(year))
    .filter((r) => !q || r.title.toLowerCase().includes(q) || (r.blurb ?? '').toLowerCase().includes(q));

  // The most recently played episode that is started and not finished.
  const resume = library
    .keepListening()
    .map((id) => rows.find((r) => r.video_id === id))
    .find((r) => Boolean(r));

  const openEpisode = (e: PublicEpisode) => router.push(`/episode/${e.video_id}`);
  const openUrl = (url: string) => { Linking.openURL(url).catch(onLoadError); };

  const chip = (testID: string, label: string, active: boolean, onPress: () => void) => (
    <Tiny
      key={testID}
      testID={testID}
      onPress={onPress}
      style={{
        borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 13,
        borderColor: active ? color.ink : color.line,
        color: active ? color.ink : color.muted,
      }}
    >
      {label}
    </Tiny>
  );

  return (
    <Screen>
      <Eyebrow>New every Wednesday</Eyebrow>
      {/* Build 12: Janell's line on the front, REAL in capitals as she wrote it.
          Who hosts it stays underneath, in a quieter voice. */}
      <Display>Finding{'\n'}Something{'\n'}REAL</Display>
      <H2 style={{ marginTop: space.md }}>
        An honest space created for young women asking big questions.
      </H2>
      <Small style={{ marginTop: space.sm }}>
        Hosted by Janell Wood with a cohort of young women in their late teens and twenties.
      </Small>
      <Rule style={{ marginVertical: space.lg }} />

      {resume ? (
        <Card tone="blue" testID="keep-listening" onPress={() => openEpisode(resume)}>
          <Eyebrow tone={color.blue}>Keep listening</Eyebrow>
          <Row>
            {resume.thumbnail_url ? (
              <Image
                source={{ uri: resume.thumbnail_url }}
                style={{
                  width: 96, aspectRatio: 16 / 9,
                  borderRadius: radius.sm, backgroundColor: color.wash,
                }}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ) : null}
            <View style={{ flex: 1 }}>
              <Small numberOfLines={2} style={{ color: color.ink }}>{resume.title}</Small>
              <Tiny style={{ marginTop: 2 }}>
                {remainingLabel(library.progress[resume.video_id]) ?? 'Pick up where you left off'}
              </Tiny>
            </View>
          </Row>
          <View style={{ height: 3, backgroundColor: color.line, marginTop: space.md }}>
            <View
              style={{
                height: 3,
                backgroundColor: color.blue,
                width: `${Math.round(fractionOf(library.progress[resume.video_id]) * 100)}%`,
              }}
            />
          </View>
        </Card>
      ) : null}

      <TextInput
        testID="episode-search"
        value={query}
        onChangeText={setQuery}
        placeholder="Search episodes"
        placeholderTextColor={color.faint}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        accessibilityLabel="Search episodes"
        style={{
          borderWidth: 1, borderColor: color.line, borderRadius: radius.pill,
          paddingHorizontal: 16, paddingVertical: 11, fontSize: 15,
          backgroundColor: color.white, color: color.ink,
          fontFamily: type.body.fontFamily,
          marginBottom: space.md,
        }}
      />

      {/* Changing list resets the year: a year that exists in one list may not in the other. */}
      <Wrap>
        {chip('filter-episode', `Episodes ${episodeCount}`, filter === 'episode', () => { setFilter('episode'); setYear('all'); })}
        {chip('filter-short', `Clips ${shortCount}`, filter === 'short', () => { setFilter('short'); setYear('all'); })}
        {savedCount > 0
          ? chip('filter-saved', `Saved ${savedCount}`, filter === 'saved', () => { setFilter('saved'); setYear('all'); })
          : null}
      </Wrap>
      {years.length > 1 ? (
        <View style={{ marginTop: 6 }}>
          <Wrap>
            {chip('year-all', 'All years', year === 'all', () => setYear('all'))}
            {years.map((y) => chip(`year-${y}`, y, year === y, () => setYear(y)))}
          </Wrap>
        </View>
      ) : null}
      <View style={{ height: space.md }} />

      <EpisodeAlertsCard />
      <View style={{ height: space.sm }} />

      {!loaded ? <Body>Loading…</Body> : null}

      {loaded && shown.length === 0 ? (
        <Card tone="wash" testID="empty-list">
          <Eyebrow>{q ? 'No matches' : 'Nothing here yet'}</Eyebrow>
          <Small>
            {q
              ? `Nothing in ${filter === 'saved' ? 'your saved episodes' : 'this list'} mentions “${query.trim()}”.`
              : filter === 'saved'
                ? 'Save an episode and it will wait for you here.'
                : 'New episodes appear automatically. In the meantime the whole back catalogue is on YouTube.'}
          </Small>
        </Card>
      ) : null}

      {shown.map((e) => (
        <EpisodeCard key={e.id} episode={e} tz={tz} onOpen={openEpisode} />
      ))}

      <Card tone="wash" style={{ marginTop: space.md }}>
        <Eyebrow>Everything else</Eyebrow>
        <Small>
          Retreats near Chelan, speaking dates and the full archive live on the website.
        </Small>
        <Tiny
          testID="open-site"
          onPress={() => openUrl('https://www.findingsomethingreal.com/')}
          style={{ marginTop: 10, textDecorationLine: 'underline', color: color.ink }}
        >
          findingsomethingreal.com
        </Tiny>
      </Card>
    </Screen>
  );
}
