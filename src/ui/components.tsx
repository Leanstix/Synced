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
