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
import AsyncStorage from '@react-native-async-storage/async-storage';
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

/**
 * Notifications are allowed, but this phone could not be connected:
 * 'no_token' — Apple or Google did not give the app a push token;
 * 'not_saved' — the token was not accepted by the server.
 * Until 18 Nov 2026 both failed silently: the phone showed notifications as on
 * and simply never received anything (Ava, iPhone, Nov 2026).
 */
export type PushProblem = { kind: 'no_token' | 'not_saved'; detail: string } | null;

type PushContextValue = {
  status: PushStatus;
  prefs: PushPrefs;
  problem: PushProblem;
  /** Try to connect this phone again after a problem. */
  retry: () => Promise<boolean>;
  /**
   * Ask for permission (only from a button that says why) and register this
   * phone. `want` is what the button offered, switched on explicitly — the
   * server no longer turns anything on during registration (see push-api).
   */
  enable: (want?: Partial<PushPrefs>) => Promise<boolean>;
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
  problem: null,
  retry: async () => false,
  enable: async () => false,
  disable: async () => {},
  setPref: async () => {},
});

export const usePush = () => useContext(PushContext);

// Phones only, and only real ones — a simulator or emulator cannot get a token.
//
// Android since build 3 (25 Oct 2026). It needs the Firebase project
// "finding-something-real" (google-services.json, android.googleServicesFile in
// app.json) and that project's FCM V1 service-account key on EAS, which Expo's
// push service uses to reach Google. Without the Firebase file,
// getExpoPushTokenAsync throws "Default FirebaseApp is not initialized".
const SUPPORTED = Platform.OS !== 'web' && Device.isDevice;
const ANDROID = Platform.OS === 'android';

// Android delivers every notification through a channel, and the outbox sends
// with channelId 'default' (amplify/functions/push-outbox). It must exist before
// the permission prompt — Android 13+ does not show the prompt until one does —
// and before asking for a token. HIGH makes it a banner, as it is on iPhone.
// Creating it again is harmless; only the first call sets the importance.
let channelReady: Promise<unknown> | null = null;
const ensureChannel = () =>
  ANDROID
    ? (channelReady ??= Notifications.setNotificationChannelAsync('default', {
        name: 'Finding Something Real',
        importance: Notifications.AndroidImportance.HIGH,
      }).catch((e) => {
        channelReady = null;
        console.log('push: could not create the channel', e);
      }))
    : Promise.resolve();

// Before Android 13, notifications are allowed from install — nobody was asked.
// "Granted" there does not mean someone tapped the button, so on Android the
// phone registers on start only if it was turned on in the app before. Keeps
// the rule above: nothing is registered until someone asks for it.
//
// Every platform: "Stop notifications on this phone" is remembered here too.
// Stopping does not change the system setting, so without this the next
// launch saw "granted" and registered the phone again — on iPhone, with every
// category switched back on (fixed 8 Nov 2026; the server half is in push-api).
const ENABLED_KEY = 'fsr.push.enabled';
const STOPPED_KEY = 'fsr.push.stopped';
const flag = async (key: string) => (await AsyncStorage.getItem(key).catch(() => null)) === '1';
const remember = (on: boolean) =>
  Promise.all(
    on
      ? [AsyncStorage.setItem(ENABLED_KEY, '1'), AsyncStorage.removeItem(STOPPED_KEY)]
      : [AsyncStorage.removeItem(ENABLED_KEY), AsyncStorage.setItem(STOPPED_KEY, '1')],
  ).catch(() => {});

// Expo push tokens are issued per EAS project.
const PROJECT_ID: string | undefined =
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

type NotificationData = { type?: string; id?: unknown } | null | undefined;

export function PushProvider({ children }: { children: ReactNode }) {
  const { profile, loading: sessionLoading } = useSession();
  const [status, setStatus] = useState<PushStatus>('loading');
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PREFS);
  const [problem, setProblem] = useState<PushProblem>(null);
  const lastError = useRef('');
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
      lastError.current = e instanceof Error ? e.message : String(e);
      console.log('push: could not get a token', e);
      return null;
    }
  }, []);

  // Register this phone as a member (signed in) or a listener (no account),
  // then read back the switches the server holds for it.
  const register = useCallback(
    async (memberId: string | null) => {
      lastError.current = '';
      const token = await getToken();
      if (!token) {
        setProblem({ kind: 'no_token', detail: lastError.current || (PROJECT_ID ? 'no token' : 'no project id') });
        return false;
      }
      // The device's name and model, so one person's phones can be told apart.
      const label = [Device.deviceName, Device.modelName].filter(Boolean).join(' · ') || undefined;
      const ok = memberId
        ? await registerMemberPushToken(token, Platform.OS, label)
        : await registerListenerPushToken(token, Platform.OS);
      if (ok) {
        registeredFor.current = memberId ?? '';
        setProblem(null);
        const saved = await getPushPrefs(token);
        if (saved) setPrefs(saved);
      } else {
        setProblem({ kind: 'not_saved', detail: `${Platform.OS} · ${memberId ? 'member' : 'listener'}` });
      }
      return ok;
    },
    [getToken],
  );

  // On start: look, do not ask. If permission was already given, mark the phone
  // enabled — the effect below registers it once the session has loaded.
  //
  // It used to register right here, before the session had loaded, so for a
  // moment every signed-in co-host was registered as a listener — and the
  // listener path switched "New episodes" back on at every launch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!SUPPORTED) {
        if (!cancelled) setStatus('unsupported');
        return;
      }
      await ensureChannel();
      const { status: permission, canAskAgain } = await Notifications.getPermissionsAsync();
      const stopped = await flag(STOPPED_KEY);
      const optedIn = !stopped && (ANDROID ? await flag(ENABLED_KEY) : true);
      if (cancelled) return;
      if (permission === 'granted' && optedIn) {
        setStatus('enabled');
      } else if (permission === 'denied' && !(ANDROID && canAskAgain)) {
        // Android may ask a second time; iOS never does.
        setStatus('denied');
      } else {
        setStatus('idle');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Registers an enabled phone, and moves it between listener and member when
  // someone signs in or out. Waits for the session: until it has loaded,
  // "no profile" means "not known yet", not "a listener".
  useEffect(() => {
    if (status !== 'enabled' || sessionLoading) return;
    const want = profile?.id ?? '';
    if (registeredFor.current === want) return;
    (async () => {
      profile?.id ? await register(profile.id) : await register(null);
    })();
  }, [profile?.id, status, sessionLoading, register]);

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

  const enable = useCallback(async (want?: Partial<PushPrefs>) => {
    if (!SUPPORTED) return false;
    await ensureChannel();
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
    await remember(true);
    const ok = await register(profile?.id ?? null);
    // Set status after registering, so the effect above does not register a
    // second time in parallel.
    setStatus('enabled');
    if (ok && want && Object.keys(want).length) {
      const token = tokenRef.current;
      const saved = token ? await setPushPrefs(token, want) : null;
      if (saved) setPrefs(saved);
    }
    return ok;
  }, [profile?.id, register]);

  const disable = useCallback(async () => {
    const token = tokenRef.current ?? (await getToken());
    if (token) await unregisterPushToken(token);
    await remember(false);
    registeredFor.current = null;
    setProblem(null);
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

  const retry = useCallback(
    () => register(profile?.id ?? null),
    [profile?.id, register],
  );

  const value = useMemo(
    () => ({ status, prefs, problem, retry, enable, disable, setPref }),
    [status, prefs, problem, retry, enable, disable, setPref],
  );

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}
