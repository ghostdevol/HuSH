// 1. INITIALIZE SECURE CONTEXT SYSTEM ENVIRONMENT METRICS
import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';

// Emulate __dirname behavior needed for ES modules paths resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 💳 INITIALIZE STRIPE INTEGRATION PIPELINE FROM SECURE VARIABLE REGISTRIES
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Points directly to messages.json sitting next to server.js
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Ensure database tracking folder directory exists cleanly
const dataDir = path.dirname(MESSAGES_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 🌐 USE PORT ASSIGNED BY CLOUD ROUTER IN PRODUCTION, OR FALLBACK TO 5174 LOCALLY
const PORT = process.env.PORT || 5174;
const wss = new WebSocketServer({ port: PORT });
const connectedProfiles = new Map(); 

console.log(`💘 HuSH Premium Stripe Matchmaking Engine online on port ${PORT}`);

/**
 * 🔒 STRIPE CHECKOUT UTILITY ROUTE ENGINE
 */
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

wss.on('connection', (ws) => {
  ws.isPremium = false;
  ws.userId = `ghost_${Math.floor(100 + Math.random() * 900)}`;

  ws.on('message', function incoming(data) {
    try {
      const parsedData = JSON.parse(data);

      // 1. PROCESS STRIPE LIVE SUBSCRIPTION GATEWAY REQUESTS
      if (parsedData.type === 'request_checkout' || parsedData.type === 'request_checkout_session') {
        console.log(`Generating checkout token link for connection session: ${ws.userId}`);
        createStripeCheckoutSession(ws.userId).then(result => {
          ws.send(JSON.stringify({
            type: 'checkout_url_generated',
            success: result.success,
            url: result.url,
            error: result.error
          }));
        });
        return;
      }

      // 2. PROFILE MANIFEST RECONCILIATIONS
      if (parsedData.type === 'update_profile') {
        ws.username = parsedData.username || ws.userId;
        ws.gender = parsedData.gender || 'Not Specified';
        ws.intent = parsedData.intent || 'Mingling';
        ws.bio = parsedData.bio || '';
        ws.photoUrl = parsedData.photoUrl || '';

        connectedProfiles.set(ws.userId, {
          userId: ws.userId,
          username: ws.username,
          gender: ws.gender,
          intent: ws.intent,
          bio: ws.bio,
          photoUrl: ws.photoUrl,
          isPremium: ws.isPremium
        });
        return;
      }

      // 3. SECURE CHAMBER ACCESS RULES GATE
      if (parsedData.type === 'join') {
        const isPremiumRoom = ['hookups', 'xxx', 'vip'].includes(parsedData.room);
        if (isPremiumRoom && !ws.isPremium) {
          ws.send(JSON.stringify({ type: 'access_denied', room: parsedData.room }));
          return;
        }
        ws.currentRoom = parsedData.room;
        const history = loadMessageHistory().filter(msg => msg.room === ws.currentRoom);
        ws.send(JSON.stringify({ type: 'history', messages: history }));
        return;
      }

      // 4. BI-DIRECTIONAL ROUTING ENGINE LOGS
      if (parsedData.type === 'message') {
        const outMessage = {
          type: 'message',
          room: parsedData.room,
          user: ws.username || parsedData.user,
          photoUrl: ws.photoUrl,
          gender: ws.gender || '?',
          intent: ws.intent || 'Mingling',
          text: parsedData.text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        saveMessageToHistory(outMessage);
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN && client.currentRoom === parsedData.room) {
            client.send(JSON.stringify(outMessage));
          }
        });
      }
    } catch (err) { console.error(err); }
  });

  ws.on('close', () => { connectedProfiles.delete(ws.userId); });
});
