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
  const [layout, setLayout] = useState<Size>({ width: 300, height: 420 });
  const [frame, setFrame] = useState<Size>({ width: 1, height: 2 });
  const latest = useRef({ layout, frame, uri, enabled, onGesture });
  latest.current = { layout, frame, uri, enabled, onGesture };
  const start = useRef<{ x: number; y: number; time: number } | null>(null);
  const point = (event: GestureResponderEvent, clamp: boolean) => {
    const { layout: box, frame: image } = latest.current;
    return normalizePoint(
      event.nativeEvent.locationX,
      event.nativeEvent.locationY,
      box,
      image,
      clamp
    );
  };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) =>
          latest.current.enabled &&
          !!latest.current.uri &&
          event.nativeEvent.touches.length === 1 &&
          point(event, false) !== null,
        onPanResponderGrant: (event) => {
          const p = point(event, false);
          start.current = p ? { ...p, time: Date.now() } : null;
        },
        onPanResponderMove: (event) => {
          if (event.nativeEvent.touches.length > 1) start.current = null;
        },
        onPanResponderRelease: (event) => {
          const first = start.current;
          start.current = null;
          const last = point(event, true);
          if (first && last && latest.current.enabled && latest.current.uri) {
            latest.current.onGesture(
              first.x,
              first.y,
              last.x,
              last.y,
              Math.max(1, Math.min(2000, Date.now() - first.time))
            );
          }
        },
        onPanResponderTerminate: () => {
          start.current = null;
        },
        onPanResponderTerminationRequest: () => false,
      }),
    []
  );
  return (
    <View style={styles.remoteShell}>
      <View
        style={[styles.remote, { height: Math.min(440, layout.width * 1.5) }]}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setLayout((previous) =>
            previous.width === width && previous.height === height
              ? previous
              : { width, height }
          );
        }}
        accessibilityLabel={
          enabled
            ? "Remote phone screen. Tap or swipe to control."
            : "Remote phone screen. View only."
        }
        {...pan.panHandlers}
      >
        {uri ? (
          <Image
            source={{ uri }}
            resizeMode="contain"
            style={styles.fill}
            pointerEvents="none"
            onLoad={(event) => {
              if (latest.current.uri !== uri) return;
              const { width, height } = event.nativeEvent.source;
              if (width > 0 && height > 0)
                setFrame((previous) =>
                  previous.width === width && previous.height === height
                    ? previous
                    : { width, height }
                );
            }}
          />
        ) : (
          <View style={styles.waiting} pointerEvents="none">
            <ActivityIndicator color={colors.lime} />
            <Text style={[styles.caption, styles.centered]}>
              Waiting for your other phone's screen
