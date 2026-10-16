'use strict';

const express = require('express');
const http = require('http');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
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

// users: { [handle]: { handle, salt, passHash, displayName, bio, avatarEmoji, createdAt, following: [] } }
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
// sessions: token -> handle
const sessions = new Map();

function saveUsers() { saveJson(USERS_FILE, users); }
function savePosts() { saveJson(POSTS_FILE, posts); }
function savePhotos() { saveJson(PHOTOS_FILE, photos); }
function saveTracks() { saveJson(TRACKS_FILE, tracks); }

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
    postCount: posts.filter(p => p.author === u.handle).length
  };
}

function authHandle(req) {
  const token = req.headers['x-hush-token'];
  if (!token) return null;
  return sessions.get(token) || null;
}

function requireAuth(req, res) {
  const handle = authHandle(req);
  if (!handle) { res.status(401).json({ error: 'Login required' }); return null; }
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
  const salt = crypto.randomBytes(16).toString('hex');
  users[handle] = {
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
    following: []
  };
  saveUsers();
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, handle);
  res.json({ token, user: publicProfile(users[handle]) });
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
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, handle);
  res.json({ token, user: publicProfile(u) });
});

app.get('/me', (req, res) => {
  const handle = requireAuth(req, res);
  if (!handle) return;
  res.json({ user: publicProfile(users[handle]) });
});

app.put('/me', (req, res) => {
  const handle = requireAuth(req, res);
  if (!handle) return;
  const u = users[handle];
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
  saveUsers();
  res.json({ user: publicProfile(u) });
});

app.get('/users', (req, res) => {
  const me = authHandle(req);
  const list = Object.values(users).map(u => ({
    ...publicProfile(u),
    following: me ? users[me].following.includes(u.handle) : false,
    isMe: me === u.handle
  }));
  res.json({ users: list });
});

app.get('/users/:handle', (req, res) => {
  const u = users[req.params.handle.toLowerCase()];
  if (!u) return res.status(404).json({ error: 'User not found' });
  const me = authHandle(req);
  res.json({
    user: {
      ...publicProfile(u),
      following: me ? users[me].following.includes(u.handle) : false,
      isMe: me === u.handle
    }
  });
});

app.get('/users/:handle/posts', (req, res) => {
  const handle = req.params.handle.toLowerCase();
  if (!users[handle]) return res.status(404).json({ error: 'User not found' });
  const me = authHandle(req);
  const list = posts
    .filter(p => p.author === handle)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(p => serializePost(p, me));
  res.json({ posts: list });
});

app.get('/users/:handle/photos', (req, res) => {
  const handle = req.params.handle.toLowerCase();
  if (!users[handle]) return res.status(404).json({ error: 'User not found' });
  const list = photos
    .filter(p => p.owner === handle)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(serializePhoto);
  res.json({ photos: list });
});

app.get('/users/:handle/tracks', (req, res) => {
  const handle = req.params.handle.toLowerCase();
  if (!users[handle]) return res.status(404).json({ error: 'User not found' });
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
  const mine = users[me].following;
  const idx = mine.indexOf(target);
  let following;
  if (idx >= 0) { mine.splice(idx, 1); following = false; } else { mine.push(target); following = true; }
  saveUsers();
  res.json({ following, user: publicProfile(users[target]) });
});

app.get('/feed', (req, res) => {
  const me = authHandle(req);
  const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 100);
  const feed = [...posts]
    .sort((a, b) => b.createdAt - a.createdAt)
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
  res.status(201).json({ post: serializePost(post, me) });
});

app.post('/posts/:id/like', (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const idx = post.likes.indexOf(me);
  let liked;
  if (idx >= 0) { post.likes.splice(idx, 1); liked = false; } else { post.likes.push(me); liked = true; }
  savePosts();
  res.json({ liked, likeCount: post.likes.length });
});

app.get('/posts/:id/comments', (req, res) => {
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const comments = post.comments.map(c => ({
    id: c.id, text: c.text, createdAt: c.createdAt, author: authorSummary(c.author)
  }));
  res.json({ comments });
});

app.post('/posts/:id/comments', (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const text = (req.body.text || '').toString().trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'Comment text required' });
  const comment = { id: crypto.randomBytes(8).toString('hex'), author: me, text, createdAt: Date.now() };
  post.comments.push(comment);
  savePosts();
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

// Presence: handles of currently connected, authenticated sockets
function currentOnline() {
  const online = new Set();
  for (const client of wss.clients) if (client.handle) online.add(client.handle);
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
    online: currentOnline().length
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

// ===================== WEBRTC SIGNALING (2026-10-15) =====================
// Relay for rtc-offer / rtc-answer / rtc-ice between two sockets in the
// same room, addressed by per-socket peerId. broadcastRtcPeers keeps
// every room member's peer list current so clients know whom to call.

function broadcastRtcPeers(room) {
  const clients = rooms.get(room);
  if (!clients) return;
  const peers = Array.from(clients).map(c => ({
    id: c.peerId,
    name: c.handle || c.userName || 'User',
    live: !!c.videoLive
  }));
  const payload = JSON.stringify({ type: 'rtc-peers', room, peers });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(payload); } catch (err) { /* ignore dead sockets */ }
    }
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
  ws.peerId = crypto.randomBytes(6).toString('hex');

  // Presence auth via ?token= on the WS URL (the 'auth' message also works)
  try {
    const url = new URL(request.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (token && sessions.has(token)) ws.handle = sessions.get(token);
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
        ws.handle = sessions.get(token);
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
      const user = (data.user || 'User').toString().slice(0, 50);
      const payload = { type: 'msg', room, user, text, ts: Date.now() };
      broadcastToRoom(room, payload);
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
    
