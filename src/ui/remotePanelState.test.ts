import {describe, expect, it} from 'vitest';
import {alarmFieldsValid, remotePanelState} from './remotePanelState';

const ready = {connected: true, transport: 'wifi' as const, controlEnabled: true, streamUrl: 'real-stream', frame: {width: 500, height: 1000}, screen: {width: 1000, height: 2000}};

describe('remote controls and viewport states', () => {
  it('permits gestures only when approved full-screen video has dimensions', () => {
    expect(remotePanelState(ready).canTouch).toBe(true);
  });
  it('blocks all input after disconnect even if old flags remain momentarily', () => {
    expect(remotePanelState({...ready, connected: false})).toMatchObject({canControl: false, canTouch: false, hasVideo: false});
  });
  it('shows video without accepting gestures when host has not approved control', () => {
    expect(remotePanelState({...ready, controlEnabled: false})).toMatchObject({canControl: false, canTouch: false, hasVideo: true});
  });
  it('keeps explicit navigation available while Wi-Fi video is not shared', () => {
    expect(remotePanelState({...ready, streamUrl: null})).toMatchObject({canControl: true, canTouch: false, hasVideo: false});
  });
  it('never treats a stale video stream as Bluetooth screen sharing', () => {
    expect(remotePanelState({...ready, transport: 'bluetooth'})).toMatchObject({canControl: true, canTouch: false, hasVideo: false, bluetooth: true});
    expect(remotePanelState({...ready, transport: 'bluetooth'}).caption).toContain('No live screen');
  });
  it('requires approval for Bluetooth button controls too', () => {
    expect(remotePanelState({...ready, transport: 'bluetooth', controlEnabled: false}).canControl).toBe(false);
  });
  it('waits for actual dimensions before any screen-coordinate action', () => {
    expect(remotePanelState({...ready, frame: null}).canTouch).toBe(false);
    expect(remotePanelState({...ready, screen: null}).caption).toContain('Waiting for screen dimensions');
  });
  it('pauses taps on a cropped screen without disabling safe navigation', () => {
    expect(remotePanelState({...ready, frame: {width: 500, height: 500}})).toMatchObject({canControl: true, canTouch: false});
  });
  it('pauses taps during rotation until the two aspect ratios agree', () => {
    expect(remotePanelState({...ready, screen: {width: 2000, height: 1000}}).canTouch).toBe(false);
  });
  it('rejects invalid native dimensions rather than enabling gestures', () => {
    expect(remotePanelState({...ready, frame: {width: Infinity, height: 1000}}).canTouch).toBe(false);
  });
});

describe('alarm form', () => {
  it('accepts midnight and the final minute of a day', () => {
    expect(alarmFieldsValid('00', '00')).toBe(true);
    expect(alarmFieldsValid('23', '59')).toBe(true);
  });
  it('accepts one-digit time fields without silently changing their meaning', () => expect(alarmFieldsValid('7', '5')).toBe(true));
  it('does not interpret empty fields as zero', () => {
    expect(alarmFieldsValid('', '0')).toBe(false);
    expect(alarmFieldsValid('0', '')).toBe(false);
  });
  it('rejects out-of-range hour and minute', () => {
    expect(alarmFieldsValid('24', '00')).toBe(false);
    expect(alarmFieldsValid('12', '60')).toBe(false);
  });
  it.each(['-1', '1.5', ' 1', '1e1', '001', 'NaN'])('rejects malformed hour %s', value => expect(alarmFieldsValid(value, '0')).toBe(false));
});
