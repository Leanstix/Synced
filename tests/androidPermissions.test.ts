import { describe, expect, it } from 'vitest';
import { limitLegacyBluetoothPermissions as limit } from '../config/androidPermissions';
const permission = (name: string, max?: string) => ({ $: { 'android:name': name, ...(max === undefined ? {} : { 'android:maxSdkVersion': max }) } });
describe('legacy Bluetooth manifest limits', () => {
  it('handles missing permissions', () => expect(limit([])).toEqual([]));
  it('caps dependency legacy permission without an SDK bound', () => expect(limit([permission('android.permission.BLUETOOTH')])[0].$['android:maxSdkVersion']).toBe('30'));
  it('caps admin grants above Android 11', () => expect(limit([permission('android.permission.BLUETOOTH_ADMIN', '99')])[0].$['android:maxSdkVersion']).toBe('30'));
  it('preserves stricter dependency limits', () => expect(limit([permission('android.permission.BLUETOOTH', '28')])[0].$['android:maxSdkVersion']).toBe('28'));
  it('bounds malformed dependency limits', () => expect(limit([permission('android.permission.BLUETOOTH', 'bad')])[0].$['android:maxSdkVersion']).toBe('30'));
  it('does not restrict modern connect permission', () => { const value = permission('android.permission.BLUETOOTH_CONNECT'); expect(limit([value])[0]).toBe(value); });
  it('does not mutate original dependency metadata', () => { const value = permission('android.permission.BLUETOOTH'); limit([value]); expect(value.$['android:maxSdkVersion']).toBeUndefined(); });
});
