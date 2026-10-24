/**
 * The episode player, native build: a WebView pointed at our own served
 * player page (public/player.html), which runs YouTube's official IFrame player.
 *
 * Guideline 4.2.2 (build 8): episodes play inside the app, not by handing off
 * to YouTube.
 *
 * Build 10: the page is SERVED, not faked. Builds 8 and 9 loaded raw HTML with
 * a claimed youtube.com origin and YouTube answered "Error code: 152". Now this
 * is just a WebView at playerUrl() — the address lives in lib/player-nav.ts.
 *
 * Build 9: the navigation rule (decideNavigation, also in lib/player-nav.ts) —
 * leaving the app is the exception. onOpenWindow is there so "Watch on YouTube"
 * inside the embed (target _blank) reaches the YouTube app. The give-up timer is
 * 15 s, not 8, and the failure card offers "Try again" first (a new key remounts
 * the WebView), with YouTube beneath it.
 *
 * The page talks to us one way, over postMessage: ready / time / ended / error.
 * We never send it anything.
 *
 * The web build uses components/player.web.tsx instead — react-native-webview
 * has no web implementation.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Linking, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { VIDEO_ID, playerUrl, decideNavigation } from '@/lib/player-nav';
import { Small, Tiny, Button } from '@/components/ui';
import { color, radius, space } from '@/lib/theme';
import { onLoadError } from '@/lib/loadError';

export type PlayerProps = {
  videoId: string;
  /** Seconds. Resume position from lib/library. */
  startAt?: number;
  /** Every few seconds while playing, and on pause and end. */
  onProgress?: (at: number, duration: number) => void;
  onEnded?: () => void;
  /** Called when she gives up on the in-app player and goes to YouTube. */
  onFallback?: () => void;
};

export function Player({ videoId, startAt = 0, onProgress, onEnded, onFallback }: PlayerProps) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // Bumped by "Try again"; used as the WebView's key, so a new value remounts it.
  const [attempt, setAttempt] = useState(0);
  // False until the first navigation request — the player page itself — has been seen.
  const documentLoaded = useRef(false);
  // Fixed at mount. startAt moves as progress is recorded; the page must not
  // reload every time it does.
  const uri = useRef(playerUrl(videoId, startAt)).current;

  useEffect(() => {
    if (ready || failed) return;
    // 15 s, not 8: the first thing the page fetches is YouTube's player script over
    // whatever signal the phone has, and a spinner that quits while a slow network
    // is still working says the app is broken when it is not.
    const timer = setTimeout(() => setFailed(true), 15000);
    return () => clearTimeout(timer);
  }, [ready, failed]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    let msg: { t?: string; at?: unknown; dur?: unknown } = {};
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return; // not ours, or not JSON
    }
    if (msg.t === 'ready') {
      setReady(true);
      setFailed(false);
    } else if (msg.t === 'time') {
      onProgress?.(Number(msg.at) || 0, Number(msg.dur) || 0);
    } else if (msg.t === 'ended') {
      onEnded?.();
    } else if (msg.t === 'error') {
      setFailed(true);
    }
  }, [onProgress, onEnded]);

  if (!VIDEO_ID.test(videoId) || !uri) return null;
  const youtube = `https://www.youtube.com/watch?v=${videoId}`;

  return (
    <View>
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
        <WebView
          key={attempt}
          source={{ uri }}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          // Plays in the page on iPhone instead of the system fullscreen player.
          allowsInlineMediaPlayback
          allowsPictureInPictureMediaPlayback
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          scrollEnabled={false}
          bounces={false}
          style={{ backgroundColor: color.ink }}
          onShouldStartLoadWithRequest={(request) => {
            const decision = decideNavigation(request, {
              os: Platform.OS,
              documentLoaded: documentLoaded.current,
            });
            documentLoaded.current = true;
            if (decision === 'load') return true;
            Linking.openURL(request.url ?? '').catch(onLoadError);
            return false;
          }}
          onOpenWindow={(event) => {
            const url = event.nativeEvent?.targetUrl;
            if (url) Linking.openURL(url).catch(onLoadError);
          }}
        />
      </View>

      {failed ? (
        <View
          testID="player-fallback"
          style={{
            backgroundColor: color.goldWash,
            borderRadius: radius.sm,
            padding: space.md,
            marginTop: space.sm,
          }}
        >
          <Small style={{ color: color.inkSoft, marginBottom: space.sm }}>
            The player is taking longer than it should — usually that means a slow connection.
          </Small>
          <Button
            testID="player-retry"
            label="Try again"
            variant="outline"
            onPress={() => {
              documentLoaded.current = false;
              setFailed(false);
              setReady(false);
              setAttempt((n) => n + 1);
            }}
          />
          <View style={{ height: 8 }} />
          <Button
            testID="player-fallback-open"
            label="Watch on YouTube"
            variant="quiet"
            onPress={() => {
              onFallback?.();
              Linking.openURL(youtube).catch(onLoadError);
            }}
          />
        </View>
      ) : null}

      {!ready && !failed ? <Tiny style={{ marginTop: 6 }}>Loading the player…</Tiny> : null}
    </View>
  );
}
