#!/usr/bin/env bash
set -euo pipefail
mkdir -p smoke-evidence
adb install -r preview/app-release.apk
adb logcat -c
adb shell am start -W -n com.leanstix.synced/.MainActivity
for attempt in $(seq 1 12); do
  adb shell uiautomator dump /sdcard/synced-window.xml >/dev/null
  adb pull /sdcard/synced-window.xml smoke-evidence/window.xml >/dev/null
  if grep -q 'YOUR PHONES. TOGETHER.' smoke-evidence/window.xml; then
    adb exec-out screencap -p > smoke-evidence/launch.png
    adb logcat -d > smoke-evidence/logcat.txt
    echo 'Synced pairing screen is visible on Android 15.'
    exit 0
  fi
  sleep 2
done
adb exec-out screencap -p > smoke-evidence/launch.png
adb logcat -d > smoke-evidence/logcat.txt
echo 'Pairing screen did not appear; inspect launch evidence.' >&2
exit 1
