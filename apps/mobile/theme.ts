// Shared design tokens for apps/mobile. Plain exported constants, no
// runtime theming/context system — this app has no dark-mode or
// multi-theme requirement today, so static exports are the simplest fit.
//
// Not yet consumed by any screen (see CLAUDE.md Increment 57) — later
// increments migrate each screen's local StyleSheet off its own hardcoded
// hex values and onto these tokens.

export const Colors = {
  background: "#ffffff",
  surface: "#ffffff",
  border: "#cccccc",
  text: "#1a1a1a",
  textMuted: "#666666",
  accent: "#3d5a80",
  positive: "#0a0",
  error: "#c00",
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Typography = {
  titleLarge: { fontSize: 32, fontWeight: "700" },
  heading: { fontSize: 18, fontWeight: "600" },
  body: { fontSize: 16, fontWeight: "400" },
  detail: { fontSize: 13, fontWeight: "400" },
} as const;

export const Radius = {
  default: 6,
} as const;
