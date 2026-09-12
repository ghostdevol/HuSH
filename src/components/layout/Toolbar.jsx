import React from 'react';
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

