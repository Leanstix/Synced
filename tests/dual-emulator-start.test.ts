import {describe, expect, it, vi} from 'vitest';
import {startSecondEmulator, type LauncherCommands} from '../scripts/dual-emulator-start.mts';
function fixture(devices = 'emulator-5554 device\n', version = 'Android emulator version 36.5.1') {
  let clock = 0;
  const io: LauncherCommands = {run: vi.fn((file, args) => args[0] === 'devices' ? devices : args.includes('-version') ? version : args.includes('getprop') ? '1' : args.includes('addr') ? `2: wlan0 inet 10.0.2.${args.includes('emulator-5554') ? 16 : 17}/24` : ''), launch: vi.fn(), pause: async ms => {clock += ms;}, now: () => clock};
  return io;
}
describe('accelerated second emulator lifecycle', () => {
it('starts an accelerated detached second emulator with explicit bounded resources', async () => {const io = fixture(); await startSecondEmulator('/sdk', io); expect(io.launch).toHaveBeenCalledWith('/sdk/emulator/emulator', expect.arrayContaining(['-port', '5556', '-accel', 'on', '-memory', '2048', '-cores', '2', '-no-audio', '-no-window']));});
it.each(['offline', 'device'])('refuses an occupied second serial even when %s', async status => {const io = fixture(`emulator-5554 device\nemulator-5556 ${status}`); await expect(startSecondEmulator('/sdk', io)).rejects.toThrow('occupied'); expect(io.launch).not.toHaveBeenCalled();});
it('requires the first emulator online', async () => {await expect(startSecondEmulator('/sdk', fixture('emulator-5554 offline'))).rejects.toThrow('First');});
it.each(['36.4.9', '35.6.0', 'unknown'])('refuses unsupported emulator %s', async version => {await expect(startSecondEmulator('/sdk', fixture(undefined, `Android emulator version ${version}`))).rejects.toThrow('36.5');});
it('polls both boot properties and cleans only its owned AVD on timeout', async () => {const io = fixture(); const original = io.run; io.run = vi.fn((file, args, input) => args.includes('getprop') ? '0' : original(file, args, input)); await expect(startSecondEmulator('/sdk', io, 4000, 'synced-dual-owned')).rejects.toThrow('startup failed'); expect(io.run).toHaveBeenCalledWith('/sdk/cmdline-tools/latest/bin/avdmanager', ['delete', 'avd', '--name', 'synced-dual-owned']);});
it('does not delete an AVD when creation failed', async () => {const io = fixture(); const original = io.run; io.run = vi.fn((file, args, input) => {if(args[0] === 'create') throw new Error('failure'); return original(file, args, input);}); await expect(startSecondEmulator('/sdk', io)).rejects.toThrow(); expect(vi.mocked(io.run).mock.calls.some(([,args]) => args[0] === 'delete')).toBe(false);});
it('requires a safe unique owned name and SDK', async () => {await expect(startSecondEmulator('', fixture())).rejects.toThrow(); await expect(startSecondEmulator('/sdk', fixture(), 10, '../first')).rejects.toThrow();});

});


describe('headless emulator version preflight', () => {
  it('checks the version without loading GUI libraries', async () => { const io = fixture(); await startSecondEmulator('/sdk', io); expect(io.run).toHaveBeenCalledWith('/sdk/emulator/emulator', ['-no-window', '-version']); });
  it('keeps the launched second guest headless as well', async () => { const io = fixture(); await startSecondEmulator('/sdk', io); expect(io.launch).toHaveBeenCalledWith('/sdk/emulator/emulator', expect.arrayContaining(['-no-window', '-no-audio'])); });
  it('refuses an old headless emulator before creating an AVD', async () => { const io = fixture(undefined, 'Android emulator version 36.4.0'); await expect(startSecondEmulator('/sdk', io)).rejects.toThrow('36.5'); expect(io.launch).not.toHaveBeenCalled(); });
  it('does not delete existing devices when version inspection fails', async () => { const io = fixture(); const run = io.run; io.run = vi.fn((file, args, input) => { if (args.includes('-version')) throw new Error('headless executable unavailable'); return run(file, args, input); }); await expect(startSecondEmulator('/sdk', io)).rejects.toThrow('unavailable'); expect(io.run).not.toHaveBeenCalledWith(expect.anything(), expect.arrayContaining(['delete'])); });
  it('rejects malformed headless output rather than assuming shared Wi-Fi support', async () => { const io = fixture(undefined, 'unexpected output'); await expect(startSecondEmulator('/sdk', io)).rejects.toThrow('36.5'); expect(io.launch).not.toHaveBeenCalled(); });
});

