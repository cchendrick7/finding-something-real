import { Stack } from 'expo-router';
import { SessionProvider } from '@/lib/session';
import { color } from '@/lib/theme';

export default function RootLayout() {
  return (
    <SessionProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.paper },
        }}
      />
    </SessionProvider>
  );
}
