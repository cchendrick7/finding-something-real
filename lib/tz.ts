/**
 * Time zone handling. Spec §5.15.
 *
 * All timestamps are stored UTC and rendered in the viewer's own zone. Several
 * co-hosts this season are overseas, so a 6pm Pacific recording is 3am for
 * them — the app has to say so rather than quietly showing Pacific.
 *
 * .format() ONLY. Intl formatToParts is only partly implemented on Hermes: it
 * dropped hour/minute/timeZoneName, so times read "undefined:undefined".
 * Every function here goes through
 * one code path on every engine — format a string, read it back — and
 * scripts/render-test.mjs covers it.
 */

export const COMMON_ZONES = [
  { id: 'America/Los_Angeles', label: 'Pacific — Los Angeles' },
  { id: 'America/Denver', label: 'Mountain — Denver' },
  { id: 'America/Chicago', label: 'Central — Chicago' },
  { id: 'America/New_York', label: 'Eastern — New York' },
  { id: 'Europe/London', label: 'United Kingdom — London' },
  { id: 'Europe/Amsterdam', label: 'Central Europe — Amsterdam' },
  { id: 'Africa/Nairobi', label: 'East Africa — Nairobi' },
  { id: 'Asia/Manila', label: 'Philippines — Manila' },
  { id: 'Australia/Sydney', label: 'Australia — Sydney' },
] as const;

export function detectZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
  } catch {
    return 'America/Los_Angeles';
  }
}

function fmt(tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts });
}

/** "Thu, Sep 10" */
export function formatDate(iso: string, tz: string): string {
  return fmt(tz, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso));
}

/** "6:00pm" — "6:00 PM" with the space (a narrow no-break space on some engines) taken out. */
export function formatTime(iso: string, tz: string): string {
  return fmt(tz, { hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(iso))
    .replace(/\s+/g, '')
    .toLowerCase();
}

/**
 * "PDT", "GMT+3". Format the hour with and without the zone name and take the
 * difference — what is left is the zone name, whatever order the engine puts
 * it in.
 */
export function zoneAbbr(iso: string, tz: string): string {
  const d = new Date(iso);
  const withZone = fmt(tz, { hour: 'numeric', timeZoneName: 'short' }).format(d);
  const hourOnly = fmt(tz, { hour: 'numeric' }).format(d);
  return withZone.replace(hourOnly, '').replace(/^[\s,]+|[\s,]+$/g, '');
}

export function formatFull(iso: string, tz: string): string {
  return `${formatDate(iso, tz)} · ${formatTime(iso, tz)} ${zoneAbbr(iso, tz)}`;
}

/** Local hour 0-23 for a UTC instant in a given zone. */
export function localHour(iso: string, tz: string): number {
  return wallClock(new Date(iso), tz).hour;
}

/**
 * "Unsociable" = 10pm–6am local. Drives both the co-host heads-up and the
 * admin scheduling warning. Without this a co-host silently misses a session
 * scheduled over her sleep and it reads as disengagement.
 */
export function isUnsociable(iso: string, tz: string): boolean {
  const h = localHour(iso, tz);
  return h >= 22 || h < 6;
}

/** Quiet hours for BROADCAST pushes only, in the recipient's own zone. */
export function inQuietHours(at: Date, tz: string): boolean {
  const h = localHour(at.toISOString(), tz);
  return h >= 21 || h < 8;
}

export type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/**
 * The wall-clock fields of an instant in `tz`, read out of one formatted
 * string ("09/10/2026, 18:00:00" in en-US) rather than formatToParts.
 */
export function wallClock(at: Date, tz: string): WallClock {
  const s = fmt(tz, {
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(at);
  const m = s.match(/(\d+)\D+(\d+)\D+(\d+)\D+(\d+)\D+(\d+)\D+(\d+)/);
  if (!m) throw new Error(`Cannot read the wall clock in ${tz} from "${s}"`);
  const [, month, day, year, hour, minute, second] = m;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    // Some engines render midnight as hour 24 under hour12:false.
    hour: Number(hour) % 24,
    minute: Number(minute),
    second: Number(second),
  };
}

/* --------------------------------------------------- writing a time back */

/**
 * Offset, in ms, that `tz` was at a given UTC instant. Positive east of UTC.
 *
 * There is no built-in for this. The trick is to format the instant in the
 * target zone, read the wall-clock fields back, and reinterpret them as if
 * they were UTC — the difference is the offset that applied at that moment,
 * which is what makes it DST-correct rather than a fixed guess.
 */
function zoneOffsetMs(utcMs: number, tz: string): number {
  const w = wallClock(new Date(utcMs), tz);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - utcMs;
}

/**
 * "2026-09-10" + "18:00" as wall-clock time in `tz` -> the UTC instant.
 *
 * Two passes, deliberately. The first guesses the offset using the wall time
 * read as UTC; near a DST boundary that guess can land on the wrong side, so
 * the second pass re-reads the offset at the instant we actually computed and
 * corrects. Without it, a session scheduled the week the clocks change lands
 * an hour out — and the people it would be wrong for are the overseas
 * co-hosts this whole time-zone feature exists to protect.
 */
export function zonedToUtcIso(date: string, time: string, tz: string): string {
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(naive)) throw new Error(`Bad date/time: ${date} ${time}`);
  const first = naive - zoneOffsetMs(naive, tz);
  const corrected = naive - zoneOffsetMs(first, tz);
  return new Date(corrected).toISOString();
}

/** Inverse of zonedToUtcIso — for prefilling an edit form. */
export function utcIsoToZonedFields(iso: string, tz: string): { date: string; time: string } {
  const w = wallClock(new Date(iso), tz);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return {
    date: `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`,
    time: `${pad(w.hour)}:${pad(w.minute)}`,
  };
}
