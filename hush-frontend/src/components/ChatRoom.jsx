import React, { useState, useEffect, useRef } from 'react';
import { WS_BASE } from '../config';
import { getToken, api } from '../api';
import AvatarView from './AvatarView';

// Room chat + WebRTC mesh video.
//
// Chat protocol (unchanged from the original HuSH frontend):
//   -> { type: 'join', room, user } | { type: 'leave' } | { type: 'msg', user, text }
//   <- { type: 'joined', room, peerId } | { type: 'msg', room, user, text, ts }
//      | { type: 'system', message } | { type: 'error', message }
//      | { type: 'presence', online } | { type: 'rtc-peers', room, peers }
//      | { type: 'rtc-live', from, live }
//      | { type: 'rtc-offer' | 'rtc-answer' | 'rtc-ice', from, payload }
//
// Video is a full mesh for small rooms: one RTCPeerConnection per peer.
// Whoever starts video (or joins while already live) offers to the
// peers already there; offer collisions are settled with the
// polite/impolite rule (the side with the smaller peerId is polite and
// rolls back), so simultaneous starts still converge.

const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function VideoTile({ stream, label, muted }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      const p = ref.current.play();
      if (p) p.catch(() => { /* autoplay waits for a user gesture */ });
    }
  }, [stream]);
  return (
    <div className="relative w-40 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black">
      <video ref={ref} autoPlay playsInline muted={!!muted} className="h-28 w-full object-cover" />
      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white">
        {label}
      </span>
    </div>
  );
}

