import React, { useState, useEffect, useRef } from 'react';
import { WS_BASE, API_BASE } from '../config';
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

export default function ChatRoom({ room, displayName, me, onPresence }) {
  const myHandle = me ? me.handle : null;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [peers, setPeers] = useState([]);
  const [live, setLive] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // peerId -> { stream, name }
  const [videoError, setVideoError] = useState('');
  const [userMap, setUserMap] = useState({});
  const [cypher, setCypher] = useState(null); // latest cypher-state, null when no cypher
  const [secondsLeft, setSecondsLeft] = useState(null);

  const wsRef = useRef(null);
  const myPeerIdRef = useRef(null);
  const peersRef = useRef([]);
  const liveRef = useRef(false);
  const localStreamRef = useRef(null);
  const pcsRef = useRef(new Map()); // peerId -> { pc, makingOffer, polite }
  const iceQueueRef = useRef(new Map()); // peerId -> RTCIceCandidateInit[]
  const chatEndRef = useRef(null);
  const nameByPeerRef = useRef(new Map());
  // Cypher performer mix: while I'm on the mic, my outgoing audio is
  // mic + beat mixed in WebAudio (see startMix/stopMix).
  const mixRef = useRef(null); // { ctx, beatEl, mixedTrack }
  const passedTurnRef = useRef(null); // turnStartedAt already auto-passed

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

  // ---------- Cypher performer mix ----------
  // While I'm on the mic, my peers should hear my voice OVER the beat.
  // The mix happens here, on my device: AudioContext with my mic and a
  // looping beat element, both into a MediaStreamDestination; that
  // mixed audio track replaces the raw mic track on every peer
  // connection. The beat never leaves my device as a separate stream —
  // the room's sync IS my mix, by design.

  const swapOutgoingAudio = async (track) => {
    for (const { pc } of pcsRef.current.values()) {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (sender && sender.track !== track) {
        try { await sender.replaceTrack(track); } catch { /* pc closing */ }
      }
    }
  };

  const startMix = async (beatUrl) => {
    if (mixRef.current) return;
    const raw = localStreamRef.current;
    if (!raw || !raw.getAudioTracks().length) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') await ctx.resume();
      const micSrc = ctx.createMediaStreamSource(new MediaStream([raw.getAudioTracks()[0]]));
      const micGain = ctx.createGain();
      micGain.gain.value = 1.0;
      micSrc.connect(micGain);

      const src = beatUrl && beatUrl.startsWith('/') ? API_BASE + beatUrl : beatUrl;
      const beatEl = new Audio();
      beatEl.crossOrigin = 'anonymous';
      beatEl.loop = true;
      beatEl.src = src;
      const beatSrcNode = ctx.createMediaElementSource(beatEl);
      const beatGain = ctx.createGain();
      beatGain.gain.value = 0.75;
      beatSrcNode.connect(beatGain);

      const dest = ctx.createMediaStreamDestination();
      micGain.connect(dest);
      beatGain.connect(dest);
      await beatEl.play();

      const mixedTrack = dest.stream.getAudioTracks()[0];
      mixRef.current = { ctx, beatEl, mixedTrack };
      await swapOutgoingAudio(mixedTrack);
      // Local tile shows my camera with the mixed audio (muted anyway).
      const videoTrack = raw.getVideoTracks()[0];
      setLocalStream(videoTrack ? new MediaStream([videoTrack, mixedTrack]) : dest.stream);
    } catch (err) {
      console.error('Cypher mix failed:', err);
      setVideoError('Could not start the beat mix (beat failed to load for mixing).');
      if (mixRef.current) {
        try { mixRef.current.beatEl.pause(); } catch { /* noop */ }
        try { mixRef.current.ctx.close(); } catch { /* noop */ }
        mixRef.current = null;
      }
    }
  };

  const stopMix = async () => {
    const mix = mixRef.current;
    if (!mix) return;
    mixRef.current = null;
    try { mix.beatEl.pause(); } catch { /* noop */ }
    try { await mix.ctx.close(); } catch { /* noop */ }
    const raw = localStreamRef.current;
    if (raw) {
      if (raw.getAudioTracks().length) await swapOutgoingAudio(raw.getAudioTracks()[0]);
      setLocalStream(raw);
    }
  };

  // I'm on the mic + I'm live => run the mix. Mic passes => tear down.
  const amCurrent = !!cypher && !!myHandle && cypher.current === myHandle;
  useEffect(() => {
    if (amCurrent && live && cypher) startMix(cypher.beatUrl);
    if (!amCurrent && mixRef.current) stopMix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amCurrent, live, cypher && cypher.beatUrl]);

  // Turn countdown + auto-pass when my bars run out (performer-side,
  // per design; manual pass is always available too).
  useEffect(() => {
    if (!amCurrent || !cypher || !cypher.turnStartedAt || !cypher.bpm || !cypher.barsPerTurn) {
      setSecondsLeft(null);
      return;
    }
    const total = (cypher.barsPerTurn * 4 * 60) / cypher.bpm;
    const tick = () => {
      const left = Math.max(0, total - (Date.now() - cypher.turnStartedAt) / 1000);
      setSecondsLeft(left);
      if (left <= 0 && passedTurnRef.current !== cypher.turnStartedAt) {
        passedTurnRef.current = cypher.turnStartedAt;
        send({ type: 'cypher-pass' });
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amCurrent, cypher && cypher.turnStartedAt]);

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
        case 'cypher-state':
          if (data.room === room) setCypher(data.active ? data : null);
          break;
        case 'cypher-ended':
          if (data.room === room) {
            setCypher(null);
            setMessages((p) => [...p, { user: 'system', text: '🎤 Cypher ended — recap posted to the feed', ts: Date.now() }]);
          }
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
      if (mixRef.current) {
        try { mixRef.current.beatEl.pause(); } catch { /* noop */ }
        try { mixRef.current.ctx.close(); } catch { /* noop */ }
        mixRef.current = null;
      }
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

  // Cypher UI state
  const inQueue = !!cypher && !!myHandle && cypher.queue.includes(myHandle);
  const isCypherHost = !!cypher && !!myHandle && cypher.host === myHandle;
  const turnTotal = cypher && cypher.bpm ? (cypher.barsPerTurn * 4 * 60) / cypher.bpm : 0;

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

      {/* Cypher panel */}
      {cypher && (
        <div className="border-b border-amber-500/20 bg-amber-950/30 p-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs font-black uppercase tracking-wide text-amber-300">🎤 Cypher</span>
            <span className="text-xs font-bold text-slate-200">{cypher.beatTitle}</span>
            <span className="text-[10px] text-slate-400">{cypher.bpm} BPM · {cypher.barsPerTurn} bars a turn · hosted by @{cypher.host}</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-300">
            {cypher.current
              ? <>On the mic: <span className="font-bold text-amber-200">@{cypher.current}</span>{amCurrent ? ' — that\'s you. The room hears your voice over the beat.' : ''}</>
              : 'Mic is open — join the queue to take it.'}
          </p>
          {amCurrent && secondsLeft !== null && (
            <div className="mt-2">
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-rose-500 transition-[width] duration-300"
                  style={{ width: `${turnTotal ? Math.min(100, (secondsLeft / turnTotal) * 100) : 0}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] font-bold text-amber-200">{Math.ceil(secondsLeft)}s left in your turn</p>
            </div>
          )}
          {cypher.queue.length > 0 && (
            <p className="mt-1.5 text-[11px] text-slate-400">
              Up next: {cypher.queue.map((h) => `@${h}`).join(' → ')}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {myHandle ? (
              <>
                {!amCurrent && !inQueue && (
                  <button
                    type="button"
                    onClick={() => send({ type: 'cypher-queue-join' })}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-black text-black"
                  >
                    🎙 Join the mic queue
                  </button>
                )}
                {inQueue && (
                  <button
                    type="button"
                    onClick={() => send({ type: 'cypher-queue-leave' })}
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200"
                  >
                    Leave queue
                  </button>
                )}
                {(amCurrent || isCypherHost) && (
                  <button
                    type="button"
                    onClick={() => send({ type: 'cypher-pass' })}
                    className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-black uppercase text-white"
                  >
                    ⏭ Pass the mic
                  </button>
                )}
                {isCypherHost && (
                  <button
                    type="button"
                    onClick={() => send({ type: 'cypher-end' })}
                    className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-1.5 text-xs font-bold text-rose-200"
                  >
                    End cypher
                  </button>
                )}
                {amCurrent && !live && (
                  <span className="text-[11px] font-bold text-amber-200">Hit 📹 Go Live so the room can hear you.</span>
                )}
              </>
            ) : (
              <span className="text-[11px] text-slate-400">Log in to join the mic queue.</span>
            )}
          </div>
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
