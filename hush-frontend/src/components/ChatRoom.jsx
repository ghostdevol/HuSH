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

function VideoTile({ stream, label, muted, peerMuted, blackedOut }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      const p = ref.current.play();
      if (p) p.catch(() => { /* autoplay waits for a user gesture */ });
    }
  }, [stream]);
  return (
    <div className="relative w-40 shrink-0 overflow-hidden rounded-xl bg-black shadow-lg shadow-black/50 ring-1 ring-white/15">
      <video ref={ref} autoPlay playsInline muted={!!muted} className={`h-28 w-full object-cover ${blackedOut ? 'invisible' : ''}`} />
      {blackedOut && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black">
          <span className="text-lg">⬛</span>
          <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Camera blacked out</span>
        </div>
      )}
      <span className="absolute bottom-1 left-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
        {label}{peerMuted ? ' 🔇' : ''}
      </span>
    </div>
  );
}

// Audio-only tile: used when MY account has video off — in a cypher I
// still hear the performance, I just never render video.
function AudioTile({ stream, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      const p = ref.current.play();
      if (p) p.catch(() => { /* autoplay waits for a user gesture */ });
    }
  }, [stream]);
  return (
    <div className="relative flex h-28 w-40 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl bg-slate-900 shadow-lg shadow-black/50 ring-1 ring-white/15">
      <span className="text-xl">🔊</span>
      <span className="px-2 text-center text-[9px] font-bold text-slate-300">{label}</span>
      <span className="text-[8px] uppercase tracking-wide text-slate-500">audio only — your video is off</span>
      <audio ref={ref} autoPlay className="hidden" />
    </div>
  );
}

