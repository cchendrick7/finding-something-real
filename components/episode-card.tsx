import { View, Image, Pressable } from 'react-native';
import { Card, Row, Small, Tiny, H3, Pill } from '@/components/ui';
import { useLibrary, fractionOf, remainingLabel } from '@/lib/library';
import { formatDate } from '@/lib/tz';
import { space, color, radius } from '@/lib/theme';
import type { PublicEpisode } from '@/lib/types';

/**
 * One episode in a list: artwork with a progress bar, date, how much is left,
 * title, and Save.
 *
 * Shared by Listen and the co-host Episodes tab (build 11): a co-host should not
 * get less than a stranger who installed the app.
 *
 * The press target is explicit — a Pressable around the artwork and text, not
 * the whole Card — because Save sits inside the card, and tapping Save must not
 * also open the episode.
 */
export function EpisodeCard({
  episode,
  tz,
  onOpen,
  showSave = true,
}: {
  episode: PublicEpisode;
  tz: string;
  onOpen: (episode: PublicEpisode) => void;
  showSave?: boolean;
}) {
  const library = useLibrary();
  const progress = library.progress[episode.video_id];
  const fraction = fractionOf(progress);
  const saved = library.isSaved(episode.video_id);
  const left = remainingLabel(progress);

  return (
    <Card testID={`ep-${episode.video_id}`}>
      <Pressable
        testID={`open-${episode.video_id}`}
        accessibilityRole="button"
        accessibilityLabel={`Play ${episode.title}`}
        onPress={() => onOpen(episode)}
      >
        {episode.thumbnail_url ? (
          <View style={{ marginBottom: space.md }}>
            <Image
              source={{ uri: episode.thumbnail_url }}
              style={{
                width: '100%', aspectRatio: 16 / 9, maxWidth: '100%',
                borderRadius: radius.sm,
                backgroundColor: color.wash,
              }}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
            {fraction > 0 ? (
              <View
                style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0, height: 4,
                  backgroundColor: 'rgba(0,0,0,0.25)',
                  borderBottomLeftRadius: radius.sm, borderBottomRightRadius: radius.sm,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: 4,
                    width: `${Math.round(fraction * 100)}%`,
                    backgroundColor: progress?.done ? color.sage : color.blue,
                  }}
                />
              </View>
            ) : null}
          </View>
        ) : null}
        <Row style={{ justifyContent: 'space-between' }}>
          <Small>{formatDate(episode.published_at, tz)}</Small>
          {progress?.done ? (
            <Pill label="Watched" tone="sage" />
          ) : left ? (
            <Tiny style={{ color: color.blue }}>{left}</Tiny>
          ) : (
            <Tiny style={{ color: color.blue }}>Play ▸</Tiny>
          )}
        </Row>
        <H3 style={{ marginTop: 4 }}>{episode.title}</H3>
      </Pressable>

      {showSave ? (
        <Row style={{ marginTop: space.md, justifyContent: 'flex-end' }}>
          <Tiny
            testID={`save-${episode.video_id}`}
            onPress={() => library.toggleSave(episode.video_id)}
            accessibilityLabel={saved ? `Remove ${episode.title} from saved` : `Save ${episode.title}`}
            style={{
              borderWidth: 1, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12,
              borderColor: saved ? color.ink : color.line,
              color: saved ? color.ink : color.muted,
            }}
          >
            {saved ? '★ Saved' : '☆ Save'}
          </Tiny>
        </Row>
      ) : null}
    </Card>
  );
}
