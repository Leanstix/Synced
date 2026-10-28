# Working on Synced

The application is React Native and strict TypeScript. Use Java only for Android platform adapters. Keep authored Kotlin application code out of this project. Use Node24, JDK17, and the Android toolchain pinned in the README and Gradle wrapper.

Run `npm ci`, `npm run typecheck`, `npm run lint`, and `npm test`. For native changes, run `cd android && ./gradlew testDebugUnitTest lintDebug assemblePreview`. Install the preview on both phones when capture, input, lifecycle, permissions, or network behavior changes.

