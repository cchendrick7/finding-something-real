import { useCallback, useState } from 'react';
import { View, Image, Linking, Share, Platform } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { listPublicEpisodes } from '@/lib/data';
import { detectZone, formatDate } from '@/lib/tz';
import { useLibrary, fractionOf, remainingLabel } from '@/lib/library';
import { Player } from '@/components/player';
import {
  Screen, Display, H3, Body, Small, Tiny, Card, Eyebrow, Rule, Row, Button, Pill,
} from '@/components/ui';
import { space, color, radius } from '@/lib/theme';
import type { PublicEpisode } from '@/lib/types';
import { onLoadError } from '@/lib/loadError';

/**
 * One episode, played inside the app.
 *
 * Guideline 4.2.2 (build 8): cards no longer hand off to YouTube. The episode
 * plays here in YouTube's official player — a WebView on the phone
 * (components/player.tsx), a plain iframe on the web (components/player.web.tsx).
 * "Open on YouTube" is still offered, quietly, for anyone who wants it.
 *
 * The route id is the YouTube video id, which is what a new-episode
 * notification carries; a row id still works so older links do not break.
 *
 * Saved, watched and the resume position live in lib/library — on this device
 * only. The line at the bottom of the screen says so.
 */
export default function EpisodeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tz = detectZone();
  const library = useLibrary();
  const [rows, setRows] = useState<PublicEpisode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [shared, setShared] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      setRows(await listPublicEpisodes());
      setLoaded(true);
    })().catch(onLoadError);
  }, []));

  const episode = rows.find((r) => r.video_id === id) ?? rows.find((r) => r.id === id) ?? null;

  // Opened from a notification there is nothing to go back to.
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(public)/listen');
  };

  if (!loaded) return <Screen><Body>Loading…</Body></Screen>;

  if (!episode) {
    return (
      <Screen>
        <Eyebrow>Not found</Eyebrow>
        <Display style={{ fontSize: 28, lineHeight: 32 }}>That episode{'\n'}isn’t here</Display>
        <Body style={{ marginTop: space.md }}>
          It may have been taken down, or the link may be from an older version of the app.
        </Body>
        <View style={{ height: space.lg }} />
        <Button testID="not-found-back" label="All episodes" onPress={back} />
      </Screen>
    );
  }

  const progress = library.progress[episode.video_id];
  const watched = Boolean(progress?.done);
  const saved = library.isSaved(episode.video_id);
  const startAt = library.resumeAt(episode.video_id);
  const left = remainingLabel(progress);

  // The share sheet where there is one; where there is not (most desktop
  // browsers), the link goes on the clipboard instead.
  const share = async () => {
    try {
      const result = await Share.share({ message: `${episode.title}\n${episode.url}`, url: episode.url });
      if (result.action !== Share.dismissedAction) setShared(true);
    } catch {
      await Clipboard.setStringAsync(episode.url).catch(() => {});
      setShared(true);
    }
  };

  const more = rows
    .filter((e) => e.kind === episode.kind && e.video_id !== episode.video_id)
    .slice(0, 3);

  return (
    <Screen>
      <Tiny
        testID="episode-back"
        onPress={back}
        style={{ marginBottom: space.md, color: color.muted }}
      >
        ← All episodes
      </Tiny>

      <Player
        videoId={episode.video_id}
        startAt={startAt}
        onProgress={(at, duration) => library.markPosition(episode.video_id, at, duration)}
        onEnded={() => library.setWatched(episode.video_id, true)}
      />
      {startAt > 0 ? (
        <Tiny testID="resumed" style={{ marginTop: space.sm }}>
          Picking up where you stopped{left ? ` · ${left}` : ''}.
        </Tiny>
      ) : null}

      <Row style={{ marginTop: space.lg, justifyContent: 'space-between' }}>
        <Small>{formatDate(episode.published_at, tz)}</Small>
        {watched ? <Pill label="Watched" tone="sage" /> : null}
      </Row>
      <H3 testID="episode-title" style={{ fontSize: 22, lineHeight: 28, marginTop: 4 }}>
        {episode.title}
      </H3>
      {episode.blurb ? (
        <>
          <Body
            testID="episode-blurb"
            numberOfLines={!expanded && episode.blurb.length > 240 ? 5 : undefined}
            style={{ marginTop: space.md }}
          >
            {episode.blurb}
          </Body>
          {episode.blurb.length > 240 ? (
            <Tiny
              testID="toggle-blurb"
              onPress={() => setExpanded((v) => !v)}
              style={{ marginTop: 6, color: color.blue }}
            >
              {expanded ? 'Show less' : 'Show more'}
            </Tiny>
          ) : null}
        </>
      ) : null}

      <Rule style={{ marginVertical: space.lg }} />

      <Row>
        <View style={{ flex: 1 }}>
          <Button
            testID="toggle-save"
            label={saved ? 'Saved' : 'Save'}
            variant={saved ? 'solid' : 'outline'}
            onPress={() => library.toggleSave(episode.video_id)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            testID="toggle-watched"
            label={watched ? 'Mark unwatched' : 'Mark watched'}
            variant="outline"
            onPress={() => library.setWatched(episode.video_id, !watched)}
          />
        </View>
      </Row>
      <View style={{ height: space.sm }} />
      <Button
        testID="share-episode"
        label={shared ? (Platform.OS === 'web' ? 'Link copied' : 'Shared') : 'Share this episode'}
        variant="quiet"
        onPress={() => { share().catch(onLoadError); }}
      />
      <View style={{ height: space.sm }} />
      <Tiny
        testID="open-on-youtube"
        onPress={() => { Linking.openURL(episode.url).catch(onLoadError); }}
        style={{ textAlign: 'center', textDecorationLine: 'underline', color: color.muted }}
      >
        Open on YouTube
      </Tiny>

      {more.length ? (
        <>
          <Eyebrow style={{ marginTop: space.xxl }}>
            {episode.kind === 'short' ? 'More clips' : 'More episodes'}
          </Eyebrow>
          {more.map((m) => {
            const p = library.progress[m.video_id];
            const fraction = fractionOf(p);
            return (
              <Card key={m.id} testID={`more-${m.video_id}`} onPress={() => router.push(`/episode/${m.video_id}`)}>
                <Row>
                  {m.thumbnail_url ? (
                    <Image
                      source={{ uri: m.thumbnail_url }}
                      style={{
                        width: 104, aspectRatio: 16 / 9,
                        borderRadius: radius.sm, backgroundColor: color.wash,
                      }}
                      resizeMode="cover"
                      accessibilityIgnoresInvertColors
                    />
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Tiny>{formatDate(m.published_at, tz)}</Tiny>
                    <Small numberOfLines={2} style={{ color: color.ink, marginTop: 2 }}>{m.title}</Small>
                  </View>
                </Row>
                {fraction > 0 ? (
                  <View style={{ height: 3, backgroundColor: color.line, marginTop: space.md }}>
                    <View
                      style={{
                        height: 3,
                        width: `${Math.round(fraction * 100)}%`,
                        backgroundColor: p?.done ? color.sage : color.blue,
                      }}
                    />
                  </View>
                ) : null}
              </Card>
            );
          })}
        </>
      ) : null}

      <Tiny style={{ marginTop: space.lg }}>
        Where you stopped, what you saved and what you have finished are kept on this phone
        only. Nobody at the ministry can see them, and they do not follow you to a new phone.
      </Tiny>
    </Screen>
  );
}
