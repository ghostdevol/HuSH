import React, { useState, useEffect, useRef } from 'react';

export default function App() {
  // 1. DATA STORES REGISTRY ENTRIES
  const [activeRoom, setActiveRoom] = useState('lobby');
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [username, setUsername] = useState(`user_${Math.floor(100 + Math.random() * 900)}`);
  const [gender, setGender] = useState('Female');
  const [age, setAge] = useState('24');
  const [location, setLocation] = useState('New York');
  const [intent, setIntent] = useState('Mingling'); 
  const [bio, setBio] = useState('Verified real connection only.');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [isAccountPaused, setIsAccountPaused] = useState(false);

  // 2. SOCIAL DECK DATA SYSTEMS
  const [friendsList, setFriendsList] = useState(['vixen_99', 'neon_vibe']);
  const [blockedUsers, setBlockedUsers] = useState(new Set());
  const [favFiveList, setFavFiveList] = useState([
    { id: '1', name: 'vixen_99', rating: 98, rank: '#1' },
    { id: '2', name: 'alpha_prime', rating: 94, rank: '#2' }
  ]);

  // 3. MINIGAME MATRIX CONFIGS
  const [gameQuestion, setGameQuestion] = useState("Click Draw to find alignment...");
  const [diceResult, setDiceResult] = useState(null);
  const [catchOfTheDay, setCatchOfTheDay] = useState({ name: 'vixen_99', matchScore: 99, sharedInterest: 'Nightlife' });

  const sharedInterestsList = ["Crypto", "Fitness", "Nightlife", "Travel", "Art", "Fine Dining"];
  const [myInterest, setMyInterest] = useState("Nightlife");

  const [localStream, setLocalStream] = useState(null);
  const [isVideoActive, setIsVideoActive] = useState(false);
  const socketRef = useRef(null);
  const chatEndRef = useRef(null);
  const localVideoRef = useRef(null);

  const rooms = [
    { id: 'lobby', name: 'General Mingling', icon: '🌐' },
    { id: 'serious', name: 'Serious Connections Only', icon: '💍' },
    { id: 'friends', name: 'Platonic Friend Circles', icon: '🤝' },
    { id: 'hookups', name: 'Elite After-Hours Lounge', icon: '🔥' },
    { id: 'xxx', name: 'Platinum VIP Chambers', icon: '👑' }
  ];
  // 4. NETWORKING HANDSHAKE LISTENERS
  useEffect(() => {
    if (isAccountPaused) return;
    const ws = new WebSocket('ws://localhost:5174');
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'update_profile', username, gender, age, location, intent, bio, photoUrl, interest: myInterest }));
      ws.send(JSON.stringify({ type: 'join', room: activeRoom }));
    };

    ws.onmessage = (e) => {
      try {
        const incoming = JSON.parse(e.data);
        if (blockedUsers.has(incoming.user)) return;
        if (incoming.type === 'history') setMessages(incoming.messages);
        else if (incoming.type === 'message' && incoming.room === activeRoom) setMessages((p) => [...p, incoming]);
      } catch (err) { console.error(err); }
    };
    return () => ws.close();
  }, [activeRoom, isAccountPaused, blockedUsers]);

  const handleStartVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setIsVideoActive(true);
      setTimeout(() => { if (localVideoRef.current) localVideoRef.current.srcObject = stream; }, 100);
    } catch { alert("Check audio/video profile device permissions!"); }
  };

  const handleStopVideo = () => {
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); setLocalStream(null); setIsVideoActive(false); }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || !socketRef.current) return;
    socketRef.current.send(JSON.stringify({ type: 'message', room: activeRoom, user: username, text: inputValue }));
    setInputValue('');
  };

  const handleRollDice = () => {
    const rolled = Math.floor(Math.random() * 6) + 1;
    setDiceResult(rolled);
    setGameQuestion(`🎲 Rolled a ${rolled}! System connection vector updated.`);
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  return (
    <div className="hush-app-container">
      
      {/* DIRECT INJECTED CSS CUSTOM OVERRIDES */}
      <style>{`
        :root {
          --bg-main: #040508;
          --bg-card: #0a0d16;
          --bg-sidebar: #080a10;
          --bg-input: #0f121c;
          --neon-pink: #f43f5e;
          --neon-purple: #a855f7;
          --text-main: #f1f5f9;
          --text-muted: #475569;
        }
        * { margin: 0; padding: 0; box-sizing: border-box !important; }
        body, html, #root { width: 100vw; height: 100vh; background-color: var(--bg-main) !important; color: var(--text-main); font-family: system-ui, sans-serif; overflow: hidden; }
        
        .hush-app-container { display: flex; width: 100vw; height: 100vh; overflow: hidden; background-color: var(--bg-main); }
        
        .hush-sidebar { width: 290px; min-width: 290px; max-width: 290px; background-color: var(--bg-sidebar); border-right: 1px solid rgba(168, 85, 247, 0.2); display: flex; flex-direction: column; justify-content: space-between; padding: 20px 14px; height: 100vh; overflow-y: auto; }
        .brand-header h2 { font-size: 16px; font-weight: 900; background: linear-gradient(90deg, var(--neon-pink), var(--neon-purple)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 0 8px rgba(244, 63, 94, 0.4)); }
        .version-tag { font-size: 9px; color: var(--text-muted); font-family: monospace; }
        .profile-console-card { background: rgba(255,255,255,0.01); border: 1px solid rgba(168, 85, 247, 0.15); padding: 14px; border-radius: 12px; margin-top: 14px; display: flex; flex-direction: column; gap: 10px; }
        .form-group label { display: block; font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
        .profile-console-card input, .profile-console-card select { width: 100%; background: var(--bg-input) !important; border: 1px solid rgba(255,255,255,0.08) !important; border-radius: 6px; padding: 8px; font-size: 12px; color: white !important; outline: none; height: 36px !important; }
        .form-row { display: flex; gap: 8px; }
        .form-row .form-group { flex: 1; }
        .btn-save-profile { width: 100%; background: linear-gradient(90deg, var(--neon-pink), var(--neon-purple)); color: white; font-weight: 700; font-size: 11px; padding: 10px; border-radius: 6px; cursor: pointer; margin-top: 4px; box-shadow: 0 0 10px rgba(244,63,94,0.15); border: none; }
        
        .realms-list { margin-top: 18px; }
        .section-title { font-size: 10px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px; }
        .realm-tab { width: 100%; display: flex; padding: 10px; border-radius: 8px; font-size: 12px; background: transparent; color: #94a3b8; text-align: left; cursor: pointer; border: 1px solid transparent; margin-bottom: 4px; }
        .realm-tab.active { background: rgba(244, 63, 94, 0.08); border: 1px solid rgba(244, 63, 94, 0.2); color: var(--neon-pink); box-shadow: 0 0 10px rgba(244, 63, 94, 0.15); font-weight: 700; }
        .btn-premium { width: 100%; background: linear-gradient(90deg, #f59e0b, #eab308); color: #000; font-weight: 900; font-size: 11px; padding: 12px; border-radius: 8px; cursor: pointer; border: none; }
        .status-footer { display: flex; justify-content: space-between; font-size: 9px; color: var(--text-muted); font-family: monospace; margin-top: 8px; }
        
        .hush-main-deck { flex: 1; display: flex; gap: 20px; padding: 20px; height: 100vh; overflow: hidden; }
        
        /* 50/50 Symmetrical Layout Scaling */
        .deck-column-wide { flex: 1.1 !important; display: flex; flex-direction: column; gap: 16px; height: 100%; overflow-y: auto; }
        .deck-column-slender { flex: 1 !important; display: flex; flex-direction: column; height: 100%; overflow: hidden; position: relative; }
        
        .hush-card { background-color: var(--bg-card); border: 1px solid rgba(168, 85, 247, 0.2); border-radius: 16px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 15px rgba(168,85,247,0.05); position: relative; }
        .hush-card.highlight { border-color: rgba(244, 63, 94, 0.35); box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(244, 63, 94, 0.08); }
        .card-lbl-neon { font-size: 9px; font-weight: 900; color: var(--neon-pink); tracking-wide; }
        .card-lbl { font-size: 9px; font-weight: 900; color: var(--neon-purple); tracking-wide; }
        .compatibility-score { font-size: 26px; font-weight: 900; color: var(--neon-pink); margin-top: 10px; text-shadow: 0 0 8px rgba(244,63,94,0.2); }
        .compatibility-score span { font-size: 10px; color: var(--text-muted); text-transform: uppercase; }
        .matrix-prompt { font-size: 13px; font-style: italic; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; margin: 12px 0; border: 1px solid rgba(255,255,255,0.02); }
        .btn-action { background: #121624; border: 1px solid rgba(168, 85, 247, 0.15); color: #e2e8f0; width: 100%; padding: 12px; border-radius: 8px; font-weight: 700; font-size: 12px; cursor: pointer; }
        
        .chat-window-box { background-color: var(--bg-card); border: 1px solid rgba(168, 85, 247, 0.2); border-radius: 16px; height: 100%; display: flex; flex-direction: column; overflow: hidden; position: relative; box-shadow: 0 15px 35px rgba(0,0,0,0.5); }
        .chat-header { padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.15); flex-shrink: 0; }
        .header-status { display: flex; align-items: center; gap: 8px; }
        .indicator-dot { width: 6px; height: 6px; background: #10b981; border-radius: 50%; box-shadow: 0 0 8px #10b981; }
        .chat-header h3 { font-size: 11px; font-weight: 900; letter-spacing: 0.05em; }
        .btn-video-toggle { background: #10131e; border: 1px solid rgba(255,255,255,0.08); color: white; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; }
        .video-stream-box { padding: 12px; background: black; display: flex; justify-content: center; border-bottom: 1px solid rgba(255,255,255,0.04); flex-shrink: 0; }
        .video-stream-box video { width: 240px; height: 130px; border-radius: 8px; background: #020617; object-fit: cover; transform: scaleX(-1); }
        
        .right-column-scroller-track { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; margin-bottom: 84px; }
        .msg-row { display: flex; flex-direction: column; max-w: 80%; }
        .msg-row.me { margin-left: auto; align-items: flex-end; }
        .msg-row.them { margin-right: auto; align-items: flex-start; }
        .msg-author { font-size: 9px; color: var(--text-muted); font-weight: bold; margin-bottom: 2px; }
        .msg-bubble { padding: 10px 14px; font-size: 12.5px; line-height: 1.4; border-radius: 12px; }
        .me .msg-bubble { background: linear-gradient(135deg, var(--neon-pink), var(--neon-purple)); color: white; border-top-right-radius: 0; box-shadow: 0 4px 10px rgba(244,63,94,0.15); }
        .them .msg-bubble { background: #1e293b; color: #f1f5f9; border-top-left-radius: 0; }
        
        .social-matrix-list-node { background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.04); padding: 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .social-matrix-list-node span { font-size: 12px; font-weight: 500; }
        
        .meta-identity-strip { font-size: 10px; color: #475569; padding: 8px 16px; border-top: 1px solid rgba(255,255,255,0.02); background: rgba(0,0,0,0.1); font-style: italic; position: absolute; bottom: 50px; left: 0; right: 0; height: 34px; z-index: 10; display: flex; align-items: center; }
        
        .chat-input-form { display: flex; gap: 10px; padding: 10px 14px; background-color: #070910; border-top: 1px solid rgba(168, 85, 247, 0.25); align-items: center; height: 50px; position: absolute; bottom: 0; left: 0; right: 0; z-index: 20; }
        .chat-input-form input { flex: 1; background: var(--bg-input) !important; border: 1px solid rgba(255,255,255,0.06) !important; padding: 8px 12px; color: white !important; font-size: 12.5px; outline: none; border-radius: 6px; height: 32px; }
        .chat-input-form button { background: linear-gradient(90deg, var(--neon-purple), #4f46e5); color: white; font-weight: 700; height: 32px; padding: 0 14px; border-radius: 6px; font-size: 11px; cursor: pointer; box-shadow: 0 0 10px rgba(168,85,247,0.15); border: none; }
        
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(168, 85, 247, 0.15); border-radius: 2px; }
      `}</style>
      {/* 1. LEFT SIDEBAR PANEL ELEMENT */}
      <aside className="hush-sidebar">
        <div className="sidebar-top">
          <div className="brand-header">
            <h2>🤫 HuSH MATCH</h2>
            <span className="version-tag">V1.3.1</span>
          </div>

          <div className="profile-console-card">
            <div className="form-group"><label>User Handle</label><input type="text" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
            <div className="form-group"><label>Avatar URL</label><input type="text" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} /></div>
            <div className="form-row">
              <div className="form-group"><label>Age Matrix</label><select value={age} onChange={(e) => setAge(e.target.value)}><option>24</option><option>28</option></select></div>
              <div className="form-group"><label>Hub</label><input type="text" value={location} onChange={(e) => setLocation(e.target.value)} /></div>
            </div>
            <div className="form-row">
              <select value={intent} onChange={(e) => setIntent(e.target.value)}><option>Mingling</option></select>
              <select value={myInterest} onChange={(e) => setMyInterest(e.target.value)}>{sharedInterestsList.map(i => <option key={i}>{i}</option>)}</select>
            </div>
            <button className="btn-save-profile">UPDATE SYSTEM PROFILE</button>
          </div>

          <div className="realms-list">
            <p className="section-title">Active Realms</p>
            {rooms.map(r => (
              <button key={r.id} onClick={() => setActiveRoom(r.id)} className={`realm-tab ${activeRoom === r.id ? 'active' : ''}`}>
                <span>{r.icon} {r.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-bottom">
          <button className="btn-premium">🔥 UNLOCK PREMIUM VIP VAULT</button>
          <div className="status-footer"><span>Secure SSL Route</span><span>Incognito active</span></div>
        </div>
      </aside>
      {/* 2. DUAL MAIN CONTENT DECK FRAME COLUMNS */}
      <main className="hush-main-deck">
        
        {/* THE WIDEST DECK COLUMN SPACE FOR DISPLAYS */}
        <div className="deck-column-wide">
          <div className="hush-card highlight">
            <p className="card-lbl-neon">⚡ ALGORITHMIC TARGET</p>
            <h3 style={{ marginTop: '6px', fontSize: '18px', fontWeight: 'bold' }}>{catchOfTheDay.name}</h3>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Aligned interest: {catchOfTheDay.sharedInterest}</p>
            <div className="compatibility-score">{catchOfTheDay.matchScore}% <span>Match</span></div>
          </div>

          <div className="hush-card">
            <p className="card-lbl">🎲 ICEBREAKER MATRIX NETWORK</p>
            {diceResult && <span style={{ position: 'absolute', top: '20px', right: '20px', fontSize: '11px', color: '#f43f5e', background: 'rgba(244,63,94,0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>VAL: {diceResult}</span>}
            <p className="matrix-prompt">"{gameQuestion}"</p>
            <button onClick={handleRollDice} className="btn-action">Execute Matrix Draw</button>
          </div>
        </div>

        {/* PROPORTIONAL SLENDER RIGHT CANVASSES ENGAGEMENT HUB */}
        <div className="deck-column-slender">
          <div className="chat-window-box">
            
            <header className="chat-header">
              <div className="header-status"><span className="indicator-dot"></span><h3 style={{ fontSize: '11px', fontWeight: '900', color: '#cbd5e1' }}>{activeRoom.toUpperCase()} CORE NODE</h3></div>
              <button onClick={isVideoActive ? handleStopVideo : handleStartVideo} className="btn-video-toggle">{isVideoActive ? '🛑 Stop Feed' : '🎥 Start Stream'}</button>
            </header>

            {isVideoActive && <div className="video-stream-box"><video ref={localVideoRef} autoPlay playsInline muted /></div>}

            {/* DIRECT ACTIVE SCROLLER CONSOLE DECK LINE LAYOUT */}
            <div className="right-column-scroller-track">
              
              {/* FAV FIVE LIST DECK DISPLAY */}
              <div style={{ marginBottom: '14px' }}>
                <p style={{ fontSize: '9px', fontWeight: '900', color: '#a855f7', letterSpacing: '0.05em', marginBottom: '8px' }}>🏆 FAV FIVE DECK LIST</p>
                {favFiveList.map(u => (
                  <div key={u.id} className="social-matrix-list-node">
                    <span>{u.rank} {u.name}</span>
                    <span style={{ color: '#10b981', fontFamily: 'monospace', fontSize: '11px' }}>{u.rating}% ALIGNED</span>
                  </div>
                ))}
              </div>

              {/* INTEGRATED FRIENDS CONNECTIONS CHANNELS DISPLAY */}
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '9px', fontWeight: '900', color: '#64748b', letterSpacing: '0.05em', marginBottom: '8px' }}>🤝 SYNCHRONIZED FRIENDS CHANNELS</p>
                {friendsList.map((f, i) => (
                  <div key={i} className="social-matrix-list-node">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#10b981' }}></span>{f}</span>
                    <span style={{ color: '#475569', fontSize: '10px', fontFamily: 'monospace' }}>SECURE LINK</span>
                  </div>
                ))}
              </div>

              {/* LIVE REALTIME TRAFFIC MESSAGES GRID PACKETS LOG FEED */}
              <p style={{ fontSize: '9px', fontWeight: '900', color: '#f43f5e', letterSpacing: '0.05em', marginBottom: '6px', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '14px' }}>📟 SECURE LOG FEED</p>
              {messages.length === 0 ? (
                <div style={{ padding: '20px 0', color: '#475569', fontSize: '11px', fontFamily: 'monospace' }}><p>Awaiting text packet traffic transmission streams...</p></div>
              ) : (
                messages.map((m, idx) => (
                  <div key={idx} className={`msg-row ${m.user === username ? 'me' : 'them'}`}>
                    <span className="msg-author">{m.user}</span>
                    <div className="msg-bubble">{m.text}</div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="meta-identity-strip">🧬 IDENTITY MATRIX: {gender} | "{bio}"</div>

            {/* THE ABSOLUTE BOTTOM DOCK DISPATCH MESSAGING SYSTEM INPUT CONTAINER */}
            <form onSubmit={handleSendMessage} className="chat-input-form">
              <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Transmit secure message block..." />
              <button type="submit">DISPATCH</button>
            </form>

          </div>
        </div>

      </main>

    </div>
  );
}
