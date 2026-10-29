import {describe, expect, it} from 'vitest';
import {deviceDisplayName, peerNameField, savedPeerDetail, sortedSavedPeers, type SavedPeerSummary} from './savedPeerPresentation';

const peer: SavedPeerSummary = {id: 'one', name: 'Kitchen', role: 'HOST', savedAt: 10};

describe('saved device names', () => {
  it('provides a readable fallback for empty and hidden-only remote names', () => {
    expect(deviceDisplayName(undefined)).toBe('Unnamed phone');
    expect(deviceDisplayName('\u202e\n')).toBe('Unnamed phone');
  });
  it('removes remote directional overrides and line breaks from display', () => {
    expect(deviceDisplayName('Phone\u202e\nwith\tname')).toBe('Phone with name');
  });
  it('does not split emoji when limiting long device names', () => {
    expect(deviceDisplayName('📱'.repeat(81))).toBe('📱'.repeat(80));
  });
  it('keeps accents and non-Latin names readable', () => {
    expect(deviceDisplayName('  Ana’s téléphone 手机  ')).toBe('Ana’s téléphone 手机');
  });
  it('requires a recognizable local label', () => {
    expect(peerNameField(' \n ').valid).toBe(false);
    expect(peerNameField(' \tDad’s phone  ')).toEqual({value: 'Dad’s phone', valid: true, error: null});
  });
  it('rejects embedded newlines and misleading formatting during rename', () => {
    expect(peerNameField('Kitchen\nPhone').valid).toBe(false);
    expect(peerNameField('Kitchen\u202ePhone').valid).toBe(false);
  });
  it('accepts the exact name limit and rejects one character beyond it', () => {
    expect(peerNameField('x'.repeat(80)).valid).toBe(true);
    expect(peerNameField('x'.repeat(81)).valid).toBe(false);
  });
});

describe('saved device rows', () => {
  it('offers address entry when the remote host has no saved endpoint', () => {
    expect(savedPeerDetail(peer)).toContain('Enter its address');
  });
  it('labels a cached endpoint as last known, without online presence', () => {
    const detail = savedPeerDetail({...peer, endpoint: {address: '10.0.0.2', port: 9800}});
    expect(detail).toContain('Last address 10.0.0.2');
    expect(detail).not.toMatch(/online|nearby|connected/i);
  });
  it('tells the host to receive a saved controller instead of connecting to it', () => {
    expect(savedPeerDetail({...peer, role: 'CONTROLLER'})).toContain('Receive its connection');
  });
  it('shows the newest saved pairing first without mutating the source', () => {
    const input = [peer, {...peer, id: 'two', savedAt: 20}];
    expect(sortedSavedPeers(input).map(item => item.id)).toEqual(['two', 'one']);
    expect(input[0].id).toBe('one');
  });
  it('keeps equal-time records in stable identity order', () => {
    expect(sortedSavedPeers([{...peer, id: 'z'}, {...peer, id: 'a'}]).map(item => item.id)).toEqual(['a', 'z']);
  });
  it('handles no saved devices without inventing a sample phone', () => {
    expect(sortedSavedPeers([])).toEqual([]);
  });
});

 describe('pending revocation visibility', () => {
  it.each(['HOST', 'CONTROLLER'] as const)('shows pending removal instead of reconnect instructions for %s', role => {
    expect(savedPeerDetail({...peer, role, revocationPending: true})).toContain('Connections are blocked');
  });
  it('keeps the pending record in the list for retry', () => expect(sortedSavedPeers([{...peer, revocationPending: true}])).toHaveLength(1));
  it('does not show stale endpoint as a reconnect instruction', () => expect(savedPeerDetail({...peer, revocationPending: true, endpoint: {address: '10.0.0.2', port: 1}})).not.toContain('10.0.0.2'));
  it('keeps ordinary records reconnectable when revocation is false', () => expect(savedPeerDetail({...peer, revocationPending: false})).toContain('Enter its address'));
});
