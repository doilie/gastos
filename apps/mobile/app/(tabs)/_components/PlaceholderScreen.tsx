import { StyleSheet, Text, View } from "react-native";

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
    fontSize: 32,
    fontWeight: "600",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: "#666",
  },
});
