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
  };
  const connect = () => {
    if (!invitation.trim()) {
      setInputError("Paste the invitation from your other phone.");
      return;
    }
    Keyboard.dismiss();
    setInputError("");
    actions.connect(invitation.trim());
  };
  const shareInvitation = async () => {
    try {
      await Share.share({
        message: state.invitation,
        title: "Synced private invitation",
      });
    } catch {
      Alert.alert(
        "Could not open sharing",
        "You can select and copy the invitation text instead."
      );
    }
  };
  const setAlarm = () => {
    if (
      !/^\d{1,2}$/.test(hour) ||
      !/^\d{1,2}$/.test(minute) ||
      Number(hour) > 23 ||
      Number(minute) > 59
    ) {
      setAlarmError("Use a time between 00:00 and 23:59.");
      return;
    }
    actions.sendAction(`set_alarm:${Number(hour)}:${Number(minute)}`);
    closeDialog();
  };
  const notice =
    state.error || (state.status !== DEFAULT_STATUS ? state.status : "");

  const welcome = (
    <>
      <View style={styles.stack}>
        <Eyebrow>YOUR PHONES. CONNECTED.</Eyebrow>
        <Text style={styles.hero}>
          {sharing
            ? "A little closer.\nOn the same Wi-Fi."
            : "Your other phone.\nRight here."}
        </Text>
        <Text style={styles.copy}>
          {sharing
            ? "Share this phone’s screen. You choose who connects and what they can do."
            : "See and control your other Android phone, with permission at every step."}
        </Text>
      </View>
      <PhoneArtwork />
      {state.role === "CONTROLLER" ? (
        <>
          <Status title="Connecting to your phone" subtitle={state.status} />
          <Button destructive onPress={actions.disconnect}>
            Cancel connection
          </Button>
        </>
      ) : sharing ? (
        <Card>
          <Eyebrow>01 · INVITE YOUR OTHER PHONE</Eyebrow>
          <Text style={styles.heading}>Make the connection.</Text>
          <Text style={styles.copy}>
            Create a private invitation, then paste it into Synced on your other
            Android phone.
          </Text>
          <Button primary onPress={actions.startHosting}>
            Create invitation
          </Button>
          <Text style={styles.fine}>
            You’ll approve the phone before it can connect.
          </Text>
        </Card>
      ) : (
        <Card>
          <Eyebrow>01 · CONNECT TO YOUR OTHER PHONE</Eyebrow>
          <Text style={styles.heading}>Have an invitation?</Text>
          <Text style={styles.copy}>
            Open Share in Synced on your other phone, then paste its invitation
            here.
          </Text>
          <TextInput
            accessibilityLabel="Invitation from your other phone"
            value={invitation}
            onChangeText={(value) => {
              setInvitation(value);
              setInputError("");
            }}
            placeholder="Paste your invitation"
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
            numberOfLines={2}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={8192}
          />
          {!!inputError && (
            <Text
              accessibilityRole="alert"
              style={[styles.caption, styles.danger]}
            >
              {inputError}
            </Text>
          )}
          <Button primary onPress={connect}>
            Connect to phone
          </Button>
        </Card>
      )}
      <Text style={[styles.caption, styles.centered]}>
        ◎ Both phones need to be on the same Wi-Fi.
      </Text>
      <View style={[styles.stack, { paddingTop: 8 }]}>
        <Eyebrow>ONE CONNECTION. A FEW LESS REACHES.</Eyebrow>
        {[
          ["See your screen", "A live view of the screen you choose to share."],
          [
            "Touch, swipe, type",
            "Optional control, enabled on the sharing phone.",
          ],
          [
            "Keep permission personal",
            "Approve the connection. Stop whenever you like.",
          ],
        ].map(([title, copy], index) => (
          <View
            key={title}
            style={[styles.row, { alignItems: "flex-start", marginTop: 5 }]}
          >
            <Text style={styles.stepNumber}>0{index + 1}</Text>
            <View style={[styles.smallStack, styles.fill]}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.caption}>{copy}</Text>
            </View>
          </View>
        ))}
      </View>
    </>
  );

  const host = (
    <>
      <View style={styles.stack}>
        <Eyebrow>
          {state.connected ? "SHARING FROM THIS PHONE" : "READY WHEN YOU ARE"}
        </Eyebrow>
        <Text style={styles.hero}>
          {state.connected
            ? "You’re in control."
            : "An invitation\nto connect."}
        </Text>
      </View>
      <Status
        title={
          state.connected
            ? state.peerName || "Your other phone"
            : "Waiting for your other phone"
        }
        subtitle={state.status}
        connected={state.connected}
      />
      {!!state.pendingPeer && (
        <Card attention>
          <Eyebrow>CONNECTION REQUEST</Eyebrow>
          <Text selectable style={styles.heading}>
            {state.pendingPeer}
          </Text>
          <Text style={styles.copy}>
            Compare the six-digit code on both phones. Approve only if the codes
            match and this is your phone. Sharing and control need separate
            permission.
          </Text>
          <View style={styles.row}>
            <Button style={styles.fill} onPress={actions.rejectPeer}>
              Decline
            </Button>
            <Button style={styles.fill} primary onPress={actions.approvePeer}>
              Approve
            </Button>
          </View>
        </Card>
      )}
      {!state.connected ? (
        <Card>
          <Eyebrow>PRIVATE INVITATION</Eyebrow>
          <Text style={styles.heading}>Send it to your other phone.</Text>
          <Text style={styles.copy}>
            Share the invitation and paste it into Connect on the other phone.
            Keep it private.
          </Text>
          {state.invitation ? (
            <>
              <Text selectable style={styles.invitation}>
                {state.invitation}
              </Text>
              <Button
                primary
                onPress={() => {
                  void shareInvitation();
                }}
              >
                Share invitation
              </Button>
            </>
          ) : (
            <Text style={styles.caption}>Preparing your invitation…</Text>
          )}
          <Text style={styles.fine}>Same Wi-Fi · Approval required</Text>
        </Card>
      ) : (
        <Card>
          <Eyebrow>SCREEN SHARING</Eyebrow>
          <Text style={styles.heading}>
            {state.capturing
              ? "Your screen is visible."
              : "Ready to share your screen?"}
          </Text>
          <Text style={styles.copy}>
            {state.capturing
              ? "The connected phone can see the screen you approved. End the session at any time below."
              : "Android will ask for screen capture permission. Approve it on this phone to begin sharing."}
          </Text>
          {!state.capturing && (
            <Button primary onPress={actions.startScreenSharing}>
              Share screen
            </Button>
          )}
          <Text style={styles.fine}>
            Sensitive apps may hide content. On Android 15+, locking this phone
            ends capture.
          </Text>
        </Card>
      )}
      <Card>
        <View style={styles.spread}>
          <Text style={[styles.title, styles.fill]}>Allow remote control</Text>
          <Switch
            accessibilityLabel="Allow the connected phone to control this phone"
            value={state.controlAllowed}
            onValueChange={actions.setControlAllowed}
            disabled={
              !state.accessibilityEnabled ||
              !state.connected ||
              !state.capturing
            }
            thumbColor={state.controlAllowed ? colors.lime : colors.muted}
            trackColor={{ false: colors.border, true: "#4B6539" }}
          />
        </View>
        <Text style={styles.caption}>
          Let your other phone tap, swipe, type, and navigate. Enable only for a
          phone you trust.
        </Text>
        {!state.accessibilityEnabled ? (
          <>
            <Text style={styles.caption}>
              Requires the Synced accessibility service. It can read screen
              content and perform actions while remote control is on.
            </Text>
            <Button onPress={actions.openAccessibilitySettings}>
              Open accessibility settings
            </Button>
          </>
        ) : (
          <Text
            style={[
              styles.fine,
              state.controlAllowed && { color: colors.lime },
            ]}
          >
            {!state.connected
              ? "Accessibility enabled · Connect a phone to allow control"
              : !state.capturing
              ? "Start screen sharing to allow remote control"
              : `Accessibility enabled · Control is ${
                  state.controlAllowed ? "on" : "off"
                }`}
          </Text>
        )}
      </Card>
      <Button destructive onPress={actions.disconnect}>
        {state.connected ? "Stop session" : "Cancel invitation"}
      </Button>
      <Text style={[styles.fine, styles.centered]}>
        Ending the session disconnects the other phone and stops screen sharing.
      </Text>
    </>
  );

  const controller = (
    <>
      <View style={styles.stack}>
        <Eyebrow>CONNECTED TO YOUR PHONE</Eyebrow>
        <Text style={styles.hero}>{state.peerName || "Your other phone"}</Text>
        <Text style={styles.caption}>{state.status}</Text>
      </View>
      <RemoteViewport
        uri={state.remoteFrame}
        enabled={canControl}
        onGesture={actions.sendGesture}
      />
      <View style={styles.row}>
        {[
          ["Back", "back"],
          ["Home", "home"],
          ["Apps", "recents"],
        ].map(([label, action]) => (
          <Button
            key={action}
            style={styles.fill}
            disabled={!canControl}
            onPress={() => actions.sendAction(action ?? "")}
          >
            {label ?? ""}
          </Button>
        ))}
      </View>
      <Button
        disabled={!canControl}
        onPress={() => {
          setText("");
          setDialog("keyboard");
        }}
      >
        Set text on the other phone
      </Button>
      <Card>
        <Eyebrow>CLOCK SHORTCUTS</Eyebrow>
        <Text style={styles.heading}>A little help with alarms.</Text>
        <Text style={styles.caption}>
          Open the clock or request an alarm action. Your other phone may ask
          you to confirm.
        </Text>
        <View style={styles.row}>
          <Button
            style={styles.fill}
            disabled={!canControl}
            onPress={() => actions.sendAction("alarms")}
          >
            Open clock
          </Button>
          <Button
            style={styles.fill}
            disabled={!canControl}
            onPress={() => {
              setAlarmError("");
              setDialog("alarm");
            }}
          >
            Set alarm
          </Button>
        </View>
        <View style={styles.row}>
          <Button
            style={styles.fill}
            disabled={!canControl}
            onPress={() => actions.sendAction("dismiss_alarm")}
          >
            Dismiss alarm
          </Button>
          <Button
            style={styles.fill}
            disabled={!canControl}
            onPress={() => actions.sendAction("snooze_alarm")}
          >
            Snooze
          </Button>
        </View>
      </Card>
      <Button destructive onPress={actions.disconnect}>
        Stop session
      </Button>
    </>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.body}
        >
          <View style={styles.spread}>
            <View style={styles.row}>
              <SyncedMark />
              <Text style={styles.brand}>Synced</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Connection guide and supported features"
              style={styles.guideButton}
              onPress={() => setDialog("guide")}
            >
              <Text style={styles.guideText}>Guide</Text>
            </Pressable>
          </View>
          <View accessibilityRole="tablist" style={styles.tabs}>
            {[
              ["Connect", false],
              ["Share", true],
            ].map(([label, value]) => (
              <Pressable
                key={String(label)}
                accessibilityRole="tab"
                accessibilityState={{ selected: sharing === value }}
