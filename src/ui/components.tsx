import React from "react";
import { Pressable, Text, View, type ViewStyle } from "react-native";
import { colors, styles } from "./theme";

type ButtonProps = {
  children: string;
  onPress: () => void;
  primary?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};
export function Button({
  children,
  onPress,
  primary,
  destructive,
  disabled,
  style,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.buttonPrimary,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          primary && styles.buttonTextPrimary,
          destructive && styles.danger,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function Card({
  children,
  attention,
}: {
  children: React.ReactNode;
  attention?: boolean;
}) {
  return (
    <View style={[styles.card, attention && { borderColor: colors.warning }]}>
      {children}
    </View>
  );
}
export function Eyebrow({ children }: { children: string }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}
export function Status({
  title,
  subtitle,
  connected,
}: {
