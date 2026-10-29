import {expect, it, vi} from 'vitest';
import {voiceLink, type VoicePhone} from '../scripts/dual-android.mts';
function phones(active = false) {
  const log: string[] = [];
  const make = (name: string): VoicePhone => ({visible: async label => {log.push(`${name}:see:${label}`);}, tap: async label => {log.push(`${name}:tap:${label}`);}, allowMicrophone: async () => {log.push(`${name}:permission`);}, dump: () => active ? [{text: 'Voice link is active', description: '', className: '', enabled: true, bounds: [0,0,1,1]}] : []});
  return {host: make('host'), controller: make('controller'), log};
}
it('waits for incoming and outgoing UI before accepting', async () => {const {host, controller, log} = phones(); await voiceLink(host, controller); expect(log.indexOf('controller:tap:Accept · Use microphone')).toBeGreaterThan(log.indexOf('host:see:Waiting for them to accept'));});
it('refuses an active link before explicit acceptance', async () => {const {host, controller, log} = phones(true); await expect(voiceLink(host, controller)).rejects.toThrow('before explicit'); expect(log).not.toContain('controller:tap:Accept · Use microphone');});
it('requires separate receiver then caller OS permission after acceptance', async () => {const {host, controller, log} = phones(); await voiceLink(host, controller); expect(log.indexOf('controller:permission')).toBeGreaterThan(log.indexOf('controller:tap:Accept · Use microphone')); expect(log.indexOf('host:permission')).toBeGreaterThan(log.indexOf('controller:permission'));});
it('checks active and exercises mute and unmute on each phone', async () => {const {host, controller, log} = phones(); await voiceLink(host, controller); for(const name of ['host', 'controller']) {expect(log).toContain(`${name}:tap:Mute my microphone`); expect(log).toContain(`${name}:see:Your microphone is muted`); expect(log).toContain(`${name}:tap:Unmute my microphone`);}});
it('ends the link and observes both idle screens', async () => {const {host, controller, log} = phones(); const stage = vi.fn(); await voiceLink(host, controller, stage); expect(log.slice(-3)).toEqual(['controller:tap:End voice link', 'host:see:Talk while you help.', 'controller:see:Talk while you help.']); expect(stage).toHaveBeenCalledWith('voice-ended-both-idle');});
it('stops before asserting active when OS permission fails', async () => {const {host, controller, log} = phones(); controller.allowMicrophone = async () => {throw new Error('denied');}; await expect(voiceLink(host, controller)).rejects.toThrow('denied'); expect(log).not.toContain('host:permission');});
