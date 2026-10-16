'use strict';

const express = require('express');
const http = require('http');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const antiscam = require('./antiscam');

const app = express();
// Render sits in front of this app as a proxy. IP evidence comes from
// the FIRST X-Forwarded-For hop when present (req.ip honors it with
// trust proxy on), falling back to the raw socket address. That is
// the IP source for registration records, login records, flag records
// and the ban list. (Daniel: "Run it by ip address.")
app.set('trust proxy', true);
// 15mb so photo (3 MB) and track (10 MB) base64 uploads fit.
app.use(express.json({ limit: '15mb' }));

// 1. CONFIGURE CORS
// This allows your frontend (both locally and on Vercel) to interact with this API
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
// The native apps (Capacitor) always run from one of these origins; they are
// allowed regardless of the ALLOWED_ORIGINS env var.
const APP_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost'];
const isAllowedOrigin = (origin) => APP_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes(origin);

app.use(cors({
  origin: function (origin, callback) {
    // If no ALLOWED_ORIGINS env variable is set, allow everything (useful for quick testing)
    if (!ALLOWED_ORIGINS.length) return callback(null, true);
    // Allow server-to-server or tools like Postman (which lack an origin header)
    if (!origin) return callback(null, true);

    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      // Deny quietly: an Error here becomes a 500 for EVERY route, which
      // reads as "server down" in the app. No CORS headers = the browser
      // blocks the read, but the API itself stays up.
      callback(null, false);
    }
  },
  credentials: true
}));

const PORT = process.env.PORT || 10000;
const LEGAL_VERSION = '1.0';
// Admin handles (lowercase) — Daniel's admin lane: view ban/moderation
// state, ban and unban. Keyed by env so no public unban UI exists.
const ADMIN_HANDLES = (process.env.ADMIN_HANDLES || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

// Create ONE unified HTTP + WebSocket Server
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

// ROOM STORAGE: map roomName -> Set of ws clients
const rooms = new Map();
// CYPHER ROOMS (v1, 2026-10-15): roomName -> config stored at createRoom
// time, and roomName -> live session while a cypher is running.
// Session: { host, beatTitle, beatUrl, bpm, barsPerTurn,
//            queue: [handles waiting], current: handle|null,
//            turnStartedAt: epoch ms, performers: [handles in order] }
const roomConfigs = new Map();
const cypherSessions = new Map();

// ===================== SOCIAL LAYER (2026-10-15) =====================
// Users, profiles, follows, posts, likes, comments. Persisted to JSON
// files next to this file; sessions in memory. Node stdlib only.

const USERS_FILE = path.join(__dirname, 'users.json');
const POSTS_FILE = path.join(__dirname, 'posts.json');

function loadJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`Failed to load ${file}:`, err);
  }
  return fallback;
}

function saveJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

// users: { [handle]: { handle, salt, passHash, displayName, bio, avatarEmoji, createdAt, following: [],
//   blocked: [], dmAccepted: [], dmDenied: [], dmRequests: [], innerFive: [],
//   privacy: { dmFrom, videoFrom, profileVisibility, invisible, videoEnabled },
//   email/phone (private), regIp/lastLoginIp/ipHistory (private),
//   legal: {version, acceptedAt}|null, warnings: [], signalHits: {}, banned: null|{...} } }
const users = loadJson(USERS_FILE, {});
// posts: [ { id, author, text, createdAt, photoId, likes: [], comments: [ { id, author, text, createdAt } ] } ]
const posts = loadJson(POSTS_FILE, []);
// photos: [ { id, owner, caption, createdAt, filename } ] — files live in uploads/
// NOTE: on Render the filesystem is ephemeral — uploads can vanish on
// redeploy unless a persistent disk or object storage is attached.
const PHOTOS_FILE = path.join(__dirname, 'photos.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (err) { console.error('uploads dir:', err); }
const photos = loadJson(PHOTOS_FILE, []);
// Public uploads get a permissive CORS header so WebAudio (cypher beat
// mixing) can read them from any app origin; the files are public-read
// by design (profile photos / tracks), same as the static mount itself.
app.use('/uploads', express.static(UPLOADS_DIR, {
  setHeaders: (res) => { res.setHeader('Access-Control-Allow-Origin', '*'); }
}));
// tracks: [ { id, owner, title, createdAt, filename } ] — audio files live
// in the same uploads/ dir and are served by the same static mount.
// Same Render-ephemeral-filesystem caveat as photos.
const TRACKS_FILE = path.join(__dirname, 'tracks.json');
const tracks = loadJson(TRACKS_FILE, []);
// Ban list + moderation log (v1.2.0): persisted server-side only.
const BANS_FILE = path.join(__dirname, 'bans.json');
const MODERATION_FILE = path.join(__dirname, 'moderation.json');
const bans = loadJson(BANS_FILE, { emails: [], phones: [], ips: [], records: [] });
if (!Array.isArray(bans.emails)) bans.emails = [];
if (!Array.isArray(bans.phones)) bans.phones = [];
if (!Array.isArray(bans.ips)) bans.ips = [];
if (!Array.isArray(bans.records)) bans.records = [];
let moderationLog = loadJson(MODERATION_FILE, []);
if (!Array.isArray(moderationLog)) moderationLog = [];
// sessions: token -> handle
const sessions = new Map();

function saveUsers() { saveJson(USERS_FILE, users); }
function savePosts() { saveJson(POSTS_FILE, posts); }
function savePhotos() { saveJson(PHOTOS_FILE, photos); }
function saveTracks() { saveJson(TRACKS_FILE, tracks); }
function saveBans() { saveJson(BANS_FILE, bans); }
function saveModeration() { saveJson(MODERATION_FILE, moderationLog); }

// ===================== IP EVIDENCE =====================
function clientIp(req) {
  return (req.ip || (req.socket && req.socket.remoteAddress) || 'unknown').toString().replace(/^::ffff:/, '');
}
function wsClientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
  return (xff || (req.socket && req.socket.remoteAddress) || 'unknown').toString().replace(/^::ffff:/, '');
}
// Rolling per-account IP history (server-side only, capped at 20).
function noteIp(user, ip, kind) {
  if (!user || !ip || ip === 'unknown') return;
  const hist = Array.isArray(user.ipHistory) ? user.ipHistory : (user.ipHistory = []);
  const existing = hist.find((e) => e.ip === ip);
  if (existing) { existing.at = Date.now(); existing.kind = kind; }
  else hist.push({ ip, at: Date.now(), kind });
  if (hist.length > 20) user.ipHistory = hist.slice(-20);
}
function userIps(user) {
  const set = new Set();
  if (user.regIp) set.add(user.regIp);
  if (user.lastLoginIp) set.add(user.lastLoginIp);
  (user.ipHistory || []).forEach((e) => set.add(e.ip));
  return [...set];
}

// ===================== USER SHAPE (additive migration) =====================
// Every account ever created keeps working; new fields arrive with
// defaults. Daniel (user #1) is grandfathered — never locked out.
function defaultPrivacy() {
  return { dmFrom: 'everyone', videoFrom: 'everyone', profileVisibility: 'everyone', invisible: false, videoEnabled: true };
}
function ensureUserShape(u) {
  let changed = false;
  const fill = (key, val) => { if (u[key] === undefined) { u[key] = val; changed = true; } };
  fill('blocked', []);
  fill('dmAccepted', []);
  fill('dmDenied', []);
  fill('dmRequests', []);
  fill('innerFive', []);
  fill('email', null);
  fill('phone', null);
  fill('emailNorm', null);
  fill('phoneNorm', null);
  fill('regIp', null);
  fill('lastLoginIp', null);
  fill('ipHistory', []);
  fill('legal', null);
  fill('warnings', []);
  fill('signalHits', {});
  fill('banned', null);
  if (!Array.isArray(u.following)) { u.following = []; changed = true; }
  if (!u.privacy || typeof u.privacy !== 'object') { u.privacy = defaultPrivacy(); changed = true; }
  for (const [k, v] of Object.entries(defaultPrivacy())) {
    if (u.privacy[k] === undefined) { u.privacy[k] = v; changed = true; }
  }
  return changed;
}
{
  let migrated = false;
  for (const u of Object.values(users)) if (ensureUserShape(u)) migrated = true;
  if (migrated) saveUsers();
}

const getUser = (handle) => users[(handle || '').toLowerCase()] || null;
const uid = () => crypto.randomBytes(9).toString('base64url');

function normalizeEmail(email) {
  const e = (email || '').toString().trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}
// Strip spaces/dashes/parens; a leading 1 (US country code) folds away
// so "(320) 555-1234", "+1 320 555 1234" and "3205551234" are one number.
function normalizePhone(phone) {
  let digits = (phone || '').toString().replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.length === 10 ? digits : null;
}

// ===================== RELATIONSHIPS =====================
const isFollowing = (a, b) => { const u = users[a]; return !!u && u.following.includes(b); };
const isConfidant = (a, b) => isFollowing(a, b) && isFollowing(b, a);
function confidantsOf(handle) {
  const u = users[handle];
  if (!u) return [];
  return u.following.filter((h) => isFollowing(h, handle));
}
function blockRelation(a, b) {
  return {
    byA: !!users[a] && (users[a].blocked || []).includes(b),
    byB: !!users[b] && (users[b].blocked || []).includes(a)
  };
}
const anyBlock = (a, b) => { const r = blockRelation(a, b); return r.byA || r.byB; };
// A DM pair is "open" once either side accepted the other's request
// (or an established conversation exists from before this system).
const pairOpen = (a, b) =>
  !!users[a] && !!users[b] &&
  ((users[a].dmAccepted || []).includes(b) || (users[b].dmAccepted || []).includes(a));
function canViewProfile(viewer, target) {
  const t = users[target];
  if (!t) return false;
  if (viewer === target) return true;
  if ((t.privacy.profileVisibility || 'everyone') !== 'confidants') return true;
  return !!viewer && isConfidant(viewer, target);
}

