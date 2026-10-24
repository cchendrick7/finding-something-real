// Everything a person sees about push notifications. The state lives in
// lib/push.tsx; these cards only read it and call enable / disable / setPref.
//
// Push never asks on launch. The permission prompt only appears when someone
// taps a button that says what it is for — the buttons below are the only
// places that call enable().
import { View, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { usePush } from '../lib/push';
import { Button, Card, Eyebrow, H3, Rule, Small, Tiny, Toggle } from './ui';
import { color, space } from '../lib/theme';
import { onLoadError } from '../lib/loadError';

// iOS only asks once. After a "no" the only way back is the app's page in Settings.
const openSettings = () => {
  Linking.openSettings().catch(onLoadError);
};

/** The full settings card on the You tab: ask, explain a refusal, or the four switches. */
export function NotificationSettings() {
  const { status, prefs, enable, disable, setPref } = usePush();

  if (status === 'unsupported') {
    return (
      <Card>
        <Eyebrow>Notifications</Eyebrow>
        <Small>Not available in this version of the app. Open it on an iPhone to get reminders before a recording.</Small>
      </Card>
    );
  }

  if (status === 'loading') {
    return (
      <Card>
        <Eyebrow>Notifications</Eyebrow>
        <Small>Checking…</Small>
      </Card>
    );
  }

  if (status === 'denied') {
    return (
      <Card tone="gold">
        <Eyebrow tone="#8A6D28">Notifications</Eyebrow>
        <H3 style={{ marginBottom: 4 }}>Turned off for this app</H3>
        <Small style={{ marginBottom: space.md }}>
          iOS only asks once, and the answer was no. It can be changed in Settings — everything else in the app works either way.
        </Small>
        <Button label="Open Settings" variant="outline" onPress={openSettings} />
      </Card>
    );
  }

  if (status === 'idle') {
    return (
      <Card tone="sage">
        <Eyebrow>Notifications</Eyebrow>
        <H3 style={{ marginBottom: 4 }}>Stay connected</H3>
        {/* Janell's sentence. */}
        <Small style={{ marginBottom: space.md }}>
          As part of your co-host season you agreed to receive FSR app notifications. This is how we send recording information, schedule changes, and messages from Janell and the FSR team. Please keep them on through the season so you do not miss anything you need to know.
        </Small>
        <Button
          testID="enable-push"
          label="Turn on notifications"
          onPress={() => {
            enable().catch(onLoadError);
          }}
        />
      </Card>
    );
  }

  // enabled
  return (
    <Card>
      <Eyebrow>Notifications</Eyebrow>
      <Toggle
        testID="pref-sessions"
        label="New recordings"
        hint="When a session is added to the calendar"
        value={prefs.wantsSessions}
        onChange={(v) => {
          setPref('wantsSessions', v).catch(onLoadError);
        }}
      />
      <Toggle
        testID="pref-reminders"
        label="Reminders"
        hint="The day before and an hour before, and if a session moves or is called off"
        value={prefs.wantsReminders}
        onChange={(v) => {
          setPref('wantsReminders', v).catch(onLoadError);
        }}
      />
      <Toggle
        testID="pref-notes"
        label="Notes from Janell"
        hint="When something is posted to the cohort"
        value={prefs.wantsNotes}
        onChange={(v) => {
          setPref('wantsNotes', v).catch(onLoadError);
        }}
      />
      <Toggle
        testID="pref-episodes"
        label="New episodes"
        hint="When an episode goes up on YouTube"
        value={prefs.wantsEpisodes}
        onChange={(v) => {
          setPref('wantsEpisodes', v).catch(onLoadError);
        }}
      />
      <Rule style={{ marginVertical: space.md }} />
      <Tiny
        testID="disable-push"
        onPress={() => {
          disable().catch(onLoadError);
        }}
        style={{ textDecorationLine: 'underline', color: color.ink }}
      >
        Stop notifications on this phone
      </Tiny>
    </Card>
  );
}

/**
 * On co-host Home, above the note and the next session. Co-hosts were never
 * asked about notifications, so this asks — with Janell's sentence — and then
 * gets out of the way: it renders nothing once she is set up. A co-host with a
 * category switched off is told WHICH, and the card takes her to the You tab.
 */
export function CohostNotificationsCard() {
  const { status, prefs, enable } = usePush();
  const router = useRouter();

  if (status === 'unsupported' || status === 'loading') return null;

  if (status === 'idle') {
    return (
      <Card tone="sage" testID="home-push-ask">
        <Eyebrow>Stay connected</Eyebrow>
        <H3 style={{ marginBottom: 4 }}>Turn on notifications</H3>
        {/* Janell's sentence. */}
        <Small style={{ marginBottom: space.md }}>
          As part of your co-host season you agreed to receive FSR app notifications. This is how we send recording information, schedule changes, and messages from Janell and the FSR team. Please keep them on through the season so you do not miss anything you need to know.
        </Small>
        <Button
          testID="home-enable-push"
          label="Turn on notifications"
          onPress={() => {
            enable().catch(onLoadError);
          }}
        />
      </Card>
    );
  }

  if (status === 'denied') {
    return (
      <Card tone="gold" testID="home-push-denied">
        <Eyebrow tone="#8A6D28">Stay connected</Eyebrow>
        <H3 style={{ marginBottom: 4 }}>Notifications are off</H3>
        <Small style={{ marginBottom: space.md }}>
          iOS only asks once and the answer was no, so recording invitations, schedule changes and notes from Janell will not reach this phone. Everything is still here in the app — but you will have to come looking.
        </Small>
        <Button label="Open Settings" variant="outline" onPress={openSettings} />
      </Card>
    );
  }

  // Enabled. Name the co-host categories that are switched off, so she knows
  // exactly what will not reach her (new episodes are not one of them).
  const off = [
    !prefs.wantsSessions && 'new recordings',
    !prefs.wantsReminders && 'reminders',
    !prefs.wantsNotes && 'notes from Janell',
  ].filter(Boolean) as string[];
  if (off.length === 0) return null;

  const which = off.length === 1 ? off[0] : `${off.slice(0, -1).join(', ')} and ${off[off.length - 1]}`;

  return (
    <Card tone="gold" testID="home-push-partial" onPress={() => router.push('/(member)/you')}>
      <Eyebrow tone="#8A6D28">Stay connected</Eyebrow>
      <H3 style={{ marginBottom: 4 }}>You are not being told about {which}</H3>
      <Small>Notifications are on for this phone, but those are switched off. Tap to change it on the You tab →</Small>
    </Card>
  );
}

/**
 * On Listen, for anyone — including a listener with no account. New-episode
 * announcements only; the token is stored against no profile.
 */
export function EpisodeAlertsCard() {
  const { status, prefs, enable } = usePush();
  // Offer it to someone who has not been asked, or who is on but has episodes off.
  if (status !== 'idle' && (status !== 'enabled' || prefs.wantsEpisodes)) return null;
  return (
    <Card tone="wash" style={{ marginTop: space.lg }}>
      <View style={{ gap: 4 }}>
        <Eyebrow>Never miss one</Eyebrow>
        <Small style={{ marginBottom: space.md }}>
          New episodes go up on Wednesdays. We can tell you when — nothing else, no account needed.
        </Small>
      </View>
      <Button
        testID="enable-episode-alerts"
        label="Notify me about new episodes"
        variant="outline"
        onPress={() => {
          enable().catch(onLoadError);
        }}
      />
    </Card>
  );
}
