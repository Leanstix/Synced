import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { auditFeatureCoverage, type FeatureLedger, type TestReport } from './coverage-policy.mts';

const reportPath = process.argv[2];
if (!reportPath) throw new Error('Usage: check-feature-coverage.mts <vitest-json-report>');
const sources = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', 'src/core', 'src/controller'], { encoding: 'utf8' }).split('\0').filter(path => /\.tsx?$/.test(path));
const ledger = JSON.parse(readFileSync('docs/release-feature-edges.json', 'utf8')) as FeatureLedger;
const report = JSON.parse(readFileSync(reportPath, 'utf8')) as TestReport;
const counts = auditFeatureCoverage(ledger, report, [...new Set(sources)]);
console.log(JSON.stringify({ minimumEdges: ledger.minimumEdges, features: counts }, null, 2));
