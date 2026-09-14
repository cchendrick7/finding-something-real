import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useSession } from '@/lib/session';
import { Screen, Body } from '@/components/ui';

/**
 * Where the app opens.
 *
 * It used to open on a sign-in form, which meant a stranger who installed the
 * app hit an invitation-only wall and could go no further — the thing App
 * Review Guideline 4.2 exists to catch. Now the front door is the public app,
 * and signing in is something you do from inside it.
 *
 * Signed-in people skip straight past to their own half, so nobody who belongs
 * here has to navigate to it.
 */
export default function Index() {
  const { profile, isAdmin, loading } = useSession();

  // A blank frame while Cognito is consulted is fine; a blank frame forever is
  // not, so this renders something either way.
  useEffect(() => { /* session loads itself; nothing to do here */ }, []);

  if (loading) return <Screen><Body>Loading…</Body></Screen>;
  if (profile) return <Redirect href={isAdmin ? '/(admin)/overview' : '/(member)/home'} />;
  return <Redirect href="/(public)/listen" />;
}
