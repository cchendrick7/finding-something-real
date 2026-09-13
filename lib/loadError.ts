/**
 * Every screen loads its data in a fire-and-forget async block inside
 * useFocusEffect. Without a catch, any rejection becomes an unhandled promise
 * rejection — a console error on web, a red box on native.
 *
 * The one that surfaced this: signing out while an admin screen still had a
 * query in flight threw "No federated jwt" with nowhere to land. That is
 * benign, but a dropped connection on a co-host's phone goes down the same
 * path and must not crash the app.
 *
 * NOTE what this does NOT do: there is no error UI yet. A screen whose load
 * fails renders empty rather than saying so. That is a real gap and it is
 * listed as one in the README — this handler stops the crash, it does not
 * make the failure legible to the person holding the phone.
 */
export function onLoadError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  // Expected during sign-out: the token is gone before in-flight reads settle.
  if (/no federated jwt|not authenticated|no current user/i.test(msg)) return;
  console.warn('[screen load failed]', msg);
}
