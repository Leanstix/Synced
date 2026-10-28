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
