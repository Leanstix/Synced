import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { base64 } from '../src/core/protocol';
const mock = vi.hoisted(() => ({ getUserMedia: vi.fn(), peers: [] as MockPeer[] }));
interface MockPeer {
  listeners: Record<string, (event?: unknown) => void>; connectionState: string; remoteDescription: unknown;
  addTrack: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; createOffer: ReturnType<typeof vi.fn>;
  createAnswer: ReturnType<typeof vi.fn>; setLocalDescription: ReturnType<typeof vi.fn>;
  setRemoteDescription: ReturnType<typeof vi.fn>; addIceCandidate: ReturnType<typeof vi.fn>;
}
vi.mock('react-native', () => ({ Platform: { OS: 'android', Version: 35 }, PermissionsAndroid: {} }));
vi.mock('expo-intent-launcher', () => ({}));
vi.mock('expo-crypto', () => ({ getRandomBytes: (length: number) => new Uint8Array(length).fill(8) }));
vi.mock('@livekit/react-native-webrtc', () => ({
  mediaDevices: { getUserMedia: mock.getUserMedia }, MediaStream: class {},
  RTCIceCandidate: class { constructor(value: unknown) { Object.assign(this, value); } },
  RTCSessionDescription: class { constructor(value: unknown) { Object.assign(this, value); } },
  RTCPeerConnection: class {
    listeners: MockPeer['listeners'] = {}; connectionState = 'new'; remoteDescription: unknown = null;
    addTrack = vi.fn(); close = vi.fn(); createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'offer' }));
    createAnswer = vi.fn(async () => ({ type: 'answer', sdp: 'answer' })); setLocalDescription = vi.fn(async () => undefined);
    setRemoteDescription = vi.fn(async (value: unknown) => { this.remoteDescription = value; }); addIceCandidate = vi.fn(async () => undefined);
    constructor() { mock.peers.push(this); }
    addEventListener(name: string, listener: MockPeer['listeners'][string]) { this.listeners[name] = listener; }
  },
}));
import { VoiceSession } from '../src/core/calls';
const callId = base64(new Uint8Array(32).fill(3));
const otherId = base64(new Uint8Array(32).fill(4));
const deferred = <T>() => { let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
function stream() {
  const track = { kind: 'audio', enabled: true, stop: vi.fn(), addEventListener: vi.fn() };
  return { track, getAudioTracks: () => [track], getVideoTracks: () => [], getTracks: () => [track], release: vi.fn() };
}
function setup() {
  const callbacks = { send: vi.fn(), onState: vi.fn(), onError: vi.fn(), requestMicrophonePermission: vi.fn(async () => true), canCall: vi.fn(() => true) };
  return { callbacks, voice: new VoiceSession(callbacks) };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); mock.peers.length = 0; mock.getUserMedia.mockResolvedValue(stream()); });
afterEach(() => vi.useRealTimers());

