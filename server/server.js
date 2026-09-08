import express from "express";
import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 3000;
const app = express();
const server = app.listen(PORT, () => console.log(`Server running on ${PORT}`));

// Keep hosting a WebSocket server
const wss = new WebSocketServer({ server });

// Optionally connect outward too
const ws = new WebSocket(process.env.VITE_WS);
// ROOM STORAGE
const rooms = new Set();

// HTTP: Create room
app.post('/createRoom', (req, res) => {
    const { room } = req.body;
    if (!room) return res.status(400).json({ error: 'Room name required' });

    rooms.add(room);console.log(`Room created: ${room}`);
 
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
                            user: data.user || "User",
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
