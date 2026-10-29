import { describe, expect, it } from 'vitest';
import { assertEvidenceSafe, comparisonFromUi, decodeXml, findUi, invitationFromUi, parseUi, shellQuote, validateSerials, type UiNode } from '../scripts/dual-android-policy.mts';
const xml = (attrs: string) => `<hierarchy><node bounds="[0,0][200,100]" enabled="true" ${attrs}/></hierarchy>`;
describe('dual Android UI parser boundaries', () => {
  it('decodes named and numeric entities without executing XML', () => expect(decodeXml('&amp;&quot;&#65;&#x42;&apos;')).toBe('&"AB\''));
  it('rejects invalid Unicode and excessive UI dumps', () => { expect(() => decodeXml('&#x110000;')).toThrow(); expect(() => parseUi('x'.repeat(2_000_001))).toThrow(); });
  it('preserves enabled state and decodes public accessibility labels', () => { const nodes = parseUi(xml('text="Save &amp; continue" content-desc="Save"')); expect(findUi(nodes, 'Save')?.text).toBe('Save & continue'); });
  it('ignores empty or malformed hit bounds', () => expect(parseUi('<hierarchy><node bounds="[0,0][0,0]"/><node bounds="bad"/></hierarchy>')).toEqual([]));
  it('does not match longer labels without an explicit prefix search', () => { const nodes = parseUi(xml('text="Reconnect to phone"')); expect(findUi(nodes, 'Reconnect')).toBeUndefined(); expect(findUi(nodes, 'Reconnect', true)).toBeDefined(); });
});
describe('dual Android secret and input boundaries', () => {
  it('keeps a complete invitation in memory and rejects ambiguous invitations', () => { const nodes = parseUi(xml('text="synced://private"')); expect(invitationFromUi(nodes)).toBe('synced://private'); expect(() => invitationFromUi([...nodes, ...parseUi(xml('text="synced://other"'))])).toThrow(); });
  it('extracts exactly six comparison digits', () => { expect(comparisonFromUi(parseUi(xml('content-desc="Comparison code: 1 2 3 4 5 6"')))).toBe('123456'); expect(() => comparisonFromUi(parseUi(xml('content-desc="Comparison code: 12345"')))).toThrow(); });
  it('refuses evidence with invitation or comparison content', () => { for (const text of ['synced://private', 'PRIVATE INVITATION', 'Comparison code: 1 2 3 4 5 6']) expect(() => assertEvidenceSafe(parseUi(xml(`text="${text}"`)))).toThrow(); assertEvidenceSafe(parseUi(xml('text="Connected"'))); });
  it('quotes shell metacharacters and blocks invalid input', () => { expect(shellQuote("a'$(touch nope)")).toBe("'a'\\''$(touch nope)'"); expect(() => shellQuote('x\0y')).toThrow(); });
  it('requires two distinct serials and rejects argument injection', () => { validateSerials('emulator-5554', 'emulator-5556'); expect(() => validateSerials('emulator-5554', 'emulator-5554')).toThrow(); expect(() => validateSerials('a; touch nope', 'b')).toThrow(); });
});

describe('Bluetooth invitation evidence privacy',()=>{
 const item=(text:string,description=''):UiNode=>({text,description,className:'',enabled:true,bounds:[0,0,100,100]});
 it.each([
  ['synced-bt://PRIVATE',''],
  ['','synced-bt://PRIVATE'],
  ['Invitation: synced-bt://PRIVATE',''],
  ['SYNCED-BT://PRIVATE',''],
  ['copied value\nsynced-bt://PRIVATE',''],
 ])('refuses Bluetooth credentials in visible text or descriptions %#',(text,description)=>{
  expect(()=>assertEvidenceSafe([item(text,description)])).toThrow('Sensitive invitation');
 });
 it('permits a public Bluetooth status without invitation credentials',()=>{
  expect(()=>assertEvidenceSafe([item('Bluetooth controls'),item('Connected')])).not.toThrow();
 });
});
