# ================================
# HuSH Full Project Auto-Installer
# ================================

Write-Host "🔥 Creating HuSH project structure..."

# Create folders
New-Item -ItemType Directory -Force -Path "backend"
New-Item -ItemType Directory -Force -Path "frontend"
New-Item -ItemType Directory -Force -Path "frontend/src"

# -------------------------
# BACKEND FILES
# -------------------------

Write-Host "📦 Writing backend files..."

@"
{
  "name": "hush-backend",
  "version": "1.0.0",
  "private": true,
  "main": "server.js",
  "type": "commonjs",
  "engines": {
    "node": "18.x"
  },
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "ws": "^8.18.0"
  }
}
"@ | Set-Content -Path "backend/package.json"

@"
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Set();

app.post('/createRoom', (req, res) => {
  const { room } = req.body;
  if (!room) return res.status(400).json({ error: 'Room name required' });

  rooms.add(room);
  console.log(`Room created: ${room}`);
  res.json({ success: true, rooms: Array.from(rooms) });
});

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

server.listen(PORT, () => {
  console.log(`HuSH backend running on port ${PORT}`);
});
"@ | Set-Content -Path "backend/server.js"

# -------------------------
# FRONTEND FILES
# -------------------------

Write-Host "🎨 Writing frontend files..."

@"
{
  "name": "hush-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "engines": {
    "node": "24.x",
    "npm": "11.x"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "tailwindcss": "^4.3.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.3.3",
    "@types/react": "^18.2.66",
    "@types/react-dom": "^18.2.22",
    "@vitejs/plugin-react-swc": "^3.5.0",
    "autoprefixer": "^10.4.19",
    "eslint": "^8.57.0",
    "eslint-plugin-react": "^7.33.2",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.6",
    "postcss": "^8.4.38",
    "vite": "^7.3.6"
  }
}
"@ | Set-Content -Path "frontend/package.json"

@"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  }
})
"@ | Set-Content -Path "frontend/vite.config.mjs"

@"
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {}
  },
  plugins: []
}
"@ | Set-Content -Path "frontend/tailwind.config.js"

@"
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {}
  }
}
"@ | Set-Content -Path "frontend/postcss.config.js"

@"
<!doctype html>
<html lang='en'>
  <head>
    <meta charset='UTF-8' />
    <title>HuSH</title>
  </head>
  <body>
    <div id='root'></div>
    <script type='module' src='/src/main.jsx'></script>
  </body>
</html>
"@ | Set-Content -Path "frontend/index.html"

@"
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

const ws = new WebSocket('wss://hush-5i33.onrender.com')

ws.onopen = () => console.log('Connected to HuSH backend')
ws.onclose = () => console.log('Disconnected from backend')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App ws={ws} />
  </React.StrictMode>
)
"@ | Set-Content -Path "frontend/src/main.jsx"

@"
import React, { useState, useEffect } from 'react'

function App({ ws }) {
  const [rooms, setRooms] = useState([])
  const [currentRoom, setCurrentRoom] = useState(null)
  const [messages, setMessages] = useState([])
  const [roomInput, setRoomInput] = useState('')
  const [msgInput, setMsgInput] = useState('')

  useEffect(() => {
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.text) {
        setMessages((prev) => [...prev, { user: data.user, text: data.text }])
      }
    }
  }, [ws])

  async function createRoom() {
    if (!roomInput) return

    const res = await fetch('https://hush-5i33.onrender.com/createRoom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: roomInput })
    })

    const data = await res.json()
    if (data.rooms) setRooms(data.rooms)
    setRoomInput('')
  }

  function joinRoom(room) {
    setCurrentRoom(room)
    ws.send(JSON.stringify({ type: 'join', room }))
    setMessages([])
  }

  function sendMessage() {
    if (!currentRoom || !msgInput) return

    ws.send(JSON.stringify({
      type: 'msg',
      room: currentRoom,
      text: msgInput,
      user: 'You'
    }))

    setMsgInput('')
  }

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>HuSH Rooms</h1>

      <div>
        <input value={roomInput} onChange={(e) => setRoomInput(e.target.value)} placeholder='Room name' />
        <button onClick={createRoom}>Create Room</button>
      </div>

      <h2>Rooms</h2>
      <ul>
        {rooms.map((room) => (
          <li key={room} onClick={() => joinRoom(room)} style={{ cursor: 'pointer' }}>
            {room}
          </li>
        ))}
      </ul>

      <h2>Chat {currentRoom ? `(${currentRoom})` : ''}</h2>
      <div>
        {messages.map((m, i) => (
          <p key={i}><strong>{m.user}:</strong> {m.text}</p>
        ))}
      </div>

      <div>
        <input value={msgInput} onChange={(e) => setMsgInput(e.target.value)} placeholder='Message' />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  )
}

export default App
"@ | Set-Content -Path "frontend/src/App.jsx"

# -------------------------
# INSTALL DEPENDENCIES
# -------------------------

Write-Host "📥 Installing backend dependencies..."
cd backend
npm install
cd ..

Write-Host "📥 Installing frontend dependencies..."
cd frontend
npm install
cd ..

Write-Host "✅ HuSH project fully generated!"
Write-Host "🔥 Backend ready for Render"
Write-Host "🔥 Frontend ready for Vercel"
