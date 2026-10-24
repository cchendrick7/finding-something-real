/**
 * LINE HEIGHT THAT CANNOT CROP A GLYPH.
 *
 * A text style that overrides fontSize keeps the lineHeight it inherited. The
 * Stat tile took the body style (lineHeight 23) and set fontSize 30: the web
 * overflows a too-small line box, iOS crops to it, and a "0" read as a "U" on
 * TestFlight. Fixed here, inside the text helpers, rather than at the call
 * sites, so the next big number cannot reintroduce it.
 */
export const MIN_LEADING_RATIO = 1.1;
export const DEFAULT_LEADING_RATIO = 1.25;

/** The given lineHeight if it is tall enough for fontSize; otherwise a safe one. */
export function safeLeading(fontSize?: number, lineHeight?: number) {
  if (!fontSize || !lineHeight) return lineHeight;
  if (!Number.isFinite(fontSize) || !Number.isFinite(lineHeight)) return lineHeight;
  if (lineHeight >= fontSize * MIN_LEADING_RATIO) return lineHeight;
  return Math.round(fontSize * DEFAULT_LEADING_RATIO);
}
