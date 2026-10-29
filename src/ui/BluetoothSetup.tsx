import React from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import type {SyncedActions, SyncedState} from '../model/types';
import {bluetoothDeviceRows, bluetoothPickerMessage} from './bluetoothPicker';
import {Button, type ActionRunner} from './primitives';
import {s} from './styles';
import {palette as c} from './theme';

type Props = {state: SyncedState; actions: SyncedActions; chooseDevice: boolean; selectedAddress: string; onSelect: (address: string) => void; busy: string | null; run: ActionRunner};

export function BluetoothSetup({state, actions, chooseDevice, selectedAddress, onSelect, busy, run}: Props) {
  const devices = bluetoothDeviceRows(state.bluetooth.devices);
  const supported = state.capabilities.bluetooth;
  return <View style={s.fieldGroup}>
    <View style={s.transportNote}><Text style={s.transportNoteTitle}>Nearby controls. No live screen.</Text><Text style={s.smallText}>Bluetooth carries navigation, text and alarm requests. It does not carry screen video or Synced voice. The host must allow control after connecting.</Text></View>
    {!supported && <Text style={s.noticeText}>{bluetoothPickerMessage(false, false, 0)}</Text>}
    {supported && <>
      <Text style={s.smallText}>First pair both phones in Android Bluetooth settings. Then return to Synced and create a private invitation.</Text>
      {state.bluetooth.enabled === false && <Text style={s.noticeText}>Bluetooth is turned off on this phone.</Text>}
      {state.bluetooth.enabled !== true && <Button label="Turn on Bluetooth" variant="secondary" disabled={!!busy} onPress={() => {void run('bluetooth-enable', actions.enableBluetooth);}} />}
      <View style={s.buttonRow}>
        <View style={s.flex}><Button label="Bluetooth settings" variant="secondary" compact disabled={!!busy} onPress={() => {void run('bluetooth-settings', actions.openBluetoothSettings);}} /></View>
        <View style={s.flex}><Button label={state.bluetooth.loading ? 'Refreshing…' : 'Refresh devices'} variant="secondary" compact disabled={!!busy || state.bluetooth.loading} onPress={() => {void run('bluetooth-refresh', actions.refreshBluetoothDevices);}} /></View>
      </View>
      {!chooseDevice && <Button label="Make this phone discoverable" variant="secondary" compact disabled={!!busy} onPress={() => {void run('bluetooth-discoverable', actions.makeBluetoothDiscoverable);}} />}
      {chooseDevice && <>
        <Text style={s.fieldLabel}>HOST PHONE · PAIRED IN ANDROID</Text>
        <Text accessibilityLiveRegion="polite" style={s.smallText}>{bluetoothPickerMessage(supported, state.bluetooth.loading, devices.length)}</Text>
        {state.bluetooth.loading && <ActivityIndicator color={c.cyan} />}
        <View accessibilityRole="radiogroup" style={s.fieldGroup}>
          {devices.map(device => <Pressable key={device.address} accessibilityRole="radio" accessibilityState={{selected: selectedAddress === device.address, disabled: !!busy || state.bluetooth.loading}} accessibilityLabel={`${device.name}, ${device.address}`} disabled={!!busy || state.bluetooth.loading} onPress={() => onSelect(device.address)} style={[s.deviceOption, selectedAddress === device.address && s.selectedDeviceOption]}>
            <View style={[s.radioCircle, selectedAddress === device.address && s.radioSelected]} />
            <View style={s.flex}><Text style={s.rowTitle}>{device.name}</Text><Text style={s.smallText}>{device.address}</Text></View>
          </Pressable>)}
        </View>
      </>}
    </>}
  </View>;
}
