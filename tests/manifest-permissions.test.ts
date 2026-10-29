import {describe, expect, it} from 'vitest';
import {assertLegacyBluetoothBounds, manifestPermissions} from '../scripts/manifest-permissions.mts';
const name = 'android.permission.BLUETOOTH';
const permission = (max = '30') => `<uses-permission android:name="${name}" android:maxSdkVersion="${max}"/>`;
const manifest = (content = permission()) => `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.leanstix.synced">\n${content}\n<application android:label="Synced"><activity android:name="MainActivity" /></application>\n</manifest>`;
describe('compiled manifest XML permission boundaries', () => {
it('reads standard pretty printed apkanalyzer XML', () => expect(manifestPermissions(manifest())).toEqual([{name, maxSdkVersion: '30'}]));
it('accepts both quote styles and hexadecimal SDK values', () => expect(() => assertLegacyBluetoothBounds(manifest(permission('0x1e').replaceAll('"', "'")), [name])).not.toThrow());
it.each(['31', '0x1f', '-1', '30oops', 'NaN', '', '0', '1e1'])('rejects invalid or excessive SDK bound %s', max => expect(() => assertLegacyBluetoothBounds(manifest(permission(max)), [name])).toThrow('Legacy Bluetooth'));
it('rejects an unbounded permission', () => expect(() => assertLegacyBluetoothBounds(manifest(`<uses-permission android:name="${name}"/>`), [name])).toThrow('Legacy Bluetooth'));
it('rejects duplicate actual grants even when individually bounded', () => expect(() => assertLegacyBluetoothBounds(manifest(permission() + permission()), [name])).toThrow('Legacy Bluetooth'));
it('checks SDK-specific actual grants', () => expect(() => assertLegacyBluetoothBounds(manifest(permission('31').replace('uses-permission', 'uses-permission-sdk-23')), [name])).toThrow('Legacy Bluetooth'));
it('does not mistake commented permission for an actual grant', () => expect(() => assertLegacyBluetoothBounds(manifest(`<!-- ${permission()} -->`), [name])).toThrow('Legacy Bluetooth'));
it('rejects deceptively nested permission tags', () => expect(() => manifestPermissions(manifest(`<application>${permission()}</application>`))).toThrow('permission declaration'));
it('rejects deceptive duplicate attributes', () => expect(() => manifestPermissions(manifest(permission().replace('/>', ' android:maxSdkVersion="31"/>')))).toThrow('Ambiguous'));
it.each(['<!DOCTYPE manifest []>', '<!ENTITY bound "30">'])('rejects DTD or entity declarations', declaration => expect(() => manifestPermissions(declaration + manifest())).toThrow('unsafe'));
it('rejects entity substitutions instead of silently decoding SDK bounds', () => expect(() => manifestPermissions(manifest(permission('&#51;0')))).toThrow('unsafe'));
it('rejects a truncated manifest', () => expect(() => manifestPermissions(manifest().replace('</manifest>', ''))).toThrow('Truncated'));
it('rejects a mismatched root package', () => expect(() => manifestPermissions(manifest().replace('com.leanstix.synced', 'com.other.app'))).toThrow('identity'));
it('rejects namespace spoofing', () => expect(() => manifestPermissions(manifest().replace('http://schemas.android.com/apk/res/android', 'http://evil'))).toThrow('namespace'));
it('requires each corresponding declared grant in actual XML', () => expect(() => assertLegacyBluetoothBounds(manifest(), [name, name + '_ADMIN'])).toThrow('Legacy Bluetooth'));
it('also checks an actual unbounded legacy grant omitted from the summary', () => expect(() => assertLegacyBluetoothBounds(manifest(permission() + `<uses-permission android:name="${name}_ADMIN"/>`), [name])).toThrow('Legacy Bluetooth'));
it('bounds the XML input', () => expect(() => manifestPermissions(' '.repeat(2_000_001))).toThrow('oversized'));

});
