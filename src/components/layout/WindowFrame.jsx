import React from 'react';
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

