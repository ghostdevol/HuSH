# HuSH APK — build notes (LOCAL ONLY — contains the keystore password)

- Keystore: `hush-release.keystore` (in this folder), alias `hush`
- Keystore password: 5b6e67ca24d334f4e6fac06c
- Key password: 5b6e67ca24d334f4e6fac06c (same)
- Cert: CN=HuSH, O=GhostTech, RSA 2048, validity 10000 days
- Package: com.ghosttech.hush — versionCode 1 — versionName 1.0.0
- Build: npx cap sync android, then gradle assembleRelease from android/
  with JAVA_HOME=/home/hatch/workspace/jdk21, ANDROID_HOME=/home/hatch/android-sdk,
  GRADLE_USER_HOME=/home/hatch/.gradle, GRADLE_OPTS=-Djava.net.preferIPv4Stack=true,
  using /home/hatch/gradle-8.14.3/bin/gradle (not ./gradlew).
- The frontend bundle in www/ was built with
  VITE_HUSH_API=https://hush-5i33.onrender.com (production backend).
- KEEP THIS KEYSTORE: future HuSH updates must be signed with it or
  Android will refuse to install them over this build.
