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

/** Roughly a screenful on a phone. Enough to say what the episode is about. */
const BLURB_MAX = 500;

/**
 * The description, made fit to read on a card.
 *
 * YouTube descriptions are written for the YouTube page: several hundred words,
 * a wall of blank lines, then links and hashtags. The opening paragraph is the
 * part worth keeping, so this keeps that — but it used to keep exactly the
 * first 500 characters, which on the episode screen ended a sentence with "In
 * this episode, we g". A cut in the middle of a word reads as a broken app,
 * not as an abbreviation, so this cuts on the last space and says it was cut.
 *
 * The blank-line collapsing is the other half: three paragraph breaks in a row
 * put half a screen of nothing between two sentences.
 */
function blurbFrom(description: string | null): string | null {
  if (!description) return null;
  const text = decode(description)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) return null;
  if (text.length <= BLURB_MAX) return text;

  const cut = text.slice(0, BLURB_MAX);
  const brk = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
  // A description with no whitespace in its first 500 characters is not a
  // sentence; cut it at the limit rather than throwing the whole thing away.
  const end = brk > BLURB_MAX * 0.6 ? brk : BLURB_MAX;
  return `${cut.slice(0, end).replace(/[\s.,;:—-]+$/, '')}…`;
}

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
      blurb: blurbFrom(description),
    });
  }
  return out;
}
