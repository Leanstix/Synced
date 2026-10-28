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
  const [sharing, setSharing] = useState(false);
  const [invitation, setInvitation] = useState("");
  const [inputError, setInputError] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [text, setText] = useState("");
  const [hour, setHour] = useState("07");
  const [minute, setMinute] = useState("00");
  const [alarmError, setAlarmError] = useState("");
  useEffect(() => {
    if (state.role !== "IDLE") setSharing(state.role === "HOST");
  }, [state.role]);
  const canControl = state.connected && state.controlAllowed;
  const closeDialog = () => setDialog(null);
  const chooseRole = (next: boolean) => {
    if (state.role !== "IDLE" && next !== sharing) {
      Alert.alert(
        "End this session?",
        "Switching phones ends the current connection and screen sharing.",
        [
          { text: "Keep session", style: "cancel" },
          {
            text: "End and switch",
            style: "destructive",
            onPress: () => {
              setSharing(next);
              actions.disconnect();
            },
          },
        ]
      );
    } else setSharing(next);
