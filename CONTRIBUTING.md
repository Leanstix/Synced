# Working on Synced

The application is React Native and strict TypeScript. Use Java only for Android platform adapters. Keep authored Kotlin application code out of this project. Use Node24, JDK17, and the Android toolchain pinned in the README and Gradle wrapper.

Run `npm ci`, `npm run typecheck`, `npm run lint`, and `npm test`. For native changes, run `cd android && ./gradlew testDebugUnitTest lintDebug assemblePreview`. Install the preview on both phones when capture, input, lifecycle, permissions, or network behavior changes.

Keep changes small and describe the actual behavior changed. Development micro-commits can establish a model, implement a bounded operation, add a lifecycle guard, define a view, or document a constraint. The integration head is the validation target; intermediate development commits are not standalone releases.

Never commit live invitations, private screenshots, message contents, signing keys, keystores, credentials, node_modules, SDK paths, Metro bundles, or build output. Use fabricated data in tests. Preserve package-lock.json so installs remain reproducible.

A shared network does not authenticate a peer. Transport changes must preserve explicit host approval, capture consent, control consent, bounded allocation, session IDs, replay checks, and revocation. Protocol changes need negative tests and a compatibility/version decision.

Remote input must remain tied to a live approved capture. Do not add automatic permission-granting, device-authentication bypasses, invisible capture, or actions that remotely approve Synced's own dialogs.

Show observed state. Do not invent paired devices, latency, frame rate, battery percentages, alarm completion, or call support. Dispatching an intent is different from confirming another app completed it.

