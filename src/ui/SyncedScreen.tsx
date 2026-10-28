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
