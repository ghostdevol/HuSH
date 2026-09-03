// 1. INITIALIZE SECURE CONTEXT SYSTEM ENVIRONMENT METRICS
import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';
import http from 'http';
import express from 'express';

// Emulate __dirname behavior needed for ES modules paths resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 💳 INITIALIZE STRIPE INTEGRATION PIPELINE FROM SECURE VARIABLE REGISTRIES
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// FILE PATHS
const MESSAGES_FILE = path.join(__dirname, 'messages.json');
const FAVORITES_FILE = path.join(__dirname, 'favorites.json');

// Ensure database tracking folder directory exists cleanly
const dataDir = path.dirname(MESSAGES_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// EXPRESS + HTTP SERVER
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// PORT (Render will inject process.env.PORT)
const PORT = process.env.PORT || 5174;
server.listen(PORT, () => {
  console.log(`💘 HuSH Premium Stripe Matchmaking Engine online on port ${PORT}`);
});

// ===============================
// STRIPE CHECKOUT SESSION CREATOR
// ===============================
function createStripeCheckoutSession(userId) {
  return new Promise((resolve) => {
    const lineItems = process.env.STRIPE_VIP_PRICE_ID 
      ? [{ price: process.env.STRIPE_VIP_PRICE_ID, quantity: 1 }]
      : [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Platinum Elite Member Upgrade',
              description: 'Unlock infinite match alignment channels, customized filter views, and advanced custom interaction profiles.',
            },
            unit_amount: 499,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        }];

    stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'subscription',
      success_url: `${process.env.VITE_APP_URL || 'http://localhost:5173'}/?payment=success`,
      cancel_url: `${process.env.VITE_APP_URL || 'http://localhost:5173'}/?payment=cancelled`,
      client_reference_id: userId,
      metadata: { 
        userId: userId,
        classification: 'Premium Matchmaking Access Protocol'
      }
    })
    .then(session => resolve({ success: true, url: session.url }))
    .catch(err => {
      console.error('Stripe billing generation failed:', err);
      resolve({ success: false, error: 'Billing gateway temporarily locked.' });
    });
  });
}

// ===============================
// MESSAGE HISTORY STORAGE
// ===============================
function loadMessageHistory() {
  try {
    if (!fs.existsSync(MESSAGES_FILE)) return [];
    const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch { return []; }
}

function saveMessageToHistory(msg) {
  try {
    const history = loadMessageHistory();
    history.push(msg);
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(history, null, 2));
  } catch (err) { console.error(err); }
}

// ===============================
// FAVORITES (FAVE FIVE) STORAGE
// ===============================
function loadFavorites() {
  try {
    if (!fs.existsSync(FAVORITES_FILE)) return {};
    const data = fs.readFileSync(FAVORITES_FILE, 'utf8');
    return JSON.parse(data || '{}');
  } catch { return {}; }
}

function saveFavorites(faves) {
  try {
    fs.writeFileSync(FAVORITES_FILE, JSON.stringify(faves, null, 2));
  } catch (err) { console.error(err); }
}

const favoritesByUser = loadFavorites(); // { userId: [userId1, userId2, ...] }

// ===============================
// 21 QUESTIONS GAME ENGINE
// ===============================
const QUESTIONS_21 = [
  "What's the wildest thing you've done on a dare?",
  "What's your biggest turn-on in someone's personality?",
  "If these walls could talk, what would they say about you?",
  "What's a secret goal you’ve never told anyone?",
  "What’s your favorite way to spend a late night?",
  "What’s the most impulsive decision you’ve ever made?",
  "What’s one red flag you ignore when you’re bored?",
  "What song feels like it was written about your life?",
  "What’s your favorite kind of trouble?",
  "What’s something you wish people understood about you?",
  "What’s a fantasy you’d only admit anonymously?",
  "What’s the most toxic habit you’ve dropped?",
  "What’s the most loyal thing you’ve ever done for someone?",
  "What’s your favorite kind of first message?",
  "What’s a boundary you’ll never cross?",
  "What’s your favorite way to flirt?",
  "What’s the most underrated trait in a partner?",
  "What’s your favorite memory from a night out?",
  "What’s one thing you’d change about your past?",
  "What’s your favorite kind of connection: slow burn or instant spark?",
  "What’s something you’re proud of but rarely say out loud?"
];

