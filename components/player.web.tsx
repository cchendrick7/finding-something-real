/**
 * The episode player, web build.
 *
 * react-native-webview has no web implementation, so the web build gets a plain
 * iframe of YouTube's official embed. On the web the page really is on a web
 * origin, so the embed is happy here — the served player.html is only needed
 * inside the native WebView (see lib/player-nav.ts).
 *
 * Same export as components/player.tsx; Metro picks this file for web.
 */
import { View } from 'react-native';
import { color, radius } from '@/lib/theme';
import { VIDEO_ID } from '@/lib/player-nav';

export type PlayerProps = {
  videoId: string;
  /** Seconds. Resume position from lib/library. */
  startAt?: number;
  /** Native only. The web iframe cannot see playback, so nothing is reported. */
  onProgress?: (at: number, duration: number) => void;
  onEnded?: () => void;
  onFallback?: () => void;
};

export function Player({ videoId, startAt = 0 }: PlayerProps) {
  // Nothing reaches the YouTube URL without matching this.
  if (!VIDEO_ID.test(videoId)) return null;
  const params = new URLSearchParams({
    // Since 2018 rel=0 means "related videos from this channel only".
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    ...(startAt > 0 ? { start: String(Math.floor(startAt)) } : {}),
  });
  return (
    <View
      testID="player"
      style={{
        width: '100%',
        aspectRatio: 16 / 9,
        backgroundColor: color.ink,
        borderRadius: radius.sm,
        overflow: 'hidden',
      }}
    >
      <iframe
        title="Episode player"
        data-testid="player-iframe"
        src={`https://www.youtube.com/embed/${videoId}?${params.toString()}`}
        style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </View>
  );
}