describe('intercom consent', () => {
  it('sends outgoing invitation without opening the microphone or OS dialog', async () => {
    const { voice, callbacks } = setup(); await voice.requestCall();
    expect(callbacks.send).toHaveBeenCalledWith({ type: 'invite', callId: expect.any(String) });
    expect(callbacks.requestMicrophonePermission).not.toHaveBeenCalled(); expect(mock.getUserMedia).not.toHaveBeenCalled(); voice.endCall();
  });
  it('shows incoming invitation without opening microphone until accepted', async () => {
    const { voice, callbacks } = setup(); await voice.handleSignal({ type: 'invite', callId });
    expect(callbacks.onState).toHaveBeenLastCalledWith({ phase: 'incoming', muted: false });
    expect(mock.getUserMedia).not.toHaveBeenCalled(); await voice.acceptCall();
    expect(callbacks.requestMicrophonePermission).toHaveBeenCalledOnce();
    expect(mock.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    expect(callbacks.send).toHaveBeenLastCalledWith({ type: 'accept', callId }); voice.endCall();
  });
  it('starts caller microphone only after the matching remote acceptance', async () => {
    const { voice, callbacks } = setup(); await voice.requestCall();
    const id = callbacks.send.mock.calls[0]![0].callId;
    await voice.handleSignal({ type: 'accept', callId: otherId }); expect(mock.getUserMedia).not.toHaveBeenCalled();
    await voice.handleSignal({ type: 'accept', callId: id });
    expect(callbacks.send).toHaveBeenLastCalledWith({ type: 'offer', callId: id, sdp: 'offer' }); voice.endCall();
  });
  it('rejects incoming calls without opening the microphone', async () => {
    const { voice, callbacks } = setup(); await voice.handleSignal({ type: 'invite', callId }); voice.rejectCall();
    expect(callbacks.send).toHaveBeenLastCalledWith({ type: 'reject', callId });
    expect(mock.getUserMedia).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('fails closed if microphone permission is refused', async () => {
    const { voice, callbacks } = setup(); callbacks.requestMicrophonePermission.mockResolvedValue(false);
    await voice.handleSignal({ type: 'invite', callId }); await expect(voice.acceptCall()).rejects.toThrow('declined');
    expect(mock.getUserMedia).not.toHaveBeenCalled(); expect(callbacks.send).not.toHaveBeenCalledWith({ type: 'accept', callId });
    expect(callbacks.onState).toHaveBeenLastCalledWith({ phase: 'idle', muted: false }); expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects Bluetooth or unapproved sessions before any invitation or capture', async () => {
    const { voice, callbacks } = setup(); callbacks.canCall.mockReturnValue(false);
    await expect(voice.requestCall()).rejects.toThrow('Wi-Fi'); await voice.handleSignal({ type: 'invite', callId });
    expect(callbacks.send).not.toHaveBeenCalled(); expect(mock.getUserMedia).not.toHaveBeenCalled();
  });
});

describe('intercom asynchronous capture lifetime', () => {
  it('does not capture after local end while the OS permission prompt is open', async () => {
    const { voice, callbacks } = setup(); const permission = deferred<boolean>(); callbacks.requestMicrophonePermission.mockReturnValue(permission.promise);
    await voice.handleSignal({ type: 'invite', callId }); const pending = voice.acceptCall(); voice.endCall(); permission.resolve(true); await pending;
    expect(mock.getUserMedia).not.toHaveBeenCalled(); expect(mock.peers).toHaveLength(0);
  });
  it('does not capture after remote end while caller permission is pending', async () => {
    const { voice, callbacks } = setup(); const permission = deferred<boolean>(); callbacks.requestMicrophonePermission.mockReturnValue(permission.promise);
    await voice.requestCall(); const id = callbacks.send.mock.calls[0]![0].callId;
    const pending = voice.handleSignal({ type: 'accept', callId: id }); await flush();
    await voice.handleSignal({ type: 'end', callId: id }); permission.resolve(true); await pending;
    expect(mock.getUserMedia).not.toHaveBeenCalled(); expect(callbacks.onState).toHaveBeenLastCalledWith({ phase: 'idle', muted: false });
  });
  it('releases microphone streams granted after disconnect exactly once', async () => {
    const { voice, callbacks } = setup(); const capture = deferred<ReturnType<typeof stream>>(); mock.getUserMedia.mockReturnValue(capture.promise);
    await voice.handleSignal({ type: 'invite', callId }); const pending = voice.acceptCall(); await flush(); voice.endCall();
    const late = stream(); capture.resolve(late); await pending;
    expect(late.track.stop).toHaveBeenCalledOnce(); expect(late.release).toHaveBeenCalledOnce();
    expect(callbacks.send).not.toHaveBeenCalledWith({ type: 'accept', callId });
  });
  it('releases streams when session permission disappears during getUserMedia', async () => {
    const { voice, callbacks } = setup(); const capture = deferred<ReturnType<typeof stream>>(); mock.getUserMedia.mockReturnValue(capture.promise);
    await voice.handleSignal({ type: 'invite', callId }); const pending = voice.acceptCall(); await flush(); callbacks.canCall.mockReturnValue(false);
    const late = stream(); capture.resolve(late); await expect(pending).rejects.toThrow('no longer'); expect(late.release).toHaveBeenCalledOnce();
    expect(mock.peers).toHaveLength(0);
  });
  it('releases both streams and peer on hangup and ignores late peer callbacks', async () => {
    const { voice, callbacks } = setup(); const local = stream(); const remote = stream(); mock.getUserMedia.mockResolvedValue(local);
    await voice.handleSignal({ type: 'invite', callId }); await voice.acceptCall(); const peer = mock.peers[0]!;
    peer.listeners.track!({ track: remote.track, streams: [remote] }); voice.endCall();
    peer.connectionState = 'connected'; peer.listeners.connectionstatechange!();
    expect(local.release).toHaveBeenCalledOnce(); expect(remote.release).toHaveBeenCalledOnce(); expect(peer.close).toHaveBeenCalledOnce();
    expect(callbacks.onState).toHaveBeenLastCalledWith({ phase: 'idle', muted: false }); expect(vi.getTimerCount()).toBe(0);
  });
  it('allows a fresh invitation while an old permission promise is unresolved', async () => {
    const { voice, callbacks } = setup(); const permission = deferred<boolean>(); callbacks.requestMicrophonePermission.mockReturnValue(permission.promise);
    await voice.requestCall(); const id = callbacks.send.mock.calls[0]![0].callId;
    const old = voice.handleSignal({ type: 'accept', callId: id }); await flush(); voice.endCall();
    await voice.handleSignal({ type: 'invite', callId });
    expect(callbacks.onState).toHaveBeenLastCalledWith({ phase: 'incoming', muted: false });
    permission.resolve(true); await old; voice.endCall(); expect(mock.getUserMedia).not.toHaveBeenCalled();
  });
  it('stops unexpected video tracks and tracks delivered after hangup', async () => {
    const { voice } = setup(); await voice.handleSignal({ type: 'invite', callId }); await voice.acceptCall();
    const peer = mock.peers[0]!; const video = { kind: 'video', stop: vi.fn() };
    peer.listeners.track!({ track: video, streams: [] }); expect(video.stop).toHaveBeenCalledOnce();
    voice.endCall(); const late = stream(); peer.listeners.track!({ track: late.track, streams: [late] });
    expect(late.track.stop).toHaveBeenCalledOnce();
  });
});

describe('intercom lifecycle and negotiation', () => {
  it('times out unanswered calls with no microphone access', async () => {
    const { voice, callbacks } = setup(); await voice.requestCall(); vi.advanceTimersByTime(30000);
    expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('not answered')); expect(mock.getUserMedia).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects colliding invitations as busy without replacing the original call', async () => {
    const { voice, callbacks } = setup(); await voice.requestCall(); await voice.handleSignal({ type: 'invite', callId: otherId });
    expect(callbacks.send).toHaveBeenLastCalledWith({ type: 'reject', callId: otherId });
    expect(callbacks.onState).toHaveBeenLastCalledWith({ phase: 'outgoing', muted: false }); voice.endCall();
  });
  it('does not extend the incoming deadline with duplicate invitations', async () => {
    const { voice, callbacks } = setup(); await voice.handleSignal({ type: 'invite', callId }); vi.advanceTimersByTime(20000);
    await voice.handleSignal({ type: 'invite', callId }); vi.advanceTimersByTime(10000);
    expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('expired')); expect(vi.getTimerCount()).toBe(0);
  });
  it('applies mute to acquired audio tracks and resets mute on hangup', async () => {
    const { voice, callbacks } = setup(); const local = stream(); mock.getUserMedia.mockResolvedValue(local);
    await voice.handleSignal({ type: 'invite', callId }); voice.setMuted(true); await voice.acceptCall(); expect(local.track.enabled).toBe(false);
    voice.setMuted(false); expect(local.track.enabled).toBe(true); voice.endCall(); expect(callbacks.onState).toHaveBeenLastCalledWith({ phase: 'idle', muted: false });
  });
  it('requires acceptance before processing SDP and never captures from an offer alone', async () => {
    const { voice } = setup(); await voice.handleSignal({ type: 'invite', callId });
    await expect(voice.handleSignal({ type: 'offer', callId, sdp: 'offer' })).rejects.toThrow('Accept'); expect(mock.getUserMedia).not.toHaveBeenCalled();
  });
  it('answers offers using local-only ICE after acceptance and flushes queued candidates', async () => {
    const { voice, callbacks } = setup(); await voice.handleSignal({ type: 'invite', callId }); await voice.acceptCall();
    await voice.handleSignal({ type: 'candidate', callId, candidate: { candidate: 'one' } });
    await voice.handleSignal({ type: 'offer', callId, sdp: 'offer' });
    expect(mock.peers[0]!.addIceCandidate).toHaveBeenCalledOnce(); expect(callbacks.send).toHaveBeenLastCalledWith({ type: 'answer', callId, sdp: 'answer' }); voice.endCall();
  });
  it('bounds candidates before SDP and cleans up on overflow', async () => {
    const { voice } = setup(); await voice.handleSignal({ type: 'invite', callId }); await voice.acceptCall();
    for (let i = 0; i < 128; i++) await voice.handleSignal({ type: 'candidate', callId, candidate: { candidate: `candidate:${i}` } });
    await expect(voice.handleSignal({ type: 'candidate', callId, candidate: { candidate: 'overflow' } })).rejects.toThrow('Too many');
    expect(mock.peers[0]!.close).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('ends an active call on prolonged ICE disconnect', async () => {
    const { voice, callbacks } = setup(); await voice.handleSignal({ type: 'invite', callId }); await voice.acceptCall();
    const peer = mock.peers[0]!; peer.connectionState = 'connected'; peer.listeners.connectionstatechange!();
    expect(callbacks.onState).toHaveBeenLastCalledWith({ phase: 'active', muted: false });
    peer.connectionState = 'disconnected'; peer.listeners.connectionstatechange!(); vi.advanceTimersByTime(10000);
    expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('lost')); expect(peer.close).toHaveBeenCalledOnce();
  });
});

describe('intercom observer cancellation and signaling limits', () => {
  it('does not send an invitation after an outgoing observer ends the call', async () => {
    const { voice, callbacks } = setup();
    callbacks.onState.mockImplementation(state => { if (state.phase === 'outgoing') voice.endCall(); });
    await voice.requestCall();
    expect(callbacks.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'invite' }));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not open the OS permission prompt after incoming acceptance is cancelled by an observer', async () => {
    const { voice, callbacks } = setup(); await voice.handleSignal({ type: 'invite', callId });
    callbacks.onState.mockImplementation(state => { if (state.phase === 'connecting') voice.endCall(); });
    await voice.acceptCall();
    expect(callbacks.requestMicrophonePermission).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not open the OS permission prompt after caller acceptance is cancelled by an observer', async () => {
    const { voice, callbacks } = setup(); await voice.requestCall(); const id = callbacks.send.mock.calls[0]![0].callId;
    callbacks.onState.mockImplementation(state => { if (state.phase === 'connecting') voice.endCall(); });
    await voice.handleSignal({ type: 'accept', callId: id });
    expect(callbacks.requestMicrophonePermission).not.toHaveBeenCalled(); expect(mock.getUserMedia).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rechecks foreground permission before opening the OS dialog', async () => {
    const { voice, callbacks } = setup(); await voice.handleSignal({ type: 'invite', callId });
    callbacks.onState.mockImplementation(state => { if (state.phase === 'connecting') callbacks.canCall.mockReturnValue(false); });
    await expect(voice.acceptCall()).rejects.toThrow('no longer');
    expect(callbacks.requestMicrophonePermission).not.toHaveBeenCalled(); expect(mock.getUserMedia).not.toHaveBeenCalled();
  });
  it('bounds signals waiting behind a pending OS permission promise', async () => {
    const { voice, callbacks } = setup(); const permission = deferred<boolean>(); callbacks.requestMicrophonePermission.mockReturnValue(permission.promise);
    await voice.requestCall(); const id = callbacks.send.mock.calls[0]![0].callId;
    const pending = voice.handleSignal({ type: 'accept', callId: id }); await flush();
    const queued = Array.from({ length: 127 }, () => voice.handleSignal({ type: 'invite', callId: otherId }));
    await expect(voice.handleSignal({ type: 'invite', callId: otherId })).rejects.toThrow('Too many queued');
    expect(callbacks.onState).toHaveBeenLastCalledWith({ phase: 'idle', muted: false });
    permission.resolve(true); await Promise.all([pending, ...queued]); expect(mock.getUserMedia).not.toHaveBeenCalled();
    await voice.handleSignal({ type: 'invite', callId }); voice.endCall(); expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds retained SDP bytes while signaling waits for microphone permission', async () => {
    const { voice, callbacks } = setup(); const permission = deferred<boolean>(); callbacks.requestMicrophonePermission.mockReturnValue(permission.promise);
    await voice.requestCall(); const id = callbacks.send.mock.calls[0]![0].callId;
    const pending = voice.handleSignal({ type: 'accept', callId: id }); await flush();
    const first = voice.handleSignal({ type: 'answer', callId: id, sdp: 'a'.repeat(128000) });
    const second = voice.handleSignal({ type: 'answer', callId: id, sdp: 'b'.repeat(128000) });
    await expect(voice.handleSignal({ type: 'answer', callId: id, sdp: 'c'.repeat(128000) })).rejects.toThrow('Too many queued');
    permission.resolve(true); await Promise.all([pending, first, second]); expect(mock.getUserMedia).not.toHaveBeenCalled();
  });
  it('lets remote hangup preempt a full signaling queue and resets its budget', async () => {
    const { voice, callbacks } = setup(); const permission = deferred<boolean>(); callbacks.requestMicrophonePermission.mockReturnValue(permission.promise);
    await voice.requestCall(); const id = callbacks.send.mock.calls[0]![0].callId;
    const pending = voice.handleSignal({ type: 'accept', callId: id }); await flush();
    const queued = Array.from({ length: 127 }, () => voice.handleSignal({ type: 'invite', callId: otherId }));
    await voice.handleSignal({ type: 'end', callId: id });
    await voice.handleSignal({ type: 'invite', callId });
    permission.resolve(true); await Promise.all([pending, ...queued]);
    expect(callbacks.onState).toHaveBeenLastCalledWith({ phase: 'incoming', muted: false }); voice.endCall();
  });
});

