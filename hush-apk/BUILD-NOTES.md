# HuSH APK — build notes (LOCAL ONLY — contains the keystore password)

- Keystore: `hush-release.keystore` (in this folder), alias `hush`
- Keystore password: 5b6e67ca24d334f4e6fac06c
- Key password: 5b6e67ca24d334f4e6fac06c (same)
- Cert: CN=HuSH, O=GhostTech, RSA 2048, validity 10000 days
- Package: com.ghosttech.hush — versionCode 1 — versionName 1.0.0 (v1.0; superseded below)

## v1.1.0 (versionCode 2) — 2026-10-15 late evening
- Rebuilt from repo commit 0442464 (HuSH Social + Cypher Rooms v1) so the
  APK now includes the Cypher Rooms frontend (first APK predated cypher).
  Frontend rebuilt with VITE_HUSH_API=https://hush-5i33.onrender.com,
  synced via npx cap sync android, gradle assembleRelease --offline.
- NEW launcher icon: the v1.0 APK shipped the default Capacitor template
  glyph; v1.1 ships a real HuSH icon — white ghost with a green
  finger-to-lips "shh" over its mouth, near-black green-tinted background
  (#090D0A), drawn for mdpi→xxxhdpi (legacy + round + adaptive foreground).
  Generator script + 1024px master kept in hush-apk/icon-src/.
- Deliverable: ~/workspace/your_files/HuSH-Social-v1.1.apk
  Size 3,241,783 B · MD5 4d9f67cd9660da18afc1f04fb4a20054 ·
  SHA-256 44de045b7c593710264fd45937906eec4b076c070642a3e88cbeb61d371ccd9c
- Same keystore as v1.0 (signer cert SHA-256
  23261d1feb60cb9051bf9a6439e6c2c87d14eda4c1012b85ba855b6f80c0ea7f) —
  apksigner verified; installs as a clean upgrade over v1.0.
  Bundled JS string-verified: "cypher" present (full cypher-* wire
  protocol), production URL present.
- Build: npx cap sync android, then gradle assembleRelease from android/
  with JAVA_HOME=/home/hatch/workspace/jdk21, ANDROID_HOME=/home/hatch/android-sdk,
  GRADLE_USER_HOME=/home/hatch/.gradle, GRADLE_OPTS=-Djava.net.preferIPv4Stack=true,
  using /home/hatch/gradle-8.14.3/bin/gradle (not ./gradlew).
- The frontend bundle in www/ was built with
  VITE_HUSH_API=https://hush-5i33.onrender.com (production backend).
- KEEP THIS KEYSTORE: future HuSH updates must be signed with it or
  Android will refuse to install them over this build.

## v1.1.1 (versionCode 3) — 2026-10-15 night
- ICON FIX ONLY (Daniel rejected the v1.1 ghost icon). New spec, verbatim:
  the HuSH icon is "lips with finger" — a bold pair of lips with a finger
  pressed vertically over their center (the shush gesture), NO ghost —
  plus the word "HuSH" spelled exactly H-u-S-H as bold text beneath the
  motif. Same near-black green-tinted background (#090D0A, unchanged
  adaptive background color). Crimson lips, skin-tone finger with
  fingernail, near-white wordmark; reads at 48px (checked on a
  192/48 check sheet before building).
- Artwork: generator hush-apk/icon-src/make_hush_icon_v2.py (parametric,
  PIL, 4x supersample); master hush-apk/icon-src/hush-icon-master-v2-1024.png.
  The rejected ghost master was kept, renamed hush-icon-master-ghost-1024.png
  (generator make_hush_icon_ghost.py). Standalone preview of the final
  icon: ~/workspace/your_files/hush-icon-v2.png.
- Deliverable: ~/workspace/your_files/HuSH-Social-v1.1.1.apk
  Size 3,267,043 B · MD5 d90173ed9a8896e10fde403500a1c53f ·
  SHA-256 17f3640e717f1d5d4df1b11d3cae0b12f69cae408194ccc52b99d85c0ad1134d
- Same keystore: apksigner verifies (v2 scheme), signer cert SHA-256
  23261d1feb60cb9051bf9a6439e6c2c87d14eda4c1012b85ba855b6f80c0ea7f —
  identical to v1.0/v1.1, clean upgrade. aapt badging: versionCode 3 /
  versionName 1.1.1, label "HuSH".
- Bundled JS unchanged from v1.1 (same bundle): "cypher" present,
  production URL hush-5i33.onrender.com present.
- Icon verified FROM THE BUILT APK: extracted the adaptive foreground
  (432px), legacy (192px) and round (192px) resources and viewed them —
  all show the lips + finger + "HuSH" design, the round one fully
  inside the circle with nothing clipped.
- Build: same recipe as v1.1 (npx cap sync android; gradle
  assembleRelease --offline from android/). Git untouched.

## v1.1.2 (versionCode 4) — 2026-10-15 late night
- BEAUTY PASS + AVATAR MENAGERIE + GHOSTSUITE CHROME ALIGNMENT.
  Frontend: avatars fully re-rendered with gradients/shading (glossy
  eyes, drawn accessories, radial backdrops) and a new `kind` dimension —
  human (default; old specs untouched) plus ghost, skull, robot, cat,
  wolf, alien, dragon, pumpkin, each with its own body color, top-detail
  names and accent slot, all exposed in the Avatar Lab. App chrome aligned
  to GhostSuite's component language (floating glass topbar, icon-tile
  drawer rows with active wash + edge bar, tiled bottom nav with active
  glow, gradient-border cards, eyebrow section headers, pulsing presence
  dot) in HuSH's own crimson/pink on near-black. All 8 profile themes got
  card gradients. Room members and message authors are now tappable →
  straight into the existing 1:1 DM (no backend routing changes).
  Backend: validateAvatar passes kind/kindColor through (additive,
  defaults human) — NOTE: kind persistence needs the next Render manual
  deploy; until then the old backend drops kind/kindColor and avatars
  save as human-spec exactly as before (no errors).
