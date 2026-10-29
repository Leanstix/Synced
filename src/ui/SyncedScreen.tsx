import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from 'react-native';
import {RTCView} from '@livekit/react-native-webrtc';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {SyncedActions, SyncedState, Transport} from '../model/types';
import {palette as c} from './theme';
import {Button, SectionLabel, StatusRow} from './primitives';
import {s} from './styles';
import {resolveScreenGesture, type Point, type Size} from './viewportGeometry';

import {SavedDevicesPanel} from './SavedDevicesPanel';
import {SavePairingPanel, ReconnectPanel} from './PairingPanels';
import {BluetoothSetup} from './BluetoothSetup';
import {VoicePanel} from './VoicePanel';
import {remotePanelState, alarmFieldsValid} from './remotePanelState';
import {transportAvailable} from './pairingPresentation';

type Props = {state: SyncedState; actions: SyncedActions};

function LinkMark({large = false}: {large?: boolean}) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[s.mark, large && s.largeMark]}>
      <View style={[s.phoneOutline, s.phoneLeft, large && s.largePhone]}><View style={s.phoneDash} /></View>
      <View style={[s.phoneOutline, s.phoneRight, large && s.largePhone]}><View style={[s.phoneDash, s.whiteDash]} /></View>
      <View style={s.linkLine} />
    </View>
  );
}


const statusLabels: Record<SyncedState['status'], string> = {
  idle: 'Ready to pair', listening: 'Waiting for a phone', connecting: 'Connecting',
  verifying: 'Verify connection', 'awaiting-approval': 'Waiting for approval',
  connected: 'Connected', disconnected: 'Disconnected', error: 'Needs attention',
};

