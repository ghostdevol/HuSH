# HuSH Social Upgrade — 2026-10-15

HuSH grew from open chat rooms into a small social app: accounts, a
feed, follows, DMs, buildable MySpace-style profile pages with themes,
a photo bucket, profile music, a built-avatar system, and real WebRTC
video chat (the old "Go Live" was local preview only — nobody could
see anybody; now they can). Packaged as a signed Android APK.

**Production backend (verbatim from the frontend source):**
`https://hush-5i33.onrender.com` — WebSocket: `wss://hush-5i33.onrender.com/ws`
The web app and the APK both talk to this URL.

---

## Backend — `backend/server.js` (Express + ws, no new dependencies)

Original behavior preserved: `POST /createRoom`, `GET /rooms`, WS room
chat at `/ws` (join/leave/msg/system), `/health` (now also reports
users/posts/photos/tracks/online counts). DM rooms are a naming
convention — `dm:<handleA>:<handleB>` (handles sorted) — rooms were
already generic, so no special server code was needed.

### Accounts & social (new)
- `POST /auth/register`, `POST /auth/login` — handle + password,
  scrypt-hashed (Node stdlib `crypto`), token = random hex, sessions
  in memory, token sent as the `x-hush-token` header.
- `GET /me`, `PUT /me` — own profile, every field below round-trips.
- `GET /users` (list + follow state), `GET /users/:handle` (public
  profile + counts + follow state).
- `POST /users/:handle/follow` — toggle.
- `GET /feed` — newest first, with author summary, likeCount,
  likedByMe, commentCount, attached photo.
- `POST /posts` {text, photoId?} (auth), `POST /posts/:id/like`
  (toggle), `GET /posts/:id/comments`, `POST /posts/:id/comments`.
- WS presence: sockets may authenticate via `?token=` on the WS URL
  or an `{type:'auth', token}` message; the server broadcasts
  `{type:'presence', online:[handles]}` whenever the set changes and
  sends a snapshot to every new socket.
- Users/posts persist to `users.json` / `posts.json` next to
  server.js (atomic tmp-then-rename writes, loaded at boot).
  **Sessions do not survive a backend restart** — users just log in
  again; accounts/posts/photos/tracks do survive (see the storage
  warning below).

### Buildable profile (per user — nothing is owner- or admin-gated)
Profile fields on every user, editable only by that user via PUT /me,
readable by everyone via GET /users/:handle:
`accentColor` (hex), `bannerEmoji`, `bannerColor` (hex) or
`bannerPhotoId` (own bucket photo), `statusLine` (≤80), `links`
(array of {label, url}, max 4, http(s) only), `pinnedPostId` (must be
one of the user's own posts — validated), `themeId` (see themes).

### Photo bucket
- `POST /photos` (auth) — JSON {dataBase64, caption}, **3 MB decoded
  hard cap** (413 over), type sniffed from magic bytes (JPG/PNG/GIF/
  WebP), stored under `backend/uploads/` with random names, recorded
  in `photos.json`.
- `GET /uploads/<file>` serves the files (express static).
- `GET /users/:handle/photos`, `DELETE /photos/:id` (owner only;
  deleting a banner/avatar photo clears those pointers).
- `POST /posts` accepts `photoId` (own photos only) — feed and
  profile posts render the attached photo.

### Profile music
- `trackTitle` + `trackUrl` on the profile via PUT /me — a direct
  audio URL, a BandLab page URL, or an uploaded track's path.
- `POST /tracks` (auth) — same base64 pipeline, **10 MB cap**,
  MP3/M4A/WAV sniffed, stored in `uploads/`, recorded in
  `tracks.json`. `GET /users/:handle/tracks`, `DELETE /tracks/:id`
  (owner only; deleting the profile track clears it).
- Playback rules (viewer-side, implemented in the profile page):
  the track plays **once** per profile visit, never loops; the
  music card is sticky with always-visible Play/Pause and **Stop**;
  Stop is sticky for the visit (state lives in refs — re-renders,
  scrolls and updates cannot restart it); leaving the page stops
  playback. If the browser blocks the automatic play, it arms on
  the viewer's first tap instead (a Stop pressed first cancels
  that). Non-direct URLs (BandLab pages) render an "Open track"
  button, never a dead player. After the one automatic play, the
  card's controls remain for deliberate replay.

