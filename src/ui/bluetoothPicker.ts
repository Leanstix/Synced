import {deviceDisplayName} from './savedPeerPresentation';

export type BluetoothDeviceRow = {address: string; name: string};

/** Show only real bonded endpoints; a repeated address is still one phone. */
export function bluetoothDeviceRows(devices: readonly BluetoothDeviceRow[]): BluetoothDeviceRow[] {
  const rows = new Map<string, BluetoothDeviceRow>();
  for (const device of devices) {
    const address = device.address.trim().toUpperCase();
    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(address)) continue;
    if (!rows.has(address)) rows.set(address, {address, name: deviceDisplayName(device.name, 'Unnamed Bluetooth device')});
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name) || a.address.localeCompare(b.address));
}

export function selectedBluetoothDevice(devices: readonly BluetoothDeviceRow[], selectedAddress: string): BluetoothDeviceRow | null {
  const address = selectedAddress.trim().toUpperCase();
  return bluetoothDeviceRows(devices).find(device => device.address === address) ?? null;
}

export function bluetoothPickerMessage(supported: boolean, loading: boolean, deviceCount: number): string {
  if (!supported) return 'Bluetooth is unavailable in this build. Use local Wi-Fi to connect.';
  if (loading) return 'Checking phones paired in Android settings…';
  if (!deviceCount) return 'No paired devices found. Pair the phones in Android Bluetooth settings, then refresh this list.';
  return 'Choose the host phone. Being paired in Android does not approve a Synced connection.';
}
