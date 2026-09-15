import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { deleteMyAccount } from '@/lib/data';
import {
  Screen, Display, Body, Small, Tiny, Card, Eyebrow, Rule, Button, Field,
} from '@/components/ui';
import { space, color } from '@/lib/theme';

/**
 * Delete your account.
 *
 * Required by Google Play for any app with accounts, and the "Delete my
 * account and data" link on the You tab used to be underlined text that did
 * nothing at all — its own App Review 2.1 problem.
 *
 * Two deliberate frictions: the person has to read what goes, and has to type
 * the word. This is irreversible, it happens on a phone, and the button sits
 * one tap from a settings screen.
 */
export default function DeleteAccount() {
  const { profile, signOut } = useSession();
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!profile) return null;
  const armed = confirm.trim().toUpperCase() === 'DELETE' && !busy;

  async function go() {
    setErr(null); setBusy(true);
    try {
      await deleteMyAccount();
      await signOut();
      router.replace('/(public)/listen');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not delete the account.');
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Tiny testID="del-back" onPress={() => router.back()} style={{ marginBottom: space.sm }}>
        ← Back
      </Tiny>
      <Eyebrow>This cannot be undone</Eyebrow>
      <Display style={{ fontSize: 30, lineHeight: 34 }}>Delete your account</Display>
      <Rule style={{ marginVertical: space.md }} />

      <Body>
        Everything below is removed from Finding Something Real straight away, and
        it cannot be recovered — not by you and not by the ministry.
      </Body>

      <Card tone="wash" style={{ marginTop: space.lg }}>
        <Eyebrow>What is deleted</Eyebrow>
        {[
          'Your profile, name and email',
          'Your sign-in — you will not be able to log back in',
          'Every session reply you have given',
          'Your prayer requests',
          'Questions you submitted, and any you asked on a session',
          'Which notes you have opened',
        ].map((t) => (
          <Small key={t} style={{ marginTop: 5 }}>· {t}</Small>
        ))}
      </Card>

      <Card tone="sage" style={{ marginTop: space.md }}>
        <Eyebrow>What stays</Eyebrow>
        <Small>
          Published episodes and the ministry's own recordings and notes. Those are
          not your personal information and are not removed.
        </Small>
      </Card>

      <View style={{ height: space.lg }} />
      <Field
        label="Type DELETE to confirm"
        value={confirm}
        onChangeText={setConfirm}
        testID="del-confirm"
        autoCapitalize="characters"
        placeholder="DELETE"
      />

      {err ? (
        <Tiny testID="del-error" style={{ color: color.danger, marginBottom: 10 }}>{err}</Tiny>
      ) : null}

      <Button
        testID="del-confirm-button"
        label={busy ? 'Deleting…' : 'Delete my account permanently'}
        onPress={go}
        disabled={!armed}
      />
      <View style={{ height: 10 }} />
      <Button testID="del-cancel" label="Keep my account" variant="outline"
              onPress={() => router.back()} />

      <Tiny style={{ textAlign: 'center', marginTop: space.xl, color: color.faint }}>
        Would rather talk to someone first? Email hello@findingsomethingreal.com.
      </Tiny>
    </Screen>
  );
}