### Custom avatar builder
`avatar` object on the user + `avatarMode` (`emoji` | `builder` |
`photo`), `avatarPhotoId` for photo mode. Builder spec slots and
counts (validated server-side against these exact lists):
- skin: 6 tones · hairStyle: 6 (bald, short, spiky, mohawk, long,
  bun) · hairColor: 8 · eyes: 5 (dots, happy, wink, sleepy, star) ·
  mouth: 5 (smile, grin, flat, open, smirk) · accessory: 5 (none,
  glasses, shades, cap, headphones) · bgColor: any hex.
One deterministic inline-SVG renderer (`AvatarView`) draws the spec;
it's used for feed posts, comments, people list, DMs, chat bubbles,
the app header and profile pages. Emoji and bucket-photo avatars
remain as alternatives.

### Profile themes (8 at launch)
`themeId` on the profile (PUT /me validates against the list). A
theme reskins the owner's whole profile page for every visitor —
palette, tiled SVG background pattern, and an SVG frame around the
header card and post cards. The rest of the app keeps the viewer's
own chrome. Launch set:
1. **Midnight** — plain dark, no decoration.
2. **GhostTech** — black/green terminal, grid pattern, corner-bracket frame.
3. **Skulls** — dark gray, skull-glyph pattern and corner frames.
4. **Barbed Wire** — steel gray, SVG barbed-wire strands along card edges.
5. **Chrome Garage** — brushed dark metal, orange accent stripe frame.
6. **Pink Glitter** — pink/rose, sparkle-dots pattern, sparkle corners.
7. **Hearts & Roses** — deep red/pink, heart pattern, rose corners.
8. **Butterfly Garden** — purple/teal, butterfly pattern and corners.

### WebRTC video (real this time)
- Backend signaling relay: `rtc-offer` / `rtc-answer` / `rtc-ice`
  messages carrying {to, payload} are delivered **only** to the
  addressed peer's socket in the same room (sockets carry a
  per-connection `peerId`); `rtc-peers` broadcasts the room's peer
  list on every join/leave; `rtc-live` announces camera on/off.
- Frontend: full mesh for small rooms — Go Live gets camera/mic,
  offers to room peers, answers incoming offers, ICE both ways,
  remote streams render as tiles next to the local tile; peer leave
  tears down that connection; Kill Cam stops tracks, closes all
  connections and notifies the room.