// gameStateByRoom: { roomName: { currentIndex } }
const gameStateByRoom = {};

// ===============================
// PRESENCE SYSTEM
// ===============================
const onlineUsers = new Set();

function broadcastOnlineUsers() {
  const payload = JSON.stringify({
    type: "onlineUsers",
    count: onlineUsers.size,
    users: Array.from(onlineUsers)
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// ===============================
// MAIN WEBSOCKET CONNECTION HANDLER
// ===============================
const connectedProfiles = new Map();

wss.on("connection", (ws) => {
  // PRESENCE
  const presenceId = Date.now().toString();
  onlineUsers.add(presenceId);
  broadcastOnlineUsers();

  ws.isPremium = false;
  ws.userId = `ghost_${Math.floor(100 + Math.random() * 900)}`;

  ws.on("close", () => {
    onlineUsers.delete(presenceId);
    broadcastOnlineUsers();
    connectedProfiles.delete(ws.userId);
  });

  ws.on("message", function incoming(data) {
    try {
      const parsedData = JSON.parse(data);

      // 1. STRIPE CHECKOUT
      if (parsedData.type === "request_checkout" || parsedData.type === "request_checkout_session") {
        console.log(`Generating checkout token link for connection session: ${ws.userId}`);
        createStripeCheckoutSession(ws.userId).then(result => {
          ws.send(JSON.stringify({
            type: "checkout_url_generated",
            success: result.success,
            url: result.url,
            error: result.error
          }));
        });
        return;
      }

      // 2. PROFILE UPDATE
      if (parsedData.type === "update_profile") {
        ws.username = parsedData.username || ws.userId;
        ws.gender = parsedData.gender || "Not Specified";
        ws.intent = parsedData.intent || "Mingling";
        ws.bio = parsedData.bio || "";
        ws.photoUrl = parsedData.photoUrl || "";

        connectedProfiles.set(ws.userId, {
          userId: ws.userId,
          username: ws.username,
          gender: ws.gender,
          intent: ws.intent,
          bio: ws.bio,
          photoUrl: ws.photoUrl,
          isPremium: ws.isPremium,
          currentRoom: ws.currentRoom || null
        });

        ws.send(JSON.stringify({
          type: "profile_updated",
          profile: connectedProfiles.get(ws.userId)
        }));
        return;
      }

      // 3. ROOM JOIN / HISTORY
      const premiumRooms = ["hookups", "xxx", "vip"]; // internal only, Stripe never sees this
      if (parsedData.type === "join") {
        const isPremiumRoom = premiumRooms.includes(parsedData.room);
        if (isPremiumRoom && !ws.isPremium) {
          ws.send(JSON.stringify({ type: "access_denied", room: parsedData.room }));
          return;
        }

        ws.currentRoom = parsedData.room;

        const profile = connectedProfiles.get(ws.userId);
        if (profile) {
          profile.currentRoom = ws.currentRoom;
          connectedProfiles.set(ws.userId, profile);
        }

        const history = loadMessageHistory().filter(msg => msg.room === ws.currentRoom);
        ws.send(JSON.stringify({ type: "history", messages: history }));
        return;
      }

      // 4. CHAT MESSAGE
      if (parsedData.type === "message") {
        const outMessage = {
          type: "message",
          room: parsedData.room,
          user: ws.username || parsedData.user,
          photoUrl: ws.photoUrl,
          gender: ws.gender || "?",
          intent: ws.intent || "Mingling",
          text: parsedData.text,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        };
        saveMessageToHistory(outMessage);
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN && client.currentRoom === parsedData.room) {
            client.send(JSON.stringify(outMessage));
          }
        });
        return;
      }

      // 5. MATCHMAKING (simple: same room, not self)
      if (parsedData.type === "request_match") {
        const room = ws.currentRoom || parsedData.room;
        if (!room) {
          ws.send(JSON.stringify({ type: "match_error", error: "No room selected." }));
          return;
        }

        const candidates = [];
        connectedProfiles.forEach((profile, userId) => {
          if (
            profile.currentRoom === room &&
            userId !== ws.userId
          ) {
            candidates.push(profile);
          }
        });

        if (candidates.length === 0) {
          ws.send(JSON.stringify({ type: "match_none", room }));
          return;
        }

        const match = candidates[Math.floor(Math.random() * candidates.length)];

        ws.send(JSON.stringify({
          type: "match_found",
          room,
          match
        }));

        // notify the other side too
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN && client.userId === match.userId) {
            client.send(JSON.stringify({
              type: "match_found",
              room,
              match: connectedProfiles.get(ws.userId)
            }));
          }
        });
        return;
      }

      // 6. FAVE FIVE: ADD
      if (parsedData.type === "favorite_add") {
        const ownerId = ws.userId;
        const targetId = parsedData.targetUserId;
        if (!ownerId || !targetId) return;

        if (!favoritesByUser[ownerId]) favoritesByUser[ownerId] = [];
        const list = favoritesByUser[ownerId];

        if (!list.includes(targetId)) {
          if (list.length >= 5) {
            ws.send(JSON.stringify({
              type: "favorite_error",
              error: "Fave Five limit reached."
            }));
            return;
          }
          list.push(targetId);
          favoritesByUser[ownerId] = list;
          saveFavorites(favoritesByUser);
        }

        ws.send(JSON.stringify({
          type: "favorite_updated",
          favorites: favoritesByUser[ownerId]
        }));
        return;
      }

      // 7. FAVE FIVE: REMOVE
      if (parsedData.type === "favorite_remove") {
        const ownerId = ws.userId;
        const targetId = parsedData.targetUserId;
        if (!ownerId || !targetId) return;

        const list = favoritesByUser[ownerId] || [];
        favoritesByUser[ownerId] = list.filter(id => id !== targetId);
        saveFavorites(favoritesByUser);

        ws.send(JSON.stringify({
          type: "favorite_updated",
          favorites: favoritesByUser[ownerId]
        }));
        return;
      }

      // 8. FAVE FIVE: LIST
      if (parsedData.type === "favorite_list") {
        const ownerId = ws.userId;
        const list = favoritesByUser[ownerId] || [];
        const detailed = list
          .map(id => connectedProfiles.get(id))
          .filter(Boolean);

        ws.send(JSON.stringify({
          type: "favorite_list",
          favorites: detailed
        }));
        return;
      }

      // 9. 21 QUESTIONS: START GAME IN ROOM
      if (parsedData.type === "game_start") {
        const room = ws.currentRoom || parsedData.room;
        if (!room) {
          ws.send(JSON.stringify({ type: "game_error", error: "No room selected." }));
          return;
        }

        gameStateByRoom[room] = {
          currentIndex: 0
        };

        const question = QUESTIONS_21[0];

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN && client.currentRoom === room) {
            client.send(JSON.stringify({
              type: "game_question",
              room,
              index: 0,
              question
            }));
          }
        });
        return;
      }

      // 10. 21 QUESTIONS: NEXT QUESTION
      if (parsedData.type === "game_next") {
        const room = ws.currentRoom || parsedData.room;
        const state = gameStateByRoom[room];
        if (!room || !state) {
          ws.send(JSON.stringify({ type: "game_error", error: "Game not started." }));
          return;
        }

        let nextIndex = state.currentIndex + 1;
        if (nextIndex >= QUESTIONS_21.length) {
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client.currentRoom === room) {
              client.send(JSON.stringify({
                type: "game_complete",
                room
              }));
            }
          });
          delete gameStateByRoom[room];
          return;
        }

        state.currentIndex = nextIndex;
        gameStateByRoom[room] = state;

        const question = QUESTIONS_21[nextIndex];

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN && client.currentRoom === room) {
            client.send(JSON.stringify({
              type: "game_question",
              room,
              index: nextIndex,
              question
            }));
          }
        });
        return;
      }

      // 11. 21 QUESTIONS: ANSWER (broadcast)
      if (parsedData.type === "game_answer") {
        const room = ws.currentRoom || parsedData.room;
        if (!room) return;

        const payload = {
          type: "game_answer",
          room,
          user: ws.username || ws.userId,
          answer: parsedData.answer,
          index: parsedData.index
        };

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN && client.currentRoom === room) {
            client.send(JSON.stringify(payload));
          }
        });
        return;
      }

    } catch (err) {
      console.error(err);
    }
  });
});
