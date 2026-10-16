import React, { useState, useEffect, useRef } from 'react';
import { api, setToken } from '../api';
import { API_BASE } from '../config';
import PostCard from '../components/PostCard';
import AvatarView, { AVATAR_DEFAULT } from '../components/AvatarView';
import AvatarBuilder from '../components/AvatarBuilder';
import Frame, { PatternLayer } from '../components/ThemeFrame';
import { getTheme, THEME_LIST } from '../themes';

const AVATARS = ['🤫', '👻', '🔥', '🌙', '⭐', '🦊', '🐺', '🎭', '💎', '🚀', '🎧', '⚡'];

function resolveUrl(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : API_BASE + url;
}

function isDirectAudio(url) {
  if (!url) return false;
  if (url.startsWith('/uploads/')) return true;
  return /\.(mp3|m4a|wav)(\?|#|$)/i.test(url);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- Profile music (viewer-side rules) ----------
// Plays ONCE per profile visit, never loops. The viewer owns playback:
// an always-visible (sticky) Stop/Pause lives here. Stop is sticky for
// the whole visit — state lives in refs, so re-renders, scrolls and
// component updates can never restart it. Leaving the page unmounts
// this component and the cleanup pauses the audio. If the browser
// blocks the automatic play, it arms on the viewer's first tap instead
// (and a Stop pressed before that tap cancels the arming).
function ProfileMusic({ profile }) {
  const audioRef = useRef(null);
  const stateRef = useRef({ stopped: false, autoPlayed: false });
  const [notice, setNotice] = useState('');
  const [playing, setPlaying] = useState(false);

  const url = profile.trackUrl;
  const direct = isDirectAudio(url);
  const src = direct ? resolveUrl(url) : null;
  const title = profile.trackTitle || 'Profile track';

  useEffect(() => {
    if (!direct || !src) return undefined;
    const audio = audioRef.current;
    if (!audio) return undefined;
    const st = stateRef.current;
    let tapHandler = null;

    const markPlayed = () => { st.autoPlayed = true; setNotice(''); };
    const attempt = audio.play();
    if (attempt) {
      attempt.then(markPlayed).catch(() => {
        if (st.stopped || st.autoPlayed) return;
        setNotice('Tap anywhere to hear the profile track 🎵');
        tapHandler = () => {
          if (st.stopped || st.autoPlayed) return;
          audio.play().then(markPlayed).catch(() => {});
        };
        document.addEventListener('pointerdown', tapHandler, { once: true });
      });
    }
    return () => {
      if (tapHandler) document.removeEventListener('pointerdown', tapHandler);
      audio.pause();
    };
  }, [direct, src]);

  if (!url) return null;

  if (!direct) {
    // Page link (e.g. BandLab): a real link out, never a dead player.
    return (
      <div className="sticky top-2 z-10 flex items-center gap-3 rounded-2xl border border-rose-400/25 bg-slate-900/95 p-3 shadow-2xl shadow-black/50 backdrop-blur">
        <span className="text-xl">🎵</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{title}</p>
          <p className="text-[10px] text-slate-400">Profile track</p>
        </div>
        <a href={url} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-rose-950/50">
          Open track ↗
        </a>
      </div>
    );
  }

  const stopMusic = () => {
    stateRef.current.stopped = true;
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    setPlaying(false);
    setNotice('Music stopped for this visit');
  };

  const togglePause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      stateRef.current.autoPlayed = true; // deliberate viewer play
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  return (
    <div className="sticky top-2 z-10 rounded-2xl border border-rose-400/25 bg-gradient-to-b from-rose-500/[0.08] to-slate-900/95 p-3 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="text-xl">🎵</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{title}</p>
          <p className="text-[10px] text-slate-400">{notice || 'Profile track • plays once'}</p>
        </div>
        <button onClick={togglePause} className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-white">
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button onClick={stopMusic} className="shrink-0 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white">
          ⏹ Stop
        </button>
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { stateRef.current.autoPlayed = true; setPlaying(false); }}
        className="mt-2 w-full"
        controls
      />
    </div>
  );
}

// ---------- Auth forms (shown when logged out, no target) ----------
function AuthForms({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = mode === 'register' ? { handle, password, displayName: displayName || handle } : { handle, password };
      const data = await api(`/auth/${mode}`, { method: 'POST', body });
      setToken(data.token);
      onAuth(data.user);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto w-full max-w-md p-4">
      <div className="grad-card rounded-[22px] p-5">
        <h2 className="mb-1 text-lg font-black">🤫 HuSH</h2>
        <p className="mb-4 text-xs text-slate-400">
          {mode === 'register' ? 'Pick a handle and password. That is the whole form.' : 'Welcome back.'}
        </p>
        <div className="mb-4 flex rounded-xl border border-white/10 bg-slate-900 p-1">
          {['login', 'register'].map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-lg py-1.5 text-xs font-bold uppercase ${mode === m ? 'bg-rose-600 text-white shadow-md shadow-rose-950/50' : 'text-slate-400'}`}>
              {m}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-2.5">
          <input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())} placeholder="handle (a-z, 0-9, _)" autoComplete="username" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none" />
          {mode === 'register' && (
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name (optional)" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none" />
          )}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (4+ characters)" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none" />
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 py-2.5 text-sm font-bold uppercase text-white shadow-lg shadow-rose-950/50 disabled:opacity-50">
            {mode === 'register' ? 'Create account' : 'Log in'}
          </button>
        </form>
        <p className="mt-3 text-center text-[11px] text-slate-500">
          No account? Rooms still work as a guest — Feed, People and DMs need the account.
        </p>
      </div>
    </div>
  );
}

// ---------- Main profile page (any user) ----------
export default function ProfilePage({ me, onAuth, targetHandle, go, goDm }) {
  const handle = targetHandle || (me && me.handle) || null;
  const [profile, setProfile] = useState(null);
  const [userPosts, setUserPosts] = useState([]);
  const [userPhotos, setUserPhotos] = useState([]);
  const [userTracks, setUserTracks] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  // own-profile management state
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [trackTitleInput, setTrackTitleInput] = useState('');
  const [uploading, setUploading] = useState(false);

  // edit drafts
  const [draft, setDraft] = useState(null);

  const isOwn = !!(me && profile && me.handle === profile.handle);

  const loadAll = async (h) => {
    try {
      const [p, po, ph, tr] = await Promise.all([
        api(`/users/${h}`),
        api(`/users/${h}/posts`),
        api(`/users/${h}/photos`),
        api(`/users/${h}/tracks`)
      ]);
      setProfile(p.user);
      setUserPosts(po.posts);
      setUserPhotos(ph.photos);
      setUserTracks(tr.tracks);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
  };

  useEffect(() => {
    if (handle) loadAll(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, me ? me.handle : null]);

  // Initialize edit drafts when my own profile loads
  useEffect(() => {
    if (profile && me && profile.handle === me.handle) {
      setDraft({
        displayName: profile.displayName || '',
        bio: profile.bio || '',
        statusLine: profile.statusLine || '',
        accentColor: profile.accentColor || '#a78bfa',
        bannerEmoji: profile.bannerEmoji || '🌙',
        bannerColor: profile.bannerColor || '#1e1b4b',
        trackTitle: profile.trackTitle || '',
        trackUrl: profile.trackUrl || '',
        links: [0, 1, 2, 3].map((i) => profile.links[i] || { label: '', url: '' }),
        avatarMode: profile.avatarMode || 'emoji',
        avatarEmoji: profile.avatarEmoji || '🤫',
        avatar: profile.avatar || { ...AVATAR_DEFAULT },
        avatarPhotoId: profile.avatarPhotoId || null,
        themeId: profile.themeId || 'midnight'
      });
    }
  }, [profile, me]);

  if (!handle) return <AuthForms onAuth={onAuth} />;
  if (!profile) {
    return <div className="p-6 text-center text-sm text-slate-500">{loadError || 'Loading profile…'}</div>;
  }

  const bannerPhoto = userPhotos.find((p) => p.id === profile.bannerPhotoId);
  const theme = getTheme(profile.themeId);
  const cardStyle = { background: theme.cardGradient || theme.cardBg, borderColor: theme.frameColor };
  const pinnedPost = profile.pinnedPostId ? userPosts.find((p) => p.id === profile.pinnedPostId) : null;
  const restPosts = pinnedPost ? userPosts.filter((p) => p.id !== pinnedPost.id) : userPosts;

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 2500); };

  const toggleFollow = async () => {
    if (!me) { go('profile'); return; }
    try {
      const data = await api(`/users/${profile.handle}/follow`, { method: 'POST', body: {} });
      setProfile((prev) => ({ ...prev, following: data.following, followerCount: data.user.followerCount }));
    } catch (err) { setActionError(err.message); }
  };

  const togglePin = async (post) => {
    try {
      const next = profile.pinnedPostId === post.id ? null : post.id;
      const data = await api('/me', { method: 'PUT', body: { pinnedPostId: next } });
      onAuth(data.user);
      setProfile((prev) => ({ ...prev, pinnedPostId: data.user.pinnedPostId }));
      flash(next ? 'Post pinned 📌' : 'Post unpinned');
    } catch (err) { setActionError(err.message); }
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setActionError('Photo is over the 3 MB limit.'); return; }
    setUploading(true);
    try {
      const dataBase64 = await fileToBase64(file);
      const data = await api('/photos', { method: 'POST', body: { dataBase64, caption: photoCaption } });
      setUserPhotos((prev) => [data.photo, ...prev]);
      setPhotoCaption('');
      flash('Photo added to your bucket 📸');
    } catch (err) { setActionError(err.message); }
    setUploading(false);
  };

  const uploadTrack = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setActionError('Track is over the 10 MB limit.'); return; }
    setUploading(true);
    try {
      const dataBase64 = await fileToBase64(file);
      const data = await api('/tracks', { method: 'POST', body: { dataBase64, title: trackTitleInput || file.name } });
      setUserTracks((prev) => [data.track, ...prev]);
      setTrackTitleInput('');
      flash('Track uploaded 🎵');
    } catch (err) { setActionError(err.message); }
    setUploading(false);
  };

  const photoToFeed = async (photo) => {
    try {
      await api('/posts', { method: 'POST', body: { text: photo.caption || '', photoId: photo.id } });
      const po = await api(`/users/${handle}/posts`);
      setUserPosts(po.posts);
      flash('Posted to the feed ✓');
    } catch (err) { setActionError(err.message); }
  };

  const setBanner = async (photo) => {
    try {
      const data = await api('/me', { method: 'PUT', body: { bannerPhotoId: photo.id } });
      onAuth(data.user);
      setProfile((prev) => ({ ...prev, bannerPhotoId: data.user.bannerPhotoId }));
      flash('Banner set ✓');
    } catch (err) { setActionError(err.message); }
  };

  const deletePhoto = async (photo) => {
    try {
      await api(`/photos/${photo.id}`, { method: 'DELETE' });
      setUserPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      setSelectedPhoto(null);
      if (profile.bannerPhotoId === photo.id) setProfile((prev) => ({ ...prev, bannerPhotoId: null }));
      flash('Photo deleted');
    } catch (err) { setActionError(err.message); }
  };

  const setProfileTrack = async (track) => {
    try {
      const data = await api('/me', { method: 'PUT', body: { trackTitle: track.title, trackUrl: track.url } });
      onAuth(data.user);
      setProfile((prev) => ({ ...prev, trackTitle: data.user.trackTitle, trackUrl: data.user.trackUrl }));
      flash('Profile track set 🎵');
    } catch (err) { setActionError(err.message); }
  };

  const deleteTrack = async (track) => {
    try {
      await api(`/tracks/${track.id}`, { method: 'DELETE' });
      setUserTracks((prev) => prev.filter((t) => t.id !== track.id));
      if (profile.trackUrl && profile.trackUrl.endsWith(track.url)) {
        setProfile((prev) => ({ ...prev, trackUrl: '', trackTitle: '' }));
      }
      flash('Track deleted');
    } catch (err) { setActionError(err.message); }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setActionError('');
    const links = draft.links.filter((l) => l.label.trim() || l.url.trim());
    for (const l of links) {
      if (!l.label.trim() || !/^https?:\/\//i.test(l.url.trim())) {
        setActionError('Each link needs a label and an http(s) URL — or clear the row.');
        return;
      }
    }
    try {
      const data = await api('/me', {
        method: 'PUT',
        body: {
          displayName: draft.displayName,
          bio: draft.bio,
          statusLine: draft.statusLine,
          accentColor: draft.accentColor,
          bannerEmoji: draft.bannerEmoji,
          bannerColor: draft.bannerColor,
          trackTitle: draft.trackTitle,
          trackUrl: draft.trackUrl,
          links,
          avatarMode: draft.avatarMode,
          avatarEmoji: draft.avatarEmoji,
          avatar: draft.avatarMode === 'builder' ? draft.avatar : profile.avatar,
          avatarPhotoId: draft.avatarPhotoId,
          themeId: draft.themeId
        }
      });
      onAuth(data.user);
      setProfile((prev) => ({ ...prev, ...data.user }));
      flash('Profile saved ✓');
    } catch (err) { setActionError(err.message); }
  };

  const logout = () => { setToken(null); onAuth(null); };

  return (
    <div className="relative mx-auto w-full max-w-xl overflow-hidden" style={{ backgroundColor: theme.bg, color: theme.text }}>
      <PatternLayer theme={theme} />
      <div className="relative space-y-4 p-4">
      {/* Banner */}
      <div className="relative h-32 overflow-hidden rounded-[22px] shadow-xl shadow-black/40 ring-1 ring-white/10" style={{ backgroundColor: profile.bannerColor }}>
        {bannerPhoto && (
          <img src={resolveUrl(bannerPhoto.url)} alt="Profile banner" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-white/[0.07]" />
        {profile.bannerEmoji && (
          <span className="absolute bottom-2 right-4 text-6xl [filter:drop-shadow(0_10px_18px_rgba(0,0,0,0.65))]">{profile.bannerEmoji}</span>
        )}
      </div>

      {/* Identity card */}
      <Frame theme={theme}>
      <div className="flex items-start gap-4 p-3" style={{ background: theme.cardGradient || theme.cardBg }}>
        <AvatarView user={profile} size={72} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-black" style={{ color: profile.accentColor }}>{profile.displayName}</h2>
          <p className="text-sm text-slate-400">@{profile.handle}</p>
          {profile.statusLine && <p className="mt-0.5 text-sm italic text-slate-300">“{profile.statusLine}”</p>}
          {profile.bio && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{profile.bio}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-black/25 px-2.5 py-0.5 text-[11px] font-bold text-slate-300 ring-1 ring-white/10"><span className="text-white">{profile.followerCount}</span> followers</span>
            <span className="rounded-full bg-black/25 px-2.5 py-0.5 text-[11px] font-bold text-slate-300 ring-1 ring-white/10"><span className="text-white">{profile.followingCount}</span> following</span>
            <span className="rounded-full bg-black/25 px-2.5 py-0.5 text-[11px] font-bold text-slate-300 ring-1 ring-white/10"><span className="text-white">{profile.postCount}</span> posts</span>
          </div>
          {profile.links.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.links.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer" className="rounded-full border px-3 py-1 text-[11px] font-bold" style={{ borderColor: profile.accentColor, color: profile.accentColor }}>
                  🔗 {l.label}
                </a>
              ))}
            </div>
          )}
        </div>
        {isOwn ? (
          <button onClick={logout} className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300">
            Log out
          </button>
        ) : (
          <div className="flex shrink-0 flex-col gap-1.5">
            <button onClick={toggleFollow} className="rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-black/40" style={{ backgroundColor: theme.accent }}>
              {profile.following ? 'Following ✓' : 'Follow'}
            </button>
            <button onClick={() => (me ? goDm(profile.handle) : go('profile'))} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200">
              Message
            </button>
          </div>
        )}
      </div>
      </Frame>

      {actionError && <p className="text-xs text-rose-400">{actionError}</p>}
      {notice && <p className="text-xs text-emerald-400">{notice}</p>}

      {/* Profile music — keyed by handle+track so a new profile visit
          gets a fresh one-play allowance */}
      <ProfileMusic key={profile.handle + ':' + profile.trackUrl} profile={profile} />

      {/* Pinned post */}
      {pinnedPost && (
        <div>
          <p className="eyebrow mb-2">📌 Pinned</p>
          <PostCard post={pinnedPost} me={me} onNeedLogin={() => go('profile')} onPin={isOwn ? togglePin : undefined} pinned cardStyle={cardStyle} />
        </div>
      )}

      {/* Posts */}
      <div className="space-y-3">
        <h3 className="eyebrow">
          {isOwn ? 'Your posts' : `${profile.displayName}'s posts`}
        </h3>
        {restPosts.length === 0 && !pinnedPost && <p className="text-sm text-slate-500">No posts yet.</p>}
        {restPosts.map((post) => (
          <PostCard key={post.id} post={post} me={me} onNeedLogin={() => go('profile')} onPin={isOwn ? togglePin : undefined} pinned={false} cardStyle={cardStyle} />
        ))}
      </div>

      {/* Photo bucket */}
      <div>
        <h3 className="eyebrow mb-2">📸 Photo bucket</h3>
        {isOwn && (
          <div className="mb-2 flex gap-2">
            <input value={photoCaption} onChange={(e) => setPhotoCaption(e.target.value)} placeholder="Caption for the next photo…" className="flex-1 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none" />
            <label className={`cursor-pointer rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-rose-950/50 ${uploading ? 'opacity-50' : ''}`}>
              {uploading ? 'Uploading…' : '＋ Upload'}
              <input type="file" accept="image/*" onChange={uploadPhoto} className="hidden" disabled={uploading} />
            </label>
          </div>
        )}
        {userPhotos.length === 0 && <p className="text-sm text-slate-500">No photos in the bucket yet.</p>}
        <div className="grid grid-cols-3 gap-2">
          {userPhotos.map((photo) => (
            <button key={photo.id} onClick={() => isOwn && setSelectedPhoto(photo)} className="group relative overflow-hidden rounded-xl shadow-md shadow-black/30 ring-1 ring-white/10">
              <img src={resolveUrl(photo.url)} alt={photo.caption || 'Bucket photo'} className="h-24 w-full object-cover transition duration-300 group-hover:scale-105" />
              {photo.caption && <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-left text-[10px] text-white">{photo.caption}</span>}
              {profile.bannerPhotoId === photo.id && <span className="absolute right-1 top-1 rounded bg-rose-600 px-1 text-[9px] font-bold text-white">BANNER</span>}
            </button>
          ))}
        </div>
        {isOwn && selectedPhoto && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2.5">
            <span className="text-xs text-slate-300">{selectedPhoto.caption || '(no caption)'}</span>
            <span className="ml-auto flex gap-1.5">
              <button onClick={() => photoToFeed(selectedPhoto)} className="rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-md shadow-rose-950/50">Post to feed</button>
              <button onClick={() => setBanner(selectedPhoto)} className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-slate-200">Set as banner</button>
              <button onClick={() => deletePhoto(selectedPhoto)} className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white">Delete</button>
            </span>
          </div>
        )}
      </div>

      {/* Tracks */}
      <div>
        <h3 className="eyebrow mb-2">🎵 Tracks</h3>
        {isOwn && (
          <div className="mb-2 flex gap-2">
            <input value={trackTitleInput} onChange={(e) => setTrackTitleInput(e.target.value)} placeholder="Title for the next track…" className="flex-1 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none" />
            <label className={`cursor-pointer rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-rose-950/50 ${uploading ? 'opacity-50' : ''}`}>
              {uploading ? 'Uploading…' : '＋ Upload'}
              <input type="file" accept="audio/*,.mp3,.m4a,.wav" onChange={uploadTrack} className="hidden" disabled={uploading} />
            </label>
          </div>
        )}
        {userTracks.length === 0 && <p className="text-sm text-slate-500">No uploaded tracks yet.</p>}
        <div className="space-y-2">
          {userTracks.map((track) => (
            <div key={track.id} className="row-card rounded-2xl p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-100">{track.title}</p>
                {profile.trackUrl === track.url && <span className="shrink-0 rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold text-white">PROFILE TRACK</span>}
                {isOwn && (
                  <>
                    <button onClick={() => setProfileTrack(track)} className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-200">Set as profile track</button>
                    <button onClick={() => deleteTrack(track)} className="shrink-0 rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white">Delete</button>
                  </>
                )}
              </div>
              <audio controls src={resolveUrl(track.url)} className="w-full" preload="metadata" />
            </div>
          ))}
        </div>
      </div>

      {/* Edit panel — own profile only */}
      {isOwn && draft && (
        <form onSubmit={saveProfile} className="glass-card space-y-4 rounded-[22px] p-5">
          <h3 className="eyebrow">Build your page</h3>

          <div>
            <p className="mb-1.5 text-[11px] font-bold text-slate-500">AVATAR</p>
            <div className="mb-3 flex gap-1.5">
              {['emoji', 'builder', 'photo'].map((m) => (
                <button type="button" key={m} onClick={() => setDraft({ ...draft, avatarMode: m })} className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize ${draft.avatarMode === m ? 'bg-rose-600 text-white shadow-md shadow-rose-950/50' : 'border border-white/10 bg-slate-900 text-slate-300'}`}>
                  {m === 'emoji' ? '😀 Emoji' : m === 'builder' ? '🧑 Builder' : '📸 Photo'}
                </button>
              ))}
            </div>
            {draft.avatarMode === 'emoji' && (
              <div className="flex flex-wrap gap-1.5">
                {AVATARS.map((emoji) => (
                  <button type="button" key={emoji} onClick={() => setDraft({ ...draft, avatarEmoji: emoji })} className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${draft.avatarEmoji === emoji ? 'border border-rose-400 bg-rose-500/20' : 'border border-white/10 bg-slate-900'}`}>
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            {draft.avatarMode === 'builder' && (
              <AvatarBuilder spec={draft.avatar} onChange={(avatar) => setDraft({ ...draft, avatar })} />
            )}
            {draft.avatarMode === 'photo' && (
              userPhotos.length === 0
                ? <p className="text-xs text-slate-500">Upload a photo to your bucket first, then pick it here.</p>
                : (
                  <div className="flex flex-wrap gap-2">
                    {userPhotos.map((photo) => (
                      <button type="button" key={photo.id} onClick={() => setDraft({ ...draft, avatarPhotoId: photo.id })}>
                        <img src={resolveUrl(photo.url)} alt={photo.caption || 'Pick avatar photo'} className={`h-14 w-14 rounded-full object-cover border-2 ${draft.avatarPhotoId === photo.id ? 'border-rose-400' : 'border-white/15'}`} />
                      </button>
                    ))}
                  </div>
                )
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-500">DISPLAY NAME</label>
              <input value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-500">STATUS LINE</label>
              <input value={draft.statusLine} onChange={(e) => setDraft({ ...draft, statusLine: e.target.value })} maxLength={80} placeholder="One line, right under your name" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500">BIO</label>
            <textarea value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} rows={3} maxLength={280} className="w-full resize-none rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-500">ACCENT COLOR</label>
              <div className="flex items-center gap-2">
                <input type="color" value={draft.accentColor} onChange={(e) => setDraft({ ...draft, accentColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg border border-white/15 bg-slate-900" />
                <input value={draft.accentColor} onChange={(e) => setDraft({ ...draft, accentColor: e.target.value })} className="w-full rounded-xl border border-white/10 bg-slate-900 px-2 py-2 text-xs text-slate-100 outline-none" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-500">BANNER COLOR</label>
              <div className="flex items-center gap-2">
                <input type="color" value={draft.bannerColor} onChange={(e) => setDraft({ ...draft, bannerColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg border border-white/15 bg-slate-900" />
                <input value={draft.bannerColor} onChange={(e) => setDraft({ ...draft, bannerColor: e.target.value })} className="w-full rounded-xl border border-white/10 bg-slate-900 px-2 py-2 text-xs text-slate-100 outline-none" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-500">BANNER EMOJI</label>
              <input value={draft.bannerEmoji} onChange={(e) => setDraft({ ...draft, bannerEmoji: e.target.value })} maxLength={8} placeholder="🌙" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-500">PROFILE TRACK TITLE</label>
              <input value={draft.trackTitle} onChange={(e) => setDraft({ ...draft, trackTitle: e.target.value })} maxLength={80} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-500">PROFILE TRACK URL</label>
              <input value={draft.trackUrl} onChange={(e) => setDraft({ ...draft, trackUrl: e.target.value })} placeholder="Direct audio link or BandLab page" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500">LINKS (UP TO 4)</label>
            <div className="space-y-1.5">
              {draft.links.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <input value={l.label} onChange={(e) => { const links = [...draft.links]; links[i] = { ...links[i], label: e.target.value }; setDraft({ ...draft, links }); }} placeholder="Label" className="w-32 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 outline-none" />
                  <input value={l.url} onChange={(e) => { const links = [...draft.links]; links[i] = { ...links[i], url: e.target.value }; setDraft({ ...draft, links }); }} placeholder="https://…" className="flex-1 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 outline-none" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500">PAGE THEME</label>
            <div className="grid grid-cols-4 gap-1.5">
              {THEME_LIST.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setDraft({ ...draft, themeId: t.id })}
                  className={`overflow-hidden rounded-lg border-2 text-left ${draft.themeId === t.id ? 'border-white' : 'border-white/10'}`}
                >
                  <span className="flex h-9 items-center justify-center text-lg" style={{ backgroundColor: t.bg, borderBottom: `3px solid ${t.accent}` }}>
                    {t.glyph}
                  </span>
                  <span className="block truncate bg-slate-900 px-1.5 py-1 text-[9px] font-bold text-slate-200">{t.name}</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-slate-500">Themes reskin your whole profile page for every visitor.</p>
          </div>

          <button type="submit" className="rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 px-5 py-2.5 text-xs font-bold uppercase text-white shadow-lg shadow-rose-950/50">
            Save profile
          </button>
        </form>
      )}
      </div>
    </div>
  );
}
