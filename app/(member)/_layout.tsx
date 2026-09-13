import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { color, type } from '@/lib/theme';

export default function MemberLayout() {
  const { profile, loading } = useSession();
  const router = useRouter();
  useEffect(() => { if (!loading && !profile) router.replace('/'); }, [profile, loading, router]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.ink,
        tabBarInactiveTintColor: color.faint,
        tabBarStyle: { backgroundColor: color.paper, borderTopColor: color.lineSoft },
        tabBarLabelStyle: {
          fontFamily: type.small.fontFamily, fontSize: 10,
          letterSpacing: 1, textTransform: 'uppercase',
        },
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
        tabBarItemStyle: { paddingTop: 10 },
        sceneStyle: { backgroundColor: color.paper },
      }}
    >
      <Tabs.Screen name="home"     options={{ title: 'Home' }} />
      <Tabs.Screen name="sessions" options={{ title: 'Sessions' }} />
      <Tabs.Screen name="episodes" options={{ title: 'Episodes' }} />
      <Tabs.Screen name="you"      options={{ title: 'You' }} />
      <Tabs.Screen name="note"     options={{ href: null }} />
      <Tabs.Screen name="prayer"   options={{ href: null }} />
      <Tabs.Screen name="session/[id]" options={{ href: null }} />
    </Tabs>
  );
}