export default function ChatRoom({ room, displayName, onPresence }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [peers, setPeers] = useState([]);
  const [live, setLive] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // peerId -> { stream, name }
  const [videoError, setVideoError] = useState('');
  const [userMap, setUserMap] = useState({});

  const wsRef = useRef(null);
  const myPeerIdRef = useRef(null);
  const peersRef = useRef([]);
  const liveRef = useRef(false);
  const localStreamRef = useRef(null);
  const pcsRef = useRef(new Map()); // peerId -> { pc, makingOffer, polite }
  const iceQueueRef = useRef(new Map()); // peerId -> RTCIceCandidateInit[]
  const chatEndRef = useRef(null);
  const nameByPeerRef = useRef(new Map());

  const send = (obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  // ---------- WebRTC helpers ----------

  const closePc = (peerId) => {
    const entry = pcsRef.current.get(peerId);
    if (entry) {
      try { entry.pc.close(); } catch { /* already closed */ }
      pcsRef.current.delete(peerId);
    }
    iceQueueRef.current.delete(peerId);
    setRemoteStreams((prev) => {
      if (!prev[peerId]) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  };

  const ensurePc = (peerId) => {
    const existing = pcsRef.current.get(peerId);
    if (existing) return existing;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const entry = { pc, makingOffer: false, polite: (myPeerIdRef.current || '') < peerId };
    pcsRef.current.set(peerId, entry);

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) pc.addTrack(track, localStreamRef.current);
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: 'rtc-ice', to: peerId, payload: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (stream) {
        setRemoteStreams((prev) => ({
          ...prev,
          [peerId]: { stream, name: nameByPeerRef.current.get(peerId) || 'Peer' }
        }));
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') closePc(peerId);
    };
    return entry;
  };

  const flushIce = async (peerId) => {
    const entry = pcsRef.current.get(peerId);
    const queue = iceQueueRef.current.get(peerId) || [];
    if (!entry || !entry.pc.remoteDescription) return;
    iceQueueRef.current.set(peerId, []);
    for (const cand of queue) {
      try { await entry.pc.addIceCandidate(cand); } catch { /* stale candidate */ }
    }
  };

  const tryOffer = async (peerId) => {
    const entry = ensurePc(peerId);
    const { pc } = entry;
    if (entry.makingOffer || pc.signalingState !== 'stable') return;
    try {
      entry.makingOffer = true;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: 'rtc-offer', to: peerId, payload: pc.localDescription.toJSON() });
    } catch (err) {
      console.error('Offer failed:', err);
    } finally {
      entry.makingOffer = false;
    }
  };

  const handleOffer = async (from, payload) => {
    const entry = ensurePc(from);
    const { pc } = entry;
    const collision = entry.makingOffer || pc.signalingState !== 'stable';
    if (collision && !entry.polite) return; // impolite side wins the glare
    try {
      if (collision) await pc.setLocalDescription({ type: 'rollback' });
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      await flushIce(from);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: 'rtc-answer', to: from, payload: pc.localDescription.toJSON() });
    } catch (err) {
      console.error('Answer failed:', err);
    }
  };

  const handleAnswer = async (from, payload) => {
    const entry = pcsRef.current.get(from);
    if (!entry) return;
    try {
      await entry.pc.setRemoteDescription(new RTCSessionDescription(payload));
      await flushIce(from);
    } catch (err) {
      console.error('Set remote answer failed:', err);
    }
  };

  const handleIce = async (from, payload) => {
    const entry = pcsRef.current.get(from);
    if (!entry || !entry.pc.remoteDescription) {
      const queue = iceQueueRef.current.get(from) || [];
      queue.push(payload);
      iceQueueRef.current.set(from, queue);
      return;
    }
    try { await entry.pc.addIceCandidate(payload); } catch { /* stale candidate */ }
  };

  // ---------- Video start / stop ----------

  const startVideo = async () => {
    setVideoError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      liveRef.current = true;
      setLocalStream(stream);
      setLive(true);
      send({ type: 'rtc-live', live: true });
      // Offer to everyone already in the room; peers not on video still
      // answer and receive, peers on video answer with their tracks too.
      for (const peer of peersRef.current) {
        if (peer.id !== myPeerIdRef.current) {
          ensurePc(peer.id);
          tryOffer(peer.id);
        }
      }
    } catch (err) {
      console.error('getUserMedia failed:', err);
      setVideoError('Camera/mic permission denied or unavailable.');
    }
  };

  const stopVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    liveRef.current = false;
    setLocalStream(null);
    setLive(false);
    for (const peerId of Array.from(pcsRef.current.keys())) closePc(peerId);
    setRemoteStreams({});
    send({ type: 'rtc-live', live: false }); // notify the room
  };

  // Handle -> profile map so chat bubbles can show real avatars
  // (built avatars, photos, emoji — whatever each user picked).
  useEffect(() => {
    api('/users')
      .then((data) => {
        const map = {};
        for (const u of data.users) map[u.handle] = u;
        setUserMap(map);
      })
      .catch(() => { /* guests/unreachable: bubbles just show names */ });
  }, []);

  // ---------- Socket lifecycle ----------

  useEffect(() => {
    setMessages([]);
    const token = getToken();
    const url = token ? `${WS_BASE}?token=${encodeURIComponent(token)}` : WS_BASE;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', room, user: displayName }));
    };

    ws.onmessage = (e) => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }

      switch (data.type) {
        case 'joined':
          myPeerIdRef.current = data.peerId;
          setMessages((p) => [...p, { user: 'system', text: `Joined ${data.room}`, ts: Date.now() }]);
          break;
        case 'msg':
          if (data.room === room) setMessages((p) => [...p, data]);
          break;
        case 'system':
          setMessages((p) => [...p, { user: 'system', text: data.message, ts: Date.now() }]);
          break;
        case 'presence':
          if (onPresence) onPresence(data.online || []);
          break;
        case 'rtc-peers': {
          if (data.room !== room) break;
          const others = (data.peers || []).filter((p) => p.id !== myPeerIdRef.current);
          const prevIds = new Set(peersRef.current.map((p) => p.id));
          nameByPeerRef.current = new Map((data.peers || []).map((p) => [p.id, p.name]));
          peersRef.current = others;
          setPeers(others);
          // Peers who left: tear down their connection and tile.
          for (const id of prevIds) {
            if (!others.some((p) => p.id === id)) closePc(id);
          }
          // New peers while I'm live: offer so they get my stream
          // (and send theirs back in the answer if they are live).
          if (liveRef.current) {
            for (const peer of others) {
              if (!prevIds.has(peer.id)) { ensurePc(peer.id); tryOffer(peer.id); }
            }
          }
          break;
        }
        case 'rtc-live':
          // A peer started video: if I'm live we connect via my offer
          // path above (their startVideo offers to me); if I'm not live
          // I still offer recv-side by answering theirs. Nothing to do
          // here — their offer arrives as rtc-offer. If they stopped,
          // drop their tile but keep the pc for chat-lifetime reuse.
          if (!data.live) {
            setRemoteStreams((prev) => {
              if (!prev[data.from]) return prev;
              const next = { ...prev };
              delete next[data.from];
              return next;
            });
          }
          break;
        case 'rtc-offer':
          handleOffer(data.from, data.payload);
          break;
        case 'rtc-answer':
          handleAnswer(data.from, data.payload);
          break;
        case 'rtc-ice':
          handleIce(data.from, data.payload);
          break;
        case 'error':
          console.error('Server error:', data.message);
          break;
        default:
          break;
      }
    };

    ws.onerror = (err) => console.error('WebSocket error:', err);

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      for (const peerId of Array.from(pcsRef.current.keys())) closePc(peerId);
      try { ws.send(JSON.stringify({ type: 'leave' })); } catch { /* socket closing */ }
      ws.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    send({ type: 'msg', user: displayName, text: input });
    setInput('');
  };

  const hasVideo = live || Object.keys(remoteStreams).length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Video strip */}
      {hasVideo && (
        <div className="flex gap-2 overflow-x-auto border-b border-white/5 bg-black/40 p-2">
          {live && localStream && <VideoTile stream={localStream} label={`${displayName} (you)`} muted />}
          {Object.entries(remoteStreams).map(([peerId, entry]) => (
            <VideoTile key={peerId} stream={entry.stream} label={entry.name} />
          ))}
        </div>
      )}

      {/* Chat thread */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.user === displayName ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[75%] rounded-xl p-2.5 text-sm ${
              msg.user === 'system'
                ? 'bg-transparent text-center text-[11px] text-slate-500'
                : msg.user === displayName
                  ? 'rounded-tr-none bg-gradient-to-br from-purple-600 to-indigo-700 text-white'
                  : 'rounded-tl-none border border-white/5 bg-white/5 text-slate-200'
            }`}>
              {msg.user !== 'system' && (
                <span className="mb-0.5 flex items-center gap-1 text-[9px] font-bold text-slate-400">
                  {userMap[msg.user] && <AvatarView user={userMap[msg.user]} size={14} />}
                  {msg.user}
                </span>
              )}
              <p className="leading-relaxed">{msg.text}</p>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {videoError && <p className="px-4 pb-1 text-[11px] text-rose-400">{videoError}</p>}

      {/* Input row */}
      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-white/5 bg-slate-950/60 p-3">
        {live ? (
          <button type="button" onClick={stopVideo} className="shrink-0 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white">
            Kill Cam
          </button>
        ) : (
          <button type="button" onClick={startVideo} className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200">
            📹 Go Live
          </button>
        )}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message ${room}...`}
          className="flex-1 rounded-xl border border-white/5 bg-white/5 px-4 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/40"
        />
        <button type="submit" className="shrink-0 rounded-xl bg-gradient-to-r from-rose-500 to-purple-600 px-4 py-2 text-xs font-bold uppercase text-white">
          Send
        </button>
      </form>

      {peers.length > 0 && (
        <p className="border-t border-white/5 px-3 py-1 text-[10px] text-slate-500">
          In room: {peers.map((p) => `${p.name}${p.live ? ' 📹' : ''}`).join(', ')}
        </p>
      )}
    </div>
  );
}
