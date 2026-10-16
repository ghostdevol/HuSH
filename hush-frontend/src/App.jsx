import React, { useState, useEffect } from 'react';
import { api, getToken } from './api';
import AvatarView from './components/AvatarView';
import LegalPage from './components/LegalPage';
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
  const [legalDoc, setLegalDoc] = useState(null); // 'rules' | 'privacy' | 'terms'
  const openLegal = (doc) => setLegalDoc(doc);

  const acceptLegal = async () => {
    try {
      const data = await api('/me', { method: 'PUT', body: { acceptLegal: true } });
      setMe(data.user);
    } catch { /* banner stays until it lands */ }
  };

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
    <div className="flex h-screen w-screen flex-col overflow-hidden font-sans text-slate-100">
      <header className="glass-card z-20 mx-3 mt-3 flex h-14 shrink-0 items-center justify-between rounded-2xl px-3">
        <div className="flex items-center gap-2.5">
          <button onClick={() => setDrawerOpen(true)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-slate-200" aria-label="Open menu">
            ☰
          </button>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-lg shadow-lg shadow-rose-950/50 ring-1 ring-white/25">🤫</span>
          <h1 className="bg-gradient-to-r from-rose-300 to-pink-500 bg-clip-text text-sm font-black tracking-[0.18em] text-transparent">
            HuSH
          </h1>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          {onlineCount > 0 && <span className="flex items-center gap-1.5"><span className="live-dot" /> {onlineCount} online</span>}
          {me
            ? <span className="flex items-center gap-1.5"><AvatarView user={me} size={22} /><span className="font-bold text-slate-200">@{me.handle}</span></span>
            : <button onClick={() => { setProfileTarget(null); setPage('profile'); }} className="font-bold text-rose-300">Log in</button>}
        </div>
      </header>

      {me && me.warnings && me.warnings.length > 0 && (
        <div className="mx-3 mt-3 flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-950/70 px-3 py-2.5">
          <p className="min-w-0 flex-1 text-xs font-bold text-amber-200">
            ⚠️ Account warning — your recent activity matches patterns from the scammer playbook. Correct it or the account is gone.
          </p>
          <button onClick={() => openLegal('rules')} className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-black text-black">
            Read the Site Rules
          </button>
        </div>
      )}
      {me && !me.legal && (
        <div className="mx-3 mt-3 flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border border-rose-300/25 bg-rose-950/50 px-3 py-2.5">
          <p className="min-w-0 flex-1 text-xs text-slate-200">
            HuSH now has Site Rules, a Privacy Policy and Terms of Use (v1.0). Give them a read and tap agree so it's on record.
          </p>
          <button onClick={() => openLegal('rules')} className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-200">
            Read them
          </button>
          <button onClick={acceptLegal} className="shrink-0 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 px-3 py-1.5 text-[11px] font-bold text-white">
            I agree
          </button>
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto">
        {page === 'feed' && <FeedPage me={me} go={go} />}
        {page === 'rooms' && (
          <div className="h-full">
            <RoomsPage
              me={me}
              guestName={guestName}
              setGuestName={setGuestName}
              onPresence={(online) => setOnlineCount(online.length)}
              goDm={goDm}
              go={go}
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
            goProfile={goProfile}
            openLegal={openLegal}
          />
        )}
      </main>

      {legalDoc && <LegalPage doc={legalDoc} onClose={() => setLegalDoc(null)} />}

      {/* Sidebar drawer: same nav as the bottom bar (which stays
          primary), plus the GhostTech section. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-rose-200/10 bg-gradient-to-b from-[#0b0e18] to-[#05070d] p-4 shadow-[24px_0_60px_rgba(0,0,0,0.6)]">
            <div className="mb-5 flex items-center justify-between">
              <span className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-lg shadow-lg shadow-rose-950/50 ring-1 ring-white/25">🤫</span>
                <span className="text-sm font-black tracking-[0.18em]">HuSH</span>
              </span>
              <button onClick={() => setDrawerOpen(false)} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300">✕</button>
            </div>
            <nav className="space-y-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { if (tab.id === 'profile') setProfileTarget(null); setPage(tab.id); setDrawerOpen(false); }}
                  className={`relative flex min-h-[46px] w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-bold ${
                    page === tab.id
                      ? 'border border-rose-300/30 bg-gradient-to-r from-rose-500/[0.16] to-pink-500/[0.07] text-white shadow-[inset_0_0_22px_rgba(244,63,94,0.07),0_0_10px_rgba(244,63,94,0.25)]'
                      : 'border border-transparent text-slate-300 hover:bg-rose-400/[0.06]'
                  }`}
                >
                  {page === tab.id && (
                    <span className="absolute -left-4 bottom-2.5 top-2.5 w-[3px] rounded bg-gradient-to-b from-rose-400 to-pink-600 shadow-[0_0_10px_rgba(244,63,94,0.6)]" />
                  )}
                  <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-[11px] text-base ${
                    page === tab.id
                      ? 'border border-rose-300/30 bg-gradient-to-br from-rose-500/25 to-pink-500/25'
                      : 'border border-white/[0.07] bg-rose-400/[0.06]'
                  }`}>
                    {tab.icon}
                  </span>
                  {tab.label}
                </button>
              ))}
            </nav>
            <div className="mt-7 border-t border-white/[0.07] pt-4">
              <p className="eyebrow mb-3 px-1">GhostTech</p>
              <button onClick={launchGhostSuite} className="flex min-h-[46px] w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 text-left hover:bg-rose-400/[0.06]">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] border border-white/[0.07] bg-rose-400/[0.06] text-lg">👻</span>
                <span>
                  <span className="block text-sm font-bold text-slate-100">GhostSuite</span>
                  <span className="block text-[10px] text-slate-400">Open the GhostSuite app</span>
                </span>
              </button>
              {suiteState === 'missing' && (
                <p className="mt-2 px-1 text-[11px] text-amber-300">GhostSuite isn't installed on this device.</p>
              )}
            </div>
            <div className="mt-7 border-t border-white/[0.07] pt-4">
              <p className="eyebrow mb-3 px-1">Rules & Legal</p>
              {[
                { id: 'rules', label: 'Site Rules', sub: 'One account per person. No scams. Consent is built in.' },
                { id: 'privacy', label: 'Privacy Policy', sub: 'What HuSH collects, why, and what it never does.' },
                { id: 'terms', label: 'Terms of Use', sub: 'Accounts, bans, content and liability — plain language.' }
              ].map((d) => (
                <button
                  key={d.id}
                  onClick={() => { setDrawerOpen(false); openLegal(d.id); }}
                  className="mb-1 flex min-h-[46px] w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 text-left hover:bg-rose-400/[0.06]"
                >
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] border border-white/[0.07] bg-rose-400/[0.06] text-lg">📜</span>
                  <span>
                    <span className="block text-sm font-bold text-slate-100">{d.label}</span>
                    <span className="block text-[10px] text-slate-400">{d.sub}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-auto px-1 text-[10px] text-slate-600">Built by Daniel "GhostDev" Sielaff & Jinx (Muse) — GhostTech</p>
          </aside>
        </div>
      )}

      <nav className="flex h-[68px] shrink-0 items-stretch justify-around gap-0.5 border-t border-rose-200/10 bg-[#070a12]/95 px-1.5 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_34px_rgba(0,0,0,0.55)] backdrop-blur-xl">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { if (tab.id === 'profile') setProfileTarget(null); setPage(tab.id); }}
            className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl ${
              page === tab.id
                ? 'bg-gradient-to-b from-rose-500/[0.14] to-pink-500/[0.05] text-rose-200 shadow-[0_0_14px_rgba(244,63,94,0.22)]'
                : 'text-slate-500'
            }`}
          >
            <span className={`flex h-[30px] w-[30px] items-center justify-center rounded-[10px] text-base leading-none ${
              page === tab.id
                ? 'border border-rose-300/30 bg-gradient-to-br from-rose-500/30 to-pink-500/30'
                : 'border border-white/[0.05] bg-white/[0.03]'
            }`}>
              {tab.icon}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wide">
              {tab.label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
