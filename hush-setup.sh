#!/bin/bash

echo "🔧 HuSH structure builder — safe mode (no overwrite)"

# --- Helper: create folder if missing ---
make_dir() {
  if [ ! -d "$1" ]; then
    mkdir -p "$1"
    echo "📁 Created folder: $1"
  else
    echo "✔️ Folder exists: $1"
  fi
}

# --- Helper: create file if missing ---
make_file() {
  if [ ! -f "$1" ]; then
    cat > "$1" <<EOF
$2
EOF
    echo "📄 Created file: $1"
  else
    echo "✔️ File exists: $1"
  fi
}

# --- Create folder structure ---
make_dir "src/assets/icons"
make_dir "src/components/layout"
make_dir "src/components/status"
make_dir "src/components/livecam"
make_dir "src/hooks"
make_dir "src/lib"
make_dir "src/store"
make_dir "src/config"
make_dir "src/styles"
make_dir "src/content"
make_dir "src/pages"

# --- Create files with starter code (only if missing) ---

make_file "src/config/env.js" \
"const isProd = import.meta.env.PROD;

export const API_URL = isProd
  ? import.meta.env.VITE_API_URL
  : 'http://localhost:5000';

export const WS_URL = isProd
  ? import.meta.env.VITE_WS_URL
  : 'ws://localhost:5000';
"

make_file "src/lib/socket.js" \
"import { WS_URL } from '../config/env';

let socket;

export const createSocket = () => {
  socket = new WebSocket(WS_URL);
  return socket;
};

export const getSocket = () => socket;
"

make_file "src/hooks/useSocket.js" \
"import { useEffect, useState } from 'react';
import { createSocket, getSocket } from '../lib/socket';
import useAppStore from '../store/useAppStore';

export default function useSocket() {
  const [ready, setReady] = useState(false);
  const setConnectionStatus = useAppStore(s => s.setConnectionStatus);

  useEffect(() => {
    let ws = createSocket();

    ws.onopen = () => {
      setReady(true);
      setConnectionStatus('connected');
      ws.send(JSON.stringify({ type: 'PING' }));
    };

    ws.onclose = () => {
      setReady(false);
      setConnectionStatus('disconnected');
      setTimeout(() => {
        ws = createSocket();
      }, 3000);
    };

    ws.onerror = () => {
      setConnectionStatus('error');
    };

    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'HEARTBEAT' }));
      }
    }, 30000);

    return () => {
      clearInterval(heartbeat);
      ws.close();
    };
  }, [setConnectionStatus]);

  return { socket: getSocket(), ready };
}
"

make_file "src/store/useAppStore.js" \
"import { create } from 'zustand';

const useAppStore = create(set => ({
  realm: 'platonic-friend-circles',
  connectionStatus: 'disconnected',
  liveCamStatus: 'idle',
  windows: {},
  setRealm: realm => set({ realm }),
  setConnectionStatus: status => set({ connectionStatus: status }),
  setLiveCamStatus: status => set({ liveCamStatus: status }),
  setWindowState: (id, state) =>
    set(s => ({ windows: { ...s.windows, [id]: state } })),
}));

export default useAppStore;
"

make_file "src/components/layout/WindowFrame.jsx" \
"import React from 'react';
import '../../styles/window.css';

export default function WindowFrame({ id, title, children }) {
  return (
    <div className='window-frame' data-id={id}>
      <div className='window-header'>
        <span className='window-title'>{title}</span>
        <div className='window-controls'>
          <button>−</button>
          <button>□</button>
          <button>×</button>
        </div>
      </div>
      <div className='window-body'>{children}</div>
    </div>
  );
}
"

make_file "src/components/layout/Toolbar.jsx" \
"import React from 'react';
import '../../styles/toolbar.css';
import useAppStore from '../../store/useAppStore';

export default function Toolbar() {
  const realm = useAppStore(s => s.realm);
  const setRealm = useAppStore(s => s.setRealm);

  return (
    <div className='toolbar neon-glow'>
      <button
        className={realm === 'platonic-friend-circles' ? 'active' : ''}
        onClick={() => setRealm('platonic-friend-circles')}
      >
        Arena
      </button>
      <button
        className={realm === 'settings' ? 'active' : ''}
        onClick={() => setRealm('settings')}
      >
        Settings
      </button>
    </div>
  );
}
"

make_file "src/components/status/ConnectionStatus.jsx" \
"import React from 'react';
import useAppStore from '../../store/useAppStore';

export default function ConnectionStatus() {
  const status = useAppStore(s => s.connectionStatus);

  return (
    <div className={'connection-status status-' + status}>
      {status === 'connected' && 'Live'}
      {status === 'disconnected' && 'Offline'}
      {status === 'error' && 'Error'}
    </div>
  );
}
"

make_file "src/components/livecam/LiveCam.jsx" \
"import React, { useEffect, useRef } from 'react';
import useSocket from '../../hooks/useSocket';
import '../../styles/livecam.css';

export default function LiveCam() {
  const videoRef = useRef(null);
  const { ready, socket } = useSocket();

  useEffect(() => {
    if (!ready || !socket) return;
    // attach stream logic here
  }, [ready, socket]);

  return (
    <div className='livecam-container neon-border'>
      <video ref={videoRef} autoPlay muted />
    </div>
  );
}
"

echo "🎉 Done — all missing folders and files created safely."
