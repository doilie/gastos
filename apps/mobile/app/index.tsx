import { StyleSheet, Text, View } from "react-native";

import { SHARED_PACKAGE_NAME } from "@gastos/shared";

/**
 * Placeholder home screen. Foundation scaffold only — proves Expo Router
 * navigation and the @gastos/shared workspace import both work; no real
 * screens or data yet.
 */
export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>gastos</Text>
      <Text style={styles.subtitle}>{SHARED_PACKAGE_NAME} linked</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "600",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: "#666",
  },
});
