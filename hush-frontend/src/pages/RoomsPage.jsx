import React, { useState } from 'react';
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
        <ChatRoom key={activeRoom + displayName} room={activeRoom} displayName={displayName} onPresence={onPresence} />
      </div>
    </div>
  );
}
