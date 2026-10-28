import { beforeEach, describe, expect, it, vi } from 'vitest';

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
