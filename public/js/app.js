const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public')); // Serves your HTML/JS frontend files

// 1. HTTP Endpoint for Creating Rooms
const rooms = new Set(); // Stores active room names

app.post('/createRoom', (req, res) => {
    const { room } = req.body;
    if (!room) return res.status(400).json({ error: 'Room name required' });
    
    rooms.add(room);
    console.log(`Room created: ${room}`);
    res.json({ success: true, rooms: Array.from(rooms) });
});

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// ONE server for HTTP + WS
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

server.listen(PORT, () => {
  console.log(`Server + WebSocket running on port ${PORT}`);
});
