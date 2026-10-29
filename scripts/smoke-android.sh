#!/usr/bin/env bash
set -euo pipefail
mkdir -p smoke-evidence
(cd preview && sha256sum --check SHA256SUMS)
adb install -r preview/app-release.apk
adb logcat -c
adb shell am start -W -n com.leanstix.synced/.MainActivity | node scripts/redact-release-log.mts > smoke-evidence/activity.txt
for attempt in $(seq 1 12); do
  adb shell uiautomator dump /sdcard/synced-window.xml >/dev/null
  adb shell cat /sdcard/synced-window.xml | node scripts/redact-release-log.mts > smoke-evidence/window.xml
  if grep -q 'YOUR PHONES. TOGETHER.' smoke-evidence/window.xml; then
    adb exec-out screencap -p > smoke-evidence/launch.png
    adb logcat -d '*:E' | node scripts/redact-release-log.mts > smoke-evidence/logcat.txt
    echo 'Synced pairing screen is visible on Android 15.'
    exit 0
  fi
  sleep 2
done
adb exec-out screencap -p > smoke-evidence/launch.png
adb logcat -d '*:E' | node scripts/redact-release-log.mts > smoke-evidence/logcat.txt
echo 'Pairing screen did not appear; inspect launch evidence.' >&2
exit 1