- ICON v3 — Daniel's ORIGINAL icon restored (he supplied the original:
  his Vercel project avatar, kept at icon-src/hush-icon-original-reference.png).
  Black circle field, glossy hot-pink/red photorealistic lips, a glossy
  RED hand in the shh gesture over the lips' center, "HuSH" serif across
  the bottom (H+u white, S+H hot pink). Recreation was image-generated
  from the reference; master icon-src/hush-icon-master-v3-1024.png,
  density set regenerated by icon-src/make_hush_icon_v3.py; adaptive
  background color now pure black #000000 (was #090D0A) to match the
  circle's field. Icon verified FROM THE BUILT APK: extracted the 432px
  adaptive foreground (composited on black), 192px legacy and round —
  all read as the original. Preview: ~/workspace/your_files/hush-icon-v3.png.
- Deliverable: ~/workspace/your_files/HuSH-Social-v1.1.2.apk
  Size 3,385,967 B · MD5 0a5ee5a4640c4b24e337e8042330889f ·
  SHA-256 91e29f8a567d7ff5e5fc4b811694346bb40a054d0f0c40a491106c0762eb2c69
- Same keystore: apksigner verifies, signer cert SHA-256
  23261d1feb60cb9051bf9a6439e6c2c87d14eda4c1012b85ba855b6f80c0ea7f —
  identical to v1.0–v1.1.1, clean upgrade. aapt badging: versionCode 4 /
  versionName 1.1.2, package com.ghosttech.hush.
- Bundled JS verified in the APK assets: production URL
  hush-5i33.onrender.com present, "cypher" present (15 hits),
  menagerie present ("pumpkin").
- Verified before build: vite production build clean; 1,400 avatar spec
  renders (all kinds × slots + legacy/garbage specs) with 0 failures;
  menagerie contact sheet eyeballed (hair-cap, skull-mohawk and dragon
  horn fixes landed from that check).
- Build: same recipe as v1.1 (frontend build with
  VITE_HUSH_API=https://hush-5i33.onrender.com, dist copied to
  hush-apk/www, npx cap sync android, gradle assembleRelease --offline).

## v1.2.0 (versionCode 5) — 2026-10-16
- SAFETY + PRIVACY + INTEGRITY release (repo commit 641a6a2 + this
  version bump). Backend (needs Daniel's Render Manual Deploy to go
  live): DM requests with accept/deny + Requests inbox; DM video call
  invites with server-side policy checks; server-persisted block with
  full severance (DM/follow/feed/People/signaling); mic mute
  (track-level, signaled) + camera blackout (track off + signaled
  blacked-out tile); Confidants (mutual follows) + The Inner Five;
  privacy prefs (who can DM / call / see profile) enforced REST + WS;
  invisible presence (server never broadcasts you); account-level
  video OFF (text-only accounts, cypher listening kept); registration
  integrity (one account per email + per phone, grandfathered bind);
  permanent dupe bans with IP evidence + ADMIN_HANDLES admin lane;
  anti-scam signal module (warning → ban ladder, fee-to-release
  weighted, opener-trio instant ban); moderation log with IP evidence
  on every flag. Frontend: matching UI everywhere above + Site Rules /
  Privacy Policy / Terms of Use v1.0 in-app (bundled from
  hush-frontend/src/legal/, also served from public/legal/) with a
  recorded agree step at registration and a one-time prompt for
  existing accounts.
- Icon UNCHANGED (v3 original recreation, same as v1.1.2).
- Deliverable: ~/workspace/your_files/HuSH-Social-v1.2.0.apk
  Size 3,405,279 B · MD5 d53e69016d298fb28e654dbc391e208b ·
  SHA-256 f3ae02be6199b5ce2b0a4ae2c4601c444f06462dde1021fe626498263ce1a384
- Same keystore: apksigner verifies, signer cert SHA-256
  23261d1feb60cb9051bf9a6439e6c2c87d14eda4c1012b85ba855b6f80c0ea7f —
  identical to v1.0–v1.1.2, clean upgrade. aapt badging: versionCode 5 /
  versionName 1.2.0, package com.ghosttech.hush.
- Bundled JS verified in the APK assets: production URL
  hush-5i33.onrender.com present, "cypher" present, "Confidants",
  "Inner Five", "call-invite", "rtc-blackout", "dm-request",
  "Site Rules" / "Privacy Policy" all present.
- Verified before build: backend headless suite
  backend/tests/run-tests.js — 111 assertions, all passing (REST + WS
  against an isolated instance); node --check clean on server.js +
  antiscam.js; vite production build clean.
- NOT yet live-verified: the v1.2.0 backend needs Daniel's Render
  Manual Deploy; two-device camera-to-camera remains the one piece no
  headless test can eyeball.
- Build: same recipe as v1.1 (frontend build with
  VITE_HUSH_API=https://hush-5i33.onrender.com, dist copied to
  hush-apk/www, npx cap sync android, gradle assembleRelease --offline).
