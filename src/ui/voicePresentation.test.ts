import {describe, expect, it} from 'vitest';
import {voicePresentation} from './voicePresentation';

const idle = {connected: true, transport: 'wifi' as const, supported: true, voice: {phase: 'idle' as const, muted: false}};

describe('separate voice consent and status', () => {
  it('explains microphone use before allowing a request', () => {
    expect(voicePresentation(idle)).toMatchObject({canRequest: true, canAccept: false, canMute: false});
    expect(voicePresentation(idle).detail).toContain('microphone');
  });
  it('requires separate acceptance for an incoming request', () => {
    const incoming = voicePresentation({...idle, voice: {phase: 'incoming', muted: false}});
    expect(incoming).toMatchObject({canRequest: false, canAccept: true, canMute: false, canEnd: true});
    expect(incoming.detail).toContain('Accepting uses your microphone');
  });
  it('does not describe ringing as an active voice link', () => {
    const outgoing = voicePresentation({...idle, voice: {phase: 'outgoing', muted: false}});
    expect(outgoing.title).toContain('Waiting');
    expect(outgoing.canMute).toBe(false);
  });
  it('allows ending while the media transport connects', () => {
    expect(voicePresentation({...idle, voice: {phase: 'connecting', muted: false}})).toMatchObject({canEnd: true, canRequest: false, canAccept: false});
  });
  it('accurately distinguishes muted and live microphone states', () => {
    expect(voicePresentation({...idle, voice: {phase: 'active', muted: true}}).title).toContain('muted');
    expect(voicePresentation({...idle, voice: {phase: 'active', muted: false}}).detail).toContain('can hear you');
  });
  it('does not offer voice over a Bluetooth controls-only connection', () => {
    expect(voicePresentation({...idle, transport: 'bluetooth'})).toMatchObject({available: false, canRequest: false, canAccept: false, canMute: false});
  });
  it('does not leak a stale active voice state into a disconnected screen', () => {
    expect(voicePresentation({...idle, connected: false, voice: {phase: 'active', muted: false}})).toMatchObject({canEnd: false, canMute: false, available: false});
  });
  it('respects unsupported native media builds', () => expect(voicePresentation({...idle, supported: false}).available).toBe(false));
  it('makes clear that declining voice preserves the phone connection', () => {
    expect(voicePresentation({...idle, voice: {phase: 'incoming', muted: false}}).detail).toContain('keep the phone connection');
  });
});
