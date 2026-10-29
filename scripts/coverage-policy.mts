export interface FeatureUnit {
  id: string;
  source: string;
  testFile: string;
  testPrefix: string;
  risk: string;
}
export interface FeatureLedger { version: number; minimumEdges: number; units: FeatureUnit[] }
export interface TestReport {
  success: boolean;
  testResults: { name: string; assertionResults: { fullName: string; status: string }[] }[];
}

/** Count executed passing cases, never source-code occurrences of `it(...)`. */
export function auditFeatureCoverage(ledger: FeatureLedger, report: TestReport, requiredSources: string[] = []): { id: string; passedEdges: number }[] {
  if (ledger.version !== 1 || !Number.isInteger(ledger.minimumEdges) || ledger.minimumEdges < 5 || !Array.isArray(ledger.units) || !ledger.units.length) throw new Error('Feature ledger must require at least five edges');
  if (report.success !== true || !Array.isArray(report.testResults)) throw new Error('A successful executed test report is required');
  const seen = new Set<string>();
  const selectors = new Set<string>();
  const result = ledger.units.map(unit => {
    if (!unit.id || seen.has(unit.id)) throw new Error('Feature IDs must be unique');
    seen.add(unit.id);
    if (!/^src\/.*\.tsx?$|^scripts\/.*\.mts$/.test(unit.source) || !/^tests\/.*\.test\.ts$/.test(unit.testFile) || !unit.testPrefix?.trim() || !unit.risk?.trim()) throw new Error(`Incomplete feature evidence: ${unit.id}`);
    const selector = `${unit.testFile}:${unit.testPrefix}`;
    if (selectors.has(selector)) throw new Error('Features must not duplicate an evidence selector');
    selectors.add(selector);
    const suites = report.testResults.filter(suite => suite.name.replaceAll('\\', '/').endsWith(`/${unit.testFile}`) || suite.name === unit.testFile);
    const assertions = suites.flatMap(suite => suite.assertionResults).filter(test => test.fullName.startsWith(`${unit.testPrefix} `));
    if (assertions.some(test => test.status !== 'passed')) throw new Error(`Unpassed feature evidence: ${unit.id}`);
    const passedEdges = new Set(assertions.filter(test => test.status === 'passed').map(test => test.fullName)).size;
    if (passedEdges < ledger.minimumEdges) throw new Error(`Insufficient executed edges: ${unit.id} (${passedEdges}/${ledger.minimumEdges})`);
    return { id: unit.id, passedEdges };
  });
  for (const source of requiredSources) if (!ledger.units.some(unit => unit.source === source)) throw new Error(`Source unit missing from feature ledger: ${source}`);
  return result;
}
