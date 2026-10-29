import React, {useState} from 'react';
import {ActivityIndicator, Pressable, Text, TextInput, View} from 'react-native';
import type {SavedDevice, SyncedActions, SyncedState, Transport} from '../model/types';
import {privateAddressField, portField} from './addressForm';
import {deviceDisplayName, savedPeerDetail, sortedSavedPeers} from './savedPeerPresentation';
import {transportAvailable} from './pairingPresentation';
import {Button, SectionLabel, type ActionRunner} from './primitives';
import {s} from './styles';
import {palette as c} from './theme';

type Props = {state: SyncedState; actions: SyncedActions; transport: Transport; busy: string | null; run: ActionRunner};

export function SavedDevicesPanel(props: Props) {
  const {state} = props;
  if (!state.capabilities.persistentPairing) return null;
  return <View style={s.card}>
    <SectionLabel>SAVED PHONES</SectionLabel>
    <Text accessibilityRole="header" style={s.cardTitle}>A familiar connection.</Text>
    {!state.trustReady ? <View style={s.waitingRow}><ActivityIndicator color={c.cyan} /><Text style={s.smallText}>Loading saved phones…</Text></View>
      : state.savedPeers.length ? sortedSavedPeers(state.savedPeers).map(peer => <SavedDeviceRow key={`${peer.id}:${props.transport}`} {...props} peer={peer} />)
        : <Text style={s.smallText}>Your saved phones will appear here. After connecting, choose “Save pairing” on both phones.</Text>}
  </View>;
}

function SavedDeviceRow({state, actions, transport, busy, run, peer}: Props & {peer: SavedDevice}) {
  const [expanded, setExpanded] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [address, setAddress] = useState(peer.role === 'HOST' ? peer.endpoint?.address ?? '' : '');
  const [port, setPort] = useState(String(peer.endpoint?.port ?? 47631));
  const hostPeer = peer.role === 'HOST';
  const name = deviceDisplayName(peer.name);
  const addressField = privateAddressField(address, hostPeer);
  const portResult = portField(port);
  const available = transportAvailable(transport, state.capabilities);
  const bluetoothEndpointMissing = transport === 'bluetooth' && hostPeer && !peer.bluetoothAddress;
  const valid = transport === 'bluetooth' ? !bluetoothEndpointMissing : addressField.valid && portResult.valid;

  const reconnect = () => run(`saved-${peer.id}`, () => hostPeer
    ? actions.reconnectPeer(peer.id, transport === 'bluetooth' ? {transport} : {transport, address: addressField.value, port: portResult.value!, retry: true})
    : actions.receiveTrustedPeer(peer.id, transport === 'bluetooth' ? {transport} : {transport, privateAddress: addressField.value || undefined, port: portResult.value!}));

  return <View style={s.savedRow}>
    <View style={s.sectionHeadingRow}>
      <View style={s.flex}><Text style={s.rowTitle}>{name}</Text><Text style={s.smallText}>{savedPeerDetail(peer)}</Text></View>
      <View style={s.savedBadge}><Text style={s.savedBadgeText}>{peer.revocationPending ? 'FORGET PENDING' : 'SAVED'}</Text></View>
    </View>
    {peer.revocationPending && <Button label={busy === `forget-${peer.id}` ? 'Forgetting…' : 'Retry forget'} variant="danger" disabled={!!busy} onPress={() => {void run(`forget-${peer.id}`, () => actions.forgetPeer(peer.id));}} />}
    {!forgetting && !peer.revocationPending && <>
      <Button label={expanded ? 'Hide connection options' : hostPeer ? 'Reconnect' : 'Receive connection'} variant="secondary" compact disabled={!!busy} onPress={() => setExpanded(!expanded)} />
      {expanded && <View style={s.fieldGroup}>
        <Text style={s.smallText}>{hostPeer ? 'On the other phone, open Synced and choose “Receive connection” for this phone. Then connect below.' : 'Keep Synced open here. On the other phone, choose “Reconnect” for this phone.'}</Text>
        {transport === 'wifi' ? <>
          <Text style={s.fieldLabel}>{hostPeer ? 'Host phone’s current private Wi-Fi address' : 'This phone’s private Wi-Fi address · optional'}</Text>
          <TextInput accessibilityLabel={hostPeer ? `Current Wi-Fi address for ${name}` : 'This phone’s private Wi-Fi address for saved pairing'} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" placeholder={hostPeer ? '192.168.1.10' : 'Automatic detection'} placeholderTextColor={c.muted} style={s.input} value={address} onChangeText={setAddress} maxLength={64} editable={!busy} />
          {addressField.error && <Text style={s.noticeText}>{addressField.error}</Text>}
          <Text style={s.fieldLabel}>Port · use the same value on both phones</Text>
          <TextInput accessibilityLabel={`Connection port for ${name}`} keyboardType="number-pad" style={s.input} value={port} onChangeText={setPort} maxLength={5} editable={!busy} />
          {portResult.error && <Text style={s.noticeText}>{portResult.error}</Text>}
          <Text style={s.smallText}>Wi-Fi addresses can change. Find the current address in the host phone’s Wi-Fi settings.</Text>
        </> : <Text style={s.smallText}>{bluetoothEndpointMissing ? 'This pairing has no saved Bluetooth address. Connect over Bluetooth with a new invitation first.' : hostPeer ? `Bluetooth device · ${peer.bluetoothAddress}` : 'Listening over Bluetooth. The other phone must already be paired in Android settings.'}</Text>}
        <Button label={busy === `saved-${peer.id}` ? 'Starting connection…' : hostPeer ? 'Reconnect to this phone' : 'Receive this phone’s connection'} disabled={!!busy || !valid || !available || !state.trustReady} onPress={() => {void reconnect();}} />
      </View>}
      <Pressable accessibilityRole="button" accessibilityLabel={`Forget ${name}`} disabled={!!busy} onPress={() => {setExpanded(false); setForgetting(true);}} style={s.textButton}><Text style={[s.linkText, s.dangerText]}>Forget phone</Text></Pressable>
    </>}
    {forgetting && !peer.revocationPending && <View accessibilityRole="alert" style={s.confirmationBox}>
      <Text style={s.rowTitle}>Forget {name}?</Text>
      <Text style={s.smallText}>This removes the saved pairing from this phone. A new invitation will be needed to pair again. The other phone keeps its own saved list.</Text>
      <Button label={busy === `forget-${peer.id}` ? 'Forgetting…' : 'Forget this phone'} variant="danger" disabled={!!busy} onPress={() => {void run(`forget-${peer.id}`, () => actions.forgetPeer(peer.id));}} />
      <Button label="Keep saved phone" variant="secondary" onPress={() => setForgetting(false)} disabled={!!busy} />
    </View>}
  </View>;
}
