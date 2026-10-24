/**
 * Where the episode player lives, and the one rule for what the player WebView
 * may load.
 *
 * No React and no react-native in here on purpose: scripts/player-test.mjs
 * imports this file directly and tests the rule without an app around it.
 *
 * WHY THE PAGE IS SERVED. Builds 8 and 9 handed the WebView raw HTML with a
 * claimed youtube.com origin. YouTube answered "Error code: 152". Since build 10
 * public/player.html is deployed with the web app on the ministry's own host,
 * and the WebView is simply pointed at it. PLAYER_ORIGIN is that host — the one
 * URL the app is compiled with.
 */

export const PLAYER_ORIGIN = 'https://main.d1jiok92baqhp9.amplifyapp.com';

/** The same check public/player.html makes before anything reaches YouTube. */
export const VIDEO_ID = /^[A-Za-z0-9_-]{6,24}$/;

/** The served player page for one video, or null if the id is not a video id. */
export function playerUrl(videoId: string, startAt: number = 0): string | null {
  if (!VIDEO_ID.test(videoId)) return null;
  const start = Number.isFinite(startAt) && startAt > 0 ? Math.floor(startAt) : 0;
  const params = new URLSearchParams({ v: videoId });
  if (start > 0) params.set('start', String(start));
  return `${PLAYER_ORIGIN}/player.html?${params.toString()}`;
}

export type NavRequest = {
  url?: string | null;
  isTopFrame?: boolean;
  /** iOS only: 'click' | 'formsubmit' | 'backforward' | 'reload' | 'formresubmit' | 'other'. */
  navigationType?: string;
};

export type NavContext = {
  /** True once the player page itself has finished loading. */
  documentLoaded: boolean;
  os: string;
};

export type NavDecision = 'load' | 'leave';

/**
 * Should this request load inside the player, or leave the app?
 *
 * LEAVING IS THE EXCEPTION (build 9). Every episode used to launch YouTube and
 * then go blank: iOS reported the initial document load as a top-frame
 * navigation, and the old rule sent it out. Now a request goes out of the app
 * only when it is a top-frame click to http(s) that is not the player document.
 * Everything else — sub-frames (the YouTube iframe itself), anything before the
 * page has loaded, non-web schemes, the player page — stays in.
 */
export function decideNavigation(req: NavRequest, ctx: NavContext): NavDecision {
  // The YouTube embed and everything it loads are sub-frames.
  if (!req.isTopFrame) return 'load';
  // The player page's own load, however the platform chooses to report it.
  if (!ctx.documentLoaded) return 'load';
  const url = req.url ?? '';
  // about:blank, data:, blob: and friends are the page's own business.
  if (!/^https?:/i.test(url)) return 'load';
  if (isPlayerDocument(url)) return 'load';
  // iOS tells us how a navigation started. Only a click is someone choosing to
  // go somewhere; a redirect or reload is not.
  if (req.navigationType && req.navigationType !== 'click' && ctx.os === 'ios') return 'load';
  return 'leave';
}

/** The player page (any query) or the bare origin it is served from. */
function isPlayerDocument(url: string): boolean {
  return (
    url.startsWith(`${PLAYER_ORIGIN}/player.html`) ||
    url.replace(/[?#].*$/, '').replace(/\/+$/, '') === PLAYER_ORIGIN
  );
}
