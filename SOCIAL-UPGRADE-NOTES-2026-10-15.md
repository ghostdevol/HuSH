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

## Cypher Rooms v1 (added later on 2026-10-15)

The flagship: a room that runs one beat with a mic queue — the host
drops a beat, people line up, the mic passes down the line, and
ending the session posts the recap to the feed.

- **Create:** Rooms page → "🎤 Host a cypher" (logged-in only): room
  name, beat = one of your uploaded tracks **or** a pasted audio URL,
  BPM (40–240, default 90), bars per turn (1–64, default 8).
  `POST /createRoom` accepts `type:'cypher'` + beat config; the host
  is taken from the caller's login. The session starts when the
  first member joins the room over WS; a host can also (re)start one
  in any room with a `cypher-start` WS message.
- **Wire protocol (over the existing /ws):** server broadcasts
  `cypher-state` `{active, host, beatTitle, beatUrl, bpm,
  barsPerTurn, queue:[handles], current, turnStartedAt,
  performers:[handles]}` on every change. Clients send
  `cypher-queue-join` (mic open → you take it immediately),
  `cypher-queue-leave`, `cypher-pass` (performer or host),
  `cypher-end` (host only). A departing performer auto-passes; a
  departing queue member drops out. Host ending the session creates
  the recap feed post: `🎤 Cypher in <room> — <beat title> — ran
  with @a, @b, @c`, authored by the host, and broadcasts
  `cypher-ended` with the recap post id.
