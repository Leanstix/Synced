import {describe, expect, it} from 'vitest';
import {INITIAL_STATE} from '../model/types';
import {pairingSavePresentation, reconnectPresentation, transportAvailable} from './pairingPresentation';

const connected = {...INITIAL_STATE, status: 'connected' as const, trustReady: true, pairingState: 'available' as const, capabilities: {...INITIAL_STATE.capabilities, persistentPairing: true}};

describe('pairing save consent', () => {
  it('offers explicit saving only after the encrypted session is connected', () => {
    expect(pairingSavePresentation(connected).canSave).toBe(true);
    expect(pairingSavePresentation({...connected, status: 'awaiting-approval'}).canSave).toBe(false);
  });
  it('waits for storage readiness instead of implying persistence', () => expect(pairingSavePresentation({...connected, trustReady: false}).canSave).toBe(false));
  it('does not offer storage on an unsupported build', () => expect(pairingSavePresentation({...connected, capabilities: INITIAL_STATE.capabilities}).canSave).toBe(false));
  it('explains that a local request still needs the second phone', () => {
    expect(pairingSavePresentation({...connected, pairingState: 'requested'})).toMatchObject({canSave: false, title: 'Waiting for the other phone'});
    expect(pairingSavePresentation({...connected, pairingState: 'requested'}).detail).toContain('before either stores');
  });
  it('never describes saved pairing as permanent permission to control', () => {
    expect(pairingSavePresentation({...connected, pairingState: 'saved'}).detail).toContain('still needs approval');
  });
  it('does not allow repeating a completed or unavailable save', () => {
    expect(pairingSavePresentation({...connected, pairingState: 'saved'}).canSave).toBe(false);
    expect(pairingSavePresentation({...connected, pairingState: 'unavailable'}).canSave).toBe(false);
  });
});

describe('trusted reconnect progress', () => {
  it('shows bounded attempt progress while reconnecting', () => expect(reconnectPresentation(true, 2, 4).title).toContain('2 of 4'));
  it('hides progress when no retry is running', () => expect(reconnectPresentation(false, 2, 4).visible).toBe(false));
  it('does not claim attempt zero is a network attempt', () => expect(reconnectPresentation(true, 0, 4).title).not.toContain('Attempt'));
  it('does not display impossible over-limit progress', () => expect(reconnectPresentation(true, 5, 4).title).not.toContain('Attempt'));
  it('handles invalid progress without exposing NaN to the user', () => expect(reconnectPresentation(true, NaN, Infinity).title).not.toMatch(/NaN|Infinity/));
  it('explains the host action and cancellation', () => expect(reconnectPresentation(true, 1, 4).detail).toMatch(/Receive connection.*cancel/));
});

describe('transport capability selection', () => {
  it.each([
    ['wifi', false, false, false], ['wifi', true, false, true], ['wifi', false, true, false],
    ['bluetooth', true, false, false], ['bluetooth', false, true, true], ['bluetooth', false, false, false],
  ] as const)('checks the selected transport %s with wifi=%s and Bluetooth=%s', (transport, localNetwork, bluetooth, expected) => {
    expect(transportAvailable(transport, {localNetwork, bluetooth})).toBe(expected);
  });
});
