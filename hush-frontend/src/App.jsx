import React, { useState, useEffect, useRef } from 'react';

export default function App() {
  // 1. CORE APPLICATION ROUTING & PROFILE STATE MATRICES
  const [activeRoom, setActiveRoom] = useState('lobby');
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [username, setUsername] = useState(`user_${Math.floor(100 + Math.random() * 900)}`);
  const [gender, setGender] = useState('Female');
  const [age, setAge] = useState('24');
  const [location, setLocation] = useState('New York');
  const [intent, setIntent] = useState('Mingling'); // Mingling, Serious, Chatting, Hookups, XXX
  const [bio, setBio] = useState('Verified real connection only.');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [isAccountPaused, setIsAccountPaused] = useState(false);

  // 2. SOCIAL SYSTEM REGISTRIES: MATCHES, FRIENDS, BLOCKS
  const [likedUsers, setLikedUsers] = useState(new Set());
  const [dislikedUsers, setDislikedUsers] = useState(new Set());
  const [friendsList, setFriendsList] = useState(['vixen_99', 'neon_vibe']);
  const [blockedUsers, setBlockedUsers] = useState(new Set());
  const [favFiveList, setFavFiveList] = useState([
    { id: '1', name: 'vixen_99', rating: 98, rank: '#1' },
    { id: '2', name: 'alpha_prime', rating: 94, rank: '#2' }
  ]);

  // 3. GAMIFIED MODULE CONTEXTS: GAMES & PICKS
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

  // 4. STREAMING MEDIA & SOCKET REFERENCE CHANNELS
  const [localStream, setLocalStream] = useState(null);
  const [isVideoActive, setIsVideoActive] = useState(false);
  const socketRef = useRef(null);
  const chatEndRef = useRef(null);
  const localVideoRef = useRef(null);

  const rooms = [
    { id: 'lobby', name: '🌐 General Mingling', intent: 'Mingling' },
    { id: 'serious', name: '💍 Serious Connections Only', intent: 'Serious' },
    { id: 'friends', name: '🤝 Platonic Friend Circles', intent: 'Friends' },
    { id: 'hookups', name: '🔥 Discrete Hookups', intent: 'Hookups' },
    { id: 'xxx', name: '😈 XXX Adult Chambers', intent: 'XXX' }
  ];
  // 5. LIVE SOCKET NETWORK SYNCHRONIZATION PIPELINE
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
        if (blockedUsers.has(incoming.user)) return; // Auto drop blocked user logs
        if (incoming.type === 'history') setMessages(incoming.messages);
        else if (incoming.type === 'message' && incoming.room === activeRoom) setMessages((p) => [...p, incoming]);
      } catch (err) { console.error(err); }
    };
    return () => ws.close();
  }, [activeRoom, isAccountPaused, isPremium, blockedUsers]);

  // 6. INTERACTION HOOK HANDLERS
  const handleStartVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setIsVideoActive(true);
      setTimeout(() => { if (localVideoRef.current) localVideoRef.current.srcObject = stream; }, 100);
    } catch { alert("Verify local security camera configurations!"); }
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

  const handleRollDice = () => {
    const rolled = Math.floor(Math.random() * 6) + 1;
    setDiceResult(rolled);
    // Dynamic game outcome engine
    if (rolled === 6) setGameQuestion("🎯 Jackpot! You get a free premium unlock message thread.");
    else setGameQuestion(`🎲 Rolled a ${rolled}! Ask the pool question #${rolled} on your list.`);
  };

  const handleBlockUser = (targetName) => {
    setBlockedUsers(new Set([...blockedUsers, targetName]));
    setSelectedUser(null);
    alert(`User ${targetName} has been completely restricted and blocked.`);
  };

  const handleLikeUser = (targetName) => {
    setLikedUsers(new Set([...likedUsers, targetName]));
    if (Math.random() > 0.5) alert(`🔥 Match Confirmed! ${targetName} liked you back. Send a DM!`);
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  return (
    <div className="flex h-screen w-screen bg-[#04060a] text-slate-100 overflow-hidden font-sans">
      
      {/* SIDEBAR DASHBOARD CONTROL AREA */}
      <aside className="w-80 border-r border-white/5 bg-slate-950/90 backdrop-blur-xl flex flex-col justify-between p-4 overflow-y-auto shrink-0 space-y-6">
        <div className="space-y-5">
          <div className="flex items-center gap-3 px-2 justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl animate-pulse">🤫</span>
              <h1 className="text-base font-black tracking-wider bg-gradient-to-r from-rose-400 to-purple-500 bg-clip-text text-transparent">HuSH MATCH</h1>
            </div>
            {isPremium && <span className="text-[8px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/30 font-black uppercase">ELITE</span>}
          </div>

          {/* SYSTEM USER VETTING PREFERENCE INPUT SHELF */}
          {isEditingProfile ? (
            <div className="bg-white/5 border border-white/5 p-3 rounded-xl space-y-2.5">
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Handle" className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1 text-xs outline-none" />
              <input type="text" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="Avatar Photo URL" className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1 text-xs outline-none" />
              <div className="flex gap-2">
                <select value={age} onChange={(e) => setAge(e.target.value)} className="w-1/2 bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs outline-none"><option>18</option><option>21</option><option>24</option><option>28</option><option>32</option></select>
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City Location" className="w-1/2 bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1 text-xs outline-none" />
              </div>
              <select value={intent} onChange={(e) => setIntent(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs outline-none"><option>Mingling</option><option>Serious</option><option>Friends</option><option>Hookups</option></select>
              <select value={myInterest} onChange={(e) => setMyInterest(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs outline-none">{sharedInterestsList.map(i => <option key={i}>{i}</option>)}</select>
              <button type="button" onClick={() => setIsEditingProfile(false)} className="w-full py-1.5 bg-gradient-to-r from-rose-500 to-purple-600 text-xs font-bold rounded-lg uppercase">Save Credentials</button>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/5 p-3 rounded-xl space-y-2 shadow-inner">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <img src={photoUrl || `https://dicebear.com{username}`} alt="Avatar" className="w-9 h-9 rounded-full object-cover border border-rose-500/30" />
                  <span className="absolute -bottom-0.5 -right-0.5 text-[8px] bg-cyan-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold border border-slate-950">✓</span>
                </div>
                <div className="flex-1 min-w-0"><div className="flex items-center gap-1.5"><p className="text-xs font-bold truncate text-slate-200">{username}</p><span className="text-[8px] text-slate-500 font-bold">{age}y • {location}</span></div><p className="text-[9px] text-rose-400 font-bold tracking-wide uppercase">{intent} Mode</p></div>
                <button type="button" onClick={() => setIsEditingProfile(true)} className="text-[9px] border border-white/10 px-2 py-0.5 rounded">Edit</button>
              </div>
            </div>
          )}

          {/* USER CONFIGURATION SWITCHES: PAUSE PRIVACY ENGINE */}
          <div className="flex gap-2">
            <button type="button" onClick={() => setIsAccountPaused(!isAccountPaused)} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase border tracking-wider transition-all ${isAccountPaused ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}>
              {isAccountPaused ? '⏸ Account Paused' : '🟢 Account Active'}
            </button>
          </div>

          {/* CHAMBERS LAYOUT SPLIT */}
          <div className="space-y-1">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Chambers</p>
            {rooms.map((r) => (
              <button key={r.id} onClick={() => { setActiveRoom(r.id); setMessages([]); }} className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs ${activeRoom === r.id ? 'bg-gradient-to-r from-rose-500/20 to-transparent border-l-2 border-rose-500 text-rose-400 font-bold' : 'text-slate-400 hover:bg-white/5'}`}>
                <span>{r.name}</span>
              </button>
            ))}
          </div>

          {/* DYNAMIC LEADERBOARD RANK MATRIX: FAV 5 */}
          <div className="space-y-1.5">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">My Fav 5 Rankings</p>
            <div className="bg-white/5 border border-white/5 p-2 rounded-xl space-y-1">
              {favFiveList.map((f) => (
                <div key={f.id} className="flex items-center justify-between bg-slate-900/40 p-1.5 border border-white/5 rounded-lg text-[11px]">
                  <p className="font-bold text-slate-300"><span className="text-pink-400 font-mono font-black mr-1">{f.rank}</span> {f.name}</p>
                  <span className="text-[8px] bg-pink-500/10 text-pink-400 font-black px-1 rounded">{f.rating}% score</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-2">
          <button type="button" onClick={() => setIsPremium(!isPremium)} className="w-full py-2 bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 text-white font-black text-xs rounded-xl uppercase shadow-md">
            {isPremium ? '✨ Premium Active' : '⚡ Upgrade Subscriptions'}
          </button>
        </div>
      </aside>
      {/* CORE DISPLAY STAGE CHAT WINDOW */}
      <main className="flex-1 flex flex-col bg-gradient-to-b from-slate-950/40 to-transparent relative">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-slate-950/20">
          <h2 className="font-bold text-xs text-slate-200 tracking-wide uppercase">{rooms.find(r => r.id === activeRoom)?.name}</h2>
          {isVideoActive ? (
            <button type="button" onClick={handleStopVideo} className="bg-rose-500/20 text-rose-400 border border-rose-500/30 px-3 py-1 rounded-lg text-xs font-bold animate-pulse">End Live Stream</button>
          ) : (
            <button type="button" onClick={handleStartVideo} className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-lg text-xs font-bold">Go Live (Video Chat)</button>
          )}
        </header>

        {/* WEBCAM STREAMS GRID */}
        {isVideoActive && (
          <div className="p-4 bg-slate-950/60 border-b border-white/5 flex justify-center">
            <div className="w-64 h-36 bg-slate-900 border border-rose-500/30 rounded-xl overflow-hidden relative shadow-lg">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover transform -scale-x-100" />
              <span className="absolute bottom-1.5 left-1.5 text-[8px] bg-black/60 px-1.5 py-0.2 rounded text-white tracking-widest font-black">LOCAL CAMERA SOURCE</span>
            </div>
          </div>
        )}

        {/* REVENUE GENERATING ENGINE MODULE LAYOUT BOARDS */}
        <div className="grid grid-cols-2 gap-3 mx-6 mt-3">
          {/* GAME 1: 21 QUESTIONS & ROLL THE DICE INTEGRATION */}
          <div className="bg-white/5 border border-white/5 p-2 rounded-xl flex items-center justify-between text-[11px] gap-2">
            <div className="min-w-0">
              <p className="text-[8px] text-pink-400 font-black uppercase tracking-widest">Icebreaker Module</p>
              <p className="text-slate-300 italic truncate font-medium">"{gameQuestion}"</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button type="button" onClick={() => setGameQuestion(questionsList[Math.floor(Math.random() * questionsList.length)])} className="bg-white/5 px-2 py-1 rounded-lg border border-white/10 font-bold uppercase text-[9px]">Draw</button>
              <button type="button" onClick={handleRollDice} className="bg-pink-500/10 text-pink-400 px-2 py-1 rounded-lg border border-pink-500/20 font-black uppercase text-[9px]">Dice</button>
            </div>
          </div>

          {/* GAME 2: ALGORITHMIC CATCH OF THE DAY AND DISCOVERY */}
          <div className="bg-white/5 border border-white/5 p-2 rounded-xl flex items-center justify-between text-[11px]">
            <div>
              <p className="text-[8px] text-amber-400 font-black uppercase tracking-widest">🏆 Algorithmic Catch of the Day</p>
              <p className="text-slate-200 font-bold">💖 {catchOfTheDay.name} <span className="text-slate-500 font-normal">({catchOfTheDay.matchScore}% Match)</span></p>
            </div>
            <span className="text-[8px] bg-amber-500/10 text-amber-400 px-2 py-1 rounded border border-amber-500/20 uppercase font-mono font-bold shrink-0">{catchOfTheDay.sharedInterest}</span>
          </div>
        </div>

        {/* FEED LAYOUT */}
        <div className="flex-1 p-6 space-y-4 overflow-y-auto">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 max-w-xl ${msg.user === username ? 'ml-auto flex-row-reverse' : ''}`}>
              <img onClick={() => setSelectedUser(msg)} src={msg.photoUrl || `https://dicebear.com{msg.user}`} alt="Avatar" className="w-8 h-8 rounded-full object-cover border border-white/5 mt-0.5 shrink-0 cursor-pointer hover:border-pink-500 transition-colors animate-pulse" />
              <div className={`border rounded-2xl px-4 py-2 text-xs ${msg.user === username ? 'bg-purple-500/10 border-purple-500/20 rounded-tr-none' : 'bg-white/5 border-white/5 rounded-tl-none'}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-bold text-slate-200">{msg.user}</p>
                  <span className="text-[7px] bg-pink-500/10 text-pink-400 px-1 rounded uppercase font-mono">{msg.intent || 'Mingling'}</span>
                  {likedUsers.has(msg.user) && <span className="text-[8px] text-rose-500 font-bold">🔥 Liked</span>}
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">{msg.text}</p>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-6 pt-0">
          <div className="bg-slate-900/40 border border-white/5 rounded-xl px-4 py-3 flex items-center gap-3">
            <input type="text" value={inputValue} disabled={isAccountPaused} onChange={(e) => setInputValue(e.target.value)} placeholder={isAccountPaused ? "Account paused. Unpause in settings panel..." : "Type an incognito whisper to the pool..."} className="bg-transparent flex-1 text-xs outline-none text-slate-100 placeholder-slate-600" />
            <button type="submit" className="text-xs font-black text-pink-400 uppercase tracking-wider px-2">Send</button>
          </div>
        </form>
      </main>

      {/* DISCOVERY ACCELERATION PORTAL MODAL OVERLAY */}
      {selectedUser && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="max-w-sm w-full bg-[#0a0d14] border border-white/10 p-5 rounded-3xl relative shadow-2xl space-y-4">
            <button type="button" onClick={() => setSelectedUser(null)} className="absolute top-4 right-4 w-6 h-6 bg-white/5 border border-white/10 rounded-full text-xs text-slate-400 flex items-center justify-center">✕</button>
            <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-ping" /><h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{selectedUser.user}'s Vetted Book</h3></div>
            
            <div className="grid grid-cols-2 gap-2">
              {galleryPhotos.map((src, i) => (
                <div key={i} className="h-28 bg-slate-900 rounded-xl overflow-hidden border border-white/5"><img src={src} alt="Gallery" className="w-full h-full object-cover" /></div>
              ))}
            </div>

            <div className="bg-white/5 border border-white/5 p-3 rounded-xl space-y-3 text-[11px]">
              <div className="flex justify-between border-b border-white/5 pb-2">
                <button type="button" onClick={() => handleLikeUser(selectedUser.user)} className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-3 py-1 rounded-lg font-bold border border-rose-500/20 uppercase text-[9px]">🔥 Like</button>
                <button type="button" onClick={() => { setDislikedUsers(new Set([...dislikedUsers, selectedUser.user])); setSelectedUser(null); }} className="bg-white/5 hover:bg-white/10 text-slate-400 px-3 py-1 rounded-lg border border-white/10 uppercase text-[9px]">✕ Dislike</button>
                <button type="button" onClick={() => handleBlockUser(selectedUser.user)} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1 rounded-lg font-bold border border-red-500/20 uppercase text-[9px]">🚫 Block</button>
              </div>
              <p className="text-slate-400 italic">"Verified photo identity checked badge profile framework match."</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
