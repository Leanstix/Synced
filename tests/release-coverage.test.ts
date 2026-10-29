import { describe, expect, it } from 'vitest';
import { auditFeatureCoverage, type FeatureLedger, type TestReport } from '../scripts/coverage-policy.mts';

const ledger = (): FeatureLedger => ({ version: 1, minimumEdges: 5, units: [{ id: 'transport', source: 'src/core/transport.ts', testFile: 'tests/transport.test.ts', testPrefix: 'transport edges', risk: 'Untrusted peer input' }] });
const report = (): TestReport => ({ success: true, testResults: [{ name: '/repo/tests/transport.test.ts', assertionResults: Array.from({ length: 5 }, (_, index) => ({ fullName: `transport edges scenario ${index}`, status: 'passed' })) }] });
describe('release feature edge ledger', () => {
  it('counts five executed passing edges for a source unit', () => expect(auditFeatureCoverage(ledger(), report(), ['src/core/transport.ts'])).toEqual([{ id: 'transport', passedEdges: 5 }]));
  it('rejects fewer than five and a weakened minimum', () => {
    const value = report(); value.testResults[0].assertionResults.pop();
    expect(() => auditFeatureCoverage(ledger(), value)).toThrow('Insufficient');
    expect(() => auditFeatureCoverage({ ...ledger(), minimumEdges: 4 }, report())).toThrow('at least five');
  });
  it('rejects failures, skipped cases, and pending reports', () => {
    expect(() => auditFeatureCoverage(ledger(), { ...report(), success: false })).toThrow('successful');
    for (const status of ['failed', 'pending', 'skipped', 'todo']) {
      const value = report(); value.testResults[0].assertionResults[0].status = status;
      expect(() => auditFeatureCoverage(ledger(), value)).toThrow('Unpassed');
    }
  });
  it('does not count repeated names as independent edges', () => {
    const value = report(); value.testResults[0].assertionResults[4].fullName = value.testResults[0].assertionResults[0].fullName;
    expect(() => auditFeatureCoverage(ledger(), value)).toThrow('4/5');
  });
  it('does not accept matching tests from a different test file or suite', () => {
    const wrongFile = report(); wrongFile.testResults[0].name = '/repo/tests/unrelated.test.ts';
    expect(() => auditFeatureCoverage(ledger(), wrongFile)).toThrow('0/5');
    const wrongSuite = report(); wrongSuite.testResults[0].assertionResults.forEach(test => { test.fullName = `transport edgesExtra ${test.fullName}`; });
    expect(() => auditFeatureCoverage(ledger(), wrongSuite)).toThrow('0/5');
  });
  it('rejects new implementation sources without a ledger entry', () => {
    expect(() => auditFeatureCoverage(ledger(), report(), ['src/core/newFeature.ts'])).toThrow('missing');
  });
  it('rejects duplicate feature identities and duplicated evidence selectors', () => {
    const value = ledger(); value.units.push({ ...value.units[0] });
    expect(() => auditFeatureCoverage(value, report())).toThrow('unique');
    value.units[1].id = 'other';
    expect(() => auditFeatureCoverage(value, report())).toThrow('selector');
  });
  it('requires a risk statement and an exact suite prefix', () => {
    const value = ledger(); value.units[0].risk = '';
    expect(() => auditFeatureCoverage(value, report())).toThrow('Incomplete');
  });
  it('rejects old or untimestamped reports when current source times are supplied', () => {
    expect(() => auditFeatureCoverage(ledger(), { ...report(), startTime: 99 }, [], 100)).toThrow('predates');
    expect(() => auditFeatureCoverage(ledger(), report(), [], 100)).toThrow('predates');
    expect(() => auditFeatureCoverage(ledger(), { ...report(), startTime: 100 }, [], 100)).not.toThrow();
  });
  it('combines multiple named suites without counting overlap twice', () => {
    const value = ledger(); value.units[0].testPrefix = ['transport edges', 'transport'];
    expect(auditFeatureCoverage(value, report())[0].passedEdges).toBe(5);
  });
  it('rejects path traversal and an empty suite selector', () => {
    const value = ledger(); value.units[0].source = 'src/../../private.ts';
    expect(() => auditFeatureCoverage(value, report())).toThrow('Incomplete');
    value.units[0].source = 'src/core/transport.ts'; value.units[0].testPrefix = [];
    expect(() => auditFeatureCoverage(value, report())).toThrow('Incomplete');
  });
});

describe('release feature edge ledger colocated UI evidence', () => {
  const uiEvidence = () => {
    const l = ledger(); l.units[0].source = 'src/ui/deviceState.ts'; l.units[0].testFile = 'src/ui/deviceState.test.ts';
    const r = report(); r.testResults[0].name = '/repo/src/ui/deviceState.test.ts'; return { l, r };
  };
  it('counts colocated UI tests for a UI feature', () => { const { l, r } = uiEvidence(); expect(auditFeatureCoverage(l, r)[0].passedEdges).toBe(5); });
  it('accepts resolved Expo configuration evidence', () => { const l = ledger(); l.units[0].source = 'app.config.ts'; expect(auditFeatureCoverage(l, report())).toHaveLength(1); });
  it('accepts configuration metadata helper evidence', () => { const l = ledger(); l.units[0].source = 'config/androidPermissions.ts'; expect(auditFeatureCoverage(l, report())).toHaveLength(1); });
  it('rejects UI test traversal', () => { const { l, r } = uiEvidence(); l.units[0].testFile = 'src/ui/../private.test.ts'; expect(() => auditFeatureCoverage(l, r)).toThrow('Incomplete'); });
  it('does not substitute a same-named tests-folder result for UI evidence', () => { const { l, r } = uiEvidence(); r.testResults[0].name = '/repo/tests/deviceState.test.ts'; expect(() => auditFeatureCoverage(l, r)).toThrow('0/5'); });
});
