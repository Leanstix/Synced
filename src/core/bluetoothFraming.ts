import { Buffer } from 'buffer';
import { FrameDecoder, MAX_FRAME_BYTES } from './protocol';

export const BLUETOOTH_CHUNK_BYTES = 1024;
export const MAX_BLUETOOTH_RECORD = Math.ceil(BLUETOOTH_CHUNK_BYTES / 3) * 4;

/** ASCII records keep RFCOMM string decoding separate from encrypted frame bytes. */
export function bluetoothRecords(frame: Uint8Array): string[] {
  if (!frame.length || frame.length > MAX_FRAME_BYTES + 4) throw new Error('Invalid Bluetooth frame size.');
  const records: string[] = [];
  for (let offset = 0; offset < frame.length; offset += BLUETOOTH_CHUNK_BYTES) {
    records.push(`${Buffer.from(frame.subarray(offset, offset + BLUETOOTH_CHUNK_BYTES)).toString('base64')}\n`);
  }
  return records;
}

/** Native DELIMITER is empty: incomplete hostile records are bounded here. */
export class BluetoothFrameDecoder {
  private pending = '';
  private readonly frames = new FrameDecoder();

  push(chunk: string): unknown[] {
    if (typeof chunk !== 'string' || chunk.length > 65536) throw new Error('Invalid Bluetooth read.');
    const output: unknown[] = [];
    let offset = 0;
    while (offset < chunk.length) {
      const end = chunk.indexOf('\n', offset);
      const piece = chunk.slice(offset, end < 0 ? undefined : end);
      if (this.pending.length + piece.length > MAX_BLUETOOTH_RECORD) throw new Error('Bluetooth record exceeds limit.');
      this.pending += piece;
      if (end < 0) break;
      const record = this.pending;
      this.pending = '';
      if (!record || record.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(record)) throw new Error('Invalid Bluetooth record.');
      const bytes = Buffer.from(record, 'base64');
      if (bytes.length > BLUETOOTH_CHUNK_BYTES || bytes.toString('base64') !== record) throw new Error('Invalid Bluetooth record encoding.');
      output.push(...this.frames.push(bytes));
      offset = end + 1;
    }
    return output;
  }
}
