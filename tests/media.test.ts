import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  getDisplayMedia: vi.fn(), peers: [] as MockPeer[],
  dimensionListener: null as null | ((event: { screen: { width: number; height: number } }) => void),
}));
interface MockPeer {
  listeners: Record<string, (event?: unknown) => void>;
  connectionState: string;
  remoteDescription: unknown;
  addTrack: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  createOffer: ReturnType<typeof vi.fn>;
  createAnswer: ReturnType<typeof vi.fn>;
  setLocalDescription: ReturnType<typeof vi.fn>;
  setRemoteDescription: ReturnType<typeof vi.fn>;
  addIceCandidate: ReturnType<typeof vi.fn>;
}
vi.mock('react-native', () => ({
  Dimensions: {
    get: () => ({ width: 400, height: 800 }),
    addEventListener: (_: string, listener: typeof mock.dimensionListener) => {
      mock.dimensionListener = listener;
      return { remove: vi.fn() };
    },
  },
  PixelRatio: { get: () => 2 },
}));
vi.mock('@livekit/react-native-webrtc', () => ({
  mediaDevices: { getDisplayMedia: mock.getDisplayMedia },
  MediaStream: class {},
  RTCIceCandidate: class { constructor(value: unknown) { Object.assign(this, value); } },
  RTCSessionDescription: class { constructor(value: unknown) { Object.assign(this, value); } },
  RTCPeerConnection: class {
    listeners: MockPeer['listeners'] = {};
    connectionState = 'new';
    remoteDescription: unknown = null;
    addTrack = vi.fn();
    close = vi.fn();
    createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'offer-sdp' }));
    createAnswer = vi.fn(async () => ({ type: 'answer', sdp: 'answer-sdp' }));
    setLocalDescription = vi.fn(async () => undefined);
    setRemoteDescription = vi.fn(async (value: unknown) => { this.remoteDescription = value; });
    addIceCandidate = vi.fn(async () => undefined);
    constructor() { mock.peers.push(this); }
    addEventListener(name: string, listener: MockPeer['listeners'][string]) { this.listeners[name] = listener; }
  },
}));

import { MediaSession } from '../src/core/media';

function stream() {
  const track = { kind: 'video', stop: vi.fn(), addEventListener: vi.fn() };
  return { track, getAudioTracks: () => [], getVideoTracks: () => [track], getTracks: () => [track], release: vi.fn(), toURL: () => 'real-stream' };
}
function setup() {
  const callbacks = { send: vi.fn(), onRemoteStream: vi.fn(), onSharingChanged: vi.fn(), onError: vi.fn() };
  return { callbacks, media: new MediaSession(callbacks) };
}
beforeEach(() => { vi.clearAllMocks(); mock.peers.length = 0; mock.dimensionListener = null; });

describe('screen capture lifetime', () => {
  it('releases capture granted after disconnect without sending an offer', async () => {
    let resolve!: (value: ReturnType<typeof stream>) => void;
    mock.getDisplayMedia.mockReturnValue(new Promise(value => { resolve = value; }));
    const { media, callbacks } = setup();
    const pending = media.startHost();
    media.stop();
    const capture = stream(); resolve(capture); await pending;
    expect(capture.track.stop).toHaveBeenCalledOnce();
    expect(capture.release).toHaveBeenCalledOnce();
    expect(callbacks.send).not.toHaveBeenCalled();
    expect(mock.peers).toHaveLength(0);
  });

  it('allows a new attempt after the owner cancels consent', async () => {
    const { media, callbacks } = setup();
    mock.getDisplayMedia.mockRejectedValueOnce(new Error('cancelled')).mockResolvedValueOnce(stream());
    await expect(media.startHost()).rejects.toThrow('cancelled');
    await media.startHost();
    expect(callbacks.onSharingChanged).toHaveBeenLastCalledWith(true);
    media.stop();
  });

  it('releases capture and closes peer if negotiation fails', async () => {
    const capture = stream();
    mock.getDisplayMedia.mockImplementation(async () => capture);
    const { media } = setup();
    // Pause just after the permission promise so the peer exists before its offer resolves.
    const pending = media.startHost();
    await Promise.resolve();
    mock.peers[0].setLocalDescription.mockRejectedValueOnce(new Error('negotiation failed'));
    await expect(pending).rejects.toThrow('negotiation failed');
    expect(capture.release).toHaveBeenCalledOnce();
    expect(mock.peers[0].close).toHaveBeenCalledOnce();
  });

  it('stops capture on display rotation instead of using stale touch coordinates', async () => {
    mock.getDisplayMedia.mockResolvedValue(stream());
    const { media, callbacks } = setup();
    await media.startHost();
    mock.dimensionListener?.({ screen: { width: 800, height: 400 } });
    expect(callbacks.onSharingChanged).toHaveBeenLastCalledWith(false);
    expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('orientation changed'));
    expect(mock.peers[0].close).toHaveBeenCalledOnce();
  });

  it('notifies controller when the remote stream is stopped', async () => {
    const { media, callbacks } = setup();
    media.startController();
    await media.handleSignal({ type: 'dimensions', width: 800, height: 1600 });
    await media.handleSignal({ type: 'offer', sdp: 'offer-sdp' });
    const remote = stream();
    mock.peers[0].listeners.track({ track: remote.track, streams: [remote] });
    expect(callbacks.onRemoteStream).toHaveBeenCalledWith('real-stream', 800, 1600);
    media.stop();
    expect(callbacks.onSharingChanged).toHaveBeenCalledWith(false);
    expect(remote.release).toHaveBeenCalledOnce();
  });
});

