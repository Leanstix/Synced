import {describe, expect, it} from 'vitest';
import {bluetoothDeviceRows, bluetoothPickerMessage, selectedBluetoothDevice} from './bluetoothPicker';

const phone = {address: 'AA:BB:CC:DD:EE:01', name: 'Kitchen phone'};

describe('bonded Bluetooth device picker', () => {
  it('keeps an empty list empty and explains the real pairing step', () => {
    expect(bluetoothDeviceRows([])).toEqual([]);
    expect(bluetoothPickerMessage(true, false, 0)).toContain('Android Bluetooth settings');
  });
  it('deduplicates differently cased copies of the same endpoint', () => {
    expect(bluetoothDeviceRows([phone, {...phone, address: phone.address.toLowerCase()}])).toHaveLength(1);
  });
  it('retains same-name phones as separate choices with distinct addresses', () => {
    expect(bluetoothDeviceRows([phone, {...phone, address: 'AA:BB:CC:DD:EE:02'}])).toHaveLength(2);
  });
  it('never offers empty or malformed Bluetooth endpoints', () => {
    expect(bluetoothDeviceRows([{...phone, address: ''}, {...phone, address: '192.168.1.3'}, {...phone, address: 'AA:BB:CC:DD:EE:GG'}])).toEqual([]);
  });
  it('gives an unnamed real device a readable label', () => {
    expect(bluetoothDeviceRows([{...phone, name: '\n'}])[0]).toEqual({...phone, name: 'Unnamed Bluetooth device'});
  });
  it('does not mutate or reorder native device results', () => {
    const original = [{...phone, name: 'Z'}, {...phone, address: 'AA:BB:CC:DD:EE:02', name: 'A'}];
    expect(bluetoothDeviceRows(original)[0].name).toBe('A');
    expect(original[0].name).toBe('Z');
  });
  it('drops a stale selection after a device is unpaired', () => {
    expect(selectedBluetoothDevice([], phone.address)).toBeNull();
    expect(selectedBluetoothDevice([phone], 'AA:BB:CC:DD:EE:02')).toBeNull();
  });
  it('matches a valid normalized selection', () => {
    expect(selectedBluetoothDevice([phone], ` ${phone.address.toLowerCase()} `)).toEqual(phone);
  });
  it('does not report paired phones as connected or approved', () => {
    expect(bluetoothPickerMessage(true, false, 1)).toContain('does not approve');
  });
  it('prioritizes unavailable state and then refresh progress over stale results', () => {
    expect(bluetoothPickerMessage(false, true, 2)).toContain('unavailable');
    expect(bluetoothPickerMessage(true, true, 2)).toContain('Checking');
  });
});
