import { Tabs } from 'expo-router';
import { color, type } from '@/lib/theme';

/**
 * The public app. No account, no invitation, nothing hidden behind a wall.
 *
 * This exists because an app whose every screen sits behind an invitation-only
 * login does not get approved — App Review Guideline 4.2, and 5.1.1(v): "if
 * your app doesn't include significant account-based features, let people use
 * it without a login." The co-host area genuinely has those features, so the
 * login is defensible; an app that is *only* that login is not.
 *
 * Nothing in here may require a session. If a screen under (public) starts
 * reading the signed-in profile to decide what to show, the wall has grown
 * back.
 */
export default function PublicLayout() {
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
      <Tabs.Screen name="listen" options={{ title: 'Listen' }} />
      <Tabs.Screen name="about" options={{ title: 'About' }} />
      <Tabs.Screen name="cohost" options={{ title: 'Co-hosts' }} />
      {/* The web deletion URL Google Play requires. Reachable, not a tab. */}
      <Tabs.Screen name="delete-request" options={{ href: null }} />
    </Tabs>
  );
}
