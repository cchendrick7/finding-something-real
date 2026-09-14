/**
 * YouTube channel feed parsing. Pure — no AWS, no network, no side effects, so
 * scripts/feed-test.mjs can exercise it against the real feed without
 * credentials. The handler imports this; there is no second copy.
 */

export interface FeedEntry {
  videoId: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  publishedAt: string;
  kind: 'episode' | 'short';
  blurb: string | null;
}

const between = (block: string, tag: string): string | null => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
};

const attr = (block: string, tag: string, name: string): string | null => {
  const m = block.match(new RegExp(`<${tag}[^>]*\\b${name}="([^"]*)"`));
  return m ? m[1] : null;
};

/** The feed uses these five entities and no others. */
const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/**
 * Fields are read WITHIN each <entry> block, never by collecting all titles
 * and all dates and zipping them — the elements do not appear in a matching
 * order, and pairing by index silently attaches the wrong date to every row.
 */
export function parseFeed(xml: string): FeedEntry[] {
  const out: FeedEntry[] = [];
  for (const raw of xml.split('<entry>').slice(1)) {
    const block = raw.split('</entry>')[0];
    const videoId = between(block, 'yt:videoId');
    const rawTitle = between(block, 'media:title') ?? between(block, 'title');
    const published = between(block, 'published');
    if (!videoId || !rawTitle || !published) continue;

    const title = decode(rawTitle).trim();
    const description = between(block, 'media:description');

    out.push({
      videoId,
      // "#shorts" is a discovery tag, not part of the name. Left in, it would
      // be the loudest thing on every card.
      title: title.replace(/\s*#shorts\b/gi, '').trim() || title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: attr(block, 'media:thumbnail', 'url')
        ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      publishedAt: published,
      kind: /#shorts\b/i.test(title) ? 'short' : 'episode',
      blurb: description ? decode(description).trim().slice(0, 500) || null : null,
    });
  }
  return out;
}
