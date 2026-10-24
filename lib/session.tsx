import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Hub } from 'aws-amplify/utils';
import { getCurrentUser, signOut as amplifySignOut } from 'aws-amplify/auth';
import { DEMO_MODE } from './amplify';
import { getMyProfile, getProfile, updateMyProfile } from './data';
import { DEMO_MEMBER, DEMO_ADMIN } from './demo';
import { detectZone } from './tz';
import type { Profile } from './types';

/**
 * Session state.
 *
 * Cognito holds identity; the Profile model holds everything the app renders
 * (display name, role, timezone, status). They are joined on the Cognito
 * `sub`, which lives in Profile.owner.
 *
 * A signed-in Cognito user with no Profile row is NOT a member — that is the
 * pending-account case, and the member-api Lambda refuses it too. We surface
 * it as `noProfile` rather than silently showing an empty app, because the
 * failure mode otherwise reads as "the app is broken".
 */
interface Ctx {
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  noProfile: boolean;
  signInDemo: (who: 'member' | 'admin') => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  setTimezone: (tz: string) => Promise<void>;
  demoMode: boolean;
}

const SessionCtx = createContext<Ctx>({
  profile: null, loading: true, isAdmin: false, noProfile: false,
  signInDemo: () => {}, refresh: async () => {}, signOut: async () => {},
  setTimezone: async () => {}, demoMode: DEMO_MODE,
});

export const useSession = () => useContext(SessionCtx);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [noProfile, setNoProfile] = useState(false);

  async function load() {
    if (DEMO_MODE) { setLoading(false); return; }
    try {
      const { userId } = await getCurrentUser();
      const p = await getMyProfile(userId);
      setProfile(p);
      setNoProfile(!p);
    } catch {
      // Not signed in. Not an error — this is the sign-in screen's normal state.
      setProfile(null);
      setNoProfile(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    if (DEMO_MODE) return;
    // Amplify does not expose an onAuthStateChange callback; auth events come
    // through Hub. signedIn fires after confirmSignIn too, so the new-password
    // path lands here as well.
    const stop = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn' || payload.event === 'tokenRefresh') load();
      if (payload.event === 'signedOut') { setProfile(null); setNoProfile(false); }
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<Ctx>(() => ({
    profile,
    loading,
    noProfile,
    isAdmin: profile?.role === 'admin',
    demoMode: DEMO_MODE,
    refresh: load,
    signInDemo: (who) => {
      const id = who === 'admin' ? DEMO_ADMIN : DEMO_MEMBER;
      getProfile(id).then((p) => {
        // Respect the zone the reviewer's device is actually in, so the
        // overseas behaviour is discoverable rather than hypothetical.
        if (p && who === 'member') p.timezone = p.timezone || detectZone();
        setProfile(p);
      });
    },
    // Clear our own state FIRST, then sign Amplify out and let any failure
    // reach the caller instead of swallowing it — a sign-out that did not
    // happen should not look like one that did.
    signOut: async () => {
      setProfile(null);
      setNoProfile(false);
      if (!DEMO_MODE) await amplifySignOut();
    },
    setTimezone: async (tz) => {
      if (!profile) return;
      await updateMyProfile(profile.id, { timezone: tz });
      setProfile({ ...profile, timezone: tz });
    },
  }), [profile, loading, noProfile]);

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
