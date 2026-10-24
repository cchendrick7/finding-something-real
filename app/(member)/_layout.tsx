import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { onLoadError } from '@/lib/loadError';
import { color, space, type } from '@/lib/theme';

// Who is signed in, and the way out. Sits above the tabs on every co-host screen.
function AccountBar() {
  const { profile, signOut } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  if (!profile) return null;
  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        paddingBottom: 8,
        paddingHorizontal: space.xl,
        backgroundColor: color.paper,
        borderBottomWidth: 1,
        borderBottomColor: color.lineSoft,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Text style={[type.eyebrow, { color: color.faint }]} numberOfLines={1}>
        CO-HOST · {profile.display_name}
      </Text>
      <Pressable
        testID="member-signout"
        onPress={() => {
          // signOut clears the session state, then rethrows; leave either way.
          signOut()
            .catch(onLoadError)
            .finally(() => router.replace('/'));
        }}
        hitSlop={12}
      >
        <Text style={[type.eyebrow, { color: color.ink, textDecorationLine: 'underline' }]}>SIGN OUT</Text>
      </Pressable>
    </View>
  );
}

export default function MemberLayout() {
  const { profile, loading } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useEffect(() => { if (!loading && !profile) router.replace('/'); }, [profile, loading, router]);

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      <AccountBar />
      {/* The bar above already clears the status bar, so the screens below get a
          top inset of 0 (Screen reads the device top inset). */}
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
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
          <Tabs.Screen name="reach-out" options={{ href: null }} />
          <Tabs.Screen name="session/[id]" options={{ href: null }} />
          <Tabs.Screen name="delete-account" options={{ href: null }} />
        </Tabs>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
