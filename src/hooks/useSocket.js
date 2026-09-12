import { useEffect, useState } from 'react';
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

