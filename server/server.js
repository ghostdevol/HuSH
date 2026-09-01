const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// 💳 INITIALIZE STRIPE WITH APIS (Swap with your real sk_test_ token later)
const stripe = require('stripe')('sk_test_placeholder_key_replace_me');

const MESSAGES_FILE = path.join(__dirname, 'data', 'messages.json');
const wss = new WebSocket.Server({ port: 5174 });
const connectedProfiles = new Map(); 

console.log('💘 HuSH Premium Stripe Dating Engine online on port 5174');

/**
 * 🔒 STRIPE CHECKOUT UTILITY ROUTE ENGINE
 * Creates a unique, encrypted gateway checkout link for the dater session
 */
function createStripeCheckoutSession(userId) {
  return new Promise((resolve) => {
    stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'HuSH Elite VIP Pass',
            description: 'Unlock infinite streams, private direct messaging, and adult chambers.',
          },
          unit_amount: 499, // $4.99 in cents
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      mode: 'subscription',
      // Dynamic callbacks when user finishes or closes the payment panel
      success_url: 'http://localhost:5173/?payment=success',
      cancel_url: 'http://localhost:5173/?payment=cancelled',
      client_reference_id: userId, // Ties transaction directly back to this specific ghost user
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
      if (parsedData.type === 'request_checkout') {
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
        const isPremiumRoom = parsedData.room === 'vip' || parsedData.room === 'xxx';
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
