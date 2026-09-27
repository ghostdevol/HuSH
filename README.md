# HuSH

Private real-time chat rooms — conversations kept at a whisper.

## Architecture

- `hush-frontend/` — React + Vite + Tailwind client (deployed on Vercel)
- `backend/` — Node.js + Express + `ws` server (deployed on Render; `node server.js`)

Room chat runs over HTTP with a `/ws` WebSocket for live messages.

## Run it locally

Backend:

```sh
cd backend
npm install
npm start
```

Frontend:

```sh
cd hush-frontend
npm install
npm run dev
```

Set `VITE_WS_URL` to your backend URL so the client knows where to connect.

## License

See LICENSE.
