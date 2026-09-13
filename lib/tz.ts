/**
 * Time zone handling. Spec §5.15.
 *
 * All timestamps are stored UTC and rendered in the viewer's own zone. Several
 * co-hosts this season are overseas, so a 6pm Pacific recording is 3am for
 * them — the app has to say so rather than quietly showing Pacific.
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

function parts(iso: string, tz: string) {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) out[p.type] = p.value;
  return out;
}

export function formatDate(iso: string, tz: string): string {
  const p = parts(iso, tz);
  return `${p.weekday}, ${p.month} ${p.day}`;
}

export function formatTime(iso: string, tz: string): string {
  const p = parts(iso, tz);
  return `${p.hour}:${p.minute}${(p.dayPeriod || '').toLowerCase()}`;
}

export function zoneAbbr(iso: string, tz: string): string {
  return parts(iso, tz).timeZoneName || '';
}

export function formatFull(iso: string, tz: string): string {
  return `${formatDate(iso, tz)} · ${formatTime(iso, tz)} ${zoneAbbr(iso, tz)}`;
}

/** Local hour 0-23 for a UTC instant in a given zone. */
export function localHour(iso: string, tz: string): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', hour12: false,
  }).format(new Date(iso));
  return parseInt(h, 10) % 24;
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
  const p: Record<string, string> = {};
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  for (const x of fmt.formatToParts(new Date(utcMs))) p[x.type] = x.value;
  // Some engines render midnight as hour 24 under hour12:false.
  const hour = p.hour === '24' ? '00' : p.hour;
  const asIfUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(hour), Number(p.minute), Number(p.second),
  );
  return asIfUtc - utcMs;
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
  const p: Record<string, string> = {};
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  for (const x of fmt.formatToParts(new Date(iso))) p[x.type] = x.value;
  const hour = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}` };
}
