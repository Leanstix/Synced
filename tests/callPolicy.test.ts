import { beforeEach, describe, expect, it, vi } from 'vitest';
import { base64 } from '../src/core/protocol';
const native = vi.hoisted(() => ({
  platform: { OS: 'android', Version: 35 }, request: vi.fn(async (): Promise<string> => 'granted'), intent: vi.fn(async () => undefined),
}));
vi.mock('react-native', () => ({ Platform: native.platform, PermissionsAndroid: {
  PERMISSIONS: { RECORD_AUDIO: 'microphone' }, RESULTS: { GRANTED: 'granted' }, request: native.request,
} }));
vi.mock('expo-intent-launcher', () => ({ startActivityAsync: native.intent }));
vi.mock('expo-crypto', () => ({}));
vi.mock('@livekit/react-native-webrtc', () => ({}));
import { dialerUri, openDialer, requestMicrophonePermission, validateCallSignal } from '../src/core/calls';
const callId = base64(new Uint8Array(32).fill(3));
beforeEach(() => { vi.clearAllMocks(); native.platform.OS = 'android'; native.platform.Version = 35; native.request.mockResolvedValue('granted'); });

describe('safe dialer policy', () => {
  it('normalizes common formatting while preserving a leading plus', () => {
    expect(dialerUri('+1 (234) 555-0199')).toBe('tel:+12345550199');
    expect(dialerUri('112')).toBe('tel:112');
  });
  it('blocks USSD, MMI and extension characters', () => {
    for (const number of ['*#06#', '*123#', '123;456', '123,456', '123p4', '123w4']) expect(() => dialerUri(number)).toThrow();
  });
  it('blocks scheme, query and control character injection', () => {
    for (const number of ['tel:123', '123?x=4', '123\n456', '123%23456', '+12+34']) expect(() => dialerUri(number)).toThrow();
  });
  it('requires a bounded useful digit count', () => {
    for (const number of ['', ' ', '+', '1', '1'.repeat(21), ' '.repeat(65)]) expect(() => dialerUri(number)).toThrow();
  });
  it('always opens ACTION_DIAL with no direct call or phone permission', async () => {
    await openDialer('555-1234');
    expect(native.intent).toHaveBeenCalledWith('android.intent.action.DIAL', { data: 'tel:5551234' });
    expect(native.request).not.toHaveBeenCalled();
  });
  it('rejects unsupported platforms and invalid numbers before opening other apps', async () => {
    await expect(openDialer('bad')).rejects.toThrow(); native.platform.OS = 'ios';
    await expect(openDialer('5551234')).rejects.toThrow('Android'); expect(native.intent).not.toHaveBeenCalled();
  });
});

describe('microphone runtime permission', () => {
  it('requests only RECORD_AUDIO on modern Android', async () => {
    expect(await requestMicrophonePermission()).toBe(true); expect(native.request).toHaveBeenCalledWith('microphone');
  });
  it('reports refusal without treating it as consent', async () => {
    native.request.mockResolvedValue('denied'); expect(await requestMicrophonePermission()).toBe(false);
  });
  it('reports permanent refusal without retrying the system prompt', async () => {
    native.request.mockResolvedValue('never_ask_again'); expect(await requestMicrophonePermission()).toBe(false); expect(native.request).toHaveBeenCalledOnce();
  });
  it('lets native media acquisition handle non Android permission dialogs', async () => {
    native.platform.OS = 'ios'; expect(await requestMicrophonePermission()).toBe(true); expect(native.request).not.toHaveBeenCalled();
  });
  it('uses install-time microphone permission before Android 6', async () => {
    native.platform.Version = 22; expect(await requestMicrophonePermission()).toBe(true); expect(native.request).not.toHaveBeenCalled();
  });
});

describe('intercom signal validation', () => {
  it('requires fresh strong call IDs rather than numeric caller identifiers', () => {
    for (const value of [null, {}, { type: 'invite', callId: '123' }, { type: 'invite', callId: 'A'.repeat(44) }]) expect(() => validateCallSignal(value)).toThrow();
  });
  it('bounds session descriptions', () => {
    for (const sdp of ['', 'x'.repeat(128001), 3]) expect(() => validateCallSignal({ type: 'offer', callId, sdp })).toThrow();
    expect(validateCallSignal({ type: 'answer', callId, sdp: 'sdp' })).toEqual({ type: 'answer', callId, sdp: 'sdp' });
  });
  it('bounds all ICE candidate fields', () => {
    for (const candidate of [{ candidate: 'x'.repeat(4097) }, { candidate: 'x', sdpMid: 'x'.repeat(257) }, { candidate: 'x', sdpMLineIndex: -1 }, { candidate: 'x', sdpMLineIndex: 65 }, { candidate: 'x', sdpMLineIndex: 1.5 }]) {
      expect(() => validateCallSignal({ type: 'candidate', callId, candidate })).toThrow();
    }
  });
  it('accepts null optional ICE fields and empty end-of-candidates', () => {
    const signal = { type: 'candidate', callId, candidate: { candidate: '', sdpMid: null, sdpMLineIndex: null } };
    expect(validateCallSignal(signal)).toEqual(signal);
  });
  it('rejects unknown remote operations such as carrier answering', () => {
    for (const type of ['answerCarrier', 'dial', 'microphone', 'screen', '']) expect(() => validateCallSignal({ type, callId })).toThrow();
  });
});
