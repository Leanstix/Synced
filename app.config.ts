import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Synced',
  slug: 'synced',
  version: '0.1.0',
  scheme: 'synced',
  icon: './assets/icon.png',
  orientation: 'default',
  userInterfaceStyle: 'dark',
  android: {
    package: 'com.leanstix.synced',
    allowBackup: false,
    permissions: [
      'INTERNET', 'ACCESS_NETWORK_STATE', 'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_MEDIA_PROJECTION', 'POST_NOTIFICATIONS',
      'com.android.alarm.permission.SET_ALARM',
    ],
    blockedPermissions: [
      'android.permission.CAMERA', 'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.BLUETOOTH',
      'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  plugins: [
    'expo-dev-client',
    '@config-plugins/react-native-webrtc',
    ['@livekit/react-native-expo-plugin', {
      android: { audioType: 'media', enableScreenShareService: true },
    }],
    ['expo-build-properties', {
      android: { minSdkVersion: 26, compileSdkVersion: 36, targetSdkVersion: 36, buildToolsVersion: '36.0.0' },
    }],
  ],
};

export default config;
