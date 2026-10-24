import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { listPeople, provisionCohost, resetCohostPassword, setCohostActive } from '@/lib/data';
import type { AdminResult } from '@/lib/data';
import { COMMON_ZONES } from '@/lib/tz';
import { Screen, Display, H3, Body, Small, Tiny, Card, Eyebrow, Rule, Pill, Row, Wrap, Button, Field } from '@/components/ui';
import { space, color } from '@/lib/theme';
import { onLoadError } from '@/lib/loadError';
import type { Profile } from '@/lib/types';

/**
 * People: leadership issues co-host accounts. Nobody registers themselves —
 * self-registration is off in Cognito (AllowAdminCreateUserOnly).
 *
 * Everything here goes through admin-api, and the Lambda is the enforcement,
 * not this screen (admin-test.mjs proves it):
 *   - provisionCohost takes email, name and time zone and NOTHING ELSE. No
 *     role, group or status argument; the group is a constant `cohost`. No
 *     input from here can produce a leader.
 *   - resetCohostPassword and setCohostActive refuse leadership targets,
 *     checked against Cognito group membership, not Profile.role.
 *
 * The temporary password is shown once, here, and she is emailed it too.
 */

export default function People() {
  const router = useRouter();
  const [people, setPeople] = useState<Profile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [tz, setTz] = useState('America/Los_Angeles');
  // The password just issued. Held only in this screen's state: leave and it is gone.
  const [issued, setIssued] = useState<{ who: string; result: AdminResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setPeople(await listPeople());
    setLoaded(true);
  }, []);
  useFocusEffect(useCallback(() => { load().catch(onLoadError); }, [load]));

  // admin-api answers with a code; say what it means in words she would use.
  const friendly = (code?: string) =>
    ({
      invalid_email: 'That does not look like an email address.',
      invalid_name: 'Please give her name as it should appear in the app.',
      already_exists: 'Someone already has an account with that email.',
      not_found: 'That account no longer exists — pull to refresh.',
      no_login: 'That profile has no sign-in attached. Ask Curtis.',
      is_leadership: 'Leadership accounts cannot be changed from the app, on purpose.',
    } as Record<string, string>)[code ?? ''] ?? 'Something went wrong. Nothing was changed.';

  async function add() {
    setError(null); setBusy(true);
    try {
      const r = await provisionCohost(email.trim(), name.trim(), tz);
      if (!r.ok) { setError(friendly(r.error)); return; }
      setIssued({ who: name.trim(), result: r });
      setName(''); setEmail(''); setAdding(false); setCopied(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function reset(p: Profile) {
    setError(null); setBusy(true);
    try {
      const r = await resetCohostPassword(p.id);
      if (!r.ok) { setError(friendly(r.error)); return; }
      setIssued({ who: p.display_name, result: r });
      setCopied(false);
    } finally {
      setBusy(false);
    }
  }

  // Off, not deleted: at the end of a season she stops being able to sign in,
  // and her history stays. "Turn back on" restores her as she was.
  async function toggle(p: Profile) {
    setError(null); setBusy(true);
    try {
      const r = await setCohostActive(p.id, p.status === 'removed');
      if (!r.ok) { setError(friendly(r.error)); return; }
      await load();
    } finally {
      setBusy(false);
    }
  }

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
  };

  const leaders = people.filter((p) => p.role === 'admin');
  const cohosts = people.filter((p) => p.role !== 'admin');

  return (
    <Screen>
      <Eyebrow>Accounts are issued, never requested</Eyebrow>
      <Display style={{ fontSize: 32, lineHeight: 36 }}>People</Display>
      <Rule style={{ marginVertical: space.md }} />

      {error ? (
        <Card tone="blush" testID="people-error">
          <Small style={{ color: color.ink }}>{error}</Small>
        </Card>
      ) : null}

      {issued ? (
        <Card tone="gold" testID="issued-password">
          <Eyebrow tone="#8A6D28">Give this to {issued.who}</Eyebrow>
          <H3 selectable style={{ marginBottom: 6, letterSpacing: 0.5 }}>
            {issued.result.temporaryPassword}
          </H3>
          <Small style={{ marginBottom: space.md }}>
            She will be asked to choose her own password the first time she signs in.
            {issued.result.emailed === false
              ? ' We could not email it to her, so this is the only copy.'
              : issued.result.emailed ? ' We have also emailed it to her.' : ''}{' '}
            This will not be shown again.
          </Small>
          <Row>
            <View style={{ flex: 1 }}>
              <Button testID="copy-password" label={copied ? 'Copied' : 'Copy'} variant="outline"
                      onPress={() => { copy(issued.result.temporaryPassword ?? '').catch(onLoadError); }} />
            </View>
            <View style={{ flex: 1 }}>
              <Button testID="dismiss-password" label="Done" onPress={() => setIssued(null)} />
            </View>
          </Row>
        </Card>
      ) : null}

      {adding ? (
        <Card testID="add-form">
          <Eyebrow>New co-host</Eyebrow>
          <Field testID="new-name" label="Name" value={name} onChangeText={setName}
                 placeholder="How her name should appear in the app" />
          <Field testID="new-email" label="Email" value={email} onChangeText={setEmail}
                 placeholder="name@example.com" autoCapitalize="none" keyboardType="email-address" />
          <Eyebrow style={{ marginTop: 4 }}>Her time zone</Eyebrow>
          <Wrap>
            {COMMON_ZONES.map((z) => (
              <Tiny key={z.id} testID={`new-tz-${z.id}`} onPress={() => setTz(z.id)}
                style={{
                  borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12,
                  borderColor: tz === z.id ? color.ink : color.line,
                  color: tz === z.id ? color.ink : color.muted,
                }}>{z.label}</Tiny>
            ))}
          </Wrap>
          <Tiny style={{ marginTop: 10 }}>
            Every time in the app is shown in her own zone, and it is how we see when a recording
            falls in the middle of her night. She can change it herself later.
          </Tiny>
          <View style={{ height: space.md }} />
          <Button testID="submit-new" label={busy ? 'Setting her up…' : 'Create account'}
                  disabled={busy || !name.trim() || !email.trim()}
                  onPress={() => { add().catch(onLoadError); }} />
          <View style={{ height: 8 }} />
          <Button label="Cancel" variant="quiet" onPress={() => { setAdding(false); setError(null); }} />
        </Card>
      ) : (
        <Button testID="open-add" label="Add a co-host"
                onPress={() => { setAdding(true); setError(null); }} />
      )}

      <Eyebrow style={{ marginTop: space.xl }}>
        Co-hosts {loaded ? `· ${cohosts.filter((p) => p.status !== 'removed').length}` : ''}
      </Eyebrow>
      {loaded ? null : <Body>Loading…</Body>}
      {loaded && cohosts.length === 0 ? (
        <Card tone="wash"><Small>Nobody yet. Add the first co-host above.</Small></Card>
      ) : null}
      {/* listPeople puts turned-off accounts last, so they can be found and
          turned back on without crowding the list. */}
      {cohosts.map((p) => {
        const off = p.status === 'removed';
        return (
          <Card key={p.id} testID={`person-${p.id}`} style={off ? { opacity: 0.55 } : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <H3>{p.display_name}</H3>
              {off ? <Pill label="Off" tone="muted" /> : <Pill label="Active" tone="sage" />}
            </Row>
            <Small style={{ marginTop: 2 }}>{p.email ?? '—'}</Small>
            <Tiny style={{ marginTop: 2 }}>{p.timezone.replace(/_/g, ' ')}</Tiny>
            <Rule style={{ marginVertical: space.md }} />
            <Row>
              <View style={{ flex: 1 }}>
                <Button testID={`reset-${p.id}`} label="New password" variant="outline"
                        disabled={busy || off}
                        onPress={() => { reset(p).catch(onLoadError); }} />
              </View>
              <View style={{ flex: 1 }}>
                <Button testID={`toggle-${p.id}`} label={off ? 'Turn back on' : 'Turn off'}
                        variant="quiet" disabled={busy}
                        onPress={() => { toggle(p).catch(onLoadError); }} />
              </View>
            </Row>
          </Card>
        );
      })}

      <Eyebrow style={{ marginTop: space.xl }}>Leadership</Eyebrow>
      {leaders.map((p) => (
        <Card key={p.id} tone="wash" testID={`leader-${p.id}`}>
          <Row style={{ justifyContent: 'space-between' }}>
            <H3>{p.display_name}</H3>
            <Pill label="Leadership" tone="ink" />
          </Row>
          <Small style={{ marginTop: 2 }}>{p.email ?? '—'}</Small>
        </Card>
      ))}
      <Tiny style={{ marginTop: 6 }}>
        Leadership accounts cannot be created, reset or turned off from here — not because it
        would be hard, but because anyone who got into one of these accounts could then make more
        of them. Adding or removing a leader is a deliberate act outside the app. Ask Curtis.
      </Tiny>

      {/* Not a tab, so there is no tab to go back to. */}
      <Tiny
        onPress={() => router.replace('/(admin)/overview')}
        style={{ textAlign: 'center', marginTop: space.xl, textDecorationLine: 'underline' }}
      >
        ← Back to overview
      </Tiny>
    </Screen>
  );
}
