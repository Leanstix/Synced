import { describe, expect, it, vi } from 'vitest';
import { pairSaveReconnect, type PairingPhone } from '../scripts/dual-android.mts';
import { parseUi } from '../scripts/dual-android-policy.mts';
function phone(serial: string, ip: string) {
  let comparison = false;
  return {
    serial, privateIp: vi.fn(() => ip), install: vi.fn(), launch: vi.fn(async () => {}), top: vi.fn(async () => {}),
    locate: vi.fn(async (label: string) => { comparison = label === 'Comparison code:'; }),
    dump: vi.fn(() => parseUi(`<hierarchy><node bounds="[0,0][100,100]" ${comparison ? 'content-desc="Comparison code: 1 2 3 4 5 6"' : 'text="synced://private-in-memory"'}/></hierarchy>`)),
    tap: vi.fn(async () => {}), fill: vi.fn(async () => {}), visible: vi.fn(async () => {}), noAutoGrants: vi.fn(async () => {}),
  } satisfies PairingPhone;
}
describe('dual Android pairing saved resume orchestration', () => {
  it('requires actual distinct shared Wi-Fi addresses before installing', async () => { const host = phone('host', '10.0.2.15'), peer = phone('peer', '10.0.2.15'); await expect(pairSaveReconnect(host, peer, '/tmp/app.apk')).rejects.toThrow('Distinct shared'); expect(host.install).not.toHaveBeenCalled(); });
  it('refuses owner approval when comparison codes differ', async () => { const host = phone('host', '10.0.2.16'), peer = phone('peer', '10.0.2.17'); peer.dump.mockReturnValue(parseUi('<hierarchy><node bounds="[0,0][100,100]" content-desc="Comparison code: 6 5 4 3 2 1"/></hierarchy>')); await expect(pairSaveReconnect(host, peer, '/tmp/app.apk')).rejects.toThrow('do not match'); expect(host.tap).not.toHaveBeenCalledWith('The codes match · Approve'); });
  it('requests both app save actions and both explicit Alert confirmations', async () => { const host = phone('host', '10.0.2.16'), peer = phone('peer', '10.0.2.17'); await pairSaveReconnect(host, peer, '/tmp/app.apk'); for (const p of [host, peer]) { expect(p.tap).toHaveBeenCalledWith('Save pairing'); expect(p.tap).toHaveBeenCalledWith('Save phone'); } });
  it('uses public saved rows with an explicit matching port and current host address', async () => { const host = phone('host', '10.0.2.16'), peer = phone('peer', '10.0.2.17'); await pairSaveReconnect(host, peer, '/tmp/app.apk'); expect(host.tap).toHaveBeenCalledWith('Receive connection'); expect(peer.tap).toHaveBeenCalledWith('Reconnect'); expect(peer.fill).toHaveBeenCalledWith('Current Wi-Fi address for ', '10.0.2.16', true); for (const p of [host, peer]) expect(p.fill).toHaveBeenCalledWith('Connection port for ', '47631', true); });
  it('checks private screen and control grants both initially and after trusted resume', async () => { const host = phone('host', '10.0.2.16'), peer = phone('peer', '10.0.2.17'); const stage = vi.fn(); await pairSaveReconnect(host, peer, '/tmp/app.apk', stage); expect(host.noAutoGrants).toHaveBeenCalledTimes(2); expect(stage).toHaveBeenLastCalledWith('trusted-reconnect-no-grants'); expect(JSON.stringify(stage.mock.calls)).not.toContain('synced://'); });
  it('stops after a failed APK installation without trying pairing or approval', async () => { const host = phone('host', '10.0.2.16'), peer = phone('peer', '10.0.2.17'); host.install.mockImplementation(() => { throw new Error('install failed'); }); await expect(pairSaveReconnect(host, peer, '/tmp/app.apk')).rejects.toThrow('install failed'); expect(host.tap).not.toHaveBeenCalled(); expect(peer.launch).not.toHaveBeenCalled(); });
});
