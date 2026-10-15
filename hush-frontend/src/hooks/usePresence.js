import { useEffect, useState } from 'react';
import { WS_BASE } from '../config';
import { getToken } from '../api';

// Opens a lightweight socket just to track who is online (the backend
// sends a presence snapshot on connect and broadcasts on every change).
// Returns a Set of online handles.
export default function usePresence() {
  const [online, setOnline] = useState(new Set());

  useEffect(() => {
    const token = getToken();
    const url = token ? `${WS_BASE}?token=${encodeURIComponent(token)}` : WS_BASE;
    const ws = new WebSocket(url);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'presence') setOnline(new Set(data.online || []));
      } catch { /* ignore malformed frames */ }
    };
    return () => ws.close();
  }, []);

  return online;
}
