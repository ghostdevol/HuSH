import React, { useEffect, useRef } from 'react';
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

