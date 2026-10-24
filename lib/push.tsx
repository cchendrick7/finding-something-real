// Push notifications: one provider at the root, read with usePush().
//
// Rules this file keeps:
// - Push NEVER asks on launch. On start we only look at what the phone already
//   allows. The system prompt appears only from enable(), and enable() is only
//   called from a button that says what it is for (components/notifications.tsx).
// - Anyone can register a phone. A listener (no account) gets new-episode
//   announcements only, stored against no profile (registerListenerPushToken).
//   A signed-in co-host registers as a member (registerMemberPushToken). When
//   the person on an enabled phone signs in or out, the token is registered
//   again under the new identity; the backend turns co-host categories on only
//   when a device moves from listener to member, so a co-host who switched one
//   off keeps her choice.
// - A notification tap opens what it is about: the session, the note, or the
//   episode in the in-app player.
//
// The web build has no push: SUPPORTED is false there and everything below that
// depends on it folds away.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSession } from './session';
import {
  getPushPrefs,
  registerListenerPushToken,
  registerMemberPushToken,
  setPushPrefs,
  unregisterPushToken,
} from './data';

export type PushStatus =
  | 'loading' // still looking at what the phone allows
  | 'unsupported' // web, or a simulator — no push token to be had
  | 'idle' // never asked
  | 'denied' // asked, and the answer was no (iOS only asks once)
  | 'enabled';

export type PushPrefs = {
  wantsSessions: boolean;
  wantsReminders: boolean;
  wantsNotes: boolean;
  wantsEpisodes: boolean;
};

type PushContextValue = {
  status: PushStatus;
  prefs: PushPrefs;
  /** Ask for permission (only from a button that says why) and register this phone. */
  enable: () => Promise<boolean>;
  /** Forget this phone's token on the server. */
  disable: () => Promise<void>;
  setPref: (key: keyof PushPrefs, value: boolean) => Promise<void>;
};

// Show a notification that arrives while the app is open, the same as when it is closed.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Until the server says otherwise, everything is on.
const DEFAULT_PREFS: PushPrefs = { wantsSessions: true, wantsReminders: true, wantsNotes: true, wantsEpisodes: true };

const PushContext = createContext<PushContextValue>({
  status: 'loading',
  prefs: DEFAULT_PREFS,
  enable: async () => false,
  disable: async () => {},
  setPref: async () => {},
});

export const usePush = () => useContext(PushContext);

// A simulator cannot get a push token, so it is treated like the web.
const SUPPORTED = Platform.OS !== 'web' && Device.isDevice;

// Expo push tokens are issued per EAS project.
const PROJECT_ID: string | undefined =
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

type NotificationData = { type?: string; id?: unknown } | null | undefined;

export function PushProvider({ children }: { children: ReactNode }) {
  const { profile } = useSession();
  const [status, setStatus] = useState<PushStatus>('loading');
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PREFS);
  const tokenRef = useRef<string | null>(null);
  // Who this phone's token is registered for: a profile id, '' for a listener,
  // null for not registered. Stops a re-render from registering again.
  const registeredFor = useRef<string | null>(null);

  const getToken = useCallback(async () => {
    if (tokenRef.current) return tokenRef.current;
    if (!PROJECT_ID) return null;
    try {
      const token = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
      tokenRef.current = token.data;
      return token.data;
    } catch (e) {
      console.log('push: could not get a token', e);
      return null;
    }
  }, []);

  // Register this phone as a member (signed in) or a listener (no account),
  // then read back the switches the server holds for it.
  const register = useCallback(
    async (memberId: string | null) => {
      const token = await getToken();
      if (!token) return false;
      // The device's name and model, so one person's phones can be told apart.
      const label = [Device.deviceName, Device.modelName].filter(Boolean).join(' · ') || undefined;
      const ok = memberId
        ? await registerMemberPushToken(token, Platform.OS, label)
        : await registerListenerPushToken(token, Platform.OS);
      if (ok) {
        registeredFor.current = memberId ?? '';
        const saved = await getPushPrefs(token);
        if (saved) setPrefs(saved);
      }
      return ok;
    },
    [getToken],
  );

  // On start: look, do not ask. If permission was already given, register.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!SUPPORTED) {
        if (!cancelled) setStatus('unsupported');
        return;
      }
      const { status: permission } = await Notifications.getPermissionsAsync();
      if (cancelled) return;
      if (permission === 'granted') {
        setStatus('enabled');
        await register(profile?.id ?? null);
      } else if (permission === 'denied') {
        setStatus('denied');
      } else {
        setStatus('idle');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Signing in or out on an enabled phone moves the token between listener and member.
  useEffect(() => {
    if (status !== 'enabled') return;
    const want = profile?.id ?? '';
    if (registeredFor.current === want) return;
    (async () => {
      profile?.id ? await register(profile.id) : await register(null);
    })();
  }, [profile?.id, status, register]);

  // A tap on a notification opens what it is about — also the tap that launched the app.
  useEffect(() => {
    if (!SUPPORTED) return;
    const open = (data: NotificationData) => {
      const type = data?.type;
      const id = data?.id ? String(data.id) : null;
      if (type === 'session' && id) router.push(`/(member)/session/${id}`);
      else if (type === 'note') router.push('/(member)/note');
      // A new-episode notification opens the episode in the app's own player.
      else if (type === 'episode') router.push(id ? `/episode/${id}` : '/(public)/listen');
    };
    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      open(r.notification.request.content.data as NotificationData),
    );
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) open(r.notification.request.content.data as NotificationData);
    });
    return () => sub.remove();
  }, []);

  const enable = useCallback(async () => {
    if (!SUPPORTED) return false;
    const current = await Notifications.getPermissionsAsync();
    let granted = current.status === 'granted';
    if (!granted && current.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.status === 'granted';
    }
    if (!granted) {
      setStatus('denied');
      return false;
    }
    setStatus('enabled');
    return register(profile?.id ?? null);
  }, [profile?.id, register]);

  const disable = useCallback(async () => {
    const token = tokenRef.current ?? (await getToken());
    if (token) await unregisterPushToken(token);
    registeredFor.current = null;
    setStatus(SUPPORTED ? 'idle' : 'unsupported');
  }, [getToken]);

  // Optimistic: the switch moves at once, then takes whatever the server saved.
  const setPref = useCallback(
    async (key: keyof PushPrefs, value: boolean) => {
      const token = tokenRef.current ?? (await getToken());
      if (!token) return;
      const next = { ...prefs, [key]: value };
      setPrefs(next);
      const saved = await setPushPrefs(token, { [key]: value });
      if (saved) setPrefs(saved);
    },
    [prefs, getToken],
  );

  const value = useMemo(
    () => ({ status, prefs, enable, disable, setPref }),
    [status, prefs, enable, disable, setPref],
  );

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}
