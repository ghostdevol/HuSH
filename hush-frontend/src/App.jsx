import React, { useState, useEffect, useRef } from 'react';

export default function App() {
  // 1. SYSTEM PROFILE METRIC REGISTRIES
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

  // 2. SOCIAL SYSTEM REGISTRIES
  const [likedUsers, setLikedUsers] = useState(new Set());
  const [dislikedUsers, setDislikedUsers] = useState(new Set());
  const [friendsList, setFriendsList] = useState(['vixen_99', 'neon_vibe']);
  const [blockedUsers, setBlockedUsers] = useState(new Set());
  const [favFiveList, setFavFiveList] = useState([
    { id: '1', name: 'vixen_99', rating: 98, rank: '#1' },
    { id: '2', name: 'alpha_prime', rating: 94, rank: '#2' }
  ]);

  // 3. GAMIFIED SYSTEMS MATRICES
  const [selectedUser, setSelectedUser] = useState(null);
  const [gameQuestion, setGameQuestion] = useState("Click Draw to find alignment...");
  const [diceResult, setDiceResult] = useState(null);
  const [catchOfTheDay, setCatchOfTheDay] = useState({ name: 'vixen_99', matchScore: 99, sharedInterest: 'Nightlife' });

  const questionsList = [
    "What is your absolute biggest dealbreaker in an inner-circle match?",
    "First date: Private hidden speakeasy or high-end roof lounge?",
    "Are you looking for slow-burn chemistry or instant fireworks?",
    "What secret obsession do you spend the most time on?"
  ];

  const sharedInterestsList = ["Crypto", "Fitness", "Nightlife", "Travel", "Art", "Fine Dining"];
  const [myInterest, setMyInterest] = useState("Nightlife");

  const [localStream, setLocalStream] = useState(null);
  const [isVideoActive, setIsVideoActive] = useState(false);
  const socketRef = useRef(null);
  const chatEndRef = useRef(null);
  const localVideoRef = useRef(null);

  // Cleaned compliant rooms list
  const rooms = [
    { id: 'lobby', name: '🌐 General Mingling', intent: 'Mingling' },
    { id: 'serious', name: '💍 Serious Connections Only', intent: 'Serious' },
    { id: 'friends', name: '🤝 Platonic Friend Circles', intent: 'Friends' },
    { id: 'hookups', name: '🔥 Elite After-Hours Lounge', intent: 'Hookups' },
    { id: 'xxx', name: '👑 Platinum VIP Chambers', intent: 'XXX' }
  ];

  // 4. STRIPE INTEGRATED LIVE SOCKET LISTENER PIPELINE
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
        
        if (incoming.type === 'history') {
          setMessages(incoming.messages);
        } else if (incoming.type === 'message' && incoming.room === activeRoom) {
          setMessages((p) => [...p, incoming]);
        } else if (incoming.type === 'checkout_url_generated') {
          if (incoming.success && incoming.url) {
            window.open(incoming.url, '_blank');
          } else {
            alert(`Stripe Billing Error: ${incoming.error}`);
          }
        }
      } catch (err) { console.error(err); }
    };
    return () => ws.close();
  }, [activeRoom, isAccountPaused, isPremium, blockedUsers]);
  const handleStartVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setIsVideoActive(true);
      setTimeout(() => { if (localVideoRef.current) localVideoRef.current.srcObject = stream; }, 100);
    } catch { alert("Verify camera and voice connection permissions!"); }
  };

  const handleStopVideo = () => {
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); setLocalStream(null); setIsVideoActive(false); }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || !socketRef.current || isAccountPaused) return;
    socketRef.current.send(JSON.stringify({ type: 'message', room: activeRoom, user: username, text: inputValue }));
    setInputValue('');
  };

  // 5. TRIGGER STRIPE WORKFLOW OVER WEBSOCKET
  const handleUpgradeSubscription = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      alert("Socket connection offline. Please check your server status.");
      return;
    }
    socketRef.current.send(JSON.stringify({
      type: 'request_checkout_session',
      user: username
    }));
  };

  const handleRollDice = () => {
    const rolled = Math.floor(Math.random() * 6) + 1;
    setDiceResult(rolled);
    if (rolled === 6) setGameQuestion("🎯 Jackpot! You get a free premium unlock message thread.");
    else setGameQuestion(`🎲 Rolled a ${rolled}! Ask the pool question #${rolled} on your list.`);
  };

  const handleBlockUser = (targetName) => {
    setBlockedUsers(new Set([...blockedUsers, targetName]));
    setSelectedUser(null);
    alert(`User ${targetName} has been blocked.`);
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  return (
    <div className="flex h-screen w-screen bg-[#04060a] text-slate-100 overflow-hidden font-sans">
      
      {/* SIDEBAR PANEL TRACK CONTROLLER */}
      <aside className="w-80 border-r border-white/5 bg-slate-950/90 backdrop-blur-xl flex flex-col justify-between p-4 overflow-y-auto shrink-0 space-y-6">
        <div className="space-y-5">
          <div className="flex items-center gap-3 px-2 justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl animate-pulse">🤫</span>
              <h1 className="text-base font-black tracking-wider bg-gradient-to-r from-rose-400 to-purple-500 bg-clip-text text-transparent">HuSH MATCH</h1>
            </div>
            {isPremium && <span className="text-[8px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/30 font-black uppercase">ELITE</span>}
          </div>

          {isEditingProfile ? (
            <div className="bg-white/5 border border-white/5 p-3 rounded-xl space-y-2.5">
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Handle" className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1 text-xs outline-none" />
              <input type="text" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="Avatar Photo URL" className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1 text-xs outline-none" />
              <div className="flex gap-2">
                <select value={age} onChange={(e) => setAge(e.target.value)} className="w-1/2 bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs outline-none"><option>18</option><option>21</option><option>24</option><option>28</option><option>32</option></select>
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City" className="w-1/2 bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1 text-xs outline-none" />
              </div>
              <select value={intent} onChange={(e) => setIntent(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs outline-none"><option>Mingling</option><option>Serious</option><option>Friends</option></select>
              <select value={myInterest} onChange={(e) => setMyInterest(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs outline-none">{sharedInterestsList.map(i => <option key={i}>{i}</option>)}</select>
              <button type="button" onClick={() => setIsEditingProfile(false)} className="w-full py-1.5 bg-gradient-to-r from-rose-500 to-purple-600 text-xs font-bold rounded-lg uppercase tracking-wide">Save Profile</button>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/5 p-3 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white">{username}, {age}</p>
                <p className="text-[10px] text-slate-400">{location} • {intent}</p>
              </div>
              <button onClick={() => setIsEditingProfile(true)} className="text-[10px] text-rose-400 underline hover:text-rose-300">Edit</button>
            </div>
          )}

          {/* ACTIVE CHAMBER CONNECTIONS */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase px-2 mb-2">Active Realms</p>
            {rooms.map((room) => {
              const isRestricted = ['hookups', 'xxx'].includes(room.id);
              const canAccess = !isRestricted || isPremium;

              const activeStyles = `
                bg-gradient-to-r from-rose-500/10 to-purple-500/10 
                border border-rose-500/20 text-rose-300
              `;
              const idleStyles = 'hover:bg-white/5 text-slate-400';

              return (
                <button
                  key={room.id}
                  onClick={() => canAccess && setActiveRoom(room.id)}
                  className={`
                    w-full text-left px-3 py-2 rounded-lg 
                    flex items-center justify-between transition-all 
                    ${activeRoom === room.id ? activeStyles : idleStyles} 
                    ${!canAccess ? 'opacity-40 cursor-not-allowed' : ''}
                  `}
                >
                  <span className="text-xs font-medium">{room.name}</span>
                  {isRestricted && !isPremium && (
                    <span className="text-[8px] bg-rose-500/20 text-rose-400 border border-rose-500/30 px-1.5 py-0.5 rounded font-black">
                      VIP
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* BOTTOM ACQUISITION MODULE */}
        <div className="pt-4 border-t border-white/5 space-y-3">
          {!isPremium && (
            <button
              onClick={handleUpgradeSubscription}
              className="w-full py-2.5 bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 rounded-xl text-xs font-black text-white shadow-xl shadow-rose-950/30 tracking-wider uppercase"
            >
              👑 Unlock Premium VIP Vault
            </button>
          )}
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-slate-500">Status: Secure Socket</span>
            <button onClick={() => setIsAccountPaused(!isAccountPaused)} className="text-[10px] text-slate-400 underline">
              {isAccountPaused ? "Resume Pipeline" : "Incognito Pause"}
            </button>
          </div>
        </div>
      </aside>      {/* CORE DISPLAY AND CHAT MATRIX */}
      <main className="flex-1 flex flex-col bg-slate-950">
        <header className="h-14 border-b border-white/5 px-4 flex items-center justify-between bg-slate-950/40 backdrop-blur-md">
          <div>
            <h2 className="text-xs font-bold text-slate-200">Arena: {rooms.find(r => r.id === activeRoom)?.name}</h2>
            <p className="text-[10px] text-slate-500">Transport Layer Encrypted</p>
          </div>
          <div className="flex items-center gap-2">
            {isVideoActive ? (
              <button onClick={handleStopVideo} className="px-2.5 py-1 bg-rose-600 text-white font-bold rounded text-[10px]">Kill Cam</button>
            ) : (
              <button onClick={handleStartVideo} className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-slate-300 font-bold border border-white/10 rounded text-[10px]">Go Live</button>
            )}
          </div>
        </header>

        {/* CHAT THREAD FEED */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex flex-col ${msg.user === username ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[70%] p-2.5 rounded-xl text-xs ${
                msg.user === username 
                  ? 'bg-gradient-to-br from-purple-600 to-indigo-700 text-white rounded-tr-none' 
                  : 'bg-white/5 text-slate-200 border border-white/5 rounded-tl-none'
              }`}>
                <span className="block text-[8px] font-bold text-slate-400 mb-0.5">{msg.user}</span>
                <p className="leading-relaxed">{msg.text}</p>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* VIDEO PREVIEW PILL */}
        {isVideoActive && (
          <div className="absolute bottom-20 right-76 w-40 h-28 rounded-lg overflow-hidden border border-white/10 bg-black shadow-2xl z-50">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          </div>
        )}

        {/* CONSOLE INPUT ROW */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-white/5 bg-slate-950/60 flex gap-2">
          <input 
            type="text" 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isAccountPaused}
            placeholder={isAccountPaused ? "Pipeline paused..." : `Message ${rooms.find(r => r.id === activeRoom)?.name}...`}
            className="flex-1 bg-white/5 border border-white/5 rounded-xl px-4 py-2 text-xs outline-none focus:border-rose-500/40 text-slate-100"
          />
          <button type="submit" disabled={isAccountPaused} className="px-4 py-2 bg-gradient-to-r from-rose-500 to-purple-600 font-bold rounded-xl text-xs uppercase text-white shadow-lg">
            Send
          </button>
        </form>
      </main>

      {/* GAMIFIED INTERACTIONS PANEL */}
      <aside className="w-72 border-l border-white/5 bg-slate-950/40 p-4 flex flex-col justify-between overflow-y-auto shrink-0 space-y-4">
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-purple-950/30 to-slate-950 border border-purple-500/10 p-3 rounded-xl space-y-2">
            <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest block">👑 Algorithmic Catch</span>
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-white">{catchOfTheDay.name}</span>
              <span className="text-rose-400 font-black">{catchOfTheDay.matchScore}% Match</span>
            </div>
            <p className="text-[10px] text-slate-400">Aligned on: <span className="text-slate-200">{catchOfTheDay.sharedInterest}</span></p>
          </div>

          <div className="bg-white/5 border border-white/5 p-3 rounded-xl space-y-3">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">🎲 Icebreaker Matrix</span>
            <p className="text-[11px] text-slate-300 italic min-h-[32px]">"{gameQuestion}"</p>
            <button type="button" onClick={handleRollDice} className="w-full py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded text-[10px] font-bold">
              Roll Dice
            </button>
          </div>
        </div>
        <div className="text-[9px] text-slate-600 text-center leading-normal">
          Encrypted Transport Layer • Active Enforcements Active
        </div>
      </aside>

    </div>
  );
}

