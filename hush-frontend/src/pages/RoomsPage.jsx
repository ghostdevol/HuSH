import React, { useState, useEffect } from 'react';
import ChatRoom from '../components/ChatRoom';
import { api } from '../api';

const DEFAULT_ROOMS = [
  { id: 'lobby', name: '🌐 General Mingling' },
  { id: 'serious', name: '💍 Serious Connections' },
  { id: 'friends', name: '🤝 Friend Circles' },
  { id: 'afterhours', name: '🔥 After-Hours Lounge' },
  { id: 'vip', name: '👑 VIP Chambers' }
];

export default function RoomsPage({ me, guestName, setGuestName, onPresence }) {
  const [activeRoom, setActiveRoom] = useState('lobby');
  const [rooms, setRooms] = useState(DEFAULT_ROOMS);
  const [newRoom, setNewRoom] = useState('');
  const displayName = me ? me.handle : guestName;

  // Cypher hosting (logged-in only — the host is a real account: they
  // own the mic controls and the recap post lands under their name).
  const [showCypher, setShowCypher] = useState(false);
  const [myTracks, setMyTracks] = useState([]);
  const [cRoom, setCRoom] = useState('');
  const [cBeat, setCBeat] = useState('__url__');
  const [cBeatUrl, setCBeatUrl] = useState('');
  const [cBeatTitle, setCBeatTitle] = useState('');
  const [cBpm, setCBpm] = useState(90);
  const [cBars, setCBars] = useState(8);
  const [cError, setCError] = useState('');

  useEffect(() => {
    if (!me) { setMyTracks([]); return; }
    api(`/users/${me.handle}/tracks`)
      .then((data) => setMyTracks(data.tracks || []))
      .catch(() => setMyTracks([]));
  }, [me]);

  const createCypher = async (e) => {
    e.preventDefault();
    setCError('');
    const id = cRoom.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (!id) { setCError('Name the cypher room first.'); return; }
    const beatUrl = cBeat === '__url__' ? cBeatUrl.trim() : cBeat;
    if (!beatUrl) { setCError('Pick one of your tracks or paste a beat URL.'); return; }
    const picked = myTracks.find((t) => t.url === cBeat);
    const beatTitle = (picked ? picked.title : cBeatTitle.trim()) || 'Untitled beat';
    try {
      await api('/createRoom', {
        method: 'POST',
        body: { room: id, type: 'cypher', beatTitle, beatUrl, bpm: Number(cBpm) || 90, barsPerTurn: Number(cBars) || 8 }
      });
    } catch (err) {
      setCError(err.message || 'Could not create the cypher room.');
      return;
    }
    if (!rooms.some((r) => r.id === id)) setRooms((prev) => [...prev, { id, name: `🎤 ${id}` }]);
    setShowCypher(false);
    setCRoom('');
    setActiveRoom(id);
  };

  const createRoom = async (e) => {
    e.preventDefault();
    const id = newRoom.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (!id) return;
    try { await api('/createRoom', { method: 'POST', body: { room: id } }); } catch { /* join creates it too */ }
    if (!rooms.some((r) => r.id === id)) setRooms((prev) => [...prev, { id, name: id }]);
    setNewRoom('');
    setActiveRoom(id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => setActiveRoom(room.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                activeRoom === room.id
                  ? 'bg-gradient-to-r from-rose-500/30 to-purple-500/30 text-rose-200 border border-rose-500/30'
                  : 'border border-white/10 bg-white/5 text-slate-400'
              }`}
            >
              {room.name}
            </button>
          ))}
        </div>
        <form onSubmit={createRoom} className="mt-2 flex gap-2">
          <input
            value={newRoom}
            onChange={(e) => setNewRoom(e.target.value)}
            placeholder="New room name…"
            className="flex-1 rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none"
          />
          <button type="submit" className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white">
            Create / Join
          </button>
        </form>
        {me && (
          <div className="mt-2">
            {!showCypher ? (
              <button
                type="button"
                onClick={() => setShowCypher(true)}
                className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-1.5 text-xs font-bold text-amber-200"
              >
                🎤 Host a cypher
              </button>
            ) : (
              <form onSubmit={createCypher} className="space-y-2 rounded-xl border border-amber-500/20 bg-amber-950/20 p-3">
                <p className="text-xs font-black uppercase tracking-wide text-amber-300">🎤 New cypher room</p>
                <input
                  value={cRoom}
                  onChange={(e) => setCRoom(e.target.value)}
                  placeholder="Room name (e.g. friday-cypher)"
                  className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none"
                />
                <select
                  value={cBeat}
                  onChange={(e) => setCBeat(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none"
                >
                  <option value="__url__">Paste a beat URL…</option>
                  {myTracks.map((t) => (
                    <option key={t.id} value={t.url}>🎵 {t.title} (your upload)</option>
                  ))}
                </select>
                {cBeat === '__url__' && (
                  <>
                    <input
                      value={cBeatUrl}
                      onChange={(e) => setCBeatUrl(e.target.value)}
                      placeholder="Beat audio URL (mp3/m4a/wav)"
                      className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none"
                    />
                    <input
                      value={cBeatTitle}
                      onChange={(e) => setCBeatTitle(e.target.value)}
                      placeholder="Beat title"
                      className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none"
                    />
                  </>
                )}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    BPM
                    <input
                      type="number" min="40" max="240" value={cBpm}
                      onChange={(e) => setCBpm(e.target.value)}
                      className="w-16 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    Bars per turn
                    <input
                      type="number" min="1" max="64" value={cBars}
                      onChange={(e) => setCBars(e.target.value)}
                      className="w-16 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none"
                    />
                  </label>
                </div>
                {cError && <p className="text-[11px] font-bold text-rose-400">{cError}</p>}
                <div className="flex gap-2">
                  <button type="submit" className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-black text-black">
                    Start cypher room
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCypher(false)}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
        {!me && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Chatting as guest:</span>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="w-36 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none"
            />
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <ChatRoom key={activeRoom + displayName} room={activeRoom} displayName={displayName} me={me} onPresence={onPresence} />
      </div>
    </div>
  );
}
