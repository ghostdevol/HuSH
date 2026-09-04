const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Create ONE server for both HTTP + WebSocket
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ROOM STORAGE
const rooms = new Set();

// HTTP: Create room
app.post('/createRoom', (req, res) => {
    const { room } = req.body;
    if (!room) return res.status(400).json({ error: 'Room name required' });

    rooms.add(room);
    console.log(`Room created: ${room}`);

    res.json({ success: true, rooms: Array.from(rooms) });
});

// WEBSOCKET: Chat system
wss.on('connection', (ws) => {
    ws.currentRoom = null;

    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);

            if (data.type === 'join') {
                ws.currentRoom = data.room;
                console.log(`User joined room: ${data.room}`);
            }

            if (data.type === 'msg' && ws.currentRoom) {
                wss.clients.forEach((client) => {
                    if (client.readyState === 1 && client.currentRoom === ws.currentRoom) {
                        client.send(JSON.stringify({
                            user: data.user || 'User',
                            text: data.text
                        }));
                    }
                });
            }
        } catch (err) {
            console.error('WS parse error:', err);
        }
    });

    ws.on('close', () => {
        console.log('User disconnected');
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`HuSH backend running on port ${PORT}`);
});
