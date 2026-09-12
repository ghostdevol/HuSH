'use strict';

const express = require('express');
const http = require('http');
const cors = require('cors'); // Added: Essential for Vercel -> Render HTTP communication
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
app.use(express.json());

// 1. ALLOWED ORIGINS CONFIGURATION
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

// Enable CORS middleware so Vercel can fetch /rooms and /createRoom
app.use(cors({
  origin: function (origin, callback) {
    // If no origins are restricted in the environment variables, allow all (good for fallback)
    if (!ALLOWED_ORIGINS.length) return callback(null, true);
    // Allow server-to-server requests or tools like Postman
    if (!origin) return callback(null, true);
    
    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

const PORT = process.env.PORT || 10000;

// Create ONE server for both HTTP + WebSocket
const server = http.createServer(app);
const WS= new WebSocketServer({ server });

// FIXED: Removed the syntax-breaking URL string from this configuration object
const wss = new WebSocketServer({ server, path: '/ws' });

// ROOM STORAGE: map roomName -> Set of ws clients
const rooms = new Map();

// HTTP: Create room
app.post('/createRoom', (req, res) => {
  const { room } = req.body;
  if (!room || typeof room !== 'string') return res.status(400).json({ error: 'Room name required' });

  if (!rooms.has(room)) rooms.set(room, new Set());
  console.log(`Room created: ${room}`);

  res.json({ success: true, rooms: Array.from(rooms.keys()) });
});

// HTTP: List rooms
app.get('/rooms', (req, res) => {
  res.json({ rooms: Array.from(rooms.keys()) });
});

// Simple origin check for WebSocket upgrade connections
function isOriginAllowed(origin) {
  if (!ALLOWED_ORIGINS.length) return true;
  if (!origin) return false;
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

wss.on('connection', (ws, request) => {
  const origin = request.headers.origin;
  if (!isOriginAllowed(origin)) {
    console.warn('Connection rejected due to origin:', origin);
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
    } catch (err) {
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
      const room = ws.currentRoom;
      if (room) {
        const set = rooms.get(room);
        if (set) set.delete(ws);
        ws.currentRoom = null;
        broadcastToRoom(room, { type: 'system', message: 'A user left the room' }, ws);
        if (set && set.size === 0) rooms.delete(room);
      }
      ws.send(JSON.stringify({ type: 'left' }));
      return;
    }

    if (type === 'msg') {
      const room = ws.currentRoom || data.room;
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not in a room' }));
        return;
      }
      const text = (data.text || '').toString().slice(0, 2000);
      const user = data.user || 'User';
      const payload = { type: 'msg', user, text, ts: Date.now() };
      broadcastToRoom(room, payload);
      return;
    }

    ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  });

  ws.on('close', () => {
    const room = ws.currentRoom;
    if (room) {
      const set = rooms.get(room);
      if (set) {
        set.delete(ws);
        broadcastToRoom(room, { type: 'system', message: 'A user disconnected' }, ws);
        if (set.size === 0) rooms.delete(room);
      }
    }
    console.log('Client disconnected');
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// Heartbeat — terminate dead connections
const interval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (err) {
      console.error('Ping error:', err);
    }
  }
}, 30000);

// Graceful shutdown
function shutdown() {
  console.log('Shutting down server...');
  clearInterval(interval);
  wss.clients.forEach((ws) => ws.terminate());
  wss.close(() => {
    server.close(() => {
      console.log('Server closed.');
      process.exit(0);
    });
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
server.listen(PORT, () => {
  console.log(`HuSH backend running on port ${PORT}`);
});


