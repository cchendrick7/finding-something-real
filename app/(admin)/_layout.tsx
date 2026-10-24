import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Row } from '@/components/ui';
import { useSession } from '@/lib/session';
import { onLoadError } from '@/lib/loadError';
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
 *
 * People (issuing co-host accounts) and Inbox (co-host messages) are not tabs;
 * they hang off this bar so the tab row stays the six it was.
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
      <Row>
        <Pressable testID="open-people" onPress={() => router.push('/(admin)/people')} hitSlop={12}>
          <Text style={[type.eyebrow, { color: color.ink, textDecorationLine: 'underline' }]}>
            PEOPLE
          </Text>
        </Pressable>
        <Pressable testID="open-messages" onPress={() => router.push('/(admin)/messages')} hitSlop={12}>
          <Text style={[type.eyebrow, { color: color.ink, textDecorationLine: 'underline' }]}>
            INBOX
          </Text>
        </Pressable>
        <Pressable
          testID="signout"
          onPress={() => {
            // signOut clears the session state and then rethrows; leave either way.
            signOut().catch(onLoadError).finally(() => router.replace('/'));
          }}
          hitSlop={12}
        >
          <Text style={[type.eyebrow, { color: color.ink, textDecorationLine: 'underline' }]}>
            SIGN OUT
          </Text>
        </Pressable>
      </Row>
    </View>
  );
}

export default function AdminLayout() {
  const { profile, loading, isAdmin } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (loading) return;
    if (!profile) router.replace('/');
    else if (!isAdmin) router.replace('/(member)/home');
  }, [profile, loading, isAdmin, router]);

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      <AccountBar />
      {/* The account bar already sits below the status bar. Screens read the
          top inset themselves (Screen does), so hand them zero or every admin
          screen gets the status-bar gap twice. */}
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
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
          {/* Reachable from Recordings and Overview, not a tab of its own. */}
          <Tabs.Screen name="recording-form" options={{ href: null }} />
          {/* Reached from the account bar (People, Inbox) and from Overview (Inquiries). */}
          <Tabs.Screen name="people" options={{ href: null }} />
          <Tabs.Screen name="messages" options={{ href: null }} />
          <Tabs.Screen name="inquiries" options={{ href: null }} />
        </Tabs>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