describe('media signaling boundaries', () => {
  it('rejects an answer on a controller and an offer on a host', async () => {
    const { media } = setup();
    media.startController();
    await expect(media.handleSignal({ type: 'answer', sdp: 'sdp' })).rejects.toThrow('Unexpected');
    mock.getDisplayMedia.mockResolvedValue(stream());
    await media.startHost();
    await expect(media.handleSignal({ type: 'offer', sdp: 'sdp' })).rejects.toThrow('Unexpected');
    media.stop();
  });

  it('bounds candidate buffering before session descriptions arrive', async () => {
    const { media } = setup(); media.startController();
    for (let i = 0; i < 128; i++) await media.handleSignal({ type: 'candidate', candidate: { candidate: `candidate:${i}` } });
    await expect(media.handleSignal({ type: 'candidate', candidate: { candidate: 'overflow' } })).rejects.toThrow('Too many');
    media.stop();
  });

  it('rejects invalid display sizes and oversized session descriptions', async () => {
    const { media } = setup(); media.startController();
    await expect(media.handleSignal({ type: 'dimensions', width: 0, height: 2 })).rejects.toThrow('dimensions');
    await expect(media.handleSignal({ type: 'offer', sdp: 'x'.repeat(128001) })).rejects.toThrow('description');
    media.stop();
  });
});

const flushMedia = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
describe('media signaling generation recovery', () => {
  it.each(['setRemoteDescription', 'createAnswer', 'setLocalDescription', 'addIceCandidate'] as const)('starts a fresh session while stale %s never settles', async operation => {
    const { media, callbacks } = setup(); media.startController();
    await media.handleSignal({ type: 'offer', sdp: 'initial' });
    const old = mock.peers[0];
    old[operation].mockImplementationOnce(() => new Promise(() => {}));
    void media.handleSignal(operation === 'addIceCandidate' ? { type: 'candidate', candidate: { candidate: 'old' } } : { type: 'offer', sdp: 'old' });
    await flushMedia(); expect(old[operation]).toHaveBeenCalled();
    media.stop(); media.startController();
    void media.handleSignal({ type: 'dimensions', width: 800, height: 1600 });
    void media.handleSignal({ type: 'offer', sdp: 'fresh' });
    await flushMedia();
    expect(mock.peers).toHaveLength(2);
    const remote = stream(); mock.peers[1].listeners.track({ track: remote.track, streams: [remote] });
    expect(callbacks.onRemoteStream).toHaveBeenCalledWith('real-stream', 800, 1600);
    expect(callbacks.send).toHaveBeenLastCalledWith({ type: 'answer', sdp: 'answer-sdp' });
    media.stop();
  });
  it('ignores a stale native rejection instead of failing a replacement stream', async () => {
    const { media } = setup(); media.startController();
    await media.handleSignal({ type: 'offer', sdp: 'initial' });
    let rejectOld!: (error: Error) => void;
    mock.peers[0].setRemoteDescription.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
    const pending = media.handleSignal({ type: 'offer', sdp: 'old' }); await flushMedia();
    media.stop(); media.startController(); rejectOld(new Error('closed old peer'));
    await expect(pending).resolves.toBeUndefined();
    await media.handleSignal({ type: 'offer', sdp: 'fresh' }); expect(mock.peers).toHaveLength(2); media.stop();
  });
});

