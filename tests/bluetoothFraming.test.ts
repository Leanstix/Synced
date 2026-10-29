import { describe, expect, it } from 'vitest';
import { Buffer } from 'buffer';
import { BluetoothFrameDecoder, bluetoothRecords, MAX_BLUETOOTH_RECORD } from '../src/core/bluetoothFraming';
import { encodeFrame } from '../src/core/protocol';

describe('Bluetooth records', () => {
  it('round trips large encrypted envelopes through bounded chunks', () => {
    const value = { ciphertext: 'x'.repeat(30000) };
    const records = bluetoothRecords(encodeFrame(value));
    expect(records.every(record => record.length <= MAX_BLUETOOTH_RECORD + 1)).toBe(true);
    const decoder = new BluetoothFrameDecoder();
    expect(records.flatMap(record => decoder.push(record))).toEqual([value]);
  });
  it('handles split base64 and multiple records in one native callback', () => {
    const decoder = new BluetoothFrameDecoder();
    const wire = bluetoothRecords(encodeFrame({ text: 'é日本語' })).join('') + bluetoothRecords(encodeFrame({ n: 2 })).join('');
    expect(decoder.push(wire.slice(0, 3))).toEqual([]);
    expect(decoder.push(wire.slice(3))).toEqual([{ text: 'é日本語' }, { n: 2 }]);
  });
  it('rejects unterminated records before unbounded allocation', () => {
    const decoder = new BluetoothFrameDecoder();
    decoder.push('a'.repeat(MAX_BLUETOOTH_RECORD));
    expect(() => decoder.push('a')).toThrow('limit');
  });
  it('rejects invalid alphabet, padding and noncanonical data', () => {
    for (const record of ['\n', '####\n', 'Zg=\n', 'Zh==\n', 'abcd=\n', 'Zg==\r\n']) {
      expect(() => new BluetoothFrameDecoder().push(record)).toThrow();
    }
  });
  it('rejects oversized records and decoded frame lengths', () => {
    expect(() => new BluetoothFrameDecoder().push('a'.repeat(65537))).toThrow();
    expect(() => new BluetoothFrameDecoder().push(`${Buffer.from([255,255,255,255]).toString('base64')}\n`)).toThrow();
    expect(() => bluetoothRecords(new Uint8Array())).toThrow();
  });
});
