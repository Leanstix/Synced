import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sourceViolations } from './source-policy.mts';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const invalid = sourceViolations(files.map(path => ({ path, text: /\.(?:[cm]?[jt]sx?|json|env|txt|md)$/.test(path) ? readFileSync(path, 'utf8') : undefined })));
if (invalid.length) throw new Error(`Application source must stay in TypeScript; rejected: ${invalid.join(', ')}`);
console.log('Source boundary passed: no authored native projects, native source, or custom bridges.');