// ===================== MODERATION LOG + BAN MACHINERY =====================
// Every flag/warning/ban event carries its IP evidence: the account's
// known IPs (registration + recent logins) ride along on the record.
// Admin-only visibility (ADMIN_HANDLES); never public.
function logModeration(entry) {
  moderationLog.push({ id: uid(), at: Date.now(), ...entry });
  if (moderationLog.length > 500) moderationLog = moderationLog.slice(-500);
  saveModeration();
}
function revokeSessions(handle) {
  for (const [token, h] of [...sessions.entries()]) if (h === handle) sessions.delete(token);
  wss.clients.forEach((client) => {
    if (client.handle === handle) {
      try { client.send(JSON.stringify({ type: 'banned', message: 'This account is banned' })); } catch (err) { /* ignore */ }
      try { client.terminate(); } catch (err) { /* ignore */ }
    }
  });
}
// The one permanent-ban path: dupe accounts, the post-warning scam
// ladder, and the opener-trio rule all land here. Identifiers
// (email/phone) + the account's IPs join the ban list so
// re-registration from them is refused.
function banUser(handle, reason, signals = []) {
  const u = users[handle];
  if (!u || u.banned) return false;
  const ips = userIps(u);
  u.banned = { at: Date.now(), reason, signals };
  if (u.emailNorm && !bans.emails.includes(u.emailNorm)) bans.emails.push(u.emailNorm);
  if (u.phoneNorm && !bans.phones.includes(u.phoneNorm)) bans.phones.push(u.phoneNorm);
  for (const ip of ips) if (!bans.ips.includes(ip)) bans.ips.push(ip);
  bans.records.push({ handle, at: Date.now(), reason, signals, ips, email: u.emailNorm, phone: u.phoneNorm });
  saveBans();
  saveUsers();
  revokeSessions(handle);
  logModeration({ handle, kind: 'ban', signals, ips, detail: reason });
  console.log(`BAN: ${handle} — ${reason}`);
  return true;
}
function unbanUser(handle) {
  const u = users[handle];
  if (!u) return false;
  u.banned = null;
  if (u.emailNorm) bans.emails = bans.emails.filter((e) => e !== u.emailNorm);
  if (u.phoneNorm) bans.phones = bans.phones.filter((p) => p !== u.phoneNorm);
  const mine = userIps(u);
  bans.records = bans.records.filter((r) => r.handle !== handle);
  const stillAnchored = new Set();
  for (const r of bans.records) (r.ips || []).forEach((ip) => stillAnchored.add(ip));
  bans.ips = bans.ips.filter((ip) => stillAnchored.has(ip) || !mine.includes(ip));
  saveBans();
  saveUsers();
  logModeration({ handle, kind: 'unban', signals: [], ips: mine, detail: 'Admin lifted the ban (mistake / server-error exception)' });
  return true;
}

// ===================== ANTI-SCAM ASSESSMENT =====================
// Signal state lives on the user record: signalHits[id] =
// {count, firstAt, lastAt}. Score sums weights over DISTINCT types.
function signalScore(hits, sinceTs = 0) {
  let score = 0;
  const types = [];
  for (const [id, hit] of Object.entries(hits || {})) {
    if (sinceTs && hit.lastAt < sinceTs) continue;
    const def = antiscam.SIGNAL_BY_ID[id] || antiscam.NAME_SIGNAL_DEFS.find((d) => d.id === id);
    score += def ? def.weight : 1;
    types.push(id);
  }
  return { score, types };
}
function notifyUser(handle, payload) {
  wss.clients.forEach((client) => {
    if (client.handle === handle && client.readyState === WebSocket.OPEN) {
      try { client.send(JSON.stringify(payload)); } catch (err) { /* ignore */ }
    }
  });
}
function recordSignals(user, signalIds, context) {
  if (!user || user.banned || !signalIds || !signalIds.length) return;
  const ts = Date.now();
  for (const id of signalIds) {
    const prev = user.signalHits[id];
    user.signalHits[id] = { count: (prev ? prev.count : 0) + 1, firstAt: prev ? prev.firstAt : ts, lastAt: ts };
  }
  saveUsers();
  const warnedAt = user.warnings.length ? user.warnings[user.warnings.length - 1].at : 0;
  const total = signalScore(user.signalHits);
  const postWarning = warnedAt ? signalScore(user.signalHits, warnedAt + 1) : { score: 0, types: [] };
  const ips = userIps(user);
  logModeration({
    handle: user.handle, kind: 'flag', signals: signalIds, ips,
    detail: `${context} — total score ${total.score}, post-warning score ${postWarning.score}`
  });
  if (!warnedAt && total.score > 5) {
    user.warnings.push({ at: ts, signals: total.types, score: total.score, context });
    saveUsers();
    logModeration({ handle: user.handle, kind: 'warning', signals: total.types, ips, detail: `Formal warning issued (${context})` });
    notifyUser(user.handle, {
      type: 'moderation', kind: 'warning',
      message: '⚠️ Account warning: your recent activity matches patterns from the scammer playbook in the HuSH Site Rules. This is a formal warning — correct it, or the account is gone. An admin reviews every flag.'
    });
  } else if (warnedAt && postWarning.score > 5) {
    banUser(user.handle, 'Scam-playbook signals crossed the line again after a formal warning', postWarning.types);
  }
}
function assessContent(user, text, context) {
  if (!user || !text) return;
  recordSignals(user, antiscam.assessText(text), context);
}
function assessNameSignals(user) {
  if (!user) return;
  recordSignals(user, antiscam.assessName(user.displayName, user.handle), 'profile name');
}

// Opener-trio tracking (Daniel's hard rule): per ordered pair, the
// sender's first QUESTION intents to a NEW (not-yet-open) DM contact.
// In-memory by design: opening exchanges are live-session events.
const trioState = new Map(); // `${from}>${to}` -> [ 'age'|'location'|'intent'|'other', ... ]
// Behavioral counters for stateful signals.
const massDmState = new Map();  // handle -> { windowStart, recipients: Set }
const repeatState = new Map();  // handle -> { text, count, windowStart }
const insultState = new Map();  // handle -> { windowStart, count }
const openerState = new Map();  // `${from}>${to}` -> count of opening messages

function checkMassDm(sender, recipient) {
  const now = Date.now();
  let st = massDmState.get(sender);
  if (!st || now - st.windowStart > 10 * 60 * 1000) st = { windowStart: now, recipients: new Set(), firedAt: 0 };
  st.recipients.add(recipient);
  massDmState.set(sender, st);
  if (st.recipients.size >= 5 && now - (st.firedAt || 0) > 60 * 60 * 1000) {
    st.firedAt = now;
    return true;
  }
  return false;
}
function checkRepeat(sender, text) {
  const now = Date.now();
  const norm = (text || '').trim().toLowerCase();
  let st = repeatState.get(sender);
  if (!st || now - st.windowStart > 60 * 1000 || st.text !== norm) st = { text: norm, count: 0, windowStart: now };
  st.count += 1;
  repeatState.set(sender, st);
  return st.count >= 8; // bait-and-flood: same line 8+ times in a minute
}
function checkInsults(sender, text) {
  if (!antiscam.INSULT_RE.test(text || '')) return false;
  const now = Date.now();
  let st = insultState.get(sender);
  if (!st || now - st.windowStart > 10 * 60 * 1000) st = { windowStart: now, count: 0 };
  st.count += 1;
  insultState.set(sender, st);
  return st.count >= 3;
}
// Stateful signals that ride along with every assessed message.
function behavioralSignals(sender, text, isRoomMessage) {
  const hits = [];
  if (checkRepeat(sender, text) && isRoomMessage) hits.push('trolling');
  if (checkInsults(sender, text)) hits.push('trolling');
  return hits;
}

function serializePhoto(p) {
  return { id: p.id, owner: p.owner, caption: p.caption, createdAt: p.createdAt, url: '/uploads/' + p.filename };
}

