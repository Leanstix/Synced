import React, { useEffect, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { UiActions, UiState } from "../controller/useSynced";
import { PhoneArtwork, SyncedMark } from "./Brand";
import { Button, Card, Eyebrow, Status } from "./components";
import { RemoteViewport } from "./RemoteViewport";
import { colors, styles } from "./theme";

type Props = { state: UiState; actions: UiActions };
type Dialog = "guide" | "keyboard" | "alarm" | null;
const DEFAULT_STATUS = "Ready for a connection you approve.";
const GUIDE =
  "1. Connect both Android phones to the same Wi-Fi.\n\n2. On the phone you want to access, choose Share and create an invitation.\n\n3. Paste its invitation into Connect on your other phone. Compare the six-digit code on both phones, then approve on the sharing phone.\n\n4. Start screen sharing and approve Android’s capture prompt. For touch control, enable Synced in accessibility settings and turn on Allow remote control.\n\nYou can view the screen, tap, swipe, replace text in a focused field, navigate, and request clock actions. Protected screens may be blank. Calls, audio forwarding, and high-performance games are not supported.\n\nStop session ends access immediately.";

export function SyncedScreen({ state, actions }: Props) {
