'use strict';

const express = require('express');
const http = require('http');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
app.use(express.json());

// 1. ALLOWED ORIGINS CONFIGURATION
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!ALLOWED_ORIGINS.length) return callback(null, true);
      if (!origin) return callback(null, true); // server-to-server, curl, Postman
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

const PORT = process.env.PORT || 10000;

// ONE server for both HTTP + WebSocket
const server = http.createServer(app);

// Single WebSocketServer. (The old duplicate `new WebSocketServer({ server })`
// was removed — it swallowed every upgrade before the /ws server saw it.)
const wss = new WebSocketServer({ server, path: '/ws' });

// ROOM STORAGE: roomName -> Set of ws clients
const rooms = new Map();

// HTTP: Create room
app.post('/createRoom', (req, res) => {
  const { room } = req.body;
  if (!room || typeof room !== 'string') {
    return res.status(400).json({ error: 'Room name required' });
  }
  if (!rooms.has(room)) rooms.set(room, new Set());
  console.log(`Room created: ${room}`);
  res.json({ success: true, rooms: Array.from(rooms.keys()) });
});

// HTTP: List rooms
app.get('/rooms', (req, res) => {
  res.json({ rooms: Array.from(rooms.keys()) });
});

// HTTP: Health check (useful for Render)
app.get('/health', (req, res) => {
  res.json({ ok: true, rooms: rooms.size, clients: wss.clients.size });
});

// Origin check for WebSocket upgrade connections.
// Matches the CORS policy: non-browser clients send no Origin header,
// so allow those through instead of rejecting them.
function isOriginAllowed(origin) {
  if (!ALLOWED_ORIGINS.length) return true;
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

// Broadcast helper: send an object to all clients in a room
function broadcastToRoom(room, dataObj, exceptSocket = null) {
  const clients = rooms.get(room);
  if (!clients) return;
  const payload = JSON.stringify(dataObj);
  for (const client of clients) {
    if (client !== exceptSocket && client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (err) {
        console.error('Error sending to client:', err);
      }
    }
  }
}

function leaveRoom(ws) {
  const room = ws.currentRoom;
  if (!room) return;
  const set = rooms.get(room);
  if (set) {
    set.delete(ws);
    broadcastToRoom(room, { type: 'system', message: 'A user left the room' }, ws);
    if (set.size === 0) rooms.delete(room);
  }
  ws.currentRoom = null;
}

wss.on('connection', (ws, request) => {
  const origin = request.headers.origin;
  if (!isOriginAllowed(origin)) {
    console.warn('WS connection rejected, origin not allowed:', origin);
    ws.close(1008, 'Origin not allowed');
    return;
  }

  ws.isAlive = true;
  ws.currentRoom = null;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    const { type } = data;

    if (type === 'join') {
      const room = data.room;
      if (!room || typeof room !== 'string') {
        ws.send(JSON.stringify({ type: 'error', message: 'Room name required to join' }));
        return;
      }
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(ws);
      ws.currentRoom = room;
      console.log(`Client joined room: ${room}`);
      broadcastToRoom(room, { type: 'system', message: 'A user joined the room' }, ws);
      ws.send(JSON.stringify({ type: 'joined', room }));
      return;
    }

    if (type === 'leave') {
      leaveRoom(ws);
      ws.send(JSON.stringify({ type: 'left' }));
      return;
    }

    if (type === 'msg') {
      const room = ws.currentRoom || data.room;
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not in a room' }));
        return;
      }
      const text = String(data.text || '').slice(0, 2000);
      const user = String(data.user || 'User').slice(0, 50);
      broadcastToRoom(room, { type: 'msg', user, text, ts: Date.now() });
      return;
    }

    ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  });

  ws.on('close', () => {
    leaveRoom(ws);
    console.log('Client disconnected');
  });

  ws.on('error', (err) => console.error('WebSocket error:', err));
});

// Heartbeat — terminate dead connections
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

// Graceful shutdown
function shutdown() {
  console.log('Shutting down server...');
  clearInterval(interval);
  for (const ws of wss.clients) ws.terminate();
  wss.close(() => {
    server.close(() => {
      console.log('Server closed.');
      process.exit(0);
    });
  });
  // Failsafe: don't hang forever on Render
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
server.listen(PORT, () => {
  console.log(`HuSH backend running on port ${PORT}`);
});
      