describe('shared Wi-Fi readiness after Android boot', () => {
  it('enables Wi-Fi on both selected emulators before reading their addresses', async () => {
    const io = fixture(); await startSecondEmulator('/sdk', io);
    const calls = vi.mocked(io.run).mock.calls;
    for (const serial of ['emulator-5554', 'emulator-5556']) {
      const enable = calls.findIndex(([, args]) => args.includes(serial) && args.includes('svc'));
      const address = calls.findIndex(([, args]) => args.includes(serial) && args.includes('addr'));
      expect(enable).toBeGreaterThan(-1); expect(address).toBeGreaterThan(enable);
    }
  });
  it('waits for DHCP even when both boot properties already report ready', async () => {
    const io = fixture(), run = io.run; let reads = 0;
    io.run = vi.fn((file, args, input) => args.includes('addr') && ++reads <= 4 ? '' : run(file, args, input));
    await startSecondEmulator('/sdk', io);
    expect(reads).toBe(6); expect(io.now()).toBe(4000);
    expect(vi.mocked(io.run).mock.calls.filter(([, args]) => args.includes('svc'))).toHaveLength(2);
  });
  it('recovers when ADB temporarily reports the second phone offline during DHCP', async () => {
    const io = fixture(), run = io.run; let failed = false;
    io.run = vi.fn((file, args, input) => {
      if (args.includes('addr') && args.includes('emulator-5556') && !failed) { failed = true; throw new Error('offline'); }
      return run(file, args, input);
    });
    await startSecondEmulator('/sdk', io); expect(io.now()).toBe(2000);
  });
  it.each(['10.0.2.15', '8.8.8.8', '192.168.1.999'])('rejects isolated or invalid network address %s within the deadline', async address => {
    const io = fixture(), run = io.run;
    io.run = vi.fn((file, args, input) => args.includes('addr') ? `2: wlan0 inet ${address}/24` : run(file, args, input));
    await expect(startSecondEmulator('/sdk', io, 4000, 'synced-dual-network')).rejects.toThrow('distinct private wlan0');
    expect(io.now()).toBe(4000);
    expect(io.run).toHaveBeenCalledWith('/sdk/cmdline-tools/latest/bin/avdmanager', ['delete', 'avd', '--name', 'synced-dual-network']);
  });
  it('does not enable radios or claim networking before the second phone boots', async () => {
    const io = fixture(), run = io.run;
    io.run = vi.fn((file, args, input) => args.includes('getprop') && args.includes('emulator-5556') ? '0' : run(file, args, input));
    await expect(startSecondEmulator('/sdk', io, 2000)).rejects.toThrow('startup failed');
    expect(vi.mocked(io.run).mock.calls.some(([, args]) => args.includes('svc') || args.includes('addr'))).toBe(false);
  });
  it('accepts distinct nondefault private Wi-Fi addresses without assuming emulator subnet values', async () => {
    const io = fixture(), run = io.run;
    io.run = vi.fn((file, args, input) => args.includes('addr') ? `2: wlan0 inet 172.20.1.${args.includes('emulator-5554') ? 5 : 9}/24` : run(file, args, input));
    await startSecondEmulator('/sdk', io); expect(io.now()).toBe(0);
  });
});
