import { resolveReleasePolicy, validateSigningIntent, type ReleaseProfile } from '../src/core/releasePolicy.ts';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected release configuration object');
  return value as Record<string, unknown>;
}

export function validateEasConfiguration(input: unknown): void {
  const config = record(input);
  if (record(config.cli).appVersionSource !== 'remote') throw new Error('EAS must manage production version codes remotely');
  const builds = record(config.build);
  if (Object.keys(builds).some(name => !['preview', 'production'].includes(name))) throw new Error('Unreviewed EAS build profile');
  for (const profile of ['preview', 'production'] as ReleaseProfile[]) {
    const build = record(builds[profile]);
    const android = record(build.android);
    const env = record(build.env);
    if (build.extends) throw new Error('Release profiles must declare signing settings directly');
    if (typeof build.node !== 'string' || !/^24\.\d+\.\d+$/.test(build.node)) throw new Error('Expo 58 requires the pinned Node 24 release line');
    if (build.channel !== profile || build.environment !== profile || env.APP_ENV !== profile) throw new Error('EAS channel or environment mismatch');
    resolveReleasePolicy({ EAS_BUILD_PROFILE: profile, APP_ENV: String(env.APP_ENV) });
    if (profile === 'production' && build.autoIncrement !== true) throw new Error('Production must auto-increment version codes');
    if (build.withoutCredentials) throw new Error('Unsigned builds are prohibited');
    validateSigningIntent({
      profile, credentialsSource: String(build.credentialsSource), buildType: String(android.buildType),
      distribution: String(build.distribution), developmentClient: build.developmentClient === true,
      gradleCommand: typeof android.gradleCommand === 'string' ? android.gradleCommand : undefined,
    });
  }
}
