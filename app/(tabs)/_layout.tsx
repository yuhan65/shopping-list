/**
 * Tab bar layout — defines the 4 main tabs of the app.
 * Today (daily hub), Plan (weekly overview), Recipes (collection),
 * and Provisions (shopping + pantry combined). Profile is
 * accessible from other screens but hidden from the tab bar.
 */
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '@/hooks/useColorScheme';
import { FontSize, Spacing } from '@/constants/Spacing';

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  const colors = useThemeColors();
  return (
    <View style={tabStyles.labelContainer}>
      <Text
        numberOfLines={1}
        style={[
          tabStyles.label,
          { color: focused ? colors.tint : colors.tabIconDefault },
        ]}
      >
        {label}
      </Text>
      {focused && (
        <View style={[tabStyles.dot, { backgroundColor: colors.tint }]} />
      )}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  labelContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 60,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});

export default function TabLayout() {
  const colors = useThemeColors();

  return (
    <Tabs
      screenOptions={{
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 70,
          paddingTop: Spacing.sm,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => <TabLabel label="Today" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          tabBarIcon: ({ focused }) => <TabLabel label="Plan" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          tabBarIcon: ({ focused }) => <TabLabel label="Recipes" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          tabBarIcon: ({ focused }) => <TabLabel label="Provisions" focused={focused} />,
        }}
      />
      {/* Pantry route is kept as a redirect for backwards compatibility */}
      <Tabs.Screen
        name="pantry"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile"
        options={{ href: null }}
      />
    </Tabs>
  );
}
