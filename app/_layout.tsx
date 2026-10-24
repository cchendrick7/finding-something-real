import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider } from '@/lib/session';
import { PushProvider } from '@/lib/push';
import { LibraryProvider } from '@/lib/library';
import { color } from '@/lib/theme';

/**
 * Root layout. Order of the providers matters:
 *
 * - SafeAreaProvider outermost, so Screen can read the device top inset.
 * - PushProvider inside SessionProvider: what a device is registered for
 *   depends on who is signed in (a listener with no account, or a co-host).
 * - LibraryProvider holds saved / watched / resume position on the device
 *   only — no account, nothing the ministry can read.
 *
 * Dark status bar text: every screen sits on the paper background.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <PushProvider>
          <LibraryProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: color.paper },
              }}
            />
          </LibraryProvider>
        </PushProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
