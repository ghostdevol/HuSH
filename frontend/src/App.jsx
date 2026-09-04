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

      <h2>Chat {currentRoom ? () : ''}</h2>
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
