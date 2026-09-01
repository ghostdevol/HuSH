
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// 💳 INITIALIZE STRIPE: Paste your real sk_test_ token inside the quotes below!
const stripe = require('stripe')('sk_test_PASTE_YOUR_STRIPE_SECRET_KEY_HERE');

const MESSAGES_FILE = path.join(__dirname, 'data', 'messages.json');
const wss = new WebSocket.Server({ port: 5174 });
const connectedProfiles = new Map();

console.log('🔥 HuSH Dating Engine with Live Video active on port 5174');

function loadMessageHistory() {
  try {
    if (!fs.existsSync(MESSAGES_FILE)) return [];
    const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch { return []; }
}

function saveMessageToHistory(msg) {
  try {
    const history = loadMessageHistory();
    history.push(msg);
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(history, null, 2));
  } catch (err) { console.error(err); }
}
wss.on('connection', (ws) => {
  ws.isPremium = false;
  ws.userId = `ghost_${Math.floor(100 + Math.random() * 900)}`;

  ws.on('message', function incoming(data) {
    try {
      const parsedData = JSON.parse(data);

      // 1. SYNC COMPREHENSIVE DATING PROFILE
      if (parsedData.type === 'update_profile') {
        ws.username = parsedData.username || ws.userId;
        ws.gender = parsedData.gender || 'Not Specified';
        ws.intent = parsedData.intent || 'Mingling';
        ws.bio = parsedData.bio || '';
        ws.photoUrl = parsedData.photoUrl || `https://dicebear.com{ws.userId}`;

        connectedProfiles.set(ws.userId, {
          userId: ws.userId,
          username: ws.username,
          gender: ws.gender,
          intent: ws.intent,
          bio: ws.bio,
          photoUrl: ws.photoUrl,
          isPremium: ws.isPremium
        });

        ws.send(JSON.stringify({ type: 'profile_synced', userId: ws.userId, photoUrl: ws.photoUrl }));
        return;
      }

      // 2. ROUTE AUDIO/VIDEO STREAM SIGNALS (WEBRTC HANDSHAKE)
      if (parsedData.type === 'video_signal') {
        // Broadcast the webcam stream handshake to the target dater
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN && client.userId !== ws.userId) {
            client.send(JSON.stringify({
              type: 'video_signal',
              senderId: ws.userId,
              senderName: ws.username,
              signal: parsedData.signal
            }));
          }
        });
        return;
      }

      // 3. STANDARD CHAT ROOM ROUTING
      if (parsedData.type === 'join') {
        ws.currentRoom = parsedData.room;
        const history = loadMessageHistory().filter(msg => msg.room === ws.currentRoom);
        ws.send(JSON.stringify({ type: 'history', messages: history }));
        return;
      }

      if (parsedData.type === 'message') {
        const outMessage = {
          type: 'message',
          room: parsedData.room,
          user: ws.username || parsedData.user,
          photoUrl: ws.photoUrl,
          gender: ws.gender || '?',
          intent: ws.intent || 'Mingling',
          text: parsedData.text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        saveMessageToHistory(outMessage);
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN && client.currentRoom === parsedData.room) {
            client.send(JSON.stringify(outMessage));
          }
        });
      }
    } catch (err) { console.error(err); }
  });

  ws.on('close', () => { connectedProfiles.delete(ws.userId); });
});
