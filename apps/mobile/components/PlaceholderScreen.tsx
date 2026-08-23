import { StyleSheet, Text, View } from "react-native";

import { Colors, Spacing, Typography } from "../theme";

/**
 * Shared visual shell for tab screens that don't have real data wired up
 * yet. Each tab renders this with its own title/subtitle until the
 * corresponding domain data is connected.
 */
export function PlaceholderScreen({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
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
    ...Typography.titleLarge,
  },
  subtitle: {
    ...Typography.detail,
    marginTop: Spacing.sm,
    color: Colors.textMuted,
  },
});
