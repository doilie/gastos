import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";

import { Colors } from "../../theme";

type IconName = keyof typeof Ionicons.glyphMap;

function TabIcon(name: IconName) {
  return function renderTabIcon({
    color,
    size,
  }: {
    color: ColorValue;
    size: number;
  }) {
    return <Ionicons name={name} size={size} color={color} />;
  };
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.background,
          borderTopColor: Colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Today", tabBarIcon: TabIcon("today-outline") }}
      />
      <Tabs.Screen
        name="envelopes"
        options={{ title: "Envelopes", tabBarIcon: TabIcon("mail-outline") }}
      />
      <Tabs.Screen
        name="cards"
        options={{ title: "Cards", tabBarIcon: TabIcon("card-outline") }}
      />
      <Tabs.Screen
        name="budget"
        options={{ title: "Budget", tabBarIcon: TabIcon("wallet-outline") }}
      />
      <Tabs.Screen
        name="reports"
        options={{ title: "Reports", tabBarIcon: TabIcon("bar-chart-outline") }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: "More", tabBarIcon: TabIcon("ellipsis-horizontal") }}
      />
    </Tabs>
  );
}
