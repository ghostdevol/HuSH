import React, { useState, useEffect } from 'react';
import { api } from '../api';
import usePresence from '../hooks/usePresence';
import AvatarView from '../components/AvatarView';

export default function PeoplePage({ me, go, goDm, goProfile }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [view, setView] = useState('all'); // 'all' | 'confidants'
  const online = usePresence();

  const load = () => {
    api('/users')
      .then((data) => setUsers(data.users))
      .catch((err) => setError(err.message));
  };

  useEffect(load, [me]);

  const toggleFollow = async (user) => {
    if (!me) { go('profile'); return; }
    try {
      const data = await api(`/users/${user.handle}/follow`, { method: 'POST', body: {} });
      setUsers((prev) => prev.map((u) => (u.handle === user.handle
        ? { ...u, following: data.following, followerCount: data.user.followerCount }
        : u)));
    } catch (err) { setError(err.message); }
  };

  const shown = view === 'confidants' ? users.filter((u) => u.confidant) : users;

  return (
    <div className="mx-auto w-full max-w-xl space-y-2 p-4">
      <h2 className="mb-2 text-base font-black tracking-wide">People</h2>
      <div className="mb-2 flex rounded-xl border border-white/10 bg-slate-900 p-1">
        {[
          { id: 'all', label: 'Everyone' },
          { id: 'confidants', label: '💚 Confidants' }
        ].map((v) => (
          <button key={v.id} onClick={() => setView(v.id)} className={`flex-1 rounded-lg py-1.5 text-xs font-bold uppercase ${view === v.id ? 'bg-rose-600 text-white shadow-md shadow-rose-950/50' : 'text-slate-400'}`}>
            {v.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">Confidants are mutual follows — you follow each other. Your Inner Five is picked from them on your profile.</p>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {shown.length === 0 && !error && (
        <p className="py-8 text-center text-sm text-slate-500">{view === 'confidants' ? 'No Confidants yet — follow somebody who follows you back.' : 'Nobody here yet.'}</p>
      )}
      {shown.map((u) => (
        <div key={u.handle} className="row-card flex items-center gap-3 rounded-2xl p-3">
          <button onClick={() => goProfile(u.handle)} className="relative shrink-0">
            <AvatarView user={u} size={44} />
            {online.has(u.handle) && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400 shadow-[0_0_8px_rgba(52,255,150,0.9)]" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">
              {u.displayName} <span className="font-normal text-slate-400">@{u.handle}</span>
              {u.isMe && <span className="ml-1 text-[10px] text-rose-300">(you)</span>}
              {u.confidant && <span className="ml-1.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300 ring-1 ring-emerald-400/30">💚 CONFIDANT</span>}
            </p>
            {u.bio && <p className="truncate text-xs text-slate-400">{u.bio}</p>}
            <p className="text-[10px] text-slate-500">
              {u.followerCount} followers • {u.followingCount} following • {u.postCount} posts
            </p>
          </div>
          {!u.isMe && (
            <div className="flex shrink-0 flex-col gap-1.5">
              <button
                onClick={() => toggleFollow(u)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  u.following ? 'border border-white/15 bg-white/5 text-slate-300' : 'bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-md shadow-rose-950/50'
                }`}
              >
                {u.following ? 'Following' : 'Follow'}
              </button>
              <button
                onClick={() => (me ? goDm(u.handle) : go('profile'))}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300"
              >
                Message
              </button>
              <button
                onClick={() => goProfile(u.handle)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300"
              >
                Profile
              </button>
            </div>
          )}
          {u.isMe && (
            <button
              onClick={() => goProfile(u.handle)}
              className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300"
            >
              Profile
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
