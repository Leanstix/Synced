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
import type {SyncedActions, SyncedState} from '../model/types';
import {palette as c} from './theme';
import {resolveScreenGesture, screenAspectMatches, type Point, type Size} from './viewportGeometry';

type Props = {state: SyncedState; actions: SyncedActions};
type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  compact?: boolean;
};

function Button({label, onPress, disabled, variant = 'primary', compact}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled: !!disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [s.button, compact && s.compactButton, s[`${variant}Button`], disabled && s.disabled, pressed && s.pressed]}>
      <Text style={[s.buttonText, variant === 'primary' ? s.primaryButtonText : variant === 'danger' ? s.dangerText : s.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

function LinkMark({large = false}: {large?: boolean}) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[s.mark, large && s.largeMark]}>
      <View style={[s.phoneOutline, s.phoneLeft, large && s.largePhone]}><View style={s.phoneDash} /></View>
      <View style={[s.phoneOutline, s.phoneRight, large && s.largePhone]}><View style={[s.phoneDash, s.whiteDash]} /></View>
      <View style={s.linkLine} />
    </View>
  );
}

function SectionLabel({children}: {children: string}) {
  return <Text style={s.eyebrow}>{children}</Text>;
}

function StatusRow({label, detail, active}: {label: string; detail: string; active: boolean}) {
  return <View style={s.statusRow}>
    <View style={[s.statusDot, active && s.activeDot]} />
    <View style={s.flex}><Text style={s.rowTitle}>{label}</Text><Text style={s.smallText}>{detail}</Text></View>
    <Text style={[s.statusValue, active && s.activeText]}>{active ? 'ON' : 'OFF'}</Text>
  </View>;
}

const statusLabels: Record<SyncedState['status'], string> = {
  idle: 'Ready to pair', listening: 'Waiting for a phone', connecting: 'Connecting',
  verifying: 'Verify connection', 'awaiting-approval': 'Waiting for approval',
  connected: 'Connected', disconnected: 'Disconnected', error: 'Needs attention',
};

