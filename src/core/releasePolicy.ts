export type ReleaseProfile = 'preview' | 'production';
export interface ReleasePolicy {
  profile: ReleaseProfile;
  channel: ReleaseProfile;
  versionCode: number;
  abis: string[];
}

/** Fail before generating a native project when release intent is ambiguous. */
export function resolveReleasePolicy(env: Record<string, string | undefined>): ReleasePolicy {
  const requested = env.EAS_BUILD_PROFILE ?? env.APP_ENV ?? 'preview';
  if (requested !== 'preview' && requested !== 'production') throw new Error('Unsupported release profile');
  if (env.APP_ENV && env.APP_ENV !== requested) throw new Error('Release environment and profile disagree');
  if (requested === 'production' && env.APP_ENV !== 'production') throw new Error('Production requires explicit APP_ENV=production');
  if (env.RELEASE_CHANNEL && env.RELEASE_CHANNEL !== requested) throw new Error('Release channel and profile disagree');
  const rawVersion = env.ANDROID_VERSION_CODE ?? '1';
  if (!/^[1-9]\d*$/.test(rawVersion)) throw new Error('Android version code must be a positive integer');
  const versionCode = Number(rawVersion);
  if (!Number.isSafeInteger(versionCode) || versionCode > 2_100_000_000) throw new Error('Android version code exceeds Play limit');
  const abis = (env.ANDROID_ABIS ?? 'arm64-v8a,x86_64').split(',');
  if (!abis.length || abis.some(abi => !['arm64-v8a', 'x86_64'].includes(abi)) || new Set(abis).size !== abis.length) {
    throw new Error('Android ABIs must be unique supported 64-bit targets');
  }
  if (requested === 'production' && !abis.includes('arm64-v8a')) throw new Error('Production requires arm64-v8a');
  return { profile: requested, channel: requested, versionCode, abis };
}

export interface SigningIntent {
  profile: ReleaseProfile;
  credentialsSource: string;
  buildType: string;
  distribution: string;
  developmentClient?: boolean;
  gradleCommand?: string;
}

/** Production is exclusively EAS-managed; local debug fallback is never accepted. */
export function validateSigningIntent(intent: SigningIntent): void {
  if (intent.credentialsSource !== 'remote') throw new Error('Release profiles require EAS-managed remote credentials');
  if (intent.developmentClient) throw new Error('Release profiles cannot be development clients');
  if (intent.gradleCommand) throw new Error('Custom Gradle commands may bypass release signing policy');
  if (intent.profile === 'production') {
    if (intent.buildType !== 'app-bundle' || intent.distribution !== 'store') throw new Error('Production requires store AAB');
  } else if (intent.buildType !== 'apk' || intent.distribution !== 'internal') throw new Error('Preview requires internal APK');
}
