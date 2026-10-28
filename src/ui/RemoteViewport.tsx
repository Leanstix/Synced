import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  PanResponder,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import type { UiActions } from "../controller/useSynced";
import { colors, styles } from "./theme";
import { normalizePoint } from "./viewportGeometry";

type Props = {
  uri: string | null;
  enabled: boolean;
  onGesture: UiActions["sendGesture"];
};
type Size = { width: number; height: number };

/** The same contain rectangle drives both JPEG display and normalized touch mapping. */
export const RemoteViewport = React.memo(function RemoteViewport({
  uri,
  enabled,
  onGesture,
}: Props) {
