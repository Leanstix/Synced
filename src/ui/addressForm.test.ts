import {describe, expect, it} from 'vitest';
import {privateAddressField} from './addressForm';

describe('private address field', () => {
  it('keeps automatic discovery available for a blank optional override', () => {
    expect(privateAddressField(' \n ')).toEqual({value: '', valid: true, error: null});
  });
  it('asks for an address when a saved phone has no usable endpoint', () => {
    expect(privateAddressField('', true).valid).toBe(false);
    expect(privateAddressField('', true).error).toContain('host phone');
  });
  it('trims pasted addresses without changing the intended endpoint', () => {
    expect(privateAddressField(' 192.168.10.2\n')).toEqual({value: '192.168.10.2', valid: true, error: null});
  });
  it.each(['10.0.0.2', '172.16.0.1', '172.31.255.254', '192.168.255.254'])('allows private hotspot/LAN address %s', address => {
    expect(privateAddressField(address).valid).toBe(true);
  });
  it.each(['8.8.8.8', '127.0.0.1', '172.15.0.1', '172.32.0.1', '169.254.0.1', '0.0.0.0'])('does not suggest connecting outside supported private ranges: %s', address => {
    expect(privateAddressField(address).valid).toBe(false);
  });
  it.each(['192.168.1.2:9800', 'http://192.168.1.2', '192.168.01.2', '192.168.1.256', 'fe80::1', '192.168.\n1.2'])('rejects ambiguous pasted endpoint %s', address => {
    expect(privateAddressField(address).error).not.toBeNull();
  });
});

import {portField} from './addressForm';

describe('saved connection port field', () => {
  it('accepts the normal trusted-device listener port', () => expect(portField('47631').value).toBe(47631));
  it('accepts the lowest and highest supported unprivileged ports', () => {
    expect(portField('1024').valid).toBe(true);
    expect(portField('65535').valid).toBe(true);
  });
  it('trims pasted surrounding whitespace', () => expect(portField(' 47631\n').value).toBe(47631));
  it('rejects privileged and out-of-range ports', () => {
    expect(portField('1023').valid).toBe(false);
    expect(portField('65536').valid).toBe(false);
  });
  it.each(['', '-47631', '4.7631', '47e3', 'abc', '047631'])('rejects ambiguous port %s', input => expect(portField(input).value).toBeNull());
});