function serializeTrack(t) {
  return { id: t.id, owner: t.owner, title: t.title, createdAt: t.createdAt, url: '/uploads/' + t.filename };
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function publicProfile(u) {
  return {
    handle: u.handle,
    displayName: u.displayName,
    bio: u.bio,
    avatarEmoji: u.avatarEmoji,
    createdAt: u.createdAt,
    // Buildable-profile fields (fallbacks keep pre-upgrade records valid)
    accentColor: u.accentColor || '#a78bfa',
    bannerEmoji: typeof u.bannerEmoji === 'string' ? u.bannerEmoji : '🌙',
    bannerColor: u.bannerColor || '#1e1b4b',
    bannerPhotoId: u.bannerPhotoId || null,
    statusLine: u.statusLine || '',
    links: Array.isArray(u.links) ? u.links : [],
    pinnedPostId: u.pinnedPostId || null,
    trackTitle: u.trackTitle || '',
    trackUrl: u.trackUrl || '',
    avatarMode: u.avatarMode || 'emoji',
    avatar: u.avatar || null,
    avatarPhotoId: u.avatarPhotoId || null,
    avatarPhotoUrl: u.avatarPhotoId
      ? (() => { const p = photos.find(x => x.id === u.avatarPhotoId); return p ? '/uploads/' + p.filename : null; })()
      : null,
    themeId: u.themeId || 'midnight',
    followerCount: Object.values(users).filter(x => x.following.includes(u.handle)).length,
    followingCount: u.following.length,
    postCount: posts.filter(p => p.author === u.handle).length,
    // v1.2.0 social graph extras
    confidantCount: confidantsOf(u.handle).length,
    innerFive: Array.isArray(u.innerFive) ? u.innerFive : []
  };
}

// The OWNER's view of their own profile — the only place private
// fields (email, phone, privacy prefs, block list, legal acceptance,
// warnings) ever leave the server. Never used for other users.
function selfProfile(u) {
  return {
    ...publicProfile(u),
    email: u.email || null,
    phone: u.phone || null,
    privacy: { ...defaultPrivacy(), ...(u.privacy || {}) },
    blocked: [...(u.blocked || [])],
    blockedUsers: (u.blocked || []).map((h) => authorSummary(h)),
    confidants: confidantsOf(u.handle),
    legal: u.legal || null,
    legalVersion: LEGAL_VERSION,
    warnings: (u.warnings || []).map((w) => ({ at: w.at, signals: w.signals, score: w.score })),
    banned: !!u.banned
  };
}

// Limited profile for confidants-only accounts viewed by outsiders:
// identity is visible (so people can follow / request / block), the
// profile's content is not.
function limitedProfile(u) {
  return {
    handle: u.handle,
    displayName: u.displayName,
    avatarEmoji: u.avatarEmoji,
    avatarMode: u.avatarMode || 'emoji',
    avatar: u.avatar || null,
    avatarPhotoUrl: u.avatarPhotoId
      ? (() => { const p = photos.find(x => x.id === u.avatarPhotoId); return p ? '/uploads/' + p.filename : null; })()
      : null,
    createdAt: u.createdAt,
    profilePrivate: true,
    followerCount: Object.values(users).filter(x => x.following.includes(u.handle)).length,
    confidantCount: confidantsOf(u.handle).length
  };
}

function dmStatusFor(me, target) {
  const rel = blockRelation(me, target);
  if (rel.byA) return 'blocked-by-me';
  if (rel.byB) return 'not-accepted';
  if (pairOpen(me, target)) return 'open';
  const t = users[target];
  const m = users[me];
  if ((t.dmDenied || []).includes(me)) return 'not-accepted';
  if ((t.dmRequests || []).some((r) => r.from === me)) return 'pending';
  if ((m.dmRequests || []).some((r) => r.from === target)) return 'incoming';
  return 'none';
}
function canVideoWith(me, target) {
  const m = users[me];
  const t = users[target];
  if (!m || !t) return { can: false, reason: 'unavailable' };
  if (!m.privacy.videoEnabled) return { can: false, reason: 'your-video-off' };
  if (!t.privacy.videoEnabled) return { can: false, reason: 'video-unavailable' };
  if (!pairOpen(me, target)) return { can: false, reason: 'not-accepted' };
  const vf = t.privacy.videoFrom || 'everyone';
  if (vf === 'nobody') return { can: false, reason: 'video-unavailable' };
  if (vf === 'confidants' && !isConfidant(me, target)) return { can: false, reason: 'confidants-only' };
  return { can: true };
}

function authHandle(req) {
  const token = req.headers['x-hush-token'];
  if (!token) return null;
  const handle = sessions.get(token) || null;
  if (handle && users[handle] && users[handle].banned) return null; // banned = tokens dead
  return handle;
}

function requireAuth(req, res) {
  const handle = authHandle(req);
  if (!handle) { res.status(401).json({ error: 'Login required' }); return null; }
  return handle;
}

function requireAdmin(req, res) {
  const handle = requireAuth(req, res);
  if (!handle) return null;
  if (!ADMIN_HANDLES.includes(handle)) { res.status(403).json({ error: 'Admin only' }); return null; }
  return handle;
}

function authorSummary(handle) {
  const a = users[handle];
  if (!a) return { handle, displayName: handle, avatarEmoji: '🤫', avatarMode: 'emoji', avatar: null, avatarPhotoUrl: null };
  const photo = a.avatarPhotoId ? photos.find(x => x.id === a.avatarPhotoId) : null;
  return {
    handle: a.handle,
    displayName: a.displayName,
    avatarEmoji: a.avatarEmoji,
    avatarMode: a.avatarMode || 'emoji',
    avatar: a.avatar || null,
    avatarPhotoUrl: photo ? '/uploads/' + photo.filename : null
  };
}

function serializePost(p, meHandle) {
  const photoRec = p.photoId ? photos.find(x => x.id === p.photoId) : null;
  return {
    id: p.id,
    text: p.text,
    createdAt: p.createdAt,
    author: authorSummary(p.author),
    photo: photoRec ? serializePhoto(photoRec) : null,
    likeCount: p.likes.length,
    likedByMe: meHandle ? p.likes.includes(meHandle) : false,
    commentCount: p.comments.length
  };
}
// A post is visible to a viewer when: no block either way with the
// author, and the author's visibility allows it.
function postVisibleTo(p, me) {
  const author = users[p.author];
  if (!author) return false;
  if (me) {
    if (p.author !== me && anyBlock(me, p.author)) return false;
    if (!canViewProfile(me, p.author)) return false;
  } else if ((author.privacy.profileVisibility || 'everyone') === 'confidants') {
    return false;
  }
  return true;
}

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

// ===================== AVATAR BUILDER =====================
// Slot choices for the built avatar. The frontend's AvatarView renders
// exactly these values to a deterministic inline SVG.
const AVATAR_SLOTS = {
  skin: ['#ffdfc4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3836'],
  hairStyle: ['bald', 'short', 'spiky', 'mohawk', 'long', 'bun'],
  hairColor: ['#14100d', '#3b2314', '#7a4a21', '#b97a45', '#e3c565', '#c0c0c0', '#c23b22', '#31559f'],
  eyes: ['dots', 'happy', 'wink', 'sleepy', 'star'],
  mouth: ['smile', 'grin', 'flat', 'open', 'smirk'],
  accessory: ['none', 'glasses', 'shades', 'cap', 'headphones']
};
// Menagerie kinds (2026-10-15): `kind` picks the avatar's form and
// `kindColor` its body color. Both are additive — pre-menagerie specs
// have neither and default to a human, exactly as before.
const AVATAR_KINDS = ['human', 'ghost', 'skull', 'robot', 'cat', 'wolf', 'alien', 'dragon', 'pumpkin'];
const AVATAR_DEFAULT = {
  style: 'builder', kind: 'human', kindColor: '#e8edf2',
  skin: '#f1c27d', hairStyle: 'short', hairColor: '#3b2314',
  eyes: 'dots', mouth: 'smile', accessory: 'none', bgColor: '#312e81'
};

// Returns a clean spec or null when any slot value is not allowed.
function validateAvatar(spec) {
  if (!spec || typeof spec !== 'object') return null;
  const out = { style: 'builder' };
  for (const slot of Object.keys(AVATAR_SLOTS)) {
    if (!AVATAR_SLOTS[slot].includes(spec[slot])) return null;
    out[slot] = spec[slot];
  }
  if (typeof spec.bgColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(spec.bgColor)) return null;
  out.bgColor = spec.bgColor;
  out.kind = AVATAR_KINDS.includes(spec.kind) ? spec.kind : 'human';
  out.kindColor = (typeof spec.kindColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(spec.kindColor))
    ? spec.kindColor
    : AVATAR_DEFAULT.kindColor;
  return out;
}

app.post('/auth/register', (req, res) => {
  const handle = (req.body.handle || '').toString().trim().toLowerCase();
  const password = (req.body.password || '').toString();
  if (!HANDLE_RE.test(handle)) return res.status(400).json({ error: 'Handle must be 3-20 chars: lowercase letters, numbers, underscore' });
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  if (users[handle]) return res.status(409).json({ error: 'Handle already taken' });
  // Registration integrity (v1.2.0): one account per person — an email
  // AND a phone number are required and each must be unique. This is
  // uniqueness of CLAIMED identifiers; no verification code is sent.
  const emailNorm = normalizeEmail(req.body.email);
  if (!emailNorm) return res.status(400).json({ error: 'A valid email address is required to register' });
  const phoneNorm = normalizePhone(req.body.phone);
  if (!phoneNorm) return res.status(400).json({ error: 'A valid 10-digit phone number is required to register' });
  if (req.body.legalAccepted !== true) {
    return res.status(400).json({ error: 'You must agree to the Site Rules, Privacy Policy and Terms of Use to register' });
  }
  const ip = clientIp(req);
  // Ban list first: banned identifiers and banned IPs cannot register.
  if (bans.emails.includes(emailNorm) || bans.phones.includes(phoneNorm) || bans.ips.includes(ip)) {
    logModeration({ handle, kind: 'evasion', signals: [], ips: [ip], detail: 'Registration refused — banned identifier or IP' });
    return res.status(403).json({ error: 'Registration refused: this email, phone number or network has been banned from HuSH' });
  }
  if (Object.values(users).some((u) => u.emailNorm === emailNorm)) {
    return res.status(409).json({ error: 'That email is already registered to an account — one account per person' });
  }
  if (Object.values(users).some((u) => u.phoneNorm === phoneNorm)) {
    return res.status(409).json({ error: 'That phone number is already registered to an account — one account per person' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const rec = {
    handle,
    salt,
    passHash: hashPassword(password, salt),
    displayName: (req.body.displayName || handle).toString().slice(0, 50),
    bio: '',
    avatarEmoji: '🤫',
    accentColor: '#a78bfa',
    bannerEmoji: '🌙',
    bannerColor: '#1e1b4b',
    bannerPhotoId: null,
    statusLine: '',
    links: [],
    pinnedPostId: null,
    trackTitle: '',
    trackUrl: '',
    avatarMode: 'emoji',
    avatar: { ...AVATAR_DEFAULT },
    avatarPhotoId: null,
    themeId: 'midnight',
    createdAt: Date.now(),
    following: [],
    email: emailNorm,
    phone: phoneNorm,
    emailNorm,
    phoneNorm,
    regIp: ip,
    lastLoginIp: ip,
    ipHistory: [{ ip, at: Date.now(), kind: 'register' }],
    legal: { version: LEGAL_VERSION, acceptedAt: Date.now() }
  };
  ensureUserShape(rec);
  users[handle] = rec;
  saveUsers();
  assessNameSignals(rec); // name patterns score from day one (never ban alone)
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, handle);
  res.json({ token, user: selfProfile(users[handle]) });
});

app.post('/auth/login', (req, res) => {
  const handle = (req.body.handle || '').toString().trim().toLowerCase();
  const password = (req.body.password || '').toString();
  const u = users[handle];
  if (!u) return res.status(401).json({ error: 'Invalid handle or password' });
  const attempt = hashPassword(password, u.salt);
  const ok = attempt.length === u.passHash.length &&
    crypto.timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(u.passHash, 'hex'));
  if (!ok) return res.status(401).json({ error: 'Invalid handle or password' });
  if (u.banned) return res.status(403).json({ error: 'This account is banned', banned: true });
  const ip = clientIp(req);
  u.lastLoginIp = ip;
  noteIp(u, ip, 'login');
  saveUsers();
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, handle);
  res.json({ token, user: selfProfile(u) });
});

app.get('/me', (req, res) => {
  const handle = requireAuth(req, res);
  if (!handle) return;
  res.json({ user: selfProfile(users[handle]) });
});

app.put('/me', (req, res) => {
  const handle = requireAuth(req, res);
  if (!handle) return;
  const u = users[handle];
  const prevDisplayName = u.displayName;
  if (typeof req.body.displayName === 'string') u.displayName = req.body.displayName.slice(0, 50);
  if (typeof req.body.bio === 'string') u.bio = req.body.bio.slice(0, 280);
  if (typeof req.body.avatarEmoji === 'string') u.avatarEmoji = req.body.avatarEmoji.slice(0, 8);

  // Buildable-profile fields — every one validated, all round-trip via GET /me
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;
  if (req.body.accentColor !== undefined) {
    if (!HEX_RE.test(req.body.accentColor)) return res.status(400).json({ error: 'accentColor must be a hex color like #a78bfa' });
    u.accentColor = req.body.accentColor;
  }
  if (req.body.bannerColor !== undefined) {
    if (!HEX_RE.test(req.body.bannerColor)) return res.status(400).json({ error: 'bannerColor must be a hex color like #1e1b4b' });
    u.bannerColor = req.body.bannerColor;
  }
  if (typeof req.body.bannerEmoji === 'string') u.bannerEmoji = req.body.bannerEmoji.slice(0, 8);
  if (typeof req.body.statusLine === 'string') u.statusLine = req.body.statusLine.slice(0, 80);
  if (req.body.bannerPhotoId !== undefined) {
    if (req.body.bannerPhotoId === null) {
      u.bannerPhotoId = null;
    } else {
      const ph = photos.find(p => p.id === req.body.bannerPhotoId);
      if (!ph || ph.owner !== handle) return res.status(400).json({ error: 'Banner photo must be one of your own photos' });
      u.bannerPhotoId = ph.id;
    }
  }
  if (req.body.links !== undefined) {
    if (!Array.isArray(req.body.links)) return res.status(400).json({ error: 'links must be an array' });
    const links = [];
    for (const l of req.body.links.slice(0, 4)) {
      const label = ((l && l.label) || '').toString().trim().slice(0, 30);
      const url = ((l && l.url) || '').toString().trim().slice(0, 300);
      if (!label || !/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'Each link needs a label and an http(s) URL' });
      }
      links.push({ label, url });
    }
    u.links = links;
  }
  if (req.body.pinnedPostId !== undefined) {
    if (req.body.pinnedPostId === null) {
      u.pinnedPostId = null;
    } else {
      const post = posts.find(p => p.id === req.body.pinnedPostId);
      if (!post || post.author !== handle) {
        return res.status(400).json({ error: 'Pinned post must be one of your own posts' });
      }
      u.pinnedPostId = post.id;
    }
  }
  // Profile track (MySpace-style): direct audio URL, BandLab page URL,
  // or an uploaded track's /uploads/ path.
  if (typeof req.body.trackTitle === 'string') u.trackTitle = req.body.trackTitle.slice(0, 80);
  if (req.body.trackUrl !== undefined) {
    const url = (req.body.trackUrl || '').toString().trim().slice(0, 400);
    if (url && !/^https?:\/\//i.test(url) && !url.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'Track URL must be an http(s) link or an uploaded track' });
    }
    u.trackUrl = url;
  }
  // Avatar: mode + builder spec + bucket-photo choice
  if (req.body.avatarMode !== undefined) {
    if (!['emoji', 'builder', 'photo'].includes(req.body.avatarMode)) {
      return res.status(400).json({ error: 'avatarMode must be emoji, builder or photo' });
    }
    u.avatarMode = req.body.avatarMode;
  }
  if (req.body.avatar !== undefined) {
    if (req.body.avatar === null) {
      u.avatar = null;
    } else {
      const clean = validateAvatar(req.body.avatar);
      if (!clean) return res.status(400).json({ error: 'Avatar has a value outside the allowed choices' });
      u.avatar = clean;
    }
  }
  if (req.body.avatarPhotoId !== undefined) {
    if (req.body.avatarPhotoId === null) {
      u.avatarPhotoId = null;
    } else {
      const ph = photos.find(p => p.id === req.body.avatarPhotoId);
      if (!ph || ph.owner !== handle) return res.status(400).json({ error: 'Avatar photo must be one of your own photos' });
      u.avatarPhotoId = ph.id;
    }
  }
  if (req.body.themeId !== undefined) {
    const THEME_IDS = ['midnight', 'ghosttech', 'skulls', 'barbedwire', 'chrome', 'glitter', 'hearts', 'butterfly'];
    if (!THEME_IDS.includes(req.body.themeId)) return res.status(400).json({ error: 'Unknown theme' });
    u.themeId = req.body.themeId;
  }
  // ---- v1.2.0 additions ----
  // Privacy preferences — validated enums, safer-by-construction.
  if (req.body.privacy !== undefined) {
    const p = req.body.privacy;
    if (!p || typeof p !== 'object') return res.status(400).json({ error: 'privacy must be an object' });
    const next = { ...u.privacy };
    if (p.dmFrom !== undefined) {
      if (!['everyone', 'confidants', 'nobody'].includes(p.dmFrom)) return res.status(400).json({ error: 'dmFrom must be everyone, confidants or nobody' });
      next.dmFrom = p.dmFrom;
    }
    if (p.videoFrom !== undefined) {
      if (!['everyone', 'confidants', 'nobody'].includes(p.videoFrom)) return res.status(400).json({ error: 'videoFrom must be everyone, confidants or nobody' });
      next.videoFrom = p.videoFrom;
    }
    if (p.profileVisibility !== undefined) {
      if (!['everyone', 'confidants'].includes(p.profileVisibility)) return res.status(400).json({ error: 'profileVisibility must be everyone or confidants' });
      next.profileVisibility = p.profileVisibility;
    }
    if (p.invisible !== undefined) next.invisible = !!p.invisible;
    if (p.videoEnabled !== undefined) next.videoEnabled = !!p.videoEnabled;
    u.privacy = next;
  }
  // The Inner Five — up to 5 of MY confidants, server-validated.
  if (req.body.innerFive !== undefined) {
    if (!Array.isArray(req.body.innerFive)) return res.status(400).json({ error: 'innerFive must be an array of handles' });
    const picks = [...new Set(req.body.innerFive.map((h) => (h || '').toString().toLowerCase()))];
    if (picks.length > 5) return res.status(400).json({ error: 'The Inner Five holds at most 5 people' });
    const confs = confidantsOf(handle);
    for (const pick of picks) {
      if (!confs.includes(pick)) return res.status(400).json({ error: 'The Inner Five can only feature your Confidants' });
    }
    u.innerFive = picks;
  }
  // Bind email/phone (grandfathered accounts) — same uniqueness rules
  // as registration. Private: only the owner ever sees these back.
  if (req.body.email !== undefined) {
    const emailNorm = normalizeEmail(req.body.email);
    if (!emailNorm) return res.status(400).json({ error: 'A valid email address is required' });
    if (Object.values(users).some((x) => x.handle !== handle && x.emailNorm === emailNorm)) {
      return res.status(409).json({ error: 'That email is already registered to another account' });
    }
    u.email = emailNorm;
    u.emailNorm = emailNorm;
  }
  if (req.body.phone !== undefined) {
    const phoneNorm = normalizePhone(req.body.phone);
    if (!phoneNorm) return res.status(400).json({ error: 'A valid 10-digit phone number is required' });
    if (Object.values(users).some((x) => x.handle !== handle && x.phoneNorm === phoneNorm)) {
      return res.status(409).json({ error: 'That phone number is already registered to another account' });
    }
    u.phone = phoneNorm;
    u.phoneNorm = phoneNorm;
  }
  // Legal acceptance for existing accounts (shown once, recorded).
  if (req.body.acceptLegal === true) {
    u.legal = { version: LEGAL_VERSION, acceptedAt: Date.now() };
  }
  saveUsers();
  // Name/bio text is assessed like any other content.
  if (u.displayName !== prevDisplayName) assessNameSignals(u);
  if (typeof req.body.bio === 'string' && req.body.bio) assessContent(u, u.bio, 'profile bio');
  res.json({ user: selfProfile(u) });
});