- **The performer's mix is the sync.** The beat plays on the
  PERFORMER's device only: their client mixes mic + looping beat in
  WebAudio (AudioContext → MediaStreamDestination) and that mixed
  track replaces their mic track on the existing RTC mesh. Nobody
  else plays the beat locally — the room hears the performer's mix,
  so there is no multi-device beat-sync problem to solve. When the
  bars elapse (beats = bars×4, seconds = beats×60÷BPM) the
  performer's client auto-passes; the countdown bar shows the time
  left; manual pass (and the host's pass) always works.
- **Supporting change:** `/uploads/` now sends
  `Access-Control-Allow-Origin: *` so WebAudio can read track audio
  from any app origin (the files are public-read by design).
- **Smoke test (headless, 20/20 PASS):** register ×2, track upload,
  cypher room create (host from token), session starts on join with
  the full state, queue-join with open mic takes it, second joiner
  queues, pass hands off in order, performers recorded in order,
  empty-queue pass opens the mic, non-host end refused, host end
  broadcasts `cypher-ended`, recap post verified in the feed (right
  text, right author), health shows 0 live cyphers after, plain
  posts unaffected. Frontend `npm run build` clean.
- **Honest gaps:** real audio (mic + beat audibly mixed for other
  people) is NOT verified — that needs Daniel on two real devices,
  same as the base video call. If a beat URL's host blocks cross-
  origin audio reads, mixing fails loudly with an on-screen error
  rather than silently (uploaded tracks always work). Guests can
  watch/listen but cannot queue — the queue is accounts-only,
  because the recap names performers by handle.

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

## Daniel's remaining steps (updated 2026-10-15, evening)
1. **git push — BLOCKED on auth, your one step.** Both builds are
   committed locally on `main` in `~/workspace/hush-repo`
   (`818f333` HuSH Social, plus the Cypher Rooms commit on top).
   The VM has no working GitHub credential: HTTPS push fails with
   `fatal: could not read Username for 'https://github.com'`, the
   env tokens are empty, `gh` is not logged in, and SSH egress is
   reset by the proxy. Fix once: complete a `gh auth login`
   (device flow — you're logged into GitHub on your phone) or
   otherwise give this VM a credential, then the push is one
   command: `cd ~/workspace/hush-repo && git push origin main`.
2. **Render redeploy of the backend** — happens automatically on
   push if the service tracks `main`; the social features (and
   cyphers, photo/track uploads, WebRTC signaling, themes, avatars)
   go live only when the new `backend/server.js` deploys. Until
   then the live backend is still the old rooms-only build
   (verified 2026-10-15 17:20 CDT: `/health` 200 old-shape,
   `/feed` 404).
3. **Vercel redeploy of the frontend** for the web version.
4. The APK needs no store anything — install `HuSH-Social.apk`
   directly; it talks to the production backend URL, so its social
   features light up as soon as step 2 lands. Install the
   GhostSuite APK on the same phone to try the drawer's GhostTech
   entry for real.

Built by Daniel "GhostDev" Sielaff & Jinx (Muse) — GhostTech.

## SAFETY BUILD — ✅ DONE in v1.2.0 (shipped 2026-10-16, see "v1.2.0" section at the end of this file)
Originally queued by Daniel 2026-10-15 23:35 CDT:
Daniel's requirement, verbatim gist: users must be able to ACCEPT or DENY chat and video from other users, plus a BLOCK feature — "people are weird out in the real world."
Design (must be enforced SERVER-side over REST + WS, not just hidden in UI):
1. DM requests: first-contact DMs land in a Requests inbox; Accept opens the conversation, Deny closes it (sender gets a neutral not-accepted state). Accepted pairs message freely after.
2. Video accept/deny in DMs: starting video sends a call invite over the existing RTC signaling; media connects only on Accept; Deny ends the call attempt. Public-room video stays presence-based, BUT blocked pairs never connect media either way.
3. Block: per-user block list, server-persisted. Blocked user cannot DM you (server refuses), cannot follow you (existing follow removed), their posts/comments are hidden from your feed, they vanish from your People and you from theirs. Unblock from a Blocked list in profile/settings.

## PRIVACY BUILD EXPANSION — ✅ DONE in v1.2.0 (same build; Daniel added video-off, registration integrity, permanent dupe bans, legal docs, and the anti-scam module the same night — all DONE, see the "v1.2.0" section at the end)
Originally specced by Daniel 2026-10-15 23:38 CDT:
More of Daniel's spec, verbatim gist: mic mute and blackout; "still have top 5 and a friends list but I want it to be called something else HuSH style"; the app "is always still based by security and privacy with users preferences to who what when where why"; hiding activity presences.
Items:
4. Mic mute: real local mic mute in any voice/video session (track-level, instant).
5. Blackout: one-tap camera blackout — your video goes dark/off while you stay in the session; others see a blacked-out tile, not a frozen frame or a silent drop.
6. Friends list + Top 5, renamed HuSH-style (working names, Daniel can rename with one word): friends = "Confidants" (mutual follows = confidants); Top 5 featured on profile = "The Inner Five" (pick up to 5 confidants to feature). If Top 5 / friends don't exist in the current build, ADD them here: friends list page + profile Top-5 showcase, picker limited to own confidants.
7. Preference-driven privacy (who / what / when / where / why): settings for who can DM me (everyone / confidants only / nobody), who can video-call me (same choices), who can see my profile + posts (everyone / confidants / only me where sensible), defaults = the safer option.
8. Presence hiding: invisible mode — hide online status, hide last-active, hide which room you're in; you can browse and read while appearing offline. Presence the server broadcasts must respect it (no leaking via WS presence or People list).

## v1.2.0 — SAFETY + PRIVACY + INTEGRITY (shipped 2026-10-16)

Everything from the SAFETY BUILD and PRIVACY BUILD EXPANSION sections above, plus the five additions Daniel specced the same night. All enforcement is SERVER-side (`backend/server.js` REST + WS); the UI only reflects real state.

1. **DM requests** — first-contact DM creates a persisted request (sender's first message held as the preview, delivered on accept). Requests inbox in DMs page (Accept & open / Deny / Block). Deny = neutral "not-accepted" state for the sender, no leaks. Accepted pairs message freely. DM rooms are join-locked to the two named accounts.
2. **Video accept/deny in DMs** — `call-invite` over the signaling channel; server checks pair-open state, blocks, both accounts' video switches and the callee's call policy BEFORE ringing. Accept → media flows; Deny/cancel/30s timeout end it cleanly. Public-room video stays presence-based; blocked pairs exchange no signaling anywhere.
3. **Block** — server-persisted. Severs follows both ways, clears Inner Five picks and DM state both ways, refuses DMs/follows/likes/comments/signaling, hides posts+comments, removes both users from each other's People, profiles 404 both ways. Unblock from the Blocked list in own profile (Privacy & Safety).
4. **Mic mute** — track-level local mute (`track.enabled`), signaled via `rtc-mute`; peers show 🔇 and rtc-peers carries the flag (also mutes the cypher mix track).
5. **Blackout** — video track disabled (black frames) + `rtc-blackout` note; remote tiles render a labeled "Camera blacked out" state, never a freeze.
6. **Confidants + The Inner Five** — Confidants = mutual follows (People page filter + badges + `/confidants`). Inner Five = up to 5 confidants featured on the profile, server-validated, auto-pruned when a confidant bond breaks.
7. **Privacy preferences** — per-user, server-persisted: dmFrom / videoFrom (everyone|confidants|nobody), profileVisibility (everyone|confidants), enforced in feed, profile/posts/photos/tracks, follow-adjacent flows, DM pipeline and call invites. Confidants-only profiles serve a limited shell (identity only) to outsiders.
8. **Presence hiding** — invisible users are never broadcast in WS presence or counted online; room peer lists redact their handle to "🤫 Someone"; they keep full use of the app. (No last-active field exists anywhere in the app.)
9. **Video OFF at account level** (`privacy.videoEnabled`, default on) — server refuses invites TO them ("video unavailable", no ring), refuses their rtc-live and their signaling in rooms/DMs; text unaffected; cypher LISTENING (receiving) still works, client renders audio-only tiles there and no video tiles elsewhere; their UI Go Live becomes a real "Video off in your settings" button that jumps to the setting.
10. **Registration integrity** — email + phone REQUIRED at registration; normalized (email lower/trim; phone digits, +1 folded); one account per email and per phone (409 with an honest error). Existing accounts grandfathered (Daniel logs in as always) and can bind email/phone in Profile → Account with the same uniqueness. Email/phone are private: only the owner's own profile payload carries them. Honest limit: these are CLAIMED identifiers — no SMS/email verification code exists yet.
11. **Permanent dupe bans + IP evidence** — server records regIp + lastLoginIp + a rolling IP history per account (IP source: first X-Forwarded-For hop via `trust proxy`, else socket address — correct behind Render). Bans: login refused with a banned state, tokens revoked, email/phone/IPs blacklisted, re-registration from any of them refused (403 + logged as evasion). IP-sharing ALONE never bans (households/NAT): the four legit same-IP cases pass in tests. Admin lane: `ADMIN_HANDLES` env — `GET /admin/overview`, `POST /admin/ban|unban/:handle` (no public UI). Unban is the mistake/server-error exception and only lifts what that ban anchored.
12. **Legal docs v1.0 (2026-10-15)** — Site Rules / Privacy Policy / Terms of Use in `hush-frontend/src/legal/*.md` (mirrored to `public/legal/`), rendered in-app (drawer + signup links + profile), honest to what the app does (no E2E claim, no fake verification claim; fee-to-release and the opener trio are named in the Rules). Registration requires the agree checkbox; server records {version, acceptedAt}. Existing accounts get one non-blocking in-app prompt, recorded when tapped. Age floor in Terms: 13+.
13. **Anti-scam module** (`backend/antiscam.js`, data-driven `SCAM_SIGNALS`) — distinct-signal scoring over messages/posts/comments/profile/bio/name: off-platform moves, payment/crypto links, guaranteed returns, gift-card/wire, money asks, credential + data harvesting, romance+money, urgency, shorteners, stranded scripts, too-good sales, claimant codes, lottery claims, impersonated lottery winners (Mavis Wanczyk / "Mavis Wick" / Becky Bell), Daniel's named archetypes (Kay Michelle, Charlotte Davis, Kate Evans, Julie Leach), two-first-names, rank/title + bait + celebrity name patterns, lead-on openers, trolling (insult counts + flood), mass-DM (distinct recipients only — repeats to ONE person never count), and FEE-TO-RELEASE weighted 3. Ladder: >5 = formal warning (recorded, in-app notice, flag logged with IP evidence); a FRESH >5 after the warning = permanent ban. Name signals are evaluated at registration and on name changes; a name alone can't reach the threshold.
14. **Opener-trio INSTANT BAN** — in a first-contact DM, if the sender's first three questions are, in order, age / where-from / what-are-you-looking-for (variant-tolerant matchers), the account is permanently banned immediately (sequence logged as the ban reason; admin-unban exception still applies). Only applies to new-contact DM openings — established pairs and public rooms never trip it (tested).
15. **Flag IP logging** — every moderation record (flag/warning/ban/evasion/trio/unban) = {user, timestamp, signals fired, IPs (registration + recent login history)} in `moderation.json`; ban records in `bans.json` carry the same IPs. Admin-only via `/admin/overview`.

Data files evolve additively (defaults filled at load; Daniel's account untouched). New files: `bans.json`, `moderation.json` (backend-local). Tests: `backend/tests/run-tests.js` — 111 assertions, all passing (REST + WS against an isolated instance): block/DM-request/policy/invisible/video-off/call-flow/mute-blackout states, registration integrity, grandfathering, identifier privacy, bans/unban/shared-IP guardrail, name signals, fee weight, scam ladder warning→ban, trio exact + variants + false positives, innocent lyrics/repeats clean.

Known honest limits: two-device camera-to-camera still needs Daniel's eyeball on the live backend; DM chat remains live-only (no stored history — a held request preview is the one exception); pattern scoring is a heuristic with an admin-review lane, not proof.
