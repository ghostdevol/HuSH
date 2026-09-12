import React from 'react';
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