describe('bounded pending media signaling', () => {
  async function stalled() {
    const result = setup(); result.media.startController();
    await result.media.handleSignal({ type: 'offer', sdp: 'initial' });
    mock.peers[0].setRemoteDescription.mockImplementationOnce(() => new Promise(() => {}));
    void result.media.handleSignal({ type: 'offer', sdp: 'stalled' }); await flushMedia();
    return result;
  }
  it('limits queued signal count while a native promise is stalled', async () => {
    const { media, callbacks } = await stalled();
    for (let i = 0; i < 127; i++) void media.handleSignal({ type: 'dimensions', width: 800, height: 1600 });
    await expect(media.handleSignal({ type: 'dimensions', width: 800, height: 1600 })).rejects.toThrow('Too many queued media signals');
    expect(callbacks.onError).toHaveBeenCalledWith('Too many queued media signals.');
    expect(mock.peers[0].close).toHaveBeenCalledOnce(); media.stop();
  });
  it('bounds the queued SDP bytes independently of message count', async () => {
    const { media } = await stalled();
    for (let i = 0; i < 2; i++) void media.handleSignal({ type: 'offer', sdp: 'x'.repeat(128000) });
    await expect(media.handleSignal({ type: 'offer', sdp: 'x'.repeat(128000) })).rejects.toThrow('Too many queued media signals'); media.stop();
  });
  it('includes queued candidate and mid strings in its memory budget', async () => {
    const { media } = await stalled();
    await expect(media.handleSignal({ type: 'candidate', candidate: { candidate: 'x'.repeat(300000), sdpMid: 'video' } })).rejects.toThrow('Too many queued media signals'); media.stop();
  });
  it('resets an overflowed queue so a new session can negotiate', async () => {
    const { media, callbacks } = await stalled();
    await expect(media.handleSignal({ type: 'offer', sdp: 'x'.repeat(300000) })).rejects.toThrow('Too many');
    media.startController(); await media.handleSignal({ type: 'offer', sdp: 'fresh' });
    expect(callbacks.send).toHaveBeenLastCalledWith({ type: 'answer', sdp: 'answer-sdp' }); media.stop();
  });
  it('frees a completed signal budget instead of counting all lifetime messages', async () => {
    const { media, callbacks } = setup(); media.startController();
    for (let i = 0; i < 150; i++) await media.handleSignal({ type: 'dimensions', width: 800, height: 1600 });
    expect(callbacks.onError).not.toHaveBeenCalled(); media.stop();
  });
});


describe('background screen-video reconnection grace', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  async function connectedController() {
    const result = setup();
    result.media.startController();
    await result.media.handleSignal({ type: 'offer', sdp: 'valid-offer' });
    const peer = mock.peers[0]!;
    return { ...result, peer, disconnected: () => { peer.connectionState = 'disconnected'; peer.listeners.connectionstatechange(); } };
  }
  it('does not tear down video at the previous ten-second threshold', async () => {
    const { media, callbacks, peer, disconnected } = await connectedController();
    disconnected(); vi.advanceTimersByTime(11000);
    expect(peer.close).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
    media.stop();
  });
  it('retains a recovering peer until the 60-second deadline', async () => {
    const { media, callbacks, peer, disconnected } = await connectedController();
    disconnected(); vi.advanceTimersByTime(59000);
    expect(peer.close).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
    media.stop();
  });
  it('fails closed after prolonged loss instead of keeping a stale video grant forever', async () => {
    const { media, callbacks, peer, disconnected } = await connectedController();
    disconnected(); vi.advanceTimersByTime(60000);
    expect(peer.close).toHaveBeenCalledOnce();
    expect(callbacks.onError).toHaveBeenCalledWith('Screen connection was lost.');
    media.stop();
  });
  it('cancels pending disconnection teardown when media connectivity returns', async () => {
    const { media, callbacks, peer, disconnected } = await connectedController();
    disconnected(); vi.advanceTimersByTime(30000);
    peer.connectionState = 'connected'; peer.listeners.connectionstatechange();
    vi.advanceTimersByTime(65000);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(peer.close).not.toHaveBeenCalled();
    media.stop();
  });
  it('does not keep extending a disconnected deadline with duplicate native callbacks', async () => {
    const { media, callbacks, disconnected } = await connectedController();
    disconnected(); vi.advanceTimersByTime(30000);
    disconnected(); vi.advanceTimersByTime(30000);
    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    media.stop();
  });
  it('never lets a stale timeout destroy a newly created sharing session', async () => {
    const { media, callbacks, disconnected } = await connectedController();
    disconnected(); vi.advanceTimersByTime(30000);
    media.stop(); media.startController();
    await media.handleSignal({ type: 'offer', sdp: 'fresh' });
    const fresh = mock.peers[1]!;
    vi.advanceTimersByTime(65000);
    expect(fresh.close).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
    media.stop();
  });
});
