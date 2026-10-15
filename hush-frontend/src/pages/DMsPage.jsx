import React, { useState, useEffect } from 'react';
import { api, dmRoomName } from '../api';
import usePresence from '../hooks/usePresence';
import ChatRoom from '../components/ChatRoom';
import AvatarView from '../components/AvatarView';

export default function DMsPage({ me, go, dmTarget, setDmTarget }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const online = usePresence();

  useEffect(() => {
    if (!me) return;
    api('/users')
      .then((data) => setUsers(data.users.filter((u) => !u.isMe)))
      .catch((err) => setError(err.message));
  }, [me]);

  if (!me) {
    return (
      <div className="mx-auto w-full max-w-xl p-6 text-center">
        <p className="mb-4 text-sm text-slate-400">Direct messages need an account so the other side knows who you are.</p>
        <button onClick={() => go('profile')} className="rounded-xl bg-gradient-to-r from-rose-500 to-purple-600 px-5 py-2.5 text-sm font-bold text-white">
          Log in / Register
        </button>
      </div>
    );
  }

  if (dmTarget) {
    const room = dmRoomName(me.handle, dmTarget);
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-white/5 p-3">
          <button onClick={() => setDmTarget(null)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300">
            ← All DMs
          </button>
          <p className="text-sm font-bold">@{dmTarget} {online.has(dmTarget) && <span className="text-emerald-400">• online</span>}</p>
        </div>
        <div className="min-h-0 flex-1">
          <ChatRoom key={room} room={room} displayName={me.handle} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-2 p-4">
      <h2 className="mb-2 text-base font-black tracking-wide">Direct Messages</h2>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {users.length === 0 && !error && (
        <p className="py-8 text-center text-sm text-slate-500">No other users yet — invite somebody.</p>
      )}
      {users.map((u) => (
        <button
          key={u.handle}
          onClick={() => setDmTarget(u.handle)}
          className="flex w-full items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-3 text-left"
        >
          <span className="relative shrink-0">
            <AvatarView user={u} size={40} />
            {online.has(u.handle) && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-white">{u.displayName}</span>
            <span className="block truncate text-[11px] text-slate-400">@{u.handle}{u.bio ? ` • ${u.bio}` : ''}</span>
          </span>
          <span className="ml-auto text-xs font-bold text-purple-300">Message →</span>
        </button>
      ))}
    </div>
  );
}
