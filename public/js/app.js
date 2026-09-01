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

// Start HTTP server on port 3000
const server = app.listen(3000, () => {
    console.log('HTTP Server running on http://localhost:3000');
});

// 2. WebSocket Server (Matching your port 5174)
const wss = new WebSocketServer({ port: 5174 });
console.log('WebSocket Server running on ws://localhost:5174');

wss.on('connection', (ws) => {
    // Attach a room tracking property directly to this client's socket
    ws.currentRoom = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // Handle joining a room
            if (data.type === 'join') {
                ws.currentRoom = data.room;
                console.log(`A user joined room: ${data.room}`);
            }

            // Handle broadcasting messages to everyone in the SAME room
            if (data.type === 'msg' && ws.currentRoom) {
                wss.clients.forEach((client) => {
                    // Only send to clients who are open AND in the matching room
                    if (client.readyState === 1 && client.currentRoom === ws.currentRoom) {
                        client.send(JSON.stringify({
                            user: "User", // You can expand this later to use real usernames
                            text: data.text
                        }));
                    }
                });
            }
        } catch (err) {
            console.error('Error parsing WS message:', err);
        }
    });

    ws.on('close', () => {
        console.log('User disconnected');
    });
});
