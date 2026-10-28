import type { ExpoConfig } from 'expo/config';
import { AndroidConfig, withStringsXml } from 'expo/config-plugins';

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
      android: {
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
    { $: { name: 'accessibility_service_description' }, _: 'Synced uses Accessibility to read the active app and perform taps, swipes, navigation, and typing when you allow a paired phone to control this device. Screen video is sent to that phone over your local network. Stop control or disconnect in Synced to end access. Do not share sensitive apps or password fields.' },
    { $: { name: 'media_projection_notification_title' }, _: 'Synced is sharing your screen' },
    { $: { name: 'media_projection_notification_text' }, _: 'Your approved phone can see this screen. Open Synced to stop sharing.' },
  ], mod.modResults);
  return mod;
});
