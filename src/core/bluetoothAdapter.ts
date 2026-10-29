import { PermissionsAndroid, Platform, type Permission } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import BluetoothClassic from 'react-native-bluetooth-classic';

export interface BluetoothPeer { address: string; name: string }
export const BLUETOOTH_OPTIONS = {
  connectorType: 'rfcomm', acceptorType: 'rfcomm', connectionType: 'delimited',
  delimiter: '', charset: 'ascii', readSize: 1024, secureSocket: true, serviceName: 'Synced',
};

export function bluetoothAddress(value: string): string {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(value)) throw new Error('Select a paired Bluetooth phone.');
  return value.toUpperCase();
}

export function bluetoothPermissions(apiLevel: number, discoverable = false): Permission[] {
  if (apiLevel < 31) return [];
  // The package cancels system discovery during connect, requiring SCAN even
  // though Synced deliberately lists bonded devices and never starts discovery.
  return [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    ...(discoverable ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE] : [])];
}

export async function requestBluetoothPermissions(discoverable = false): Promise<void> {
  if (Platform.OS !== 'android') throw new Error('Bluetooth phone connections require Android.');
  const permissions = bluetoothPermissions(Number(Platform.Version), discoverable);
  if (!permissions.length) return;
  const result = await PermissionsAndroid.requestMultiple(permissions);
  if (permissions.some(permission => result[permission] !== PermissionsAndroid.RESULTS.GRANTED)) {
    throw new Error('Allow Nearby devices permission to use Bluetooth.');
  }
}

export async function requestBluetoothEnable(): Promise<void> {
  await requestBluetoothPermissions();
  if (!await BluetoothClassic.isBluetoothAvailable()) throw new Error('Bluetooth Classic is unavailable on this phone.');
  if (!await BluetoothClassic.isBluetoothEnabled()) {
    await IntentLauncher.startActivityAsync('android.bluetooth.adapter.action.REQUEST_ENABLE');
    if (!await BluetoothClassic.isBluetoothEnabled()) throw new Error('Bluetooth is still off.');
  }
}

export async function listBondedDevices(): Promise<BluetoothPeer[]> {
  await requestBluetoothEnable();
  const devices = await BluetoothClassic.getBondedDevices();
  const peers = new Map<string, BluetoothPeer>();
  for (const device of devices) {
    if (device.type === 'LOW_ENERGY' || !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(device.address)) continue;
    const address = bluetoothAddress(device.address);
    const name = typeof device.name === 'string' ? device.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) : '';
    peers.set(address, { address, name: name || 'Paired phone' });
  }
  return [...peers.values()].sort((a, b) => a.name.localeCompare(b.name) || a.address.localeCompare(b.address));
}

export async function requestBluetoothDiscoverable(): Promise<void> {
  await requestBluetoothPermissions(true);
  await requestBluetoothEnable();
  const result = await IntentLauncher.startActivityAsync('android.bluetooth.adapter.action.REQUEST_DISCOVERABLE', {
    extra: { 'android.bluetooth.adapter.extra.DISCOVERABLE_DURATION': 120 },
  });
  if (result.resultCode <= 0) throw new Error('Discoverability was cancelled.');
}

export async function openBluetoothPairingSettings(): Promise<void> {
  if (Platform.OS !== 'android') throw new Error('Bluetooth pairing requires Android.');
  await IntentLauncher.startActivityAsync('android.settings.BLUETOOTH_SETTINGS');
}
