import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  platform: { OS: 'android', Version: 35 },
  permissions: vi.fn(async (values: string[]) => Object.fromEntries(values.map(value => [value, 'granted']))),
  available: vi.fn(async () => true), enabled: vi.fn(async () => true), bonded: vi.fn(async (): Promise<unknown[]> => []),
  intent: vi.fn(async () => ({ resultCode: 120 })),
}));
vi.mock('react-native', () => ({ Platform: native.platform, PermissionsAndroid: {
  PERMISSIONS: { BLUETOOTH_CONNECT: 'connect', BLUETOOTH_SCAN: 'scan', BLUETOOTH_ADVERTISE: 'advertise' },
  RESULTS: { GRANTED: 'granted' }, requestMultiple: native.permissions,
} }));
vi.mock('react-native-bluetooth-classic', () => ({ default: {
  isBluetoothAvailable: native.available, isBluetoothEnabled: native.enabled, getBondedDevices: native.bonded,
} }));
vi.mock('expo-intent-launcher', () => ({ startActivityAsync: native.intent }));
import { bluetoothAddress, bluetoothPermissions, listBondedDevices, openBluetoothPairingSettings,
  requestBluetoothDiscoverable, requestBluetoothEnable, requestBluetoothPermissions } from '../src/core/bluetoothAdapter';

beforeEach(() => { vi.clearAllMocks(); native.platform.OS = 'android'; native.platform.Version = 35;
  native.available.mockResolvedValue(true); native.enabled.mockResolvedValue(true); native.intent.mockResolvedValue({ resultCode: 120 });
  native.permissions.mockImplementation(async values => Object.fromEntries(values.map(value => [value, 'granted'])));
});

describe('Bluetooth permission policy', () => {
  it('uses no location or runtime permission for bonded devices before Android 12', async () => {
    expect(bluetoothPermissions(30)).toEqual([]); native.platform.Version = 30;
    await requestBluetoothPermissions(); expect(native.permissions).not.toHaveBeenCalled();
  });
  it('requests connect and scan on modern Android and advertise only for discoverability', () => {
    expect(bluetoothPermissions(31)).toEqual(['connect', 'scan']);
    expect(bluetoothPermissions(35, true)).toEqual(['connect', 'scan', 'advertise']);
  });
  it('fails closed when any Nearby devices permission is refused', async () => {
    native.permissions.mockResolvedValue({ connect: 'granted', scan: 'denied' });
    await expect(listBondedDevices()).rejects.toThrow('Nearby'); expect(native.bonded).not.toHaveBeenCalled();
  });
  it('refuses unsupported platforms without invoking Android APIs', async () => {
    native.platform.OS = 'ios'; await expect(requestBluetoothEnable()).rejects.toThrow('Android');
    expect(native.available).not.toHaveBeenCalled();
  });
  it('refuses absent hardware and cancelled enable requests', async () => {
    native.available.mockResolvedValue(false); await expect(requestBluetoothEnable()).rejects.toThrow('unavailable');
    native.available.mockResolvedValue(true); native.enabled.mockResolvedValue(false);
    await expect(requestBluetoothEnable()).rejects.toThrow('still off');
    expect(native.intent).toHaveBeenCalledWith('android.bluetooth.adapter.action.REQUEST_ENABLE');
  });
});

describe('bonded adapter operations', () => {
  it('normalizes addresses, excludes BLE, deduplicates and bounds device names', async () => {
    native.bonded.mockResolvedValue([
      { address: 'aa:bb:cc:dd:ee:ff', name: 'One', type: 'DUAL' },
      { address: 'AA:BB:CC:DD:EE:FF', name: '\u0000Two\n', type: 'CLASSIC' },
      { address: '00:11:22:33:44:55', name: 'BLE', type: 'LOW_ENERGY' },
      { address: 'invalid', name: 'Bad' },
    ]);
    expect(await listBondedDevices()).toEqual([{ address: 'AA:BB:CC:DD:EE:FF', name: 'Two' }]);
  });
  it('validates exact MAC addresses rather than arbitrary native targets', () => {
    expect(bluetoothAddress('aa:bb:cc:dd:ee:ff')).toBe('AA:BB:CC:DD:EE:FF');
    for (const value of ['', 'AA:BB:CC:DD:EE', 'AA:BB:CC:DD:EE:GG', ' AA:BB:CC:DD:EE:FF']) expect(() => bluetoothAddress(value)).toThrow();
  });
  it('asks the OS for limited discoverability and reports cancellation', async () => {
    await requestBluetoothDiscoverable();
    expect(native.intent).toHaveBeenCalledWith('android.bluetooth.adapter.action.REQUEST_DISCOVERABLE', { extra: { 'android.bluetooth.adapter.extra.DISCOVERABLE_DURATION': 120 } });
    native.intent.mockResolvedValue({ resultCode: 0 }); await expect(requestBluetoothDiscoverable()).rejects.toThrow('cancelled');
  });
  it('opens pairing settings without silent programmatic bonding', async () => {
    await openBluetoothPairingSettings(); expect(native.intent).toHaveBeenCalledWith('android.settings.BLUETOOTH_SETTINGS');
  });
  it('does not open the enable prompt for an already enabled adapter', async () => {
    await requestBluetoothEnable(); expect(native.intent).not.toHaveBeenCalled();
  });
});
