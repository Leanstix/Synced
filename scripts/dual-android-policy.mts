/** UI-only harness helpers. Invitation/code values remain in memory, never evidence. */
export interface UiNode { text: string; description: string; className: string; enabled: boolean; bounds: [number, number, number, number] }
export function decodeXml(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, entity => {
    const named: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (named[entity]) return named[entity];
    const code = entity.startsWith('&#x') ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
    if (code > 0x10ffff || code < 0 || (code >= 0xd800 && code <= 0xdfff)) throw new Error('Invalid XML character.');
    return String.fromCodePoint(code);
  });
}
export function parseUi(xml: string): UiNode[] {
  if (xml.length > 2_000_000 || !xml.includes('<hierarchy')) throw new Error('Android UI hierarchy unavailable.');
  const nodes: UiNode[] = [];
  for (const match of xml.matchAll(/<node\b([^>]*?)(?:\/?>)/g)) {
    const attrs: Record<string, string> = {};
    for (const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[attr[1]] = decodeXml(attr[2]);
    const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(attrs.bounds ?? '');
    if (!bounds) continue;
    const [left, top, right, bottom] = bounds.slice(1).map(Number);
    if (right <= left || bottom <= top) continue;
    nodes.push({ text: attrs.text ?? '', description: attrs['content-desc'] ?? '', className: attrs.class ?? '', enabled: attrs.enabled !== 'false', bounds: [left, top, right, bottom] });
  }
  return nodes;
}
export function findUi(nodes: UiNode[], label: string, prefix = false): UiNode | undefined {
  return nodes.find(node => [node.text, node.description].some(value => prefix ? value.startsWith(label) : value === label));
}
export function invitationFromUi(nodes: UiNode[]): string {
  const values = nodes.flatMap(node => [node.text, node.description]).filter(value => /^synced:\/\/\S+$/.test(value));
  const unique = [...new Set(values)];
  if (unique.length !== 1 || unique[0].length > 4096) throw new Error('One complete invitation must be visible.');
  return unique[0];
}
export function comparisonFromUi(nodes: UiNode[]): string {
  const values = nodes.filter(node => node.description.startsWith('Comparison code:')).map(node => node.description.slice('Comparison code:'.length).replace(/\s/g, ''));
  if (values.length !== 1 || !/^\d{6}$/.test(values[0])) throw new Error('A six-digit comparison code must be visible.');
  return values[0];
}
export function assertEvidenceSafe(nodes: UiNode[]): void {
  if (nodes.some(node => /synced:\/\/|Comparison code:|PRIVATE INVITATION/i.test(`${node.text} ${node.description}`))) throw new Error('Sensitive invitation or comparison UI is visible; evidence capture refused.');
}
export function shellQuote(value: string): string {
  if (value.includes('\0') || value.length > 8192) throw new Error('Invalid Android input value.');
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
export function validateSerials(host: string, controller: string): void {
  if (!/^(?:emulator-\d+|[\w.:-]+)$/.test(host) || !/^(?:emulator-\d+|[\w.:-]+)$/.test(controller) || host === controller) throw new Error('Two distinct Android device serials are required.');
}
