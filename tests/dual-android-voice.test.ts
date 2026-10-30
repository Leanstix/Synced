import {describe, expect, it, vi} from 'vitest';
import {voiceLink, type VoicePhone} from '../scripts/dual-android.mts';
function phones(active = false) {
  const log: string[] = [];
  const make = (name: string): VoicePhone => ({visible: async label => {log.push(`${name}:see:${label}`);}, tap: async label => {log.push(`${name}:tap:${label}`);}, allowMicrophone: async () => {log.push(`${name}:permission`);}, dump: () => active ? [{text: 'Voice link is active', description: '', className: '', enabled: true, bounds: [0,0,1,1]}] : []});
  return {host: make('host'), controller: make('controller'), log};
}
describe('two-phone explicit voice flow', () => {
it('waits for incoming and outgoing UI before accepting', async () => {const {host, controller, log} = phones(); await voiceLink(host, controller); expect(log.indexOf('controller:tap:Accept · Use microphone')).toBeGreaterThan(log.indexOf('host:see:Waiting for them to accept'));});
it('refuses an active link before explicit acceptance', async () => {const {host, controller, log} = phones(true); await expect(voiceLink(host, controller)).rejects.toThrow('before explicit'); expect(log).not.toContain('controller:tap:Accept · Use microphone');});
it('requires separate receiver then caller OS permission after acceptance', async () => {const {host, controller, log} = phones(); await voiceLink(host, controller); expect(log.indexOf('controller:permission')).toBeGreaterThan(log.indexOf('controller:tap:Accept · Use microphone')); expect(log.indexOf('host:permission')).toBeGreaterThan(log.indexOf('controller:permission'));});
it('checks active and exercises mute and unmute on each phone', async () => {const {host, controller, log} = phones(); await voiceLink(host, controller); for(const name of ['host', 'controller']) {expect(log).toContain(`${name}:tap:Mute my microphone`); expect(log).toContain(`${name}:see:Your microphone is muted`); expect(log).toContain(`${name}:tap:Unmute my microphone`);}});
it('ends the link and observes both idle screens', async () => {const {host, controller, log} = phones(); const stage = vi.fn(); await voiceLink(host, controller, stage); expect(log.slice(-3)).toEqual(['controller:tap:End voice link', 'host:see:Talk while you help.', 'controller:see:Talk while you help.']); expect(stage).toHaveBeenCalledWith('voice-ended-both-idle');});
it('stops before asserting active when OS permission fails', async () => {const {host, controller, log} = phones(); controller.allowMicrophone = async () => {throw new Error('denied');}; await expect(voiceLink(host, controller)).rejects.toThrow('denied'); expect(log).not.toContain('host:permission');});

});

describe('voice permission stage diagnostics',()=>{
 it('records the request before any permission confirmation',async()=>{
  const {host,controller}=phones(),stage=vi.fn();await voiceLink(host,controller,stage);
  expect(stage.mock.calls.slice(0,2).flat()).toEqual(['voice-request-tapped','voice-waits-for-explicit-acceptance']);
 });
 it('does not claim the acceptance tap completed when the UI action fails',async()=>{
  const {host,controller}=phones(),stage=vi.fn();controller.tap=async label=>{if(label.startsWith('Accept'))throw new Error('missing action')};
  await expect(voiceLink(host,controller,stage)).rejects.toThrow('missing action');expect(stage).not.toHaveBeenCalledWith('voice-accept-tapped');
 });
 it('identifies receiver permission failure before claiming caller permission',async()=>{
  const {host,controller}=phones(),stage=vi.fn();controller.allowMicrophone=async()=>{throw new Error('receiver permission')};
  await expect(voiceLink(host,controller,stage)).rejects.toThrow('receiver permission');
  expect(stage).toHaveBeenCalledWith('voice-accept-tapped');expect(stage).not.toHaveBeenCalledWith('voice-controller-permission-confirmed');expect(stage).not.toHaveBeenCalledWith('voice-host-permission-confirmed');
 });
 it('distinguishes caller permission failure from an accepted receiver permission',async()=>{
  const {host,controller}=phones(),stage=vi.fn();host.allowMicrophone=async()=>{throw new Error('caller permission')};
  await expect(voiceLink(host,controller,stage)).rejects.toThrow('caller permission');expect(stage).toHaveBeenCalledWith('voice-controller-permission-confirmed');expect(stage).not.toHaveBeenCalledWith('voice-link-active-both');
 });
 it('requires both permission observations before recording an active link',async()=>{
  const {host,controller}=phones(),stage=vi.fn();await voiceLink(host,controller,stage);const order=stage.mock.calls.flat();
  expect(order.indexOf('voice-host-permission-confirmed')).toBeGreaterThan(order.indexOf('voice-controller-permission-confirmed'));
  expect(order.indexOf('voice-link-active-both')).toBeGreaterThan(order.indexOf('voice-host-permission-confirmed'));
 });
});