describe('microphone permission capture boundary',()=>{
 it('marks only a pending owner permission decision as safe to await without capture',async()=>{
  const {voice,callbacks}=setup(),permission=deferred<boolean>();callbacks.requestMicrophonePermission.mockReturnValue(permission.promise);
  await voice.handleSignal({type:'invite',callId});const pending=voice.acceptCall();
  expect(voice.awaitingMicrophonePermission).toBe(true);expect(mock.getUserMedia).not.toHaveBeenCalled();
  permission.resolve(true);await pending;expect(voice.awaitingMicrophonePermission).toBe(false);voice.endCall();
 });
 it('clears the permission marker on refusal and never acquires audio',async()=>{
  const {voice,callbacks}=setup();callbacks.requestMicrophonePermission.mockResolvedValue(false);
  await voice.handleSignal({type:'invite',callId});await expect(voice.acceptCall()).rejects.toThrow('declined');
  expect(voice.awaitingMicrophonePermission).toBe(false);expect(mock.getUserMedia).not.toHaveBeenCalled();
 });
 it('clears the marker immediately on hangup even if Android never resolves its prompt',async()=>{
  const {voice,callbacks}=setup(),permission=deferred<boolean>();callbacks.requestMicrophonePermission.mockReturnValue(permission.promise);
  await voice.handleSignal({type:'invite',callId});const pending=voice.acceptCall();voice.endCall();
  expect(voice.awaitingMicrophonePermission).toBe(false);permission.resolve(true);await pending;expect(mock.getUserMedia).not.toHaveBeenCalled();
 });
 it('does not let an old permission result clear a newer call permission marker',async()=>{
  const {voice,callbacks}=setup(),older=deferred<boolean>(),newer=deferred<boolean>();
  callbacks.requestMicrophonePermission.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  await voice.handleSignal({type:'invite',callId});const old=voice.acceptCall();voice.endCall();
  await voice.handleSignal({type:'invite',callId:otherId});const fresh=voice.acceptCall();older.resolve(false);
  await expect(old).resolves.toBeUndefined();expect(voice.awaitingMicrophonePermission).toBe(true);expect(mock.getUserMedia).not.toHaveBeenCalled();
  newer.resolve(true);await fresh;expect(voice.awaitingMicrophonePermission).toBe(false);expect(mock.getUserMedia).toHaveBeenCalledOnce();voice.endCall();
 });
 it('does not exempt an in-flight native microphone acquisition from background teardown',async()=>{
  const {voice}=setup(),capture=deferred<ReturnType<typeof stream>>();mock.getUserMedia.mockReturnValue(capture.promise);
  await voice.handleSignal({type:'invite',callId});const pending=voice.acceptCall();await flush();
  expect(voice.awaitingMicrophonePermission).toBe(false);voice.endCall();const late=stream();capture.resolve(late);await pending;expect(late.release).toHaveBeenCalledOnce();
 });
 it('ignores a rejected old OS permission request after hangup',async()=>{
  const {voice,callbacks}=setup();let reject!: (error:Error)=>void;
  callbacks.requestMicrophonePermission.mockReturnValue(new Promise<boolean>((_resolve,no)=>{reject=no}));
  await voice.handleSignal({type:'invite',callId});const pending=voice.acceptCall();voice.endCall();reject(new Error('stale Android prompt'));
  await expect(pending).resolves.toBeUndefined();expect(callbacks.onError).not.toHaveBeenCalled();expect(mock.getUserMedia).not.toHaveBeenCalled();
 });
});
