import { useState } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { submitInterest } from '@/lib/data';
import { problems, type Interest } from '@/lib/interest';
import {
  Screen, Display, Body, Small, Tiny, Rule, Button, Field, Eyebrow, Card,
} from '@/components/ui';
import { color, space } from '@/lib/theme';
import { onLoadError } from '@/lib/loadError';

/**
 * The public interest form: a woman who is not (yet) a co-host can leave her
 * details for a future cohort. No account needed.
 *
 * It goes through the public-api Lambda (submitInterest) and lands as an
 * Inquiry that leadership sees in (admin)/inquiries. The Inquiry id is derived
 * from the email (lib/interest.ts idForEmail), so sending twice looks exactly
 * like sending once — the form cannot be used to find out whether someone has
 * already been in touch.
 */
type Form = { name: string; email: string; phone?: string; note?: string };

export default function InterestForm() {
  const router = useRouter();
  const [form, setForm] = useState<Form>({ name: '', email: '', phone: '', note: '' });
  // Problems are only shown once she has tried to send — not while she types.
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);

  const errs = problems(form as Interest);
  const set = (key: keyof Form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  const errorFor = (key: keyof Form) => (tried ? errs[key] : undefined);

  async function send() {
    setTried(true);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setFailed(false);
    try {
      const r = await submitInterest({
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        note: form.note || undefined,
      });
      // `ok` is read from the parsed AWSJSON (lib/data.ts awsJson) — the raw
      // value is a string, and `.ok` on a string is undefined.
      if (r.ok) setSent(true);
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Screen>
        <Eyebrow>Sent</Eyebrow>
        <Display style={{ fontSize: 30, lineHeight: 36 }}>Thank you.</Display>
        <Rule style={{ marginVertical: space.md }} />
        <Body style={{ marginBottom: space.lg }}>
          Janell will see this. Cohorts are invited a season at a time, so it may not be
          straight away — but someone will come back to you, and in the meantime every
          episode is here to listen to without an account.
        </Body>
        <Button
          testID="interest-done"
          label="Back to the podcast"
          onPress={() => router.replace('/(public)/listen')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Tiny onPress={() => router.back()} style={{ marginBottom: space.md }}>← Back</Tiny>
      <Eyebrow>A future cohort</Eyebrow>
      <Display style={{ fontSize: 30, lineHeight: 36 }}>Tell us about you</Display>
      <Rule style={{ marginVertical: space.md }} />
      <Body style={{ marginBottom: space.md }}>
        Cohorts are intentionally small and invited one season at a time. Leave your
        details and Janell will be in touch — there is no application and nothing to
        prepare.
      </Body>

      <Card tone="wash" style={{ marginBottom: space.lg }}>
        <Small>
          What you send here goes to Janell and the Finding Something Real team, and is
          used to get back to you about a future cohort. It is not shared with anyone else
          and it is not added to a mailing list.
        </Small>
        <Tiny
          testID="interest-privacy"
          onPress={() => router.push('/(public)/privacy')}
          style={{ marginTop: 10, textDecorationLine: 'underline', color: color.ink }}
        >
          How we look after it
        </Tiny>
      </Card>

      <Field
        label="Your name"
        value={form.name}
        onChangeText={set('name')}
        testID="i-name"
        placeholder="First name is plenty"
        error={errorFor('name')}
      />
      <Field
        label="Email"
        value={form.email}
        onChangeText={set('email')}
        testID="i-email"
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        error={errorFor('email')}
      />
      <Field
        label="Phone (optional)"
        value={form.phone ?? ''}
        onChangeText={set('phone')}
        testID="i-phone"
        keyboardType="phone-pad"
        hint="Only if you'd rather be texted than emailed."
        error={errorFor('phone')}
      />
      <Field
        label="Anything you want to say (optional)"
        value={form.note ?? ''}
        onChangeText={set('note')}
        testID="i-note"
        multiline
        placeholder="However you want to say it."
        error={errorFor('note')}
      />

      {failed ? (
        <Card tone="blush" testID="interest-error" style={{ marginBottom: space.md }}>
          <Tiny style={{ color: color.danger }}>
            That didn't send. Check your signal and try again — or write to us through
            findingsomethingreal.com if it keeps failing.
          </Tiny>
        </Card>
      ) : null}

      <Button
        testID="interest-send"
        label={busy ? 'Sending…' : 'Send'}
        disabled={busy}
        onPress={() => { send().catch(onLoadError); }}
      />
      <Tiny
        testID="interest-website"
        onPress={() => { Linking.openURL('https://www.findingsomethingreal.com/').catch(onLoadError); }}
        style={{ textAlign: 'center', marginTop: space.lg, textDecorationLine: 'underline' }}
      >
        Or find the ministry online
      </Tiny>
    </Screen>
  );
}
