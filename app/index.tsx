import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { signIn, confirmSignIn } from 'aws-amplify/auth';
import { useSession } from '@/lib/session';
import { DEMO_MODE } from '@/lib/amplify';
import {
  Screen, Display, Body, Small, Tiny, Rule, Button, Field, Eyebrow, Card,
} from '@/components/ui';
import { color, space } from '@/lib/theme';

/**
 * Sign-in.
 *
 * Email + password against Cognito. The spec (§5.1) wants passwordless email
 * OTP and the backend is shaped for it, but that needs SES out of sandbox and
 * a verified domain — neither exists yet. Passwords are set by an admin; this
 * screen never creates an account, which is what makes "invitation only" true
 * rather than aspirational.
 *
 * Cognito can answer a sign-in with a challenge instead of a session. The one
 * that actually happens here is a forced password change on a first login, so
 * that path is handled rather than swallowed.
 */
export default function SignIn() {
  const { profile, loading, noProfile, signInDemo, signOut: endSession } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [stage, setStage] = useState<'password' | 'newPassword'>('password');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) router.replace(profile.role === 'admin' ? '/(admin)/overview' : '/(member)/home');
  }, [profile, router]);

  async function doSignIn() {
    setErr(null); setBusy(true);
    try {
      // SRP, which is the only password flow the Amplify-generated app client
      // enables (ALLOW_USER_SRP_AUTH). USER_PASSWORD_AUTH is deliberately off:
      // it sends the password to Cognito in the clear inside TLS. Do not add it
      // just to make a test easier.
      const { nextStep } = await signIn({
        username: email.trim().toLowerCase(),
        password,
      });
      if (nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        setStage('newPassword');
      } else if (nextStep.signInStep !== 'DONE') {
        setErr(`This account needs another step to sign in (${nextStep.signInStep}). Ask an administrator.`);
      }
      // On DONE the Hub 'signedIn' event loads the profile and the effect above
      // redirects. Nothing to do here.
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  async function doNewPassword() {
    setErr(null); setBusy(true);
    try {
      await confirmSignIn({ challengeResponse: newPassword });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not set that password.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Screen><Body>Loading…</Body></Screen>;

  /**
   * Signed in to Cognito, but no Profile row. That is a pending account — the
   * backend gives it nothing on purpose. Saying so plainly beats an empty app.
   */
  if (noProfile) {
    return (
      <Screen>
        <View style={{ paddingTop: 40 }}>
          <Eyebrow>Finding Something Real</Eyebrow>
          <Display style={{ fontSize: 32, lineHeight: 36 }}>Almost there</Display>
          <Rule />
          <Body style={{ marginBottom: space.lg }}>
            Your account exists but has not been added to a season yet, so there is
            nothing here to show you. Leadership will finish setting you up.
          </Body>
          <Button
            testID="signout"
            label="Sign out"
            variant="outline"
            onPress={endSession}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ paddingTop: 40 }}>
        <Eyebrow>Finding Something Real</Eyebrow>
        <Display style={{ fontSize: 38, lineHeight: 42 }}>
          Finding{'\n'}Something{'\n'}Real
        </Display>
        <Rule />

        {DEMO_MODE ? (
          <>
            <Body style={{ marginBottom: space.lg }}>
              This build is running on demo data — no account needed. Choose who to sign in as.
            </Body>
            <Button testID="demo-member" label="Enter as a co-host (Imani)" onPress={() => signInDemo('member')} />
            <View style={{ height: 10 }} />
            <Button testID="demo-admin" label="Enter as leadership (Lauren)" variant="outline" onPress={() => signInDemo('admin')} />
            <Card tone="wash" style={{ marginTop: space.xl }}>
              <Eyebrow>What this is</Eyebrow>
              <Small>
                A working build, not a mock-up. Everything you change here persists while the
                tab is open. Deploy the AWS backend and the same screens run on real data
                with real sign-in.
              </Small>
            </Card>
          </>
        ) : stage === 'password' ? (
          <>
            <Body style={{ marginBottom: space.lg }}>
              Sign in with the email you were invited on.
            </Body>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              testID="email"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              testID="password"
              secure
              autoCapitalize="none"
            />
            <Button
              testID="password-signin"
              label={busy ? 'Signing in…' : 'Sign in'}
              onPress={doSignIn}
              disabled={busy || !email.includes('@') || !password}
            />
            {err ? <Tiny testID="signin-error" style={{ color: color.danger, marginTop: 12 }}>{err}</Tiny> : null}
          </>
        ) : (
          <>
            <Body style={{ marginBottom: space.lg }}>
              Choose a password of your own. The one you were given only works once.
            </Body>
            <Field
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              testID="new-password"
              secure
              autoCapitalize="none"
              hint="At least 8 characters."
            />
            <Button
              testID="new-password-submit"
              label={busy ? 'Saving…' : 'Save and continue'}
              onPress={doNewPassword}
              disabled={busy || newPassword.length < 8}
            />
            {err ? <Tiny testID="signin-error" style={{ color: color.danger, marginTop: 12 }}>{err}</Tiny> : null}
          </>
        )}

        <Tiny style={{ textAlign: 'center', marginTop: space.xl }}>
          Invitation only. If you were not invited you will not be able to create an account.
        </Tiny>
      </View>
    </Screen>
  );
}
