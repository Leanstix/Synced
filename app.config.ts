import type { ExpoConfig } from 'expo/config';
import { AndroidConfig, withStringsXml } from 'expo/config-plugins';
import { resolveReleasePolicy } from './src/core/releasePolicy';

const release = resolveReleasePolicy(process.env);

const config: ExpoConfig = {
  name: 'Synced',
  slug: 'synced',
  version: '0.2.0',
  scheme: 'synced',
  icon: './assets/icon.png',
  orientation: 'default',
  userInterfaceStyle: 'dark',
  android: {
    package: 'com.leanstix.synced',
    allowBackup: false,
    versionCode: release.versionCode,
    permissions: [
      'INTERNET', 'ACCESS_NETWORK_STATE', 'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_MEDIA_PROJECTION', 'POST_NOTIFICATIONS',
      'com.android.alarm.permission.SET_ALARM',
      'RECORD_AUDIO', 'BLUETOOTH_CONNECT', 'BLUETOOTH_SCAN', 'BLUETOOTH_ADVERTISE',
    ],
    blockedPermissions: [
      'android.permission.CAMERA', 'android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  plugins: [
    'expo-dev-client',
    ['expo-secure-store', { configureAndroidBackup: true }],
    '@config-plugins/react-native-webrtc',
    ['@livekit/react-native-expo-plugin', {
      android: { audioType: 'media', enableScreenShareService: true },
    }],
    ['expo-build-properties', {
      android: {
        buildArchs: release.abis,
        minSdkVersion: 26, compileSdkVersion: 37, targetSdkVersion: 36, buildToolsVersion: '37.0.0',
        // The prefixed WebRTC AAR omits a generated class used only by its
        // unused custom-class-loader setter. Normal JNI initialization uses
        // the default loader and does not reference this class.
        extraProguardRules: '-dontwarn livekit.org.jni_zero.JniZeroJni',
      },
    }],
  ],
};

// Override dependency metadata in generated resources, without native code.
export default withStringsXml(config, mod => {
  mod.modResults = AndroidConfig.Strings.setStringItem([
    { $: { name: 'accessibility_service_label' }, _: 'Synced remote control' },
    { $: { name: 'accessibility_service_description' }, _: 'Synced uses Accessibility to read the active app and perform taps, swipes, navigation, and typing when you allow a paired phone to control this device. Screen video is sent over your local Wi-Fi network. Bluetooth control can work without a screen preview after separate approval. The optional Synced voice link requests microphone consent separately; it does not forward cellular call audio. Stop control or disconnect in Synced to end access. Do not share sensitive apps or password fields.' },
    { $: { name: 'media_projection_notification_title' }, _: 'Synced is sharing your screen' },
    { $: { name: 'media_projection_notification_text' }, _: 'Your approved phone can see this screen. Open Synced to stop sharing.' },
  ], mod.modResults);
  return mod;
});
