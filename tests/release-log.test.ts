import { describe, expect, it } from 'vitest';
import { redactReleaseLog } from '../scripts/log-policy.mts';

describe('release diagnostic redaction', () => {
  it('redacts invitation URIs without needing to decode their secrets', () => {
    expect(redactReleaseLog('failure synced://abc_DEF-123 next')).toBe('failure [REDACTED INVITATION] next');
  });
  it('redacts case-insensitive JSON credentials and escaped typed text', () => {
    const result = redactReleaseLog('{"secret":"private","accessToken":"access","typedText":"hello\\"world","status":"closed"}');
    expect(result).not.toContain('private'); expect(result).not.toContain('access"'); expect(result).not.toContain('hello');
    expect(result).toContain('"status":"closed"');
  });
  it('redacts authorization and assignment credentials', () => {
    expect(redactReleaseLog('Authorization: Bearer abc123\npassword=hunter2, token=private')).not.toMatch(/abc123|hunter2|private/);
  });
  it('removes complete and truncated private key blocks', () => {
    for (const tail of ['-----END PRIVATE KEY-----', '']) {
      const input = ['-----BEGIN', 'PRIVATE KEY-----\nsensitive\n', tail].join(' ');
      expect(redactReleaseLog(input)).not.toContain('sensitive');
    }
  });
  it('redacts local peer IP and Bluetooth addresses', () => {
    expect(redactReleaseLog('10.1.2.3 192.168.43.1 172.16.0.2 172.31.255.1 A0:B1:C2:D3:E4:F5')).not.toMatch(/10\.1|192\.168|172\.16|172\.31|A0:B1/);
  });
  it('preserves useful crash classification and timestamps', () => {
    const line = '10-29 09:34:56 FATAL EXCEPTION: main java.lang.IllegalStateException';
    expect(redactReleaseLog(line)).toBe(line);
  });
  it('is idempotent for repeatedly processed diagnostics', () => {
    const once = redactReleaseLog('secret=abc synced://private 192.168.1.2');
    expect(redactReleaseLog(once)).toBe(once);
  });
});

describe('Bluetooth invitation diagnostic redaction',()=>{
 it.each([
  'synced-bt://PRIVATE_SESSION',
  'SYNCED-BT://PRIVATE_SESSION',
  'request failed: synced-bt://PRIVATE_SESSION',
  '<node text="synced-bt://PRIVATE_SESSION"/>',
  JSON.stringify({invitation:'synced-bt://PRIVATE_SESSION'}),
 ])('redacts Bluetooth credentials in diagnostic format %#',input=>{
  const output=redactReleaseLog(input);
  expect(output).toContain('[REDACTED INVITATION]');expect(output).not.toContain('PRIVATE_SESSION');
 });
 it('redacts mixed Bluetooth and Wi-Fi invitations independently',()=>{
  expect(redactReleaseLog('synced-bt://BT_SECRET synced://LAN_SECRET')).toBe('[REDACTED INVITATION] [REDACTED INVITATION]');
 });
 it('preserves public Bluetooth status text',()=>expect(redactReleaseLog('Bluetooth controls connected')).toBe('Bluetooth controls connected'));
});
