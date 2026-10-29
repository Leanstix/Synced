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
  it('uses public saved rows with an explicit matching port and current host address', async () => { const host = phone('host', '10.0.2.16'), peer = phone('peer', '10.0.2.17'); await pairSaveReconnect(host, peer, '/tmp/app.apk'); expect(host.tap).toHaveBeenCalledWith('Receive connection'); expect(host.fill).toHaveBeenCalledWith('This phone’s private Wi-Fi address for saved pairing', '10.0.2.16'); expect(peer.tap).toHaveBeenCalledWith('Reconnect'); expect(peer.fill).toHaveBeenCalledWith('Current Wi-Fi address for ', '10.0.2.16', true); for (const p of [host, peer]) expect(p.fill).toHaveBeenCalledWith('Connection port for ', '47631', true); });
  it('checks private screen and control grants both initially and after trusted resume', async () => { const host = phone('host', '10.0.2.16'), peer = phone('peer', '10.0.2.17'); const stage = vi.fn(); await pairSaveReconnect(host, peer, '/tmp/app.apk', stage); expect(host.noAutoGrants).toHaveBeenCalledTimes(2); expect(stage).toHaveBeenLastCalledWith('trusted-reconnect-no-grants'); expect(JSON.stringify(stage.mock.calls)).not.toContain('synced://'); });
  it('stops after a failed APK installation without trying pairing or approval', async () => { const host = phone('host', '10.0.2.16'), peer = phone('peer', '10.0.2.17'); host.install.mockImplementation(() => { throw new Error('install failed'); }); await expect(pairSaveReconnect(host, peer, '/tmp/app.apk')).rejects.toThrow('install failed'); expect(host.tap).not.toHaveBeenCalled(); expect(peer.launch).not.toHaveBeenCalled(); });
});

import { screenAndControl } from '../scripts/dual-android.mts';
import { AndroidUi } from '../scripts/dual-android-ui.mts';
function controlPhone() {
  const p = new AndroidUi('host', 'com.leanstix.synced');
  vi.spyOn(p, 'tap').mockResolvedValue(); vi.spyOn(p, 'visible').mockResolvedValue(); vi.spyOn(p, 'enableTestAccessibility').mockResolvedValue();
  vi.spyOn(p, 'adb').mockReturnValue('mResumedActivity: ActivityRecord{ launcher/.Launcher }'); return p;
}
describe('dual Android real media and control proof requirements', () => {
  it('requires live remote video and touch-ready dimensions before claiming success', async () => { const host = controlPhone(), peer = controlPhone(); await screenAndControl(host, peer, vi.fn(), async () => {}); expect(peer.visible).toHaveBeenCalledWith('Live remote phone screen'); expect(peer.visible).toHaveBeenCalledWith('Touch control allowed'); });
  it('uses OS entire-screen permission and a separate explicit owner control dialog', async () => { const host = controlPhone(), peer = controlPhone(); await screenAndControl(host, peer, vi.fn(), async () => {}); for (const label of ['Share my entire screen', 'Entire screen', 'Start now', 'Allow touch control', 'Allow control']) expect(host.tap).toHaveBeenCalledWith(label); });
  it('does not claim video or input readiness when the RTCView is absent', async () => { const host = controlPhone(), peer = controlPhone(); vi.mocked(peer.visible).mockRejectedValueOnce(new Error('video absent')); const stage = vi.fn(); await expect(screenAndControl(host, peer, stage, async () => {})).rejects.toThrow('video absent'); expect(stage).not.toHaveBeenCalled(); expect(peer.tap).not.toHaveBeenCalledWith('Home on the other phone'); });
  it('rejects historical launcher activity when Synced is still resumed', async () => { const host = controlPhone(), peer = controlPhone(); vi.mocked(host.adb).mockReturnValue('mResumedActivity: ActivityRecord{ com.leanstix.synced/.MainActivity }\n historical launcher/.Launcher'); const stage = vi.fn(); await expect(screenAndControl(host, peer, stage, async () => {})).rejects.toThrow('Remote Home'); expect(stage).not.toHaveBeenCalledWith('remote-home-opened-launcher'); });
  it('rejects missing resumed activity evidence rather than accepting a Home tap alone', async () => { const host = controlPhone(), peer = controlPhone(); vi.mocked(host.adb).mockReturnValue('Activity history includes launcher'); await expect(screenAndControl(host, peer, vi.fn(), async () => {})).rejects.toThrow('Remote Home'); });
  it('returns the owner through the launcher without force-stopping the verified session', async () => { const host = controlPhone(), peer = controlPhone(); const stage = vi.fn(); await screenAndControl(host, peer, stage, async () => {}); expect(stage).toHaveBeenCalledWith('remote-home-opened-launcher'); expect(host.adb).toHaveBeenCalledWith(['shell', 'monkey', '-p', 'com.leanstix.synced', '-c', 'android.intent.category.LAUNCHER', '1']); expect(vi.mocked(host.adb).mock.calls.some(([args]) => args.includes('force-stop'))).toBe(false); });
});
