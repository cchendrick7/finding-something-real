import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { color, type, space } from '@/lib/theme';

/**
 * Account bar.
 *
 * The admin portal is six tabs of content and, until this existed, no way out:
 * "Sign out" lived only on the co-host You tab, which leadership never sees.
 * Signing in as Janell meant staying Janell.
 *
 * It also names who you are, which matters more here than it looks — the
 * demo has seven accounts and the screens are the tell, not the identity.
 */
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
        LEADERSHIP · {profile.display_name}
      </Text>
      <Pressable
        testID="signout"
        onPress={async () => { await signOut(); router.replace('/'); }}
        hitSlop={12}
      >
        <Text style={[type.eyebrow, { color: color.ink, textDecorationLine: 'underline' }]}>
          SIGN OUT
        </Text>
      </Pressable>
    </View>
  );
}

export default function AdminLayout() {
  const { profile, loading, isAdmin } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!profile) router.replace('/');
    else if (!isAdmin) router.replace('/(member)/home');
  }, [profile, loading, isAdmin, router]);

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
    <AccountBar />
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.ink,
        tabBarInactiveTintColor: color.faint,
        tabBarStyle: { backgroundColor: color.paper, borderTopColor: color.lineSoft },
        tabBarLabelStyle: {
          fontFamily: type.small.fontFamily, fontSize: 9,
          letterSpacing: 0.8, textTransform: 'uppercase',
        },
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
        tabBarItemStyle: { paddingTop: 10 },
        sceneStyle: { backgroundColor: color.paper },
      }}
    >
      <Tabs.Screen name="overview" options={{ title: 'Overview' }} />
      <Tabs.Screen name="recordings" options={{ title: 'Recordings' }} />
      <Tabs.Screen name="notes" options={{ title: 'Notes' }} />
      <Tabs.Screen name="intake" options={{ title: 'Intake' }} />
      <Tabs.Screen name="responses" options={{ title: 'Responses' }} />
      <Tabs.Screen name="prayers" options={{ title: 'Prayer' }} />
    </Tabs>
    </View>
  );
}