app.get('/users', (req, res) => {
  const me = authHandle(req);
  const list = Object.values(users)
    .filter((u) => !(me && u.handle !== me && anyBlock(me, u.handle))) // blocked pairs vanish both ways
    .map(u => ({
      ...publicProfile(u),
      following: me ? users[me].following.includes(u.handle) : false,
      isMe: me === u.handle,
      confidant: me ? isConfidant(me, u.handle) : false,
      blockedByMe: me ? (users[me].blocked || []).includes(u.handle) : false,
      dmAccepted: me ? pairOpen(me, u.handle) : false
    }));
  res.json({ users: list });
});

// My Confidants (mutual follows).
app.get('/confidants', (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  const list = confidantsOf(me).map((h) => ({ ...publicProfile(users[h]), author: authorSummary(h) }));
  res.json({ confidants: list });
});

app.get('/users/:handle', (req, res) => {
  const target = req.params.handle.toLowerCase();
  const u = users[target];
  if (!u) return res.status(404).json({ error: 'User not found' });
  const me = authHandle(req);
  if (me && me !== target && anyBlock(me, target)) return res.status(404).json({ error: 'User not found' });
  const rel = {
    following: me ? users[me].following.includes(u.handle) : false,
    isMe: me === u.handle,
    confidant: me ? isConfidant(me, u.handle) : false,
    blockedByMe: me ? (users[me].blocked || []).includes(u.handle) : false
  };
  if (me === target) return res.json({ user: { ...selfProfile(u), ...rel } });
  if (!canViewProfile(me, target)) {
    return res.json({ user: { ...limitedProfile(u), ...rel, dmStatus: me ? dmStatusFor(me, target) : 'none' } });
  }
  res.json({
    user: {
      ...publicProfile(u),
      ...rel,
      innerFiveUsers: (u.innerFive || []).map((h) => authorSummary(h)),
      dmStatus: me ? dmStatusFor(me, target) : 'none'
    }
  });
});

app.get('/users/:handle/posts', (req, res) => {
  const handle = req.params.handle.toLowerCase();
  if (!users[handle]) return res.status(404).json({ error: 'User not found' });
  const me = authHandle(req);
  if (me && me !== handle && anyBlock(me, handle)) return res.status(404).json({ error: 'User not found' });
  if (!canViewProfile(me, handle)) return res.status(403).json({ error: 'This profile is confidants-only' });
  const list = posts
    .filter(p => p.author === handle)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(p => serializePost(p, me));
  res.json({ posts: list });
});

app.get('/users/:handle/photos', (req, res) => {
  const handle = req.params.handle.toLowerCase();
  if (!users[handle]) return res.status(404).json({ error: 'User not found' });
  const me = authHandle(req);
  if (me && me !== handle && anyBlock(me, handle)) return res.status(404).json({ error: 'User not found' });
  if (!canViewProfile(me, handle)) return res.status(403).json({ error: 'This profile is confidants-only' });
  const list = photos
    .filter(p => p.owner === handle)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(serializePhoto);
  res.json({ photos: list });
});

app.get('/users/:handle/tracks', (req, res) => {
  const handle = req.params.handle.toLowerCase();
  if (!users[handle]) return res.status(404).json({ error: 'User not found' });
  const me = authHandle(req);
  if (me && me !== handle && anyBlock(me, handle)) return res.status(404).json({ error: 'User not found' });
  if (!canViewProfile(me, handle)) return res.status(403).json({ error: 'This profile is confidants-only' });
  const list = tracks
    .filter(t => t.owner === handle)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(serializeTrack);
  res.json({ tracks: list });
});

