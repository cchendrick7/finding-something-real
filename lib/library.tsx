/**
 * The listener's own library: saved episodes, what she has watched, and where
 * she stopped.
 *
 * ON THE DEVICE ONLY. No account, no sync, nothing the ministry can read. The
 * privacy screen says so, and says the consequence: a new phone starts empty.
 * That is the price of not knowing what anyone watches, and it is the right
 * price for this ministry.
 *
 * AsyncStorage is localStorage on the web build, so one code path serves both.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'fsr.library.v1';

/** Past this share of the running time an episode counts as watched (end cards). */
const WATCHED_AT = 0.93;

/** Under this many seconds in, there is nothing worth resuming. */
const MIN_RESUME = 20;

export type Progress = {
  /** Seconds in. */
  at: number;
  /** Running time in seconds, 0 while unknown. */
  dur: number;
  done: boolean;
  /** When this was last touched (ms). Orders "Keep listening". */
  t: number;
};

type Stored = {
  /** Video ids, most recently saved first. */
  saved: string[];
  progress: Record<string, Progress>;
};

export type Library = Stored & {
  /** False until storage has been read; nothing is written before then. */
  ready: boolean;
  isSaved: (videoId: string) => boolean;
  toggleSave: (videoId: string) => void;
  markPosition: (videoId: string, at: number, duration?: number) => void;
  setWatched: (videoId: string, watched: boolean) => void;
  forget: (videoId: string) => void;
  /** Seconds to start from, or 0 to start at the beginning. */
  resumeAt: (videoId: string) => number;
  /** Started and not finished, most recent first. */
  keepListening: () => string[];
};

const EMPTY: Stored = { saved: [], progress: {} };

const LibraryContext = createContext<Library | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Stored>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (alive) setState(parse(raw));
      })
      // Unreadable storage is an empty library, not a broken app.
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // The player reports every few seconds; write at most once it settles.
  const latest = useRef(state);
  latest.current = state;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Never write before the read: it would overwrite the library with EMPTY.
    if (!ready) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify(latest.current)).catch(() => {});
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state, ready]);

  const toggleSave = useCallback((videoId: string) => {
    setState((s) => ({
      ...s,
      saved: s.saved.includes(videoId) ? s.saved.filter((id) => id !== videoId) : [videoId, ...s.saved],
    }));
  }, []);

  const markPosition = useCallback((videoId: string, at: number, duration?: number) => {
    if (!Number.isFinite(at) || at < 0) return;
    setState((s) => {
      const prev = s.progress[videoId];
      const dur = Number.isFinite(duration) && duration! > 0 ? duration! : (prev?.dur ?? 0);
      // Once watched, stays watched — scrubbing back does not undo it.
      const done = prev?.done || (dur > 0 && at >= dur * WATCHED_AT);
      // Same second, same facts: keep the same object so nothing re-renders or writes.
      if (prev && Math.abs(prev.at - at) < 1 && prev.dur === dur && prev.done === done) return s;
      return { ...s, progress: { ...s.progress, [videoId]: { at, dur, done, t: Date.now() } } };
    });
  }, []);

  const setWatched = useCallback((videoId: string, watched: boolean) => {
    setState((s) => {
      const prev = s.progress[videoId] ?? { at: 0, dur: 0, done: false, t: 0 };
      return {
        ...s,
        progress: {
          ...s.progress,
          // Unmarking starts it over rather than resuming near the end.
          [videoId]: watched
            ? { ...prev, done: true, t: Date.now() }
            : { at: 0, dur: prev.dur, done: false, t: Date.now() },
        },
      };
    });
  }, []);

  const forget = useCallback((videoId: string) => {
    setState((s) => {
      const progress = { ...s.progress };
      delete progress[videoId];
      return { ...s, progress };
    });
  }, []);

  const value = useMemo<Library>(
    () => ({
      ...state,
      ready,
      isSaved: (videoId) => state.saved.includes(videoId),
      toggleSave,
      markPosition,
      setWatched,
      forget,
      resumeAt: (videoId) => {
        const p = state.progress[videoId];
        if (!p || p.done || p.at < MIN_RESUME || (p.dur > 0 && p.at >= p.dur * WATCHED_AT)) return 0;
        return Math.floor(p.at);
      },
      keepListening: () =>
        Object.entries(state.progress)
          .filter(([, p]) => !p.done && p.at >= MIN_RESUME)
          .sort((a, b) => b[1].t - a[1].t)
          .map(([videoId]) => videoId),
    }),
    [state, ready, toggleSave, markPosition, setWatched, forget],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): Library {
  const library = useContext(LibraryContext);
  if (!library) throw new Error('useLibrary outside LibraryProvider');
  return library;
}

/** 0..1 for a progress bar. Watched is full. */
export function fractionOf(p: Progress | undefined): number {
  if (!p) return 0;
  if (p.done) return 1;
  if (!p.dur) return 0;
  return Math.max(0, Math.min(1, p.at / p.dur));
}

/** "12 min left", or null when there is nothing honest to say. */
export function remainingLabel(p: Progress | undefined): string | null {
  if (!p || p.done || !p.dur) return null;
  const m = Math.round((p.dur - p.at) / 60);
  if (m <= 0) return null;
  return `${m} min left`;
}

/**
 * Whatever is in storage is untrusted: an older version, a half-written value,
 * someone's hand-edit in devtools. Keep what is well-formed, drop the rest.
 */
function parse(raw: string | null): Stored {
  if (!raw) return EMPTY;
  try {
    const data = JSON.parse(raw);
    const saved = Array.isArray(data.saved) ? data.saved.filter((id: unknown) => typeof id === 'string') : [];
    const progress: Record<string, Progress> = {};
    for (const [videoId, p] of Object.entries<any>(data.progress ?? {})) {
      if (!p || typeof p !== 'object') continue;
      const at = Number(p.at);
      const dur = Number(p.dur);
      if (!Number.isFinite(at) || at < 0) continue;
      progress[videoId] = {
        at,
        dur: Number.isFinite(dur) && dur > 0 ? dur : 0,
        done: Boolean(p.done),
        t: Number(p.t) || 0,
      };
    }
    return { saved, progress };
  } catch {
    return EMPTY;
  }
}
