# Validation status

This file records evidence for the React Native/TypeScript implementation. It does not reuse the superseded Kotlin prototype's Android-build result.

## Completed locally

- `npm ci`: dependency installation succeeded; package-lock.json pins the dependency graph.
- `npm run typecheck`: strict TypeScript checking passed.
- `npm run lint -- --quiet`: ESLint passed with no errors.
- `npm test -- --silent`:18tests passed across the session hook and viewport geometry.
- Direct JDK17 compilation and JUnit4 execution of the Java protocol classes:30tests passed, including6real loopback socket tests.
- Source inspection confirms no authored `.kt` or `.kts` application files.

The JavaScript tests cover local consent before control, invalid gesture/action/text rejection, subscription cleanup, delayed initial-state races, stale-session frame rejection, capture-stop clearing, letterbox mapping, and layout edge cases. Java tests cover authentication/tampering, directional keys, strict sequence/replay rejection, allocation limits, approval decisions, framing, and bidirectional encrypted sockets.

## Android integration build

A full React Native Android build requires React Native's native dependencies, Android Gradle Plugin9.2.1, SDK37, NDK27.1, and CMake. Local Gradle dependency resolution was blocked by the execution environment's network policy. Offline resolution confirmed a missing build dependency; it did not reveal an application compilation result.