app.post('/users/:handle/follow', (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  const target = req.params.handle.toLowerCase();
  if (!users[target]) return res.status(404).json({ error: 'User not found' });
  if (target === me) return res.status(400).json({ error: 'Cannot follow yourself' });
  if (anyBlock(me, target)) return res.status(403).json({ error: 'Unavailable' });
  const mine = users[me].following;
  const idx = mine.indexOf(target);
  let following;
  if (idx >= 0) { mine.splice(idx, 1); following = false; } else { mine.push(target); following = true; }
  // Inner Five can only feature current confidants — prune on change.
  users[me].innerFive = (users[me].innerFive || []).filter((h) => confidantsOf(me).includes(h));
  users[target].innerFive = (users[target].innerFive || []).filter((h) => confidantsOf(target).includes(h));
  saveUsers();
  res.json({ following, user: publicProfile(users[target]) });
});

// ===================== BLOCK =====================
app.post('/users/:handle/block', (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  const target = req.params.handle.toLowerCase();
  if (!users[target]) return res.status(404).json({ error: 'User not found' });
  if (target === me) return res.status(400).json({ error: 'Cannot block yourself' });
  const mine = users[me];
  const theirs = users[target];
  if (!mine.blocked.includes(target)) mine.blocked.push(target);
  // Sever follows BOTH ways, drop from both Inner Fives, close the DM
  // pair and clear any pending requests between the pair.
  mine.following = mine.following.filter((h) => h !== target);
  theirs.following = theirs.following.filter((h) => h !== me);
  mine.innerFive = (mine.innerFive || []).filter((h) => h !== target);
  theirs.innerFive = (theirs.innerFive || []).filter((h) => h !== me);
  mine.dmAccepted = (mine.dmAccepted || []).filter((h) => h !== target);
  theirs.dmAccepted = (theirs.dmAccepted || []).filter((h) => h !== me);
  mine.dmRequests = (mine.dmRequests || []).filter((r) => r.from !== target);
  theirs.dmRequests = (theirs.dmRequests || []).filter((r) => r.from !== me);
  trioState.delete(`${me}>${target}`);
  trioState.delete(`${target}>${me}`);
  saveUsers();
  // Drop any live signaling between the pair immediately.
  wss.clients.forEach((client) => {
    if (client.currentRoom && ((client.handle === me) || (client.handle === target))) {
      broadcastRtcPeers(client.currentRoom);
    }
  });
  res.json({ blocked: true });
});

app.post('/users/:handle/unblock', (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  const target = req.params.handle.toLowerCase();
  if (!users[target]) return res.status(404).json({ error: 'User not found' });
  users[me].blocked = (users[me].blocked || []).filter((h) => h !== target);
  saveUsers();
  res.json({ blocked: false });
});

// ===================== DM REQUESTS =====================
app.get('/dm/requests', (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  const requests = (users[me].dmRequests || []).map((r) => ({
    from: authorSummary(r.from),
    at: r.at,
    preview: r.preview
  }));
  res.json({ requests });
});

app.get('/dm/status/:handle', (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  const target = req.params.handle.toLowerCase();
  if (!users[target]) return res.status(404).json({ error: 'User not found' });
  const video = canVideoWith(me, target);
  res.json({ status: dmStatusFor(me, target), canVideo: video.can, videoReason: video.reason || null });
});

app.post('/dm/requests/:handle/accept', (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  const from = req.params.handle.toLowerCase();
  if (!users[from]) return res.status(404).json({ error: 'User not found' });
  if (anyBlock(me, from)) return res.status(403).json({ error: 'Unavailable' });
  const mine = users[me];
  const reqEntry = (mine.dmRequests || []).find((r) => r.from === from);
  mine.dmRequests = (mine.dmRequests || []).filter((r) => r.from !== from);
  mine.dmDenied = (mine.dmDenied || []).filter((h) => h !== from);
  if (!mine.dmAccepted.includes(from)) mine.dmAccepted.push(from);
  saveUsers();
  // If the requester is sitting in the DM room, deliver the held first
  // message now so it isn't lost (chat here is live-only, no history).
  const room = 'dm:' + [me, from].sort().join(':');
  const clients = rooms.get(room);
  if (clients && reqEntry && reqEntry.preview) {
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify({ type: 'msg', room, user: from, text: reqEntry.preview, ts: reqEntry.at, held: true }));
          client.send(JSON.stringify({ type: 'dm-accepted', room, by: me }));
        } catch (err) { /* ignore */ }
      }
    }
  }
  notifyUser(from, { type: 'dm-accepted', room, by: me });
  res.json({ status: 'open' });
});

app.post('/dm/requests/:handle/deny', (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  const from = req.params.handle.toLowerCase();
  if (!users[from]) return res.status(404).json({ error: 'User not found' });
  const mine = users[me];
  mine.dmRequests = (mine.dmRequests || []).filter((r) => r.from !== from);
  if (!mine.dmDenied.includes(from)) mine.dmDenied.push(from);
  saveUsers();
  res.json({ status: 'not-accepted' });
});

// ===================== ADMIN (Daniel's lane) =====================
app.get('/admin/overview', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const flagged = Object.values(users)
    .filter((u) => u.banned || u.warnings.length || Object.keys(u.signalHits || {}).length)
    .map((u) => ({
      handle: u.handle,
      banned: u.banned || null,
      warnings: u.warnings,
      signalHits: u.signalHits,
      score: signalScore(u.signalHits).score,
      ips: userIps(u),
      regIp: u.regIp,
      lastLoginIp: u.lastLoginIp
    }));
  res.json({
    banlist: { emails: bans.emails, phones: bans.phones, ips: bans.ips },
    records: bans.records.slice(-100),
    moderationLog: moderationLog.slice(-100),
    flagged
  });
});
app.post('/admin/ban/:handle', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const target = req.params.handle.toLowerCase();
  if (!users[target]) return res.status(404).json({ error: 'User not found' });
  const reason = (req.body.reason || 'Banned by admin').toString().slice(0, 200);
  banUser(target, reason, []);
  res.json({ banned: true });
});
app.post('/admin/unban/:handle', (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  const target = req.params.handle.toLowerCase();
  if (!users[target]) return res.status(404).json({ error: 'User not found' });
  unbanUser(target);
  res.json({ banned: false });
});

app.get('/feed', (req, res) => {
  const me = authHandle(req);
  const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 100);
  const feed = [...posts]
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((p) => postVisibleTo(p, me))
    .slice(0, limit)
    .map(p => serializePost(p, me));
  res.json({ posts: feed });
});

// Shared post creation (REST /posts and the cypher recap both use it).
function createPostRecord(author, text, photoId = null) {
  const post = {
    id: crypto.randomBytes(8).toString('hex'),
    author,
    text,
    createdAt: Date.now(),
    photoId,
    likes: [],
    comments: []
  };
  posts.push(post);
  savePosts();
  return post;
}

app.post('/posts', (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  const text = (req.body.text || '').toString().trim().slice(0, 500);
  let photoId = null;
  if (req.body.photoId) {
    const photo = photos.find(p => p.id === req.body.photoId);
    if (!photo) return res.status(400).json({ error: 'Photo not found' });
    if (photo.owner !== me) return res.status(403).json({ error: 'You can only attach your own photos' });
    photoId = photo.id;
  }
  if (!text && !photoId) return res.status(400).json({ error: 'Post text required' });
  const post = createPostRecord(me, text, photoId);
  assessContent(users[me], text, 'post');
  res.status(201).json({ post: serializePost(post, me) });
});

app.post('/posts/:id/like', (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.author !== me && anyBlock(me, post.author)) return res.status(403).json({ error: 'Unavailable' });
  if (!canViewProfile(me, post.author)) return res.status(403).json({ error: 'Unavailable' });
  const idx = post.likes.indexOf(me);
  let liked;
  if (idx >= 0) { post.likes.splice(idx, 1); liked = false; } else { post.likes.push(me); liked = true; }
  savePosts();
  res.json({ liked, likeCount: post.likes.length });
});

app.get('/posts/:id/comments', (req, res) => {
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const me = authHandle(req);
  const comments = post.comments
    .filter((c) => !(me && c.author !== me && anyBlock(me, c.author)))
    .map(c => ({
      id: c.id, text: c.text, createdAt: c.createdAt, author: authorSummary(c.author)
    }));
  res.json({ comments });
});

app.post('/posts/:id/comments', (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.author !== me && anyBlock(me, post.author)) return res.status(403).json({ error: 'Unavailable' });
  if (!canViewProfile(me, post.author)) return res.status(403).json({ error: 'Unavailable' });
  const text = (req.body.text || '').toString().trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'Comment text required' });
  const comment = { id: crypto.randomBytes(8).toString('hex'), author: me, text, createdAt: Date.now() };
  post.comments.push(comment);
  savePosts();
  assessContent(users[me], text, 'comment');
  res.status(201).json({
    comment: { id: comment.id, text: comment.text, createdAt: comment.createdAt, author: authorSummary(me) },
    commentCount: post.comments.length
  });
});

// ===================== PHOTO BUCKET =====================
// Upload: JSON { dataBase64, caption } — data URI prefix optional.
// Hard cap: 3 MB decoded. Type is sniffed from magic bytes, never
// trusted from the client. Files land in uploads/ under random names.

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

function sniffImageExt(buf) {
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

app.post('/photos', (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  let b64 = (req.body.dataBase64 || '').toString();
  const dataUri = b64.match(/^data:image\/[a-z0-9.+-]+;base64,(.*)$/i);
  if (dataUri) b64 = dataUri[1];
  if (!b64) return res.status(400).json({ error: 'Image data required' });
  const buf = Buffer.from(b64, 'base64');
  if (buf.length === 0) return res.status(400).json({ error: 'Image data did not decode' });
  if (buf.length > MAX_PHOTO_BYTES) return res.status(413).json({ error: 'Photo too large (max 3 MB)' });
  const ext = sniffImageExt(buf);
  if (!ext) return res.status(400).json({ error: 'Unsupported image — use JPG, PNG, GIF or WebP' });
  const filename = crypto.randomBytes(12).toString('hex') + '.' + ext;
  try {
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);
  } catch (err) {
    console.error('Photo write failed:', err);
    return res.status(500).json({ error: 'Could not store photo' });
  }
  const photo = {
    id: crypto.randomBytes(8).toString('hex'),
    owner: me,
    caption: (req.body.caption || '').toString().slice(0, 140),
    createdAt: Date.now(),
    filename
  };
  photos.push(photo);
  savePhotos();
  res.status(201).json({ photo: serializePhoto(photo) });
});

