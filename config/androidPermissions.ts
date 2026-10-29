/** Bound dependency-provided legacy Bluetooth grants to Android 11 and earlier. */
export function limitLegacyBluetoothPermissions<T extends { $: { 'android:name'?: string; 'android:maxSdkVersion'?: string } }>(permissions: T[]): T[] {
  return permissions.map(permission => {
    if (!['android.permission.BLUETOOTH', 'android.permission.BLUETOOTH_ADMIN'].includes(permission.$['android:name'] ?? '')) return permission;
    const existing = permission.$['android:maxSdkVersion'];
    const maximum = existing && /^\d+$/.test(existing) ? Math.min(30, Number(existing)) : 30;
    return { ...permission, $: { ...permission.$, 'android:maxSdkVersion': String(maximum), 'tools:node': 'replace' } };
  });
}
