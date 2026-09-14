import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/youtube-sync';
import { parseFeed } from './parse';

/**
 * Keeps PublicEpisode in step with the ministry's YouTube channel.
 *
 * Why a scheduled job rather than fetching the feed from the app: the public
 * screens are the first thing a stranger sees after installing, and the App
 * Store reviewer is one of those strangers. They have to render immediately
 * and they must not fail because YouTube was slow, or because a browser
 * refused a cross-origin request to youtube.com.
 *
 * The channel feed is public and needs no API key or quota. It returns only
 * the most recent ~15 uploads, which is fine: this runs every two hours, so
 * nothing is ever missed, and rows already written are never removed.
 */

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

// iam, for the same reason member-api uses it: the schema default is userPool
// and there is no user token on a scheduled invocation.
const db = generateClient<Schema>({ authMode: 'iam' });

const CHANNEL_ID = 'UCbsn5KFfTCfyLztOJIA-a7w';
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

/** See member-api: Limit caps rows SCANNED, not rows returned after a filter. */
async function existingByVideoId() {
  const map = new Map<string, string>();
  let nextToken: string | null | undefined;
  let pages = 0;
  do {
    const r = await db.models.PublicEpisode.list({ limit: 1000, nextToken });
    for (const row of r.data ?? []) map.set(row.videoId, row.id);
    nextToken = r.nextToken;
  } while (nextToken && ++pages < 20);
  return map;
}

export const handler = async () => {
  let xml: string;
  try {
    const res = await fetch(FEED, { headers: { 'user-agent': 'fsr-app/1.0' } });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    xml = await res.text();
  } catch (e) {
    // Never throw. A failed sync must leave yesterday's episodes on the
    // public screens, not empty them.
    console.log(JSON.stringify({ youtubeSync: 'feed unavailable', error: String(e) }));
    return { ok: false, reason: 'feed unavailable' };
  }

  const entries = parseFeed(xml);
  if (!entries.length) {
    console.log(JSON.stringify({ youtubeSync: 'feed parsed to zero entries — not touching existing rows' }));
    return { ok: false, reason: 'empty feed' };
  }

  const existing = await existingByVideoId();
  let created = 0;
  let updated = 0;

  for (const e of entries) {
    const id = existing.get(e.videoId);
    if (id) {
      // Titles get edited on YouTube after publishing; keep up.
      await db.models.PublicEpisode.update({ id, ...e });
      updated++;
    } else {
      await db.models.PublicEpisode.create(e);
      created++;
    }
  }

  console.log(JSON.stringify({ youtubeSync: 'ok', seen: entries.length, created, updated }));
  return { ok: true, seen: entries.length, created, updated };
};
