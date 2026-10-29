export interface ManifestPermission {name: string; maxSdkVersion?: string}
/** Parse only plain apkanalyzer XML; fail closed on ambiguous or malformed input. */
export function manifestPermissions(xml: string): ManifestPermission[] {
  if (!xml || xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY|&/i.test(xml)) throw new Error('Compiled manifest XML is missing, oversized, or unsafe.');
  const source = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*<\?xml\s[^?]*\?>/, '');
  const stack: string[] = [], permissions: ManifestPermission[] = [];
  let cursor = 0, roots = 0;
  for (const token of source.matchAll(/<[^>]*>/g)) {
    if (source.slice(cursor, token.index).trim()) throw new Error('Malformed compiled manifest XML text.');
    cursor = token.index! + token[0].length;
    const close = /^<\/([\w:.-]+)\s*>$/.exec(token[0]);
    if (close) { if (stack.pop() !== close[1]) throw new Error('Malformed compiled manifest XML nesting.'); continue; }
    const open = /^<([\w:.-]+)\b([\s\S]*?)(\/?)>$/.exec(token[0]);
    if (!open) throw new Error('Malformed compiled manifest XML tag.');
    const [, tag, raw, selfClosing] = open;
    const attributes: Record<string, string> = {};
    let consumed = 0;
    for (const attribute of raw.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/g)) {
      if (raw.slice(consumed, attribute.index).trim() || Object.hasOwn(attributes, attribute[1])) throw new Error('Ambiguous compiled manifest XML attributes.');
      attributes[attribute[1]] = attribute[3]; consumed = attribute.index! + attribute[0].length;
    }
    if (raw.slice(consumed).trim()) throw new Error('Malformed compiled manifest XML attributes.');
    if (stack.length === 0) {
      if (tag !== 'manifest' || ++roots !== 1 || (attributes.package && attributes.package !== 'com.leanstix.synced')) throw new Error('Compiled manifest package identity mismatch.');
      if (attributes['xmlns:android'] !== 'http://schemas.android.com/apk/res/android') throw new Error('Compiled manifest Android namespace is missing.');
    }
    if (/^uses-permission(?:-sdk-\d+)?$/.test(tag)) {
      if (stack.length !== 1 || stack[0] !== 'manifest' || !attributes['android:name']) throw new Error('Malformed compiled manifest permission declaration.');
      permissions.push({name: attributes['android:name'], ...(attributes['android:maxSdkVersion'] !== undefined ? {maxSdkVersion: attributes['android:maxSdkVersion']} : {})});
    }
    if (!selfClosing) stack.push(tag);
  }
  if (stack.length || roots !== 1 || source.slice(cursor).trim()) throw new Error('Truncated compiled manifest XML.');
  return permissions;
}
export function assertLegacyBluetoothBounds(xml: string, declared: string[]): void {
  const permissions = manifestPermissions(xml);
  const names = new Set([...declared, ...permissions.map(permission => permission.name)].filter(name => /^android\.permission\.BLUETOOTH(?:_ADMIN)?$/.test(name)));
  for (const name of names) {
    const matching = permissions.filter(permission => permission.name === name);
    const max = matching[0]?.maxSdkVersion;
    if (matching.length !== 1 || !max || !/^(?:\d+|0x[\da-f]+)$/i.test(max) || !Number.isSafeInteger(Number(max)) || Number(max) < 1 || Number(max) > 30) throw new Error(`Legacy Bluetooth permission needs one compiled SDK bound at Android 11 or earlier: ${name}`);
  }
}
