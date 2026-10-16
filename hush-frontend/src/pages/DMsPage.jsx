import React, { useState, useEffect, useCallback } from 'react';
import { api, dmRoomName } from '../api';
import usePresence from '../hooks/usePresence';
import ChatRoom from '../components/ChatRoom';
import AvatarView from '../components/AvatarView';

export default function DMsPage({ me, go, dmTarget, setDmTarget }) {
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [dmStatus, setDmStatus] = useState('open');
  const [blockedFlash, setBlockedFlash] = useState('');
  const online = usePresence();

  const loadRequests = useCallback(() => {
    if (!me) return;
    api('/dm/requests')
      .then((data) => setRequests(data.requests || []))
      .catch(() => { /* inbox just stays as-is */ });
  }, [me]);

  useEffect(() => {
    if (!me) return;
    api('/users')
      .then((data) => setUsers(data.users.filter((u) => !u.isMe)))
      .catch((err) => setError(err.message));
    loadRequests();
  }, [me, loadRequests]);

  const refreshStatus = useCallback(() => {
    if (!me || !dmTarget) return;
    api(`/dm/status/${dmTarget}`)
      .then((data) => setDmStatus(data.status))
      .catch(() => { /* keep last known state */ });
  }, [me, dmTarget]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  if (!me) {
    return (
      <div className="mx-auto w-full max-w-xl p-6 text-center">
        <p className="mb-4 text-sm text-slate-400">Direct messages need an account so the other side knows who you are.</p>
        <button onClick={() => go('profile')} className="rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-950/50">
          Log in / Register
        </button>
      </div>
    );
  }

  const acceptRequest = async (handle, openChat) => {
    try {
      await api(`/dm/requests/${handle}/accept`, { method: 'POST', body: {} });
      loadRequests();
      refreshStatus();
      if (openChat) setDmTarget(handle);
    } catch (err) { setError(err.message); }
  };

  const denyRequest = async (handle) => {
    try {
      await api(`/dm/requests/${handle}/deny`, { method: 'POST', body: {} });
      loadRequests();
      refreshStatus();
    } catch (err) { setError(err.message); }
  };

  const blockUser = async (handle) => {
    try {
      await api(`/users/${handle}/block`, { method: 'POST', body: {} });
      setDmTarget(null);
      setBlockedFlash(`Blocked @${handle} — they can't message, follow or call you, and you won't see each other. Manage blocks in your profile.`);
      api('/users')
        .then((data) => setUsers(data.users.filter((u) => !u.isMe)))
        .catch(() => {});
      loadRequests();
    } catch (err) { setError(err.message); }
  };

  if (dmTarget) {
    const room = dmRoomName(me.handle, dmTarget);
    const locked = dmStatus === 'not-accepted' || dmStatus === 'blocked-by-me';
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-white/5 p-3">
          <button onClick={() => setDmTarget(null)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300">
            ← All DMs
          </button>
          <p className="text-sm font-bold">@{dmTarget} {online.has(dmTarget) && <span className="text-emerald-400">• online</span>}</p>
          {dmStatus !== 'blocked-by-me' && (
            <button onClick={() => blockUser(dmTarget)} className="ml-auto rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-1.5 text-xs font-bold text-rose-200">
              🚫 Block
            </button>
          )}
        </div>
        {dmStatus === 'incoming' && (
          <div className="flex flex-wrap items-center gap-2 border-b border-amber-400/25 bg-amber-950/40 px-3 py-2.5">
            <p className="min-w-0 flex-1 text-xs font-bold text-amber-200">
              @{dmTarget} asked to message you. Nothing reaches your conversation until you accept.
            </p>
            <button onClick={() => acceptRequest(dmTarget, false)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-black uppercase text-white">
              Accept
            </button>
            <button onClick={() => denyRequest(dmTarget)} className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-black uppercase text-white">
              Deny
            </button>
          </div>
        )}
        {dmStatus === 'blocked-by-me' && (
          <div className="border-b border-white/[0.06] bg-white/[0.04] px-3 py-2 text-center text-[11px] font-bold text-slate-400">
            You blocked @{dmTarget}. Unblock from your profile's blocked list to talk again.
          </div>
        )}
        {dmStatus === 'not-accepted' && (
          <div className="border-b border-white/[0.06] bg-white/[0.04] px-3 py-2 text-center text-[11px] font-bold text-slate-400">
            This conversation isn't open.
          </div>
        )}
        <div className="min-h-0 flex-1">
          <ChatRoom
            key={room}
            room={room}
            displayName={me.handle}
            me={me}
            isDm
            dmPeer={dmTarget}
            dmStatus={dmStatus}
            dmLocked={locked}
            onDmEvent={refreshStatus}
            onOpenSettings={() => go('profile')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-2 p-4">
      <h2 className="mb-2 text-base font-black tracking-wide">Direct Messages</h2>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {blockedFlash && <p className="rounded-xl border border-rose-500/25 bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-200">{blockedFlash}</p>}

      {requests.length > 0 && (
        <div className="space-y-2 pb-2">
          <h3 className="eyebrow">📥 Message requests ({requests.length})</h3>
          {requests.map((r) => (
            <div key={r.from.handle} className="row-card rounded-2xl border border-amber-400/20 p-3">
              <div className="flex items-center gap-3">
                <AvatarView user={r.from} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{r.from.displayName} <span className="font-normal text-slate-400">@{r.from.handle}</span></p>
                  <p className="truncate text-[11px] italic text-slate-400">“{r.preview}”</p>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => acceptRequest(r.from.handle, true)} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black uppercase text-white">
                  Accept & open
                </button>
                <button onClick={() => denyRequest(r.from.handle)} className="flex-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-black uppercase text-white">
                  Deny
                </button>
                <button onClick={() => blockUser(r.from.handle)} className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-200">
                  🚫 Block
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {users.length === 0 && !error && (
        <p className="py-8 text-center text-sm text-slate-500">No other users yet — invite somebody.</p>
      )}
      {users.map((u) => (
        <button
          key={u.handle}
          onClick={() => setDmTarget(u.handle)}
          className="row-card flex w-full items-center gap-3 rounded-2xl p-3 text-left"
        >
          <span className="relative shrink-0">
            <AvatarView user={u} size={40} />
            {online.has(u.handle) && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400 shadow-[0_0_8px_rgba(52,255,150,0.9)]" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-white">{u.displayName}</span>
            <span className="block truncate text-[11px] text-slate-400">@{u.handle}{u.bio ? ` • ${u.bio}` : ''}</span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            {u.confidant && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300 ring-1 ring-emerald-400/30">💚 Confidant</span>}
            <span className="text-xs font-bold text-rose-300">{u.dmAccepted ? 'Message →' : 'Request →'}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
