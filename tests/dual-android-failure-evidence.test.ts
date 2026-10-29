import {describe, expect, it, vi} from 'vitest';
import {captureSafeFailureEvidence} from '../scripts/dual-android.mts';
import {assertEvidenceSafe, type UiNode} from '../scripts/dual-android-policy.mts';
const node = (text: string): UiNode => ({text, description: '', className: '', enabled: true, bounds: [0, 0, 10, 10]});
describe('secret-safe emulator failure evidence', () => {
it('captures both phones with fixed nonsecret filenames', () => {
  const host = {screenshot: vi.fn()}, controller = {screenshot: vi.fn()};
  captureSafeFailureEvidence(host, controller, '/evidence');
  expect(host.screenshot).toHaveBeenCalledExactlyOnceWith('/evidence', 'failure-host.png');
  expect(controller.screenshot).toHaveBeenCalledExactlyOnceWith('/evidence', 'failure-controller.png');
});
it('still attempts the controller when the host secret guard refuses capture', () => {
  const host = {screenshot: vi.fn(() => assertEvidenceSafe([node('synced://private')]))}, controller = {screenshot: vi.fn()};
  expect(() => captureSafeFailureEvidence(host, controller, '/evidence')).not.toThrow();
  expect(controller.screenshot).toHaveBeenCalledOnce();
});
it.each(['synced://DO_NOT_PERSIST', 'Comparison code: 123456', 'PRIVATE INVITATION'])('does not persist or log guarded %s UI', text => {
  const write = vi.fn();
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const phone = {screenshot: () => {assertEvidenceSafe([node(text)]); write(text);}};
  try {
    expect(captureSafeFailureEvidence(phone, phone, '/evidence')).toBeUndefined();
    expect(write).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled();
  } finally {log.mockRestore();}
});
it('keeps the original test failure when filesystem capture fails', () => {
  const original = new Error('Expected public UI was not found');
  let failure: unknown;
  try {throw original;} catch (error) {
    failure = error;
    captureSafeFailureEvidence({screenshot: () => {throw new Error('ENOSPC');}}, {screenshot: vi.fn()}, '/evidence');
  }
  expect(failure).toBe(original);
});
it('returns without exceptions when both captures fail', () => {
  const screenshot = vi.fn(() => {throw new Error('raw adb output synced://SECRET');});
  expect(() => captureSafeFailureEvidence({screenshot}, {screenshot}, '/evidence')).not.toThrow();
  expect(screenshot).toHaveBeenCalledTimes(2);
});
it('retains a successful host capture even if the controller fails', () => {
  const host = {screenshot: vi.fn()}, controller = {screenshot: () => {throw new Error('offline');}};
  captureSafeFailureEvidence(host, controller, '/evidence'); expect(host.screenshot).toHaveBeenCalledOnce();
});

});

import {captureTopFailureEvidence} from '../scripts/dual-android.mts';
describe('visible error banners in guarded failure evidence', () => {
 const phone=()=>({top:vi.fn(async()=>{}),screenshot:vi.fn()});
 it('returns both views to their error banners before guarded screenshots', async()=>{
  const host=phone(),peer=phone();await captureTopFailureEvidence(host,peer,'/evidence');
  for(const p of [host,peer])expect(p.top.mock.invocationCallOrder[0]).toBeLessThan(p.screenshot.mock.invocationCallOrder[0]);
 });
 it('still captures both guarded views when the host cannot scroll', async()=>{
  const host=phone(),peer=phone();host.top.mockRejectedValueOnce(new Error('offline'));
  await expect(captureTopFailureEvidence(host,peer,'/evidence')).resolves.toBeUndefined();
  expect(host.screenshot).toHaveBeenCalledOnce();expect(peer.screenshot).toHaveBeenCalledOnce();
 });
 it('keeps host evidence when the controller cannot scroll or capture', async()=>{
  const host=phone(),peer=phone();peer.top.mockRejectedValueOnce(new Error('offline'));peer.screenshot.mockImplementation(()=>{throw new Error('offline')});
  await expect(captureTopFailureEvidence(host,peer,'/evidence')).resolves.toBeUndefined();expect(host.screenshot).toHaveBeenCalledOnce();
 });
 it('continues to refuse secrets revealed by scrolling to the top', async()=>{
  const write=vi.fn(),p=phone();p.screenshot.mockImplementation(()=>{assertEvidenceSafe([node('PRIVATE INVITATION')]);write()});
  await captureTopFailureEvidence(p,p,'/evidence');expect(write).not.toHaveBeenCalled();
 });
 it('never replaces the test failure or logs raw errors from either device', async()=>{
  const p=phone(),log=vi.spyOn(console,'error').mockImplementation(()=>{});
  p.top.mockRejectedValue(new Error('synced://SECRET'));p.screenshot.mockImplementation(()=>{throw new Error('private data')});
  try{await expect(captureTopFailureEvidence(p,p,'/evidence')).resolves.toBeUndefined();expect(log).not.toHaveBeenCalled();}finally{log.mockRestore()}
 });
});
