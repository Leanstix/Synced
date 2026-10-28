import { StyleSheet } from "react-native";

export const colors = {
  background: "#0F1411",
  surface: "#19201B",
  elevated: "#222B24",
  border: "#354036",
  ink: "#F2F7EE",
  muted: "#A5B1A1",
  lime: "#D4FF74",
  warning: "#FFD58F",
  danger: "#FFAEA4",
};

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  body: {
    padding: 24,
    paddingTop: 18,
    paddingBottom: 32,
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    gap: 20,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  spread: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  stack: { gap: 12 },
  smallStack: { gap: 7 },
  brand: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -1,
  },
  guideButton: {
    minHeight: 44,
    minWidth: 76,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
  },
  guideText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  tabs: {
    flexDirection: "row",
    padding: 5,
    backgroundColor: colors.surface,
    borderRadius: 17,
    gap: 4,
  },
  tab: {
