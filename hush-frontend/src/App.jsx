import React, { useState, useEffect } from 'react';
import { api, getToken } from './api';
import AvatarView from './components/AvatarView';
import FeedPage from './pages/FeedPage';
import RoomsPage from './pages/RoomsPage';
import DMsPage from './pages/DMsPage';
import PeoplePage from './pages/PeoplePage';
import ProfilePage from './pages/ProfilePage';

// HuSH social shell: paginated pages with a bottom nav selector
// (GhostSuite pattern) — no single endless page. The original
// single-screen chat app is preserved in src/LegacyApp.jsx; the chat
// wire protocol it used is unchanged in src/components/ChatRoom.jsx.

const TABS = [
  { id: 'feed', label: 'Feed', icon: '📰' },
  { id: 'rooms', label: 'Rooms', icon: '💬' },
  { id: 'dms', label: 'DMs', icon: '✉️' },
  { id: 'people', label: 'People', icon: '👥' },
  { id: 'profile', label: 'Profile', icon: '🤫' }
];

export default function App() {
  const [page, setPage] = useState('feed');
  const [me, setMe] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [guestName, setGuestName] = useState(`guest_${Math.floor(100 + Math.random() * 900)}`);
  const [dmTarget, setDmTarget] = useState(null);
  const [profileTarget, setProfileTarget] = useState(null);

  useEffect(() => {
    if (getToken()) {
      api('/me')
        .then((data) => setMe(data.user))
        .catch(() => setMe(null));
    }
  }, []);

  const go = (target) => setPage(target);
  const goDm = (handle) => {
    setDmTarget(handle);
    setPage('dms');
  };
  const goProfile = (handle) => {
    setProfileTarget(handle);
    setPage('profile');
  };

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [suiteState, setSuiteState] = useState(''); // '' | 'missing'

  // GhostTech drawer entry: fire the Android intent for the installed
  // GhostSuite app. If the device switches away, it launched; if we're
  // still here after a beat (or we're on web), say so plainly — the
  // button reports its outcome, it never just sits dead.
  const launchGhostSuite = () => {
    setSuiteState('');
    let launched = false;
    const onVis = () => { if (document.hidden) launched = true; };
    document.addEventListener('visibilitychange', onVis);
    window.location.href = 'intent://#Intent;package=com.ghosttech.ghostsuite;end';
    setTimeout(() => {
      document.removeEventListener('visibilitychange', onVis);
      if (!launched) setSuiteState('missing');
    }, 1500);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#04060a] font-sans text-slate-100">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/5 bg-slate-950/90 px-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setDrawerOpen(true)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-slate-200" aria-label="Open menu">
            ☰
          </button>
          <span className="text-lg">🤫</span>
          <h1 className="bg-gradient-to-r from-rose-400 to-purple-500 bg-clip-text text-sm font-black tracking-wider text-transparent">
            HuSH
          </h1>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          {onlineCount > 0 && <span><span className="text-emerald-400">●</span> {onlineCount} online</span>}
          {me
            ? <span className="flex items-center gap-1.5"><AvatarView user={me} size={20} /><span className="font-bold text-slate-200">@{me.handle}</span></span>
            : <button onClick={() => { setProfileTarget(null); setPage('profile'); }} className="font-bold text-purple-300">Log in</button>}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto bg-slate-950">
        {page === 'feed' && <FeedPage me={me} go={go} />}
        {page === 'rooms' && (
          <div className="h-full">
            <RoomsPage
              me={me}
              guestName={guestName}
              setGuestName={setGuestName}
              onPresence={(online) => setOnlineCount(online.length)}
            />
          </div>
        )}
        {page === 'dms' && <DMsPage me={me} go={go} dmTarget={dmTarget} setDmTarget={setDmTarget} />}
        {page === 'people' && <PeoplePage me={me} go={go} goDm={goDm} goProfile={goProfile} />}
        {page === 'profile' && (
          <ProfilePage
            key={profileTarget || (me ? me.handle : 'guest')}
            me={me}
            onAuth={setMe}
            targetHandle={profileTarget}
            go={go}
            goDm={goDm}
          />
        )}
      </main>

      {/* Sidebar drawer: same nav as the bottom bar (which stays
          primary), plus the GhostTech section. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-white/10 bg-slate-950 p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-black tracking-wide">🤫 HuSH</span>
              <button onClick={() => setDrawerOpen(false)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300">✕</button>
            </div>
            <nav className="space-y-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { if (tab.id === 'profile') setProfileTarget(null); setPage(tab.id); setDrawerOpen(false); }}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold ${
                    page === tab.id ? 'bg-gradient-to-r from-rose-500/20 to-purple-500/20 text-rose-200' : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <span>{tab.icon}</span> {tab.label}
                </button>
              ))}
            </nav>
            <div className="mt-6 border-t border-white/10 pt-4">
              <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-widest text-slate-500">GhostTech</p>
              <button onClick={launchGhostSuite} className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left">
                <span className="text-lg">👻</span>
                <span>
                  <span className="block text-sm font-bold text-slate-100">GhostSuite</span>
                  <span className="block text-[10px] text-slate-400">Open the GhostSuite app</span>
                </span>
              </button>
              {suiteState === 'missing' && (
                <p className="mt-2 px-1 text-[11px] text-amber-300">GhostSuite isn't installed on this device.</p>
              )}
            </div>
            <p className="mt-auto px-1 text-[10px] text-slate-600">Built by Daniel "GhostDev" Sielaff & Jinx (Muse) — GhostTech</p>
          </aside>
        </div>
      )}

      <nav className="flex h-16 shrink-0 items-stretch justify-around border-t border-white/10 bg-slate-950/95 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { if (tab.id === 'profile') setProfileTarget(null); setPage(tab.id); }}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 ${
              page === tab.id ? 'text-rose-300' : 'text-slate-500'
            }`}
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wide ${page === tab.id ? '' : ''}`}>
              {tab.label}
            </span>
            {page === tab.id && <span className="h-0.5 w-8 rounded bg-gradient-to-r from-rose-500 to-purple-500" />}
          </button>
        ))}
      </nav>
    </div>
  );
}
