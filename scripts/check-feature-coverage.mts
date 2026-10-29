import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { auditFeatureCoverage, type FeatureLedger, type TestReport } from './coverage-policy.mts';

const reportPath = process.argv[2];
if (!reportPath) throw new Error('Usage: check-feature-coverage.mts <vitest-json-report>');
const sources = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', 'src/core', 'src/controller'], { encoding: 'utf8' }).split('\0').filter(path => /\.tsx?$/.test(path));
const ledger = JSON.parse(readFileSync('docs/release-feature-edges.json', 'utf8')) as FeatureLedger;
const report = JSON.parse(readFileSync(reportPath, 'utf8')) as TestReport;
const evidenceFiles = new Set(['docs/release-feature-edges.json', ...sources, ...ledger.units.flatMap(unit => [unit.source, unit.testFile])]);
const latestSourceTime = Math.max(...[...evidenceFiles].map(path => statSync(path).mtimeMs));
const counts = auditFeatureCoverage(ledger, report, [...new Set(sources)], latestSourceTime);
console.log(JSON.stringify({ minimumEdges: ledger.minimumEdges, features: counts }, null, 2));