export default function ChatRoom({ room, displayName, me, onPresence, onOpenDm, isDm = false, dmPeer = null, dmStatus = 'open', dmLocked = false, onDmEvent, onOpenSettings }) {
  const myHandle = me ? me.handle : null;
  const myVideoOff = !!(me && me.privacy && me.privacy.videoEnabled === false);
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
  // v1.2.0: call flow + mic/blackout + notices
  const [chatNotice, setChatNotice] = useState('');
  const [callState, setCallState] = useState('idle'); // idle | calling | incoming | live
  const [incomingFrom, setIncomingFrom] = useState(null); // { peerId, fromHandle }
  const [peerStates, setPeerStates] = useState({}); // peerId -> { muted, blackedOut }
  const [micMuted, setMicMuted] = useState(false);
  const [blackedOut, setBlackedOut] = useState(false);
  const callTimerRef = useRef(null);
  const callStateRef = useRef('idle');
  const setCall = (s) => { callStateRef.current = s; setCallState(s); };

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
    setMicMuted(false);
    setBlackedOut(false);
    if (callStateRef.current === 'live') setCall('idle');
    for (const peerId of Array.from(pcsRef.current.keys())) closePc(peerId);
    setRemoteStreams({});
    send({ type: 'rtc-live', live: false }); // notify the room
  };

  // ---------- Mic mute / camera blackout (real, track-level) ----------

  const toggleMute = () => {
    const next = !micMuted;
    setMicMuted(next);
    // Mute the raw mic track AND the cypher mix track (the mix carries
    // my voice; muting must actually silence what peers receive).
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !next; });
    }
    if (mixRef.current && mixRef.current.mixedTrack) mixRef.current.mixedTrack.enabled = !next;
    send({ type: 'rtc-mute', muted: next });
  };

  const toggleBlackout = () => {
    const next = !blackedOut;
    setBlackedOut(next);
    // enabled=false on a video track sends black frames — the session
    // stays up, and the rtc-blackout note tells peers to render the
    // blacked-out state instead of a "frozen" tile.
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = !next; });
    }
    send({ type: 'rtc-blackout', blackedOut: next });
  };

  // ---------- DM video call flow ----------
  // In a DM, "Go Live" is an invitation. Media starts only on accept.

  const dmPeerSocketId = () => {
    const other = peersRef.current[0];
    return other ? other.id : null;
  };

  const clearCallTimer = () => {
    if (callTimerRef.current) { clearTimeout(callTimerRef.current); callTimerRef.current = null; }
  };

  const startCall = () => {
    setVideoError('');
    setChatNotice('');
    setCall('calling');
    send({ type: 'call-invite', to: dmPeerSocketId() || '' });
    clearCallTimer();
    callTimerRef.current = setTimeout(() => {
      if (callStateRef.current === 'calling') {
        send({ type: 'call-cancel', to: dmPeerSocketId() || '' });
        setCall('idle');
        setChatNotice('No answer — the call ended.');
      }
    }, 30000);
  };

  const cancelCall = () => {
    clearCallTimer();
    send({ type: 'call-cancel', to: dmPeerSocketId() || '' });
    setCall('idle');
  };

  const acceptCall = () => {
    clearCallTimer();
    if (incomingFrom) send({ type: 'call-accept', to: incomingFrom.peerId });
    setIncomingFrom(null);
    setCall('live');
    startVideo();
  };

  const declineCall = () => {
    clearCallTimer();
    if (incomingFrom) send({ type: 'call-decline', to: incomingFrom.peerId });
    setIncomingFrom(null);
    setCall('idle');
    setChatNotice('Call declined.');
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
          setPeerStates((prev) => {
            const next = { ...prev };
            for (const p of data.peers || []) {
              next[p.id] = { muted: !!p.muted, blackedOut: !!p.blackedOut };
            }
            return next;
          });
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
        case 'rtc-mute':
          setPeerStates((prev) => ({ ...prev, [data.from]: { ...(prev[data.from] || {}), muted: !!data.muted } }));
          break;
        case 'rtc-blackout':
          setPeerStates((prev) => ({ ...prev, [data.from]: { ...(prev[data.from] || {}), blackedOut: !!data.blackedOut } }));
          break;
        case 'dm-request-sent':
          setChatNotice('Request sent — your first message lands when they accept.');
          if (onDmEvent) onDmEvent();
          break;
        case 'dm-request-pending':
          setChatNotice('Request already sent — waiting for them to accept.');
          break;
        case 'dm-request':
          setChatNotice(`@${data.from} wants to message you — accept or deny above.`);
          if (onDmEvent) onDmEvent();
          break;
        case 'dm-accepted':
          setChatNotice('Conversation open — say hi 🤫');
          if (onDmEvent) onDmEvent();
          break;
        case 'call-incoming':
          setIncomingFrom({ peerId: data.from, fromHandle: data.fromHandle });
          setCall('incoming');
          break;
        case 'call-accepted':
          clearCallTimer();
          setCall('live');
          startVideo();
          break;
        case 'call-declined':
          clearCallTimer();
          setCall('idle');
          setChatNotice('Call declined.');
          break;
        case 'call-cancelled':
          clearCallTimer();
          if (callStateRef.current === 'incoming') setChatNotice('Missed call.');
          setIncomingFrom(null);
          setCall('idle');
          break;
        case 'call-unavailable':
          clearCallTimer();
          setCall('idle');
          setChatNotice(data.message || 'Video is unavailable.');
          break;
        case 'moderation':
          setChatNotice(data.message || '');
          break;
        case 'banned':
          setChatNotice('⛔ This account is banned.');
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
          if (data.code) setChatNotice(data.message);
          else console.error('Server error:', data.message);
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

  // Rendering rules when MY video is off account-wide: I never publish,
  // and I don't render video tiles — except in a cypher, where I still
  // hear the performance through audio-only tiles.
  const audioOnlyMode = myVideoOff && !!cypher;
  const renderedRemote = Object.entries(remoteStreams).filter(() => !myVideoOff || audioOnlyMode);
  const hasVideo = live || renderedRemote.length > 0;

  // Cypher UI state
  const inQueue = !!cypher && !!myHandle && cypher.queue.includes(myHandle);
  const isCypherHost = !!cypher && !!myHandle && cypher.host === myHandle;
  const turnTotal = cypher && cypher.bpm ? (cypher.barsPerTurn * 4 * 60) / cypher.bpm : 0;

  return (
    <div className="flex h-full flex-col">
      {/* Video strip */}
      {hasVideo && (
        <div className="flex gap-2 overflow-x-auto border-b border-white/5 bg-black/40 p-2">
          {live && localStream && (
            <VideoTile
              stream={localStream}
              label={`${displayName} (you)${micMuted ? ' — muted' : ''}${blackedOut ? ' — blacked out' : ''}`}
              muted
              blackedOut={blackedOut}
            />
          )}
          {renderedRemote.map(([peerId, entry]) => (
            audioOnlyMode ? (
              <AudioTile key={peerId} stream={entry.stream} label={entry.name} />
            ) : (
              <VideoTile
                key={peerId}
                stream={entry.stream}
                label={entry.name}
                peerMuted={!!(peerStates[peerId] && peerStates[peerId].muted)}
                blackedOut={!!(peerStates[peerId] && peerStates[peerId].blackedOut)}
              />
            )
          ))}
        </div>
      )}

      {/* Incoming call (DMs) */}
      {callState === 'incoming' && incomingFrom && (
        <div className="flex flex-wrap items-center gap-2 border-b border-rose-400/30 bg-gradient-to-r from-rose-950/80 to-pink-950/60 px-3 py-2.5">
          <span className="live-dot" />
          <p className="min-w-0 flex-1 text-sm font-bold text-white">
            📹 @{incomingFrom.fromHandle} is calling you
          </p>
          <button type="button" onClick={acceptCall} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black uppercase text-white shadow-lg shadow-emerald-950/50">
            Accept
          </button>
          <button type="button" onClick={declineCall} className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-black uppercase text-white shadow-lg shadow-rose-950/50">
            Deny
          </button>
        </div>
      )}
      {chatNotice && (
        <div className="border-b border-white/[0.06] bg-white/[0.04] px-3 py-2 text-center text-[11px] font-bold text-slate-300">
          {chatNotice}
        </div>
      )}

      {/* Cypher panel */}
      {cypher && (
        <div className="border-b border-amber-500/20 bg-gradient-to-b from-amber-500/[0.13] via-amber-950/30 to-amber-950/10 p-3 shadow-[inset_0_1px_0_rgba(251,191,36,0.14)]">
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
                    className="rounded-lg bg-gradient-to-b from-amber-400 to-amber-500 px-3 py-1.5 text-xs font-black text-black shadow-lg shadow-amber-950/50"
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
                  <span className="text-[11px] font-bold text-amber-200">
                    {myVideoOff
                      ? 'Your video is off in your settings, so you can\'t perform right now — listening only.'
                      : 'Hit 📹 Go Live so the room can hear you.'}
                  </span>
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
            <div className={`max-w-[75%] rounded-2xl p-2.5 text-sm ${
              msg.user === 'system'
                ? 'bg-transparent text-center text-[11px] text-slate-500'
                : msg.user === displayName
                  ? 'rounded-tr-md bg-gradient-to-br from-rose-500 to-pink-700 text-white shadow-lg shadow-rose-950/40'
                  : 'rounded-tl-md border border-white/[0.06] bg-white/[0.06] text-slate-200 shadow-md shadow-black/30'
            }`}>
              {msg.user !== 'system' && (() => {
                // Tapping a message author breaks out of the room into
                // the 1:1 DM — only for real accounts (guests have no
                // DM room) and never for your own messages.
                const canDm = !!onOpenDm && !!userMap[msg.user] && msg.user !== displayName;
                const inner = (
                  <>
                    {userMap[msg.user] && <AvatarView user={userMap[msg.user]} size={14} />}
                    {msg.user}
                  </>
                );
                return canDm ? (
                  <button
                    type="button"
                    onClick={() => onOpenDm(msg.user)}
                    title={`Message @${msg.user} privately`}
                    className="mb-0.5 flex items-center gap-1 text-[9px] font-bold text-slate-400 transition hover:text-rose-300"
                  >
                    {inner}
                  </button>
                ) : (
                  <span className="mb-0.5 flex items-center gap-1 text-[9px] font-bold text-slate-400">
                    {inner}
                  </span>
                );
              })()}
              <p className="leading-relaxed">{msg.text}</p>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {videoError && <p className="px-4 pb-1 text-[11px] text-rose-400">{videoError}</p>}

      {/* Input row */}
      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-white/[0.06] bg-[#070a12]/85 p-3 backdrop-blur-xl">
        {myVideoOff ? (
          <button
            type="button"
            onClick={() => (onOpenSettings ? onOpenSettings() : setChatNotice('Video is off in your settings — turn it on under Profile → Privacy & Safety.'))}
            title="Video is disabled in your settings — tap to open them"
            className="shrink-0 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-slate-500"
          >
            📹 Video off in your settings
          </button>
        ) : live ? (
          <>
            <button type="button" onClick={stopVideo} className="shrink-0 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-rose-950/50">
              Kill Cam
            </button>
            <button
              type="button"
              onClick={toggleMute}
              title={micMuted ? 'Unmute your mic' : 'Mute your mic'}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold shadow-md shadow-black/30 ${micMuted ? 'bg-amber-500 text-black' : 'border border-white/10 bg-white/5 text-slate-200'}`}
            >
              {micMuted ? '🔇 Muted' : '🎙 Mic on'}
            </button>
            <button
              type="button"
              onClick={toggleBlackout}
              title={blackedOut ? 'Bring your camera back' : 'Black out your camera (stay in the session)'}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold shadow-md shadow-black/30 ${blackedOut ? 'bg-slate-200 text-black' : 'border border-white/10 bg-white/5 text-slate-200'}`}
            >
              {blackedOut ? '⬛ Blacked out' : '⬛ Blackout'}
            </button>
          </>
        ) : isDm ? (
          dmStatus === 'open' ? (
            callState === 'calling' ? (
              <button type="button" onClick={cancelCall} className="shrink-0 rounded-lg bg-amber-500 px-3 py-2 text-xs font-black text-black shadow-lg shadow-amber-950/50">
                📞 Calling… ✕
              </button>
            ) : (
              <button type="button" onClick={startCall} className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 shadow-md shadow-black/30">
                📹 Call
              </button>
            )
          ) : (
            <button type="button" disabled title="Video unlocks when the conversation is accepted" className="shrink-0 cursor-not-allowed rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-slate-500">
              📹 Call — after they accept
            </button>
          )
        ) : (
          <button type="button" onClick={startVideo} className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200 shadow-md shadow-black/30">
            📹 Go Live
          </button>
        )}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={dmLocked || (isDm && dmStatus === 'pending')}
          placeholder={
            dmLocked
              ? 'This conversation is unavailable'
              : isDm && dmStatus === 'pending'
                ? `Waiting for @${dmPeer} to accept your request…`
                : isDm && dmStatus === 'none'
                  ? `First message to @${dmPeer} goes as a request…`
                  : `Message ${room}...`
          }
          className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.05] px-4 py-2 text-sm text-slate-100 outline-none disabled:opacity-50"
        />
        <button type="submit" disabled={dmLocked || (isDm && dmStatus === 'pending')} className="shrink-0 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 px-4 py-2 text-xs font-bold uppercase text-white shadow-lg shadow-rose-950/50 disabled:opacity-50">
          Send
        </button>
      </form>

      {peers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] px-3 py-1.5 text-[10px] text-slate-500">
          <span className="font-bold uppercase tracking-wide">In room:</span>
          {peers.map((p) => {
            // Account members are tappable → straight into the 1:1 DM.
            // Guests have no DM room, so they stay plain text.
            const canDm = !!onOpenDm && !!userMap[p.name];
            const label = `${p.name}${p.live ? ' 📹' : ''}`;
            return canDm ? (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenDm(p.name)}
                title={`Message @${p.name} privately`}
                className="rounded-full bg-white/[0.05] px-2 py-0.5 font-bold text-slate-300 ring-1 ring-white/10 transition hover:bg-rose-500/15 hover:text-rose-200 hover:ring-rose-400/30"
              >
                @{label} ✉️
              </button>
            ) : (
              <span key={p.id} className="px-1">{label}</span>
            );
          })}
          {!!onOpenDm && <span className="text-slate-600">tap a name for a private DM</span>}
        </div>
      )}
    </div>
  );
}