app.delete('/photos/:id', (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  const idx = photos.findIndex(p => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Photo not found' });
  const photo = photos[idx];
  if (photo.owner !== me) return res.status(403).json({ error: 'Not your photo' });
  photos.splice(idx, 1);
  savePhotos();
  try { fs.unlinkSync(path.join(UPLOADS_DIR, photo.filename)); } catch (err) { /* file already gone */ }
  if (users[me].bannerPhotoId === photo.id) {
    users[me].bannerPhotoId = null;
    saveUsers();
  }
  res.json({ deleted: true });
});

// ===================== PROFILE TRACKS =====================
// Same base64 upload pipeline as the photo bucket. Cap: 10 MB decoded.
// Type sniffed from magic bytes: MP3 (ID3 / frame sync), M4A (ftyp),
// WAV (RIFF/WAVE). Stored in uploads/ next to the photos.

const MAX_TRACK_BYTES = 10 * 1024 * 1024;

function sniffAudioExt(buf) {
  if (buf.length >= 3 && buf.toString('ascii', 0, 3) === 'ID3') return 'mp3';
  if (buf.length >= 2 && buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return 'mp3';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  if (buf.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp') return 'm4a';
  return null;
}

app.post('/tracks', (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  let b64 = (req.body.dataBase64 || '').toString();
  const dataUri = b64.match(/^data:[^;]+;base64,(.*)$/s);
  if (dataUri) b64 = dataUri[1];
  if (!b64) return res.status(400).json({ error: 'Audio data required' });
  const buf = Buffer.from(b64, 'base64');
  if (buf.length === 0) return res.status(400).json({ error: 'Audio data did not decode' });
  if (buf.length > MAX_TRACK_BYTES) return res.status(413).json({ error: 'Track too large (max 10 MB)' });
  const ext = sniffAudioExt(buf);
  if (!ext) return res.status(400).json({ error: 'Unsupported audio — use MP3, M4A or WAV' });
  const filename = crypto.randomBytes(12).toString('hex') + '.' + ext;
  try {
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);
  } catch (err) {
    console.error('Track write failed:', err);
    return res.status(500).json({ error: 'Could not store track' });
  }
  const track = {
    id: crypto.randomBytes(8).toString('hex'),
    owner: me,
    title: (req.body.title || 'Untitled track').toString().slice(0, 80),
    createdAt: Date.now(),
    filename
  };
  tracks.push(track);
  saveTracks();
  res.status(201).json({ track: serializeTrack(track) });
});

app.delete('/tracks/:id', (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  const idx = tracks.findIndex(t => t.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Track not found' });
  const track = tracks[idx];
  if (track.owner !== me) return res.status(403).json({ error: 'Not your track' });
  tracks.splice(idx, 1);
  saveTracks();
  try { fs.unlinkSync(path.join(UPLOADS_DIR, track.filename)); } catch (err) { /* file already gone */ }
  if (users[me].trackUrl && users[me].trackUrl.endsWith('/' + track.filename)) {
    users[me].trackUrl = '';
    users[me].trackTitle = '';
    saveUsers();
  }
  res.json({ deleted: true });
});

// Presence: handles of currently connected, authenticated sockets.
// Invisible users are NEVER broadcast — the server simply does not
// report them as online, anywhere.
function currentOnline() {
  const online = new Set();
  for (const client of wss.clients) {
    if (client.handle && !(users[client.handle] && users[client.handle].privacy.invisible)) {
      online.add(client.handle);
    }
  }
  return Array.from(online).sort();
}

let lastPresenceJson = '[]';
function broadcastPresence() {
  const list = currentOnline();
  const json = JSON.stringify(list);
  if (json === lastPresenceJson) return;
  lastPresenceJson = json;
  const payload = JSON.stringify({ type: 'presence', online: list });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(payload); } catch (err) { /* ignore dead sockets */ }
    }
  }
}

// HTTP: Create room — plain chat room, or a cypher room when
// type:'cypher' comes with a beat. The cypher config is stored and the
// session starts when the first member joins over WS.
app.post('/createRoom', (req, res) => {
  const { room } = req.body;
  if (!room || typeof room !== 'string') return res.status(400).json({ error: 'Room name required' });

  if (!rooms.has(room)) rooms.set(room, new Set());

  let cypher = null;
  if (req.body.type === 'cypher') {
    const beatUrl = (req.body.beatUrl || '').toString().trim().slice(0, 400);
    if (!beatUrl || (!/^https?:\/\//i.test(beatUrl) && !beatUrl.startsWith('/uploads/'))) {
      return res.status(400).json({ error: 'Cypher needs a beat: an http(s) URL or one of your uploaded tracks' });
    }
    const bpmRaw = parseInt(req.body.bpm, 10);
    const barsRaw = parseInt(req.body.barsPerTurn, 10);
    cypher = {
      type: 'cypher',
      // Host comes from the caller's login when present — the recap
      // post and host controls belong to a real account.
      host: authHandle(req) || (req.body.host || '').toString().trim().toLowerCase() || null,
      beatTitle: (req.body.beatTitle || 'Untitled beat').toString().slice(0, 80),
      beatUrl,
      bpm: Number.isFinite(bpmRaw) && bpmRaw >= 40 && bpmRaw <= 240 ? bpmRaw : 90,
      barsPerTurn: Number.isFinite(barsRaw) && barsRaw >= 1 && barsRaw <= 64 ? barsRaw : 8
    };
    roomConfigs.set(room, cypher);
  }
  console.log(`Room created: ${room}${cypher ? ' (cypher)' : ''}`);

  res.json({ success: true, rooms: Array.from(rooms.keys()), cypher });
});

// HTTP: List rooms
app.get('/rooms', (req, res) => {
  res.json({ rooms: Array.from(rooms.keys()) });
});

// HTTP: Health check (useful for Render)
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    clients: wss.clients.size,
    users: Object.keys(users).length,
    posts: posts.length,
    photos: photos.length,
    tracks: tracks.length,
    cyphers: cypherSessions.size,
    online: currentOnline().length,
    banned: Object.values(users).filter((u) => u.banned).length
  });
});

// Broadcast helper: send an object to all clients in a room
function broadcastToRoom(room, dataObj, exceptSocket = null) {
  const clients = rooms.get(room);
  if (!clients) return;
  const payload = JSON.stringify(dataObj);
  for (const client of clients) {
    if (client !== exceptSocket && client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (err) {
        console.error('Error sending to client:', err);
      }
    }
  }
}

// ===================== CYPHER ROOMS (v1) =====================
// A cypher room runs one beat with a mic queue. The host starts it
// (room config at createRoom time, or cypher-start over WS), people
// join the queue, the mic passes down the line, and ending the
// session posts a recap to the feed under the host's name.
// The beat itself is mixed on the PERFORMER's client (WebAudio), so
// the room hears the performer's mix — see ChatRoom.jsx.

function cypherStatePayload(room) {
  const s = cypherSessions.get(room);
  if (!s) return { type: 'cypher-state', room, active: false };
  return {
    type: 'cypher-state',
    room,
    active: true,
    host: s.host,
    beatTitle: s.beatTitle,
    beatUrl: s.beatUrl,
    bpm: s.bpm,
    barsPerTurn: s.barsPerTurn,
    queue: [...s.queue],
    current: s.current,
    turnStartedAt: s.turnStartedAt,
    performers: [...s.performers]
  };
}

function broadcastCypherState(room) {
  broadcastToRoom(room, cypherStatePayload(room));
}

function startCypher(room, cfg) {
  cypherSessions.set(room, {
    host: cfg.host || null,
    beatTitle: cfg.beatTitle || 'Untitled beat',
    beatUrl: cfg.beatUrl || '',
    bpm: cfg.bpm || 90,
    barsPerTurn: cfg.barsPerTurn || 8,
    queue: [],
    current: null,
    turnStartedAt: null,
    performers: []
  });
  broadcastToRoom(room, { type: 'system', message: `🎤 Cypher started — ${cfg.beatTitle || 'Untitled beat'}` });
  broadcastCypherState(room);
}

// Move the mic to the next queued handle that is actually in the room.
// Records each new performer (in order) for the recap post.
function advanceCypher(room) {
  const s = cypherSessions.get(room);
  if (!s) return;
  const clients = rooms.get(room) || new Set();
  const present = new Set(Array.from(clients).map(c => c.handle).filter(Boolean));
  let next = null;
  while (s.queue.length) {
    const candidate = s.queue.shift();
    if (present.has(candidate)) { next = candidate; break; }
  }
  s.current = next;
  s.turnStartedAt = next ? Date.now() : null;
  if (next && !s.performers.includes(next)) s.performers.push(next);
  broadcastCypherState(room);
}

function endCypher(room) {
  const s = cypherSessions.get(room);
  if (!s) return null;
  cypherSessions.delete(room);
  let recapPostId = null;
  if (s.host && users[s.host]) {
    const ranWith = s.performers.length
      ? s.performers.map(h => '@' + h).join(', ')
      : 'no takers this time';
    const post = createPostRecord(
      s.host,
      `🎤 Cypher in ${room} — ${s.beatTitle} — ran with ${ranWith}`
    );
    recapPostId = post.id;
  }
  broadcastToRoom(room, { type: 'cypher-ended', room, recapPostId });
  broadcastCypherState(room);
  return recapPostId;
}

function leaveRoom(ws) {
  const room = ws.currentRoom;
  if (!room) return;
  const set = rooms.get(room);
  if (set) {
    set.delete(ws);
    // Cypher housekeeping: a departing performer passes the mic on;
    // a departing queue member drops out of the line.
    const s = cypherSessions.get(room);
    if (s && ws.handle) {
      const qi = s.queue.indexOf(ws.handle);
      if (qi >= 0) s.queue.splice(qi, 1);
      if (s.current === ws.handle) advanceCypher(room);
      else if (qi >= 0) broadcastCypherState(room);
    }
    broadcastToRoom(room, { type: 'system', message: 'A user left the room' }, ws);
    broadcastRtcPeers(room);
    if (set.size === 0) {
      rooms.delete(room);
      cypherSessions.delete(room);
      roomConfigs.delete(room);
    }
  }
  ws.currentRoom = null;
}

