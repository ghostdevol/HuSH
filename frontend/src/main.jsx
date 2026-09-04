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