export function SyncedScreen({state, actions}: Props) {
  const [mode, setMode] = useState<'share' | 'connect'>('share');
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
            <Text style={s.heroBody}>Share a screen. Lend a hand. Connect two Android phones on the same trusted Wi-Fi.</Text>
          </View>}

          {error && <View accessibilityRole="alert" style={s.errorCard}>
            <Text style={s.errorTitle}>Let’s get this working</Text>
            <Text selectable style={s.errorText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => {setLocalError(null); actions.clearError();}} style={s.textButton}><Text style={s.errorDismiss}>Dismiss</Text></Pressable>
          </View>}

          {!paired && !pairing && <>
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
              {mode === 'share' ? <>
                <Button label={busy === 'host' ? 'Creating invitation…' : 'Create invitation  ↗'} disabled={!!busy || !state.capabilities.localNetwork} onPress={() => {void run('host', () => actions.startHost(privateAddress.trim() ? {privateAddress: privateAddress.trim()} : undefined));}} />
                <Pressable accessibilityRole="button" accessibilityState={{expanded: showAddress}} onPress={() => setShowAddress(!showAddress)} style={s.textButton}><Text style={s.linkText}>{showAddress ? 'Hide network address' : 'Need to enter a network address?'}</Text></Pressable>
                {showAddress && <View style={s.fieldGroup}><Text style={s.fieldLabel}>This phone’s private Wi-Fi address</Text><TextInput accessibilityLabel="This phone's private Wi-Fi address" autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" placeholder="192.168.1.10" placeholderTextColor={c.muted} style={s.input} value={privateAddress} onChangeText={setPrivateAddress} /><Text style={s.smallText}>Only needed if automatic address detection fails. Find it in this phone’s Wi-Fi settings.</Text></View>}
              </> : <>
                <Text style={s.fieldLabel}>Invitation</Text>
                <TextInput accessibilityLabel="Connection invitation" multiline autoCapitalize="none" autoCorrect={false} placeholder="Paste the complete invitation" placeholderTextColor={c.muted} style={[s.input, s.invitationInput]} value={invitation} onChangeText={setInvitation} />
                <Button label={busy === 'connect' ? 'Requesting connection…' : 'Request connection  ↗'} disabled={!!busy || !invitation.trim() || !state.capabilities.localNetwork} onPress={() => {void run('connect', () => actions.connect(invitation.trim()));}} />
              </>}
              {!state.capabilities.localNetwork && <Text style={s.noticeText}>Local connections are unavailable here. Synced requires its Android development build on a physical phone.</Text>}
            </View>
            <View style={s.assurance}><View style={s.assuranceLine} /><Text style={s.assuranceText}>An invitation. A matching code. Your approval.</Text><View style={s.assuranceLine} /></View>
            <View style={s.explainer}><Text style={s.explainerTitle}>You stay in control.</Text><Text style={s.smallText}>Screen sharing and touch control each need your permission. You can stop either at any time.</Text></View>
          </>}

          {pairing && !showComparison && <View style={s.card}>
            <View style={s.cardHeading}><ActivityIndicator color={c.cyan} /><Text accessibilityRole="header" style={s.cardTitle}>{state.role === 'HOST' ? 'Your invitation is ready' : 'Finding the other phone'}</Text></View>
            <Text style={s.body}>{state.role === 'HOST' ? 'Send this invitation to the other phone. Keep Synced open while it connects.' : 'Keep both phones on the same trusted Wi-Fi, with Synced open.'}</Text>
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
              {!state.screenSharing && <Text style={s.body}>Android will ask what to share. Choose <Text style={s.strong}>Entire screen</Text> so the other phone can follow you between apps.</Text>}
              <Button label={state.screenSharing ? 'Stop screen sharing' : busy === 'screen' ? 'Opening screen permission…' : 'Share my entire screen'} variant={state.screenSharing ? 'secondary' : 'primary'} disabled={!!busy || !state.capabilities.screenSharing} onPress={() => {if (state.screenSharing) actions.stopScreenSharing(); else void run('screen', actions.startScreenSharing);}} />
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

          {paired && <Button label="Disconnect phones" variant="danger" onPress={actions.disconnect} />}
          <View style={s.footer}><Text style={s.footerBrand}>CONNECTED WITH CONSENT</Text><Text style={s.footerText}>Local Wi-Fi · No camera or microphone</Text><Text style={s.footerText}>Bluetooth, call audio and saved pairing aren’t available.</Text></View>
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
  const canControl = state.controlEnabled && !!state.remoteStreamUrl;
  const aspectMatches = screenAspectMatches(frame, state.remoteStreamSize);
  const canTouch = canControl && aspectMatches;
  const validAlarm = /^\d{1,2}$/.test(hour) && /^\d{1,2}$/.test(minute) && Number(hour) <= 23 && Number(minute) <= 59;

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
      <View style={s.sectionHeadingRow}><Text accessibilityRole="header" style={s.sectionTitle}>Within reach.</Text><View style={s.liveBadge}><View style={[s.tinyDot, state.remoteStreamUrl && s.activeDot]} /><Text style={s.smallText}>{state.remoteStreamUrl ? 'Live screen' : 'Waiting'}</Text></View></View>
      <Text style={s.body}>{state.controlEnabled ? 'Tap, hold or swipe the screen to lend a hand.' : 'View only. The other phone must allow touch control.'}</Text>
    </View>
    <View style={s.remoteFrame}>
      <View
        accessibilityLabel={state.remoteStreamUrl ? 'Live remote phone screen' : 'Waiting for remote screen sharing'}
        style={s.remoteViewport}
        onLayout={event => {gesture.current = null; setViewport({width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height});}}>
        {state.remoteStreamUrl ? <RTCView streamURL={state.remoteStreamUrl} objectFit="contain" mirror={false} style={StyleSheet.absoluteFill} onDimensionsChange={event => {
          const {width, height} = event.nativeEvent;
          if (frame?.width !== width || frame?.height !== height) {
            gesture.current = null;
            setFrame(width > 0 && height > 0 ? {width, height} : null);
          }
        }} /> : <View style={s.remoteEmpty}><LinkMark large /><Text style={s.emptyTitle}>Ready when they are.</Text><Text style={s.emptyText}>Ask the other phone to choose “Share my entire screen”. Its screen will appear here.</Text></View>}
        {state.remoteStreamUrl && <View
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
      <View style={s.remoteBottom}><View style={[s.tinyDot, canTouch && s.activeDot]} /><Text style={s.remoteCaption}>{canTouch ? 'Touch control allowed' : canControl ? frame && state.remoteStreamSize ? 'Touch gestures paused · Screen size differs' : 'Waiting for screen dimensions' : 'Screen viewing only'}</Text></View>
    </View>
    {canControl && frame && state.remoteStreamSize && !aspectMatches && <Text style={s.noticeText}>The video does not match the other phone’s entire screen. Ask them to stop sharing and share again, choosing “Entire screen”.</Text>}
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

const s = StyleSheet.create({
  safe: {flex: 1, backgroundColor: c.background},
  flex: {flex: 1},
  page: {paddingHorizontal: 22, paddingTop: 14, paddingBottom: 38, gap: 18, width: '100%', maxWidth: 620, alignSelf: 'center'},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16},
  brand: {flexDirection: 'row', alignItems: 'center', gap: 8},
  brandText: {fontSize: 27, fontWeight: '800', color: c.text, letterSpacing: -1.2},
  brandPeriod: {color: c.cyan},
  mark: {width: 32, height: 33, position: 'relative'},
  largeMark: {width: 65, height: 61, marginBottom: 12},
  phoneOutline: {position: 'absolute', width: 15, height: 25, borderWidth: 2, borderColor: c.cyan, borderRadius: 4, top: 2},
  phoneLeft: {left: 0},
  phoneRight: {right: 0, top: 8, borderColor: c.text},
  phoneDash: {position: 'absolute', bottom: 2, width: '35%', height: 2, borderRadius: 1, backgroundColor: c.cyan, alignSelf: 'center'},
  whiteDash: {backgroundColor: c.text},
  largePhone: {width: 29, height: 46, borderRadius: 8, borderWidth: 3},
  linkLine: {position: 'absolute', top: '48%', left: '36%', width: '28%', height: 3, backgroundColor: c.cyan, borderRadius: 2},
  statusPill: {flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 30},
  tinyDot: {width: 6, height: 6, borderRadius: 3, backgroundColor: c.muted},
  pillText: {color: c.secondary, fontSize: 11, fontWeight: '600'},
  hero: {gap: 15, marginBottom: 14},
  eyebrow: {fontSize: 10, color: c.cyan, fontWeight: '700', letterSpacing: 2},
  heroTitle: {fontSize: 36, lineHeight: 42, fontWeight: '700', letterSpacing: -1.7, color: c.text},
  cyanText: {color: c.cyan},
  heroBody: {fontSize: 15, lineHeight: 23, color: c.secondary, maxWidth: 410},
  tabs: {flexDirection: 'row', borderRadius: 13, padding: 4, gap: 3, backgroundColor: c.surface},
  tab: {flex: 1, minHeight: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center', padding: 9},
  selectedTab: {backgroundColor: c.surfaceRaised},
  tabText: {color: c.muted, fontSize: 12, fontWeight: '600', textAlign: 'center'},
  selectedTabText: {color: c.text},
  card: {backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 20, gap: 17},
  cardHeading: {flexDirection: 'row', alignItems: 'center', gap: 11},
  cardTitle: {color: c.text, fontSize: 18, lineHeight: 25, fontWeight: '600', flexShrink: 1, letterSpacing: -0.4},
  stepBadge: {width: 32, height: 32, borderRadius: 10, backgroundColor: c.cyanDark, alignItems: 'center', justifyContent: 'center'},
  stepText: {fontSize: 11, color: c.cyan, fontWeight: '700'},
  body: {color: c.secondary, fontSize: 14, lineHeight: 22, flexShrink: 1},
  strong: {fontWeight: '700', color: c.text},
  smallText: {color: c.secondary, fontSize: 12, lineHeight: 18},
  button: {minHeight: 51, justifyContent: 'center', alignItems: 'center', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14},
  compactButton: {minHeight: 44, paddingVertical: 10},
  primaryButton: {backgroundColor: c.cyan},
  secondaryButton: {backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border},
  dangerButton: {backgroundColor: c.redDark},
  buttonText: {fontSize: 13, fontWeight: '700', textAlign: 'center'},
  primaryButtonText: {color: c.background},
  secondaryButtonText: {color: c.text},
  dangerText: {color: c.red},
  disabled: {opacity: 0.38},
  pressed: {opacity: 0.7},
  textButton: {minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 8},
  linkText: {color: c.secondary, fontSize: 12, textAlign: 'center', lineHeight: 19},
  fieldGroup: {gap: 10},
  fieldLabel: {color: c.secondary, fontSize: 11, fontWeight: '600', lineHeight: 16},
  input: {backgroundColor: c.background, borderWidth: 1, borderColor: c.border, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: c.text, minHeight: 48},
  invitationInput: {minHeight: 112, textAlignVertical: 'top'},
  noticeText: {fontSize: 12, lineHeight: 19, color: c.amber},
  assurance: {flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 5},
  assuranceLine: {height: 1, flex: 1, backgroundColor: c.border},
  assuranceText: {color: c.muted, fontSize: 10, flexShrink: 1, textAlign: 'center'},
  explainer: {gap: 7, paddingHorizontal: 12, marginBottom: 8},
  explainerTitle: {color: c.text, fontWeight: '600', fontSize: 14},
  errorCard: {borderColor: c.redDark, borderWidth: 1, backgroundColor: '#251F2A', borderRadius: 15, padding: 16, gap: 9},
  errorTitle: {fontSize: 14, fontWeight: '700', color: c.red},
  errorText: {fontSize: 13, lineHeight: 20, color: c.text},
  errorDismiss: {color: c.red, fontSize: 12, fontWeight: '600'},
  invitationBox: {backgroundColor: c.background, padding: 13, borderRadius: 10},
  invitationCode: {color: c.secondary, fontSize: 11, lineHeight: 17, fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'})},
  verificationCard: {borderColor: '#32646F'},
  sectionTitle: {fontSize: 29, lineHeight: 35, color: c.text, fontWeight: '600', letterSpacing: -0.9, flexShrink: 1},
  codeBox: {backgroundColor: c.background, borderRadius: 12, paddingVertical: 25, alignItems: 'center'},
  comparisonCode: {fontSize: 31, color: c.cyan, letterSpacing: 4, fontWeight: '600', fontVariant: ['tabular-nums']},
  waitingRow: {flexDirection: 'row', gap: 12, alignItems: 'center'},
  connectedHeading: {gap: 12, marginBottom: 2},
  statusRow: {flexDirection: 'row', alignItems: 'center', gap: 11},
  statusDot: {width: 10, height: 10, borderRadius: 5, backgroundColor: c.muted},
  activeDot: {backgroundColor: c.green},
  rowTitle: {fontSize: 16, color: c.text, fontWeight: '600', marginBottom: 3},
  statusValue: {fontSize: 10, fontWeight: '700', letterSpacing: 1, color: c.muted},
  activeText: {color: c.green},
  sectionHeadingRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap'},
  liveBadge: {flexDirection: 'row', gap: 6, alignItems: 'center'},
  remoteFrame: {borderWidth: 1, borderColor: c.border, borderRadius: 20, backgroundColor: '#030A10', overflow: 'hidden'},
  remoteViewport: {height: 430, width: '100%', overflow: 'hidden'},
  remoteEmpty: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, gap: 12},
  emptyTitle: {fontSize: 19, lineHeight: 25, color: c.text, fontWeight: '600', textAlign: 'center'},
  emptyText: {color: c.secondary, fontSize: 13, lineHeight: 21, textAlign: 'center'},
  remoteBottom: {backgroundColor: c.surface, padding: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7},
  remoteCaption: {fontSize: 11, color: c.secondary},
  navigationBar: {flexDirection: 'row', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 15, marginTop: -7},
  navigationButton: {flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 66, paddingVertical: 9, gap: 3},
  navigationSymbol: {color: c.text, fontSize: 23, lineHeight: 25},
  navigationLabel: {color: c.secondary, fontSize: 10},
  messageInput: {minHeight: 90, textAlignVertical: 'top'},
  divider: {height: 1, backgroundColor: c.border, marginVertical: 4},
  alarmRow: {flexDirection: 'row', gap: 12, alignItems: 'flex-end'},
  timeInput: {textAlign: 'center', fontSize: 24, fontVariant: ['tabular-nums'], marginTop: 8},
  timeSeparator: {color: c.muted, fontSize: 25, paddingBottom: 12},
  footer: {alignItems: 'center', gap: 6, paddingTop: 14},
  footerBrand: {fontSize: 8, color: c.muted, letterSpacing: 2, fontWeight: '700', marginBottom: 3},
  footerText: {fontSize: 10, color: c.muted, lineHeight: 15, textAlign: 'center'},
});