export function SyncedScreen({state, actions}: Props) {
  const [mode, setMode] = useState<'share' | 'connect'>('share');
  const [transport, setTransport] = useState<Transport>('wifi');
  const [bluetoothAddress, setBluetoothAddress] = useState('');
  const [invitation, setInvitation] = useState('');
  const [privateAddress, setPrivateAddress] = useState('');
  const [showAddress, setShowAddress] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const run = async (label: string, operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(label);
    setLocalError(null);
    try { await operation(); }
    catch (error) { setLocalError(error instanceof Error ? error.message : 'That action could not be completed. Please try again.'); }
    finally { setBusy(null); }
  };

  const available = transportAvailable(transport, state.capabilities);
  const paired = state.status === 'connected';
  const pairing = ['listening', 'connecting', 'verifying', 'awaiting-approval'].includes(state.status);
  const comparisonCode = state.pendingPeer?.comparisonCode ?? state.comparisonCode;
  const showComparison = !!comparisonCode && !paired && pairing;
  const canApprove = state.role === 'HOST' && state.status === 'awaiting-approval';
  const error = localError ?? state.error;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={s.header}>
            <View style={s.brand}><LinkMark /><Text style={s.brandText}>synced<Text style={s.brandPeriod}>.</Text></Text></View>
            <View style={s.statusPill}><View style={[s.tinyDot, paired && s.activeDot]} /><Text style={s.pillText}>{statusLabels[state.status]}</Text></View>
          </View>

          {!paired && <View style={s.hero}>
            <SectionLabel>YOUR PHONES. TOGETHER.</SectionLabel>
            <Text accessibilityRole="header" style={s.heroTitle}>A little closer.<Text style={s.cyanText}>{'\n'}Even from here.</Text></Text>
            <Text style={s.heroBody}>Share a screen. Lend a hand. Connect two Android phones over trusted Wi-Fi or nearby Bluetooth.</Text>
          </View>}

          {error && <View accessibilityRole="alert" style={s.errorCard}>
            <Text style={s.errorTitle}>Let’s get this working</Text>
            <Text selectable style={s.errorText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => {setLocalError(null); actions.clearError();}} style={s.textButton}><Text style={s.errorDismiss}>Dismiss</Text></Pressable>
          </View>}

          {!paired && !pairing && !state.reconnect.active && <>
            <View accessibilityRole="tablist" style={s.tabs}>
              {(['wifi', 'bluetooth'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{selected: transport === value}} disabled={!!busy} onPress={() => {setTransport(value); setInvitation('');}} style={[s.tab, transport === value && s.selectedTab]}><Text style={[s.tabText, transport === value && s.selectedTabText]}>{value === 'wifi' ? 'Local Wi-Fi' : 'Bluetooth controls'}</Text></Pressable>)}
            </View>
            <View accessibilityRole="tablist" style={s.tabs}>
              {(['share', 'connect'] as const).map(tab => <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityState={{selected: mode === tab}}
                onPress={() => setMode(tab)}
                style={[s.tab, mode === tab && s.selectedTab]}>
                <Text style={[s.tabText, mode === tab && s.selectedTabText]}>{tab === 'share' ? 'Share this phone' : 'Connect to a phone'}</Text>
              </Pressable>)}
            </View>
            <View style={s.card}>
              <View style={s.cardHeading}><View style={s.stepBadge}><Text style={s.stepText}>01</Text></View><Text accessibilityRole="header" style={s.cardTitle}>{mode === 'share' ? 'Start with an invitation' : 'Bring your invitation'}</Text></View>
              <Text style={s.body}>{mode === 'share' ? 'Create a private invitation, then send it to the phone you want to connect. You approve the connection before anything is shared.' : 'On the other phone, choose “Share this phone”. Paste its invitation here to request a connection.'}</Text>
              {transport === 'bluetooth' && <BluetoothSetup state={state} actions={actions} chooseDevice={mode === 'connect'} selectedAddress={bluetoothAddress} onSelect={setBluetoothAddress} busy={busy} run={run} />}
              {mode === 'share' ? <>
                <Button label={busy === 'host' ? 'Creating invitation…' : 'Create invitation  ↗'} disabled={!!busy || !available} onPress={() => {void run('host', () => transport === 'bluetooth' ? actions.startBluetoothHost() : actions.startHost(privateAddress.trim() ? {privateAddress: privateAddress.trim()} : undefined));}} />
                {transport === 'wifi' && <Pressable accessibilityRole="button" accessibilityState={{expanded: showAddress}} onPress={() => setShowAddress(!showAddress)} style={s.textButton}><Text style={s.linkText}>{showAddress ? 'Hide network address' : 'Need to enter a network address?'}</Text></Pressable>}
                {transport === 'wifi' && showAddress && <View style={s.fieldGroup}><Text style={s.fieldLabel}>This phone’s private Wi-Fi address</Text><TextInput accessibilityLabel="This phone's private Wi-Fi address" autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" placeholder="192.168.1.10" placeholderTextColor={c.muted} style={s.input} value={privateAddress} onChangeText={setPrivateAddress} /><Text style={s.smallText}>Only needed if automatic address detection fails. Find it in this phone’s Wi-Fi settings.</Text></View>}
              </> : <>
                <Text style={s.fieldLabel}>Invitation</Text>
                <TextInput accessibilityLabel="Connection invitation" multiline autoCapitalize="none" autoCorrect={false} placeholder="Paste the complete invitation" placeholderTextColor={c.muted} style={[s.input, s.invitationInput]} value={invitation} onChangeText={setInvitation} />
                <Button label={busy === 'connect' ? 'Requesting connection…' : 'Request connection  ↗'} disabled={!!busy || !invitation.trim() || !available || (transport === 'bluetooth' && !state.bluetooth.devices.some(device => device.address === bluetoothAddress))} onPress={() => {void run('connect', () => transport === 'bluetooth' ? actions.connectBluetooth(invitation.trim(), bluetoothAddress) : actions.connect(invitation.trim()));}} />
              </>}
              {!available && <Text style={s.noticeText}>Local connections are unavailable here. Synced requires its Android development build on a physical phone.</Text>}
            </View>
            <SavedDevicesPanel state={state} actions={actions} transport={transport} busy={busy} run={run} />
            <View style={s.assurance}><View style={s.assuranceLine} /><Text style={s.assuranceText}>An invitation. A matching code. Your approval.</Text><View style={s.assuranceLine} /></View>
            <View style={s.explainer}><Text style={s.explainerTitle}>You stay in control.</Text><Text style={s.smallText}>Screen sharing and touch control each need your permission. You can stop either at any time.</Text></View>
          </>}

          {state.reconnect.active && <ReconnectPanel state={state} actions={actions} />}
          {pairing && !showComparison && !state.reconnect.active && <View style={s.card}>
            <View style={s.cardHeading}><ActivityIndicator color={c.cyan} /><Text accessibilityRole="header" style={s.cardTitle}>{state.role === 'HOST' ? 'Your invitation is ready' : 'Finding the other phone'}</Text></View>
            <Text style={s.body}>{state.role === 'HOST' ? 'Send this invitation to the other phone. Keep Synced open while it connects.' : state.transport === 'bluetooth' ? 'Keep both phones nearby with Bluetooth on and Synced open.' : 'Keep both phones on the same trusted Wi-Fi, with Synced open.'}</Text>
            {state.invitation && <>
              <Text style={s.fieldLabel}>PRIVATE INVITATION</Text>
              <View style={s.invitationBox}><Text selectable style={s.invitationCode}>{state.invitation}</Text></View>
              <Button label="Share invitation  ↗" onPress={() => {void run('share', async () => {await Share.share({message: state.invitation!});});}} disabled={!!busy} />
            </>}
            {state.localAddress && <Text style={s.smallText}>This phone · {state.localAddress}</Text>}
            <Button label="Cancel connection" variant="secondary" onPress={actions.disconnect} />
          </View>}

          {showComparison && <View style={[s.card, s.verificationCard]}>
            <SectionLabel>CHECK BOTH PHONES</SectionLabel>
            <Text accessibilityRole="header" style={s.sectionTitle}>Same code, same connection.</Text>
            <Text style={s.body}>Compare this code with the code on the other phone. Only continue if every digit matches.</Text>
            <View style={s.codeBox}><Text selectable accessibilityLabel={`Comparison code: ${comparisonCode.split('').join(' ')}`} style={s.comparisonCode}>{comparisonCode}</Text></View>
            {state.pendingPeer?.address && <Text style={s.smallText}>Connecting phone · {state.pendingPeer.address}</Text>}
            {canApprove ? <Button label="The codes match · Approve" onPress={actions.approvePeer} /> : <View style={s.waitingRow}><ActivityIndicator color={c.cyan} /><Text style={s.body}>Waiting for the other phone’s approval.</Text></View>}
            <Button label="Reject connection" variant="danger" onPress={actions.rejectPeer} />
          </View>}

          {paired && state.role === 'HOST' && <>
            <View style={s.connectedHeading}><SectionLabel>THIS PHONE IS CONNECTED</SectionLabel><Text accessibilityRole="header" style={s.sectionTitle}>Share on your terms.</Text><Text style={s.body}>{state.remoteAddress ? `Connected to ${state.remoteAddress}` : 'Your paired phone is connected.'}</Text></View>
            <View style={s.card}>
              <StatusRow label="Screen sharing" detail={state.screenSharing ? 'The other phone can see your screen.' : 'Your screen is private.'} active={state.screenSharing} />
              {state.transport === 'wifi' && !state.screenSharing && <Text style={s.body}>Android will ask what to share. Choose <Text style={s.strong}>Entire screen</Text> so the other phone can follow you between apps.</Text>}
              <Button label={state.screenSharing ? 'Stop screen sharing' : busy === 'screen' ? 'Opening screen permission…' : 'Share my entire screen'} variant={state.screenSharing ? 'secondary' : 'primary'} disabled={!!busy || state.transport === 'bluetooth' || !state.capabilities.screenSharing} onPress={() => {if (state.screenSharing) actions.stopScreenSharing(); else void run('screen', actions.startScreenSharing);}} />
              {state.transport === 'bluetooth' && <Text style={s.noticeText}>Bluetooth is controls only. There is no live screen or voice link. Use Wi-Fi to share a screen.</Text>}
              {!state.capabilities.screenSharing && <Text style={s.noticeText}>Screen sharing is unavailable in this build.</Text>}
            </View>
            <View style={s.card}>
              <StatusRow label="Touch control" detail={state.controlEnabled ? 'The other phone can tap, swipe and type.' : 'Only you can control this phone.'} active={state.controlEnabled} />
              <Text style={s.body}>Allow the paired phone to interact with your apps. This requires Android Accessibility permission and your explicit approval here.</Text>
              {!state.accessibilityEnabled && <Button label="Open Accessibility settings" variant="secondary" disabled={!!busy || !state.capabilities.remoteControl} onPress={() => {void run('accessibility', actions.requestAccessibility);}} />}
              <Button label={state.controlEnabled ? 'Turn off touch control' : 'Allow touch control'} variant={state.controlEnabled ? 'secondary' : 'primary'} disabled={!!busy || !state.capabilities.remoteControl || (!state.accessibilityEnabled && !state.controlEnabled)} onPress={() => {void run('control', () => actions.setControlEnabled(!state.controlEnabled));}} />
              {!state.accessibilityEnabled && state.capabilities.remoteControl && <Pressable accessibilityRole="button" onPress={() => {void run('refresh', actions.refreshPermissions);}} style={s.textButton}><Text style={s.linkText}>I enabled it · Check permission</Text></Pressable>}
              {!state.capabilities.remoteControl && <Text style={s.noticeText}>Touch control is unavailable in this build. Screen viewing can still work.</Text>}
            </View>
          </>}

          {paired && state.role === 'CONTROLLER' && <ControllerPanel state={state} actions={actions} />}

          {paired && <><SavePairingPanel state={state} actions={actions} busy={busy} run={run} /><VoicePanel state={state} actions={actions} busy={busy} run={run} /></>}
          {paired && <Button label="Disconnect phones" variant="danger" onPress={actions.disconnect} />}
          <View style={s.footer}><Text style={s.footerBrand}>CONNECTED WITH CONSENT</Text><Text style={s.footerText}>Local Wi-Fi or Bluetooth · Your permission, every session</Text><Text style={s.footerText}>Optional Wi-Fi voice intercom · No carrier or SIM call audio</Text></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ControllerPanel({state, actions}: Props) {
  const [viewport, setViewport] = useState<Size>({width: 0, height: 0});
  const [frame, setFrame] = useState<Size | null>(null);
  const [text, setText] = useState('');
  const [hour, setHour] = useState('');
  const [minute, setMinute] = useState('');
  const gesture = useRef<{point: Point; time: number} | null>(null);
  const {bluetooth, hasVideo, canControl, canTouch, aspectMatches, caption} = remotePanelState({connected: state.status === 'connected', transport: state.transport, controlEnabled: state.controlEnabled, streamUrl: state.remoteStreamUrl, frame, screen: state.remoteStreamSize});
  const validAlarm = alarmFieldsValid(hour, minute);

  useEffect(() => {
    setFrame(null);
    gesture.current = null;
  }, [state.remoteStreamUrl]);
  useEffect(() => { gesture.current = null; }, [state.controlEnabled, state.remoteStreamSize?.width, state.remoteStreamSize?.height]);

  const finishGesture = (event: GestureResponderEvent) => {
    const start = gesture.current;
    gesture.current = null;
    if (!start || !canTouch || !frame) return;
    const result = resolveScreenGesture(start.point, {x: event.nativeEvent.locationX, y: event.nativeEvent.locationY}, Date.now() - start.time, viewport, frame);
    if (!result) return;
    if (result.kind === 'swipe') actions.sendInput({type: 'swipe', fromX: result.from.x, fromY: result.from.y, toX: result.to.x, toY: result.to.y, durationMs: result.durationMs});
    else actions.sendInput({type: result.kind, x: result.point.x, y: result.point.y});
  };

  return <>
    <View style={s.connectedHeading}>
      <SectionLabel>THE OTHER PHONE</SectionLabel>
      <View style={s.sectionHeadingRow}><Text accessibilityRole="header" style={s.sectionTitle}>Within reach.</Text><View style={s.liveBadge}><View style={[s.tinyDot, state.remoteStreamUrl && s.activeDot]} /><Text style={s.smallText}>{bluetooth ? 'Controls only' : hasVideo ? 'Live screen' : 'Waiting'}</Text></View></View>
      <Text style={s.body}>{bluetooth ? 'No screen preview over Bluetooth. Use the buttons below after the host allows control.' : state.controlEnabled ? 'Tap, hold or swipe the screen to lend a hand.' : 'View only. The other phone must allow touch control.'}</Text>
    </View>
    <View style={s.remoteFrame}>
      <View
        accessibilityLabel={state.remoteStreamUrl ? 'Live remote phone screen' : 'Waiting for remote screen sharing'}
        style={s.remoteViewport}
        onLayout={event => {gesture.current = null; setViewport({width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height});}}>
        {hasVideo ? <RTCView streamURL={state.remoteStreamUrl!} objectFit="contain" mirror={false} style={StyleSheet.absoluteFill} onDimensionsChange={event => {
          const {width, height} = event.nativeEvent;
          if (frame?.width !== width || frame?.height !== height) {
            gesture.current = null;
            setFrame(width > 0 && height > 0 ? {width, height} : null);
          }
        }} /> : <View style={s.remoteEmpty}><LinkMark large /><Text style={s.emptyTitle}>{bluetooth ? 'Bluetooth controls only.' : 'Ready when they are.'}</Text><Text style={s.emptyText}>{bluetooth ? 'There is no live screen over Bluetooth. Navigation, text and alarm controls work after host approval.' : 'Ask the other phone to choose “Share my entire screen”. Its screen will appear here.'}</Text></View>}
        {hasVideo && <View
          accessible={false}
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => canTouch}
          onMoveShouldSetResponder={() => canTouch}
          onResponderGrant={event => {gesture.current = {point: {x: event.nativeEvent.locationX, y: event.nativeEvent.locationY}, time: Date.now()};}}
          onResponderRelease={finishGesture}
          onResponderTerminate={() => {gesture.current = null;}}
          onResponderTerminationRequest={() => false}
        />}
      </View>
      <View style={s.remoteBottom}><View style={[s.tinyDot, canTouch && s.activeDot]} /><Text style={s.remoteCaption}>{caption}</Text></View>
    </View>
    {hasVideo && canControl && frame && state.remoteStreamSize && !aspectMatches && <Text style={s.noticeText}>The video does not match the other phone’s entire screen. Ask them to stop sharing and share again, choosing “Entire screen”.</Text>}
    <View style={s.navigationBar}>{(['back', 'home', 'recents'] as const).map(action => <Pressable
      key={action}
      accessibilityRole="button"
      accessibilityLabel={`${action[0].toUpperCase()}${action.slice(1)} on the other phone`}
      accessibilityState={{disabled: !canControl}}
      disabled={!canControl}
      onPress={() => actions.sendInput({type: 'globalAction', action})}
      style={({pressed}) => [s.navigationButton, !canControl && s.disabled, pressed && s.pressed]}>
      <Text style={s.navigationSymbol}>{action === 'back' ? '‹' : action === 'home' ? '○' : '▢'}</Text>
      <Text style={s.navigationLabel}>{action === 'back' ? 'Back' : action === 'home' ? 'Home' : 'Recents'}</Text>
    </Pressable>)}</View>
    <View style={s.card}>
      <SectionLabel>A HELPING HAND</SectionLabel>
      <Text accessibilityRole="header" style={s.cardTitle}>Send some text</Text>
      <Text style={s.smallText}>Tap an editable field on the other phone first. Sending replaces the text in that field.</Text>
      <TextInput accessibilityLabel="Text to send to the focused remote field" style={[s.input, s.messageInput]} placeholder="Type for the other phone…" placeholderTextColor={c.muted} value={text} onChangeText={setText} multiline maxLength={2000} editable={canControl} />
      <Button label="Send to focused field" variant="secondary" disabled={!canControl || !text.length} onPress={() => actions.sendInput({type: 'setFocusedText', text})} />
      <View style={s.divider} />
      <Text accessibilityRole="header" style={s.cardTitle}>Set an alarm</Text>
      <Text style={s.smallText}>Opens the other phone’s alarm app. Android may ask for confirmation.</Text>
      <View style={s.alarmRow}><View style={s.flex}><Text style={s.fieldLabel}>Hour · 00–23</Text><TextInput accessibilityLabel="Alarm hour, 0 through 23" keyboardType="number-pad" maxLength={2} value={hour} onChangeText={value => setHour(value.replace(/\D/g, ''))} placeholder="HH" placeholderTextColor={c.muted} style={[s.input, s.timeInput]} editable={canControl} /></View><Text style={s.timeSeparator}>:</Text><View style={s.flex}><Text style={s.fieldLabel}>Minute · 00–59</Text><TextInput accessibilityLabel="Alarm minute, 0 through 59" keyboardType="number-pad" maxLength={2} value={minute} onChangeText={value => setMinute(value.replace(/\D/g, ''))} placeholder="MM" placeholderTextColor={c.muted} style={[s.input, s.timeInput]} editable={canControl} /></View></View>
      <Button label="Open alarm on other phone" variant="secondary" disabled={!canControl || !validAlarm} onPress={() => actions.sendInput({type: 'setAlarm', hour: Number(hour), minute: Number(minute)})} />
    </View>
  </>;
}

