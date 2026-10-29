export type SavedPeerSummary = {
  id: string;
  name: string;
  role: 'HOST' | 'CONTROLLER';
  endpoint?: {address: string; port: number};
  savedAt: number;
};

const unsafeDisplayCharacters = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** Nearby devices choose their own names; keep labels on one readable line. */
export function deviceDisplayName(name: string | null | undefined, fallback = 'Unnamed phone'): string {
  const readable = (name ?? '').replace(unsafeDisplayCharacters, ' ').replace(/\s+/g, ' ').trim();
  return readable ? Array.from(readable).slice(0, 80).join('') : fallback;
}

export function peerNameField(input: string): {value: string; valid: boolean; error: string | null} {
  const value = input.trim();
  if (!value) return {value, valid: false, error: 'Give this phone a name you will recognize.'};
  if (Array.from(value).length > 80) return {value, valid: false, error: 'Use 80 characters or fewer.'};
  if (value !== value.replace(unsafeDisplayCharacters, '')) return {value, valid: false, error: 'Use a name without line breaks or hidden formatting.'};
  return {value, valid: true, error: null};
}

/** Never turn a saved record into a claim that the peer is nearby or online. */
export function savedPeerDetail(peer: SavedPeerSummary): string {
  return peer.role === 'HOST'
    ? `You control this phone${peer.endpoint ? ` · Last address ${peer.endpoint.address}` : ' · Enter its address to reconnect'}`
    : 'This phone can request to control yours · Receive its connection here';
}

export function sortedSavedPeers<T extends SavedPeerSummary>(peers: readonly T[]): T[] {
  return [...peers].sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id));
}