// ===================== DM ROOMS =====================
// DM rooms are named dm:<handleA>:<handleB> (sorted). Only the two
// named, logged-in users may join one.
const isDmRoom = (room) => typeof room === 'string' && room.startsWith('dm:');
function dmPairOf(room) {
  const parts = room.split(':');
  return parts.length === 3 ? [parts[1], parts[2]] : null;
}
// May `me` open a first contact with `target` right now? (Policy gate
// for creating a NEW DM request; open pairs bypass it.)
function dmPolicyAllows(me, target) {
  const t = users[target];
  if (!t) return false;
  const policy = t.privacy.dmFrom || 'everyone';
  if (policy === 'nobody') return false;
  if (policy === 'confidants' && !isConfidant(me, target)) return false;
  return true;
}

// ===================== WEBRTC SIGNALING (2026-10-15) =====================
// Relay for rtc-offer / rtc-answer / rtc-ice between two sockets in the
// same room, addressed by per-socket peerId. broadcastRtcPeers keeps
// every room member's peer list current so clients know whom to call.
// v1.2.0: peer lists are built PER RECIPIENT — blocked pairs never see
// each other, and invisible users appear under a generic label (their
// handle is never broadcast; global presence hides them entirely).

function peerEntryFor(recipient, peer) {
  const peerHandle = peer.handle || null;
  const redacted = peerHandle && recipient.handle !== peerHandle &&
    users[peerHandle] && users[peerHandle].privacy.invisible;
  return {
    id: peer.peerId,
    name: redacted ? '🤫 Someone' : (peer.handle || peer.userName || 'User'),
    live: !!peer.videoLive,
    muted: !!peer.muted,
    blackedOut: !!peer.blackedOut
  };
}

function broadcastRtcPeers(room) {
  const clients = rooms.get(room);
  if (!clients) return;
  const all = Array.from(clients);
  for (const client of clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    const visible = all.filter((peer) => {
      if (peer === client) return true;
      if (client.handle && peer.handle && anyBlock(client.handle, peer.handle)) return false;
      return true;
    });
    try {
      client.send(JSON.stringify({
        type: 'rtc-peers', room,
        peers: visible.map((peer) => peerEntryFor(client, peer))
      }));
    } catch (err) { /* ignore dead sockets */ }
  }
}

function findPeer(room, peerId) {
  const clients = rooms.get(room);
  if (!clients) return null;
  for (const client of clients) {
    if (client.peerId === peerId) return client;
  }
  return null;
}

// Signaling policy between two sockets. Returns null when allowed, or
// an error message for the SENDER when refused.
function signalingRefusal(fromWs, toWs, room, isLiveNote) {
  const from = fromWs.handle;
  const to = toWs ? toWs.handle : null;
  if (from && to && anyBlock(from, to)) return 'Unavailable';
  const fromUser = from ? users[from] : null;
  if (fromUser && !fromUser.privacy.videoEnabled) return 'Video is disabled on your account';
  if (isDmRoom(room)) {
    // DM media is a call: both sides must have video on.
    const toUser = to ? users[to] : null;
    if (toUser && !toUser.privacy.videoEnabled) return 'Video is unavailable for this user';
    if (!isLiveNote && from && to && !pairOpen(from, to)) return 'This conversation is not open for calls yet';
  }
  // Public/cypher rooms: receiving stays allowed for video-off users
  // (listening to a cypher is receiving a performance, not a call) —
  // their own publishing is refused above.
  return null;
}

