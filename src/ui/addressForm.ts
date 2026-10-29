import {isPrivateAddress} from '../core/protocol';

export type AddressField = {value: string; valid: boolean; error: string | null};

/** A blank override means automatic discovery, but an entered address must be local. */
export function privateAddressField(input: string, required = false): AddressField {
  const value = input.trim();
  if (!value) return {value, valid: !required, error: required ? 'Enter the host phone’s current private Wi-Fi address.' : null};
  if (!isPrivateAddress(value)) return {value, valid: false, error: 'Use a private IPv4 address, such as 192.168.1.10. Do not include a port or web address.'};
  return {value, valid: true, error: null};
}

export function portField(input: string): {value: number | null; valid: boolean; error: string | null} {
  const text = input.trim();
  const value = /^\d{4,5}$/.test(text) ? Number(text) : NaN;
  if (!Number.isInteger(value) || value < 1024 || value > 65535) return {value: null, valid: false, error: 'Use the same port on both phones, from 1024 to 65535.'};
  return {value, valid: true, error: null};
}
