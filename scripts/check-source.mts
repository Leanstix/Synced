import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const invalid = files.filter(path => /\.(java|kt|kts|swift|m|mm)$/.test(path) || /^(android|ios)\//.test(path));
for (const path of files.filter(path => /^(src\/.*|App|index)\.tsx?$/.test(path))) {
  if (/\b(NativeModules|TurboModuleRegistry)\b/.test(readFileSync(path, 'utf8'))) invalid.push(path);
}
if (invalid.length) throw new Error(`Application source must stay in TypeScript; rejected: ${invalid.join(', ')}`);
console.log('Source boundary passed: no authored native projects, native source, or custom bridges.');
