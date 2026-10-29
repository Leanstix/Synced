import { readFileSync } from 'node:fs';
import { validateEasConfiguration } from './release-config.mts';
import { resolveReleasePolicy } from '../src/core/releasePolicy.ts';

validateEasConfiguration(JSON.parse(readFileSync('eas.json', 'utf8')));
const policy = resolveReleasePolicy(process.env);
console.log(`Release policy passed: ${policy.profile}, version ${policy.versionCode}, ABIs ${policy.abis.join(',')}; remote production signing required.`);