// WebSocket Connection Management
wss.on('connection', (ws, request) => {
  const origin = request.headers.origin;

  // Origin check: allow when no origins configured, or no origin header
  // (non-browser clients), or origin is in the allow list or an app origin
  if (ALLOWED_ORIGINS.length && origin && !isAllowedOrigin(origin)) {
    console.warn('Connection rejected due to origin:', origin);
    ws.close(1008, 'Origin not allowed');
    return;
  }

  ws.isAlive = true;
  ws.currentRoom = null;
  ws.handle = null;
  ws.userName = null;
  ws.videoLive = false;
  ws.muted = false;
  ws.blackedOut = false;
  ws.clientIp = wsClientIp(request);
  ws.peerId = crypto.randomBytes(6).toString('hex');

  // Presence auth via ?token= on the WS URL (the 'auth' message also works)
  try {
    const url = new URL(request.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (token && sessions.has(token)) {
      const h = sessions.get(token);
      if (!users[h] || !users[h].banned) ws.handle = h;
    }
  } catch (err) { /* non-fatal: socket just stays anonymous */ }

  // Everyone gets a presence snapshot on connect; authed joins also
  // trigger a broadcast since the online set just changed.
  try {
    ws.send(JSON.stringify({ type: 'presence', online: currentOnline() }));
  } catch (err) { /* ignore */ }
  if (ws.handle) broadcastPresence();

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    const { type } = data;

    if (type === 'auth') {
      const token = (data.token || '').toString();
      if (sessions.has(token)) {
        const h = sessions.get(token);
        if (users[h] && users[h].banned) {
          ws.send(JSON.stringify({ type: 'error', code: 'banned', message: 'This account is banned' }));
          return;
        }
        ws.handle = h;
        ws.send(JSON.stringify({ type: 'authed', handle: ws.handle }));
        broadcastPresence();
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
      }
      return;
    }

    if (type === 'join') {
      const room = data.room;
      if (!room || typeof room !== 'string') {
        ws.send(JSON.stringify({ type: 'error', message: 'Room name required to join' }));
        return;
      }
      // DM rooms are private to the two named, logged-in users.
      if (isDmRoom(room)) {
        const pair = dmPairOf(room);
        if (!pair || !ws.handle || !pair.includes(ws.handle)) {
          ws.send(JSON.stringify({ type: 'error', code: 'dm-private', message: 'This conversation is private' }));
          return;
        }
        const other = pair[0] === ws.handle ? pair[1] : pair[0];
        if (!users[other]) {
          ws.send(JSON.stringify({ type: 'error', code: 'dm-unavailable', message: 'Unavailable' }));
          return;
        }
      }
      if (typeof data.user === 'string') ws.userName = data.user.slice(0, 50);
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(ws);
      ws.currentRoom = room;
      console.log(`Client joined room: ${room}`);
      broadcastToRoom(room, { type: 'system', message: 'A user joined the room' }, ws);
      ws.send(JSON.stringify({ type: 'joined', room, peerId: ws.peerId }));
      broadcastRtcPeers(room);
      // Cypher: a configured cypher room starts its session when the
      // first member joins; joining a running cypher re-sends state.
      const cfg = roomConfigs.get(room);
      if (cfg && cfg.type === 'cypher' && !cypherSessions.has(room)) {
        startCypher(room, cfg);
      } else if (cypherSessions.has(room)) {
        try { ws.send(JSON.stringify(cypherStatePayload(room))); } catch (err) { /* ignore */ }
      }
      return;
    }

    if (type === 'leave') {
      leaveRoom(ws);
      ws.send(JSON.stringify({ type: 'left' }));
      return;
    }

    // ---- DM video call invites (v1.2.0) ----
    // Starting video in a DM is an invitation, not an ambush: the
    // server checks the pair, the recipient's call policy and both
    // accounts' video switches before the callee's phone ever rings.
    if (type === 'call-invite' || type === 'call-accept' || type === 'call-decline' || type === 'call-cancel') {
      const room = ws.currentRoom || data.room;
      if (!room || !isDmRoom(room)) {
        ws.send(JSON.stringify({ type: 'error', code: 'call-failed', message: 'Calls only happen inside a DM' }));
        return;
      }
      if (!ws.handle) {
        ws.send(JSON.stringify({ type: 'error', code: 'call-failed', message: 'Login required to call' }));
        return;
      }
      const pair = dmPairOf(room);
      const other = pair[0] === ws.handle ? pair[1] : pair[0];
      const otherUser = users[other];
      const target = findPeer(room, (data.to || '').toString());
      if (type === 'call-invite') {
        const deny = (code, message) => ws.send(JSON.stringify({ type: 'call-unavailable', code, message }));
        if (!otherUser || anyBlock(ws.handle, other)) return deny('unavailable', 'This call cannot be placed');
        if (!users[ws.handle].privacy.videoEnabled) return deny('your-video-off', 'Video is disabled in your settings');
        if (!otherUser.privacy.videoEnabled) return deny('video-unavailable', 'Video is unavailable for this user');
        if (!pairOpen(ws.handle, other)) return deny('not-accepted', 'Accept the conversation before calling');
        const policy = otherUser.privacy.videoFrom || 'everyone';
        if (policy === 'nobody') return deny('video-unavailable', 'Video is unavailable for this user');
        if (policy === 'confidants' && !isConfidant(ws.handle, other)) return deny('confidants-only', 'This user only takes calls from their Confidants');
        if (!target) return deny('unavailable', 'They are not in this conversation right now');
        try {
          target.send(JSON.stringify({ type: 'call-incoming', room, from: ws.peerId, fromHandle: ws.handle }));
        } catch (err) { return deny('unavailable', 'This call cannot be placed'); }
        return;
      }
      // accept / decline / cancel relay to the named peer.
      if (!target) {
        ws.send(JSON.stringify({ type: 'error', code: 'call-failed', message: 'Peer not found' }));
        return;
      }
      if (anyBlock(ws.handle, other)) {
        ws.send(JSON.stringify({ type: 'error', code: 'call-failed', message: 'Unavailable' }));
        return;
      }
      const outType = type === 'call-accept' ? 'call-accepted' : type === 'call-decline' ? 'call-declined' : 'call-cancelled';
      try {
        target.send(JSON.stringify({ type: outType, room, from: ws.peerId, fromHandle: ws.handle }));
      } catch (err) { /* peer vanished mid-call */ }
      return;
    }

    // Mic mute / camera blackout state notes — relayed room-wide so
    // remote tiles render the real state (a blacked-out tile is
    // labeled, never a silent frozen frame).
    if (type === 'rtc-mute' || type === 'rtc-blackout') {
      const room = ws.currentRoom || data.room;
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not in a room' }));
        return;
      }
      if (type === 'rtc-mute') ws.muted = !!data.muted;
      else ws.blackedOut = !!data.blackedOut;
      broadcastToRoom(room, { type, room, from: ws.peerId, muted: ws.muted, blackedOut: ws.blackedOut }, ws);
      broadcastRtcPeers(room);
      return;
    }

    // WebRTC signaling relay — addressed peer-to-peer inside one room.
    // rtc-live is a room-wide note ("I started/stopped video"); the other
    // three are delivered ONLY to the socket whose peerId matches `to`.
    if (type === 'rtc-live' || type === 'rtc-offer' || type === 'rtc-answer' || type === 'rtc-ice') {
      const room = ws.currentRoom || data.room;
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not in a room' }));
        return;
      }
      if (type === 'rtc-live') {
        if (data.live) {
          const refusal = signalingRefusal(ws, null, room, true);
          if (refusal) {
            ws.send(JSON.stringify({ type: 'error', code: 'video-disabled', message: refusal }));
            return;
          }
        }
        ws.videoLive = !!data.live;
        broadcastToRoom(room, { type: 'rtc-live', room, from: ws.peerId, live: ws.videoLive }, ws);
        broadcastRtcPeers(room);
        return;
      }
      const target = findPeer(room, (data.to || '').toString());
      if (!target) {
        ws.send(JSON.stringify({ type: 'error', message: 'Peer not found' }));
        return;
      }
      const refusal = signalingRefusal(ws, target, room, false);
      if (refusal) {
        ws.send(JSON.stringify({
          type: 'error',
          code: refusal === 'Video is unavailable for this user' ? 'video-unavailable' : 'video-disabled',
          message: refusal
        }));
        return;
      }
      try {
        target.send(JSON.stringify({ type, room, from: ws.peerId, payload: data.payload }));
      } catch (err) {
        console.error('Error relaying signal:', err);
      }
      return;
    }

    // ---- Cypher room control ----
    if (type === 'cypher-start' || type === 'cypher-queue-join' || type === 'cypher-queue-leave' ||
        type === 'cypher-pass' || type === 'cypher-end') {
      const room = ws.currentRoom;
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not in a room' }));
        return;
      }

      if (type === 'cypher-start') {
        if (!ws.handle) {
          ws.send(JSON.stringify({ type: 'error', message: 'Login required to host a cypher' }));
          return;
        }
        const existing = cypherSessions.get(room);
        if (existing && existing.host !== ws.handle) {
          ws.send(JSON.stringify({ type: 'error', message: 'Only the host can restart the cypher' }));
          return;
        }
        const bpmRaw = parseInt(data.bpm, 10);
        const barsRaw = parseInt(data.barsPerTurn, 10);
        const cfg = {
          host: ws.handle,
          beatTitle: ((data.beatTitle || (existing && existing.beatTitle) || 'Untitled beat') + '').slice(0, 80),
          beatUrl: ((data.beatUrl || (existing && existing.beatUrl) || '') + '').slice(0, 400),
          bpm: Number.isFinite(bpmRaw) && bpmRaw >= 40 && bpmRaw <= 240 ? bpmRaw : (existing ? existing.bpm : 90),
          barsPerTurn: Number.isFinite(barsRaw) && barsRaw >= 1 && barsRaw <= 64 ? barsRaw : (existing ? existing.barsPerTurn : 8)
        };
        if (!cfg.beatUrl) {
          ws.send(JSON.stringify({ type: 'error', message: 'Cypher needs a beat URL' }));
          return;
        }
        startCypher(room, cfg);
        return;
      }

      const session = cypherSessions.get(room);
      if (!session) {
        ws.send(JSON.stringify({ type: 'error', message: 'No cypher running in this room' }));
        return;
      }

      if (type === 'cypher-queue-join') {
        if (!ws.handle) {
          ws.send(JSON.stringify({ type: 'error', message: 'Login required to join the mic queue' }));
          return;
        }
        if (session.current === ws.handle) { broadcastCypherState(room); return; }
        if (!session.current) {
          // Mic is open — stepping up takes it immediately.
          session.current = ws.handle;
          session.turnStartedAt = Date.now();
          if (!session.performers.includes(ws.handle)) session.performers.push(ws.handle);
        } else if (!session.queue.includes(ws.handle)) {
          session.queue.push(ws.handle);
        }
        broadcastCypherState(room);
        return;
      }

      if (type === 'cypher-queue-leave') {
        if (!ws.handle) return;
        if (session.current === ws.handle) { advanceCypher(room); return; }
        const qi = session.queue.indexOf(ws.handle);
        if (qi >= 0) session.queue.splice(qi, 1);
        broadcastCypherState(room);
        return;
      }

      if (type === 'cypher-pass') {
        if (session.current !== ws.handle && session.host !== ws.handle) {
          ws.send(JSON.stringify({ type: 'error', message: 'Only the performer or the host can pass the mic' }));
          return;
        }
        advanceCypher(room);
        return;
      }

      if (type === 'cypher-end') {
        if (session.host !== ws.handle) {
          ws.send(JSON.stringify({ type: 'error', message: 'Only the host can end the cypher' }));
          return;
        }
        endCypher(room);
        return;
      }
    }

    if (type === 'msg') {
      const room = ws.currentRoom || data.room;
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not in a room' }));
        return;
      }
      const text = (data.text || '').toString().slice(0, 2000);
      if (!text.trim()) return;

      // ---------- DM pipeline: requests, blocks, policy, safety ----------
      if (isDmRoom(room)) {
        if (!ws.handle) {
          ws.send(JSON.stringify({ type: 'error', code: 'dm-unavailable', message: 'Login required for DMs' }));
          return;
        }
        const pair = dmPairOf(room);
        const other = pair && (pair[0] === ws.handle ? pair[1] : pair[0]);
        const me = users[ws.handle];
        const them = other ? users[other] : null;
        if (!me || !them) {
          ws.send(JSON.stringify({ type: 'error', code: 'dm-unavailable', message: 'Unavailable' }));
          return;
        }
        // Sender identity is the logged-in account, never client-claimed.
        const senderName = ws.handle;

        // Anti-scam content pass (posts/DMs/rooms all assessed).
        assessContent(me, text, 'dm message');
        recordSignals(me, behavioralSignals(ws.handle, text, false), 'dm behavior');
        if (me.banned) return; // banned mid-assessment (post-warning ladder)

        if (anyBlock(ws.handle, other)) {
          ws.send(JSON.stringify({ type: 'error', code: 'dm-unavailable', message: 'This conversation is unavailable' }));
          return;
        }

        if (!pairOpen(ws.handle, other)) {
          // If THEY already requested ME, my replying is acceptance —
          // open the pair and fall through to normal delivery.
          if ((me.dmRequests || []).some((r) => r.from === other)) {
            me.dmRequests = me.dmRequests.filter((r) => r.from !== other);
            me.dmDenied = (me.dmDenied || []).filter((h) => h !== other);
            if (!me.dmAccepted.includes(other)) me.dmAccepted.push(other);
            saveUsers();
            notifyUser(other, { type: 'dm-accepted', room, by: ws.handle });
            broadcastToRoom(room, { type: 'msg', room, user: senderName, text, ts: Date.now() });
            return;
          }
          // ---- first-contact territory: trio rule, opener signals,
          // then the request gate itself.
          const key = `${ws.handle}>${other}`;
          // Lead-on opener signal on the sender's first messages.
          const openCount = (openerState.get(key) || 0) + 1;
          openerState.set(key, openCount);
          if (openCount <= 3 && antiscam.assessOpener(text)) {
            recordSignals(me, ['leadon_opener'], 'first-contact opener');
            if (me.banned) return;
          }
          // HARD RULE (Daniel, verbatim): the sender's first three
          // QUESTIONS to a new contact, in order — age? / where from? /
          // what are you looking for here? — means instant permanent ban.
          const intent = antiscam.classifyQuestion(text);
          if (intent) {
            const qs = trioState.get(key) || [];
            qs.push(intent);
            trioState.set(key, qs);
            if (qs.length === 3 && qs[0] === 'age' && qs[1] === 'location' && qs[2] === 'intent') {
              logModeration({
                handle: ws.handle, kind: 'trio-ban', signals: ['opener_trio'],
                ips: userIps(me), detail: `Opener trio sequence banned: ${JSON.stringify(qs)}`
              });
              banUser(ws.handle, 'Instant ban: age / where-from / what-are-you-looking-for opener trio to a new contact', ['opener_trio']);
              return;
            }
          }
          // Denied earlier, or policy says no new requests right now.
          if ((them.dmDenied || []).includes(ws.handle) || !dmPolicyAllows(ws.handle, other)) {
            ws.send(JSON.stringify({ type: 'error', code: 'dm-unavailable', message: 'This conversation is unavailable' }));
            return;
          }
          // Create (or refresh) the request — the message is HELD as
          // the preview, never delivered into their conversation.
          const existing = (them.dmRequests || []).find((r) => r.from === ws.handle);
          if (checkMassDm(ws.handle, other)) recordSignals(me, ['mass_dm'], 'mass first-contact DMs');
          if (me.banned) return;
          if (existing) {
            ws.send(JSON.stringify({ type: 'dm-request-pending', room, message: 'Request already sent — waiting for them to accept' }));
            return;
          }
          them.dmRequests.push({ from: ws.handle, at: Date.now(), preview: text.slice(0, 300) });
          saveUsers();
          notifyUser(other, { type: 'dm-request', room, from: ws.handle });
          ws.send(JSON.stringify({ type: 'dm-request-sent', room, message: 'Request sent — your message lands when they accept' }));
          return;
        }

        // Open conversation: free messaging. If I message someone who
        // had denied me but the pair is open via their acceptance,
        // state is already consistent.
        broadcastToRoom(room, { type: 'msg', room, user: senderName, text, ts: Date.now() });
        return;
      }

      // ---------- public room message ----------
      const user = ws.handle || (data.user || 'User').toString().slice(0, 50);
      if (ws.handle && users[ws.handle]) {
        assessContent(users[ws.handle], (data.text || '').toString(), 'room message');
        recordSignals(users[ws.handle], behavioralSignals(ws.handle, (data.text || '').toString(), true), 'room behavior');
        if (users[ws.handle].banned) return;
      }
      broadcastToRoom(room, { type: 'msg', room, user, text, ts: Date.now() });
      return;
    }

    ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  });

  ws.on('close', () => {
    leaveRoom(ws);
    if (ws.handle) {
      ws.handle = null;
      broadcastPresence();
    }
    console.log('Client disconnected');
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// Heartbeat — terminate dead connections
const interval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (err) {
      console.error('Ping error:', err);
    }
  }
}, 30000);

// Graceful shutdown
function shutdown() {
  console.log('Shutting down server...');
  clearInterval(interval);
  wss.clients.forEach((ws) => ws.terminate());
  wss.close(() => {
    server.close(() => {
      console.log('Server closed.');
      process.exit(0);
    });
  });
  // Failsafe so Render deploys don't hang
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
server.listen(PORT, () => {
  console.log(`HuSH backend running on port ${PORT}`);
});