- **Honest limit:** signaling was verified headlessly with scripted
  clients (offer/answer/ICE both directions, room isolation). A real
  camera-to-camera call has NOT been verified — that needs two real
  devices (e.g. Daniel's phone + the Envy) on the live backend.

## Frontend — `hush-frontend/` (React 18 + Vite + Tailwind)
Paginated shell with a bottom nav (GhostSuite pattern): **Feed**
(composer, posts, likes, comments, photos), **Rooms** (the original
chat, same wire protocol, + video), **DMs** (user list → dm room),
**People** (profiles, follow, message, online dots), **Profile**
(login/register when logged out; any user's built page; full edit
panel + avatar builder + bucket + tracks + theme picker on your own).
A sidebar drawer (☰) mirrors the nav and holds the **GhostTech**
section: one entry, GhostSuite — fires the Android intent
(`intent://…package=com.ghosttech.ghostsuite…`); if the device
doesn't switch away (or on web) it reports "GhostSuite isn't
installed on this device" — never a dead button.
API base lives in one module (`src/config.js`): `VITE_HUSH_API` if
set, else the production URL above. The original single-screen app
is preserved untouched at `src/LegacyApp.jsx`; legacy root dirs
(`src/`, `server/`, `public/`) were not touched.

## APK — `hush-apk/` (Capacitor 8, mirrors the GhostSuite setup)
- Deliverable: `~/workspace/your_files/HuSH-Social.apk`
- Size: **3,241,399 bytes** · MD5 `c7cb6fa79027f4310e4aa4928710819a`
  · SHA-256 `fe253de7e617c443c6e3d36fbe49c2e47e6ac03e9fc2343813d16a44a714c7f3`
- Package `com.ghosttech.hush`, versionCode **1**, versionName
  **1.0.0**, label "HuSH".
- Signed with the new HuSH keystore (`hush-apk/hush-release.keystore`,
  alias `hush`; password lives ONLY in `hush-apk/BUILD-NOTES.md` —
  keep that keystore, future updates must use it). Signer cert:
  CN=HuSH, O=GhostTech — SHA-256
  `23261d1feb60cb9051bf9a6439e6c2c87d14eda4c1012b85ba855b6f80c0ea7f`.
  Verified with apksigner (v2 scheme) and aapt badging.
- Manifest carries INTERNET, CAMERA, RECORD_AUDIO,
  MODIFY_AUDIO_SETTINGS (for WebRTC). Capacitor serves the app from
  an https origin, and the production backend is https/wss, so the
  secure-context requirement for getUserMedia is met; the phone will
  still ask the user to grant camera/mic on first Go Live.
- The bundle inside was built with
  `VITE_HUSH_API=https://hush-5i33.onrender.com` and string-verified
  to contain the production URL, the RTC client and the GhostSuite
  intent.

## Smoke tests (all against the final code, local server)
- REST social suite: register/login/dup-409/bad-login-401, profile
  PUT/GET, follow, post, feed likedByMe, like, comment — **pass**.
- New-features suite (**33/33**): buildable-profile round-trip +
  validation rejections (bad avatar slot, bad theme, bad hex,
  non-http link, pinning others' posts), photo upload/serve/3 MB
  cap/non-image rejection, photo posts + foreign-photo 403,
  banner/avatar photo rules, track upload/serve/set/delete +
  profile-track clearing, delete-permission rules, health counts.
- WebSocket suites: legacy chat + presence + DM isolation — pass;
  RTC signaling (**10/10**): peer lists, offer/answer/ICE delivery,
  cross-room isolation, peer-not-found, rtc-live, leave cleanup.
- Frontend `npm run build` clean; Gradle `assembleRelease` clean.

## ⚠️ Known limit — uploaded files live on borrowed time
Photos and tracks are stored on the backend's local filesystem
(`backend/uploads/`). **Render's filesystem is ephemeral: files
survive a process restart but can vanish on redeploys.** The fix
when it matters: attach a Render persistent disk mounted at the
uploads path, or move uploads to an S3-compatible bucket. The
metadata (users.json/posts.json/photos.json/tracks.json) lives on
the same filesystem, same caveat. Nothing about this blocks
shipping; it is the first thing to upgrade before calling HuSH
anybody's permanent archive.

## Daniel's remaining steps (nothing was pushed)
1. **git push** — all changes are local and **uncommitted** in
   `~/workspace/hush-repo` (nothing was pushed anywhere).
2. **Render redeploy of the backend** — the social features (and
   photo/track uploads, WebRTC signaling, themes, avatars) go live
   only when the new `backend/server.js` deploys. Until then the
   live backend is still the old rooms-only build.
3. **Vercel redeploy of the frontend** for the web version.
4. The APK needs no store anything — install `HuSH-Social.apk`
   directly; it talks to the production backend URL, so its social
   features light up as soon as step 2 lands. Install the
   GhostSuite APK on the same phone to try the drawer's GhostTech
   entry for real.

Built by Daniel "GhostDev" Sielaff & Jinx (Muse) — GhostTech.
