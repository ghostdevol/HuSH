const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 10000;

// Create ONE server for both HTTP + WebSocket
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// ROOM STORAGE
const rooms = new Set();

// Helper: broadcast a payload to all clients in a room (optionally excluding one socket)
function broadcastToRoom(room, payload, exceptSocket = null) {
  const msg = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN && client.currentRoom === room && client !== exceptSocket) {
      client.send(msg);
    }
  }
}

wss.on('connection', (socket, req) => {
  socket.currentRoom = null;
  socket.isAlive = true;

  // keepalive
  socket.on('pong', () => {
    socket.isAlive = true;
  });

  // welcome
  socket.send(JSON.stringify({ type: 'welcome', message: 'Connected to HuSH server' }));

  socket.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      console.error('WS parse error:', err);
      return;
    }

    if (data.type === 'join') {
      const room = String(data.room || '').trim();
      if (!room) {
        socket.send(JSON.stringify({ type: 'error', message: 'room required to join' }));
        return;
      }
      rooms.add(room);
      const prev = socket.currentRoom;
      socket.currentRoom = room;
      console.log(`User joined room: ${room} (was: ${prev})`);
      socket.send(JSON.stringify({ type: 'joined', room }));
      broadcastToRoom(room, { type: 'system', message: `${data.user || 'Someone'} joined the room` }, socket);
      return;
    }

    if (data.type === 'leave') {
      if (socket.currentRoom) {
        const left = socket.currentRoom;
        socket.currentRoom = null;
        socket.send(JSON.stringify({ type: 'left', room: left }));
        broadcastToRoom(left, { type: 'system', message: `${data.user || 'Someone'} left the room` }, socket);
      } else {
        socket.send(JSON.stringify({ type: 'error', message: 'not in a room' }));
      }
      return;
    }

    if (data.type === 'msg') {
      if (!socket.currentRoom) {
        socket.send(JSON.stringify({ type: 'error', message: 'join a room before sending messages' }));
        return;
      }
      const payload = {
        type: 'msg',
        user: data.user || 'User',
        text: data.text || '',
        ts: Date.now()
      };
      broadcastToRoom(socket.currentRoom, payload);
      return;
    }

    socket.send(JSON.stringify({ type: 'error', message: 'unknown message type' }));
  });

  socket.on('close', () => {
    console.log('User disconnected', socket.currentRoom);
    if (socket.currentRoom) {
      broadcastToRoom(socket.currentRoom, { type: 'system', message: 'A user disconnected' }, socket);
    }
  });

  socket.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// Periodic ping to detect dead connections
const pingInterval = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    try {
      socket.ping();
    } catch (err) {
      socket.terminate();
    }
  }
}, 30000);

wss.on('close', () => {
  clearInterval(pingInterval);
});

// HTTP: Create room
app.post('/createRoom', (req, res) => {
  const room = String((req.body && req.body.room) || '').trim();
  if (!room) return res.status(400).json({ error: 'Room name required' });

  rooms.add(room);
  console.log(`Room created: ${room}`);

  res.json({ success: true, rooms: Array.from(rooms) });
});

app.get('/rooms', (req, res) => {
  res.json({ rooms: Array.from(rooms) });
});

// Start server
server.listen(PORT, () => {
  console.log(`HuSH backend running on port ${PORT}`);
});
