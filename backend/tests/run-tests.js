'use strict';

// HuSH v1.2.0 headless test suite — REST + WS against a throwaway
// server instance with its own data dir. Per-user IPs are simulated
// with X-Forwarded-For (the same header Render's proxy sets).

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 10099;
const BASE = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  ok - ${name}`); }
  else { failed++; failures.push(name); console.log(`  FAIL - ${name}${extra ? ' :: ' + extra : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, p, { token, ip, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['x-hush-token'] = token;
  if (ip) headers['x-forwarded-for'] = ip;
  const res = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch (err) { /* no body */ }
  return { status: res.status, json };
}

let seq = 0;
async function registerUser(handle, ip, opts = {}) {
  seq++;
  const res = await api('POST', '/auth/register', {
    ip,
    body: {
      handle,
      password: opts.password || 'pass1234',
      displayName: opts.displayName || handle,
      email: opts.email || `${handle}@example.com`,
      phone: opts.phone || `320555${String(1000 + seq).slice(-4)}`,
      legalAccepted: opts.legalAccepted !== false
    }
  });
  return res;
}

class TestWs {
  constructor(token, ip) {
    this.messages = [];
    this.waiters = [];
    this.closed = false;
    const headers = {};
    if (ip) headers['x-forwarded-for'] = ip;
    this.ws = new WebSocket(WS_URL + (token ? `?token=${token}` : ''), { headers });
    this.ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (err) { return; }
      this.messages.push(msg);
      this.waiters = this.waiters.filter((w) => !w(msg));
    });
    this.ws.on('close', () => { this.closed = true; });
    this.ws.on('error', () => {});
  }
  ready() {
    return new Promise((resolve) => {
      if (this.ws.readyState === WebSocket.OPEN) return resolve();
      this.ws.once('open', resolve);
    });
  }
  send(obj) { this.ws.send(JSON.stringify(obj)); }
  waitFor(pred, timeout = 2500) {
    const existing = this.messages.find(pred);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeout);
      this.waiters.push((msg) => {
        if (pred(msg)) { clearTimeout(timer); resolve(msg); return true; }
        return false;
      });
    });
  }
  async join(room, user) {
    this.send({ type: 'join', room, user });
    const joined = await this.waitFor((m) => m.type === 'joined' && m.room === room);
    return joined ? joined.peerId : null;
  }
  close() { try { this.ws.terminate(); } catch (err) {} }
}

async function main() {
  // ----- isolated server instance -----
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hush-test-'));
  const backendDir = path.join(__dirname, '..');
  fs.copyFileSync(path.join(backendDir, 'server.js'), path.join(tmp, 'server.js'));
  fs.copyFileSync(path.join(backendDir, 'antiscam.js'), path.join(tmp, 'antiscam.js'));
  fs.symlinkSync(path.join(backendDir, 'node_modules'), path.join(tmp, 'node_modules'), 'junction');
  // Grandfathered pre-v1.2.0 account: OLD record shape, no email/phone.
  const salt = crypto.randomBytes(16).toString('hex');
  const passHash = crypto.scryptSync('oldpass123', salt, 64).toString('hex');
  fs.writeFileSync(path.join(tmp, 'users.json'), JSON.stringify({
    oldtimer: { handle: 'oldtimer', salt, passHash, displayName: 'Old Timer', bio: 'here since day one', avatarEmoji: '🤫', createdAt: 1000, following: [] }
  }, null, 2));

  const server = spawn('node', ['server.js'], {
    cwd: tmp,
    env: { ...process.env, PORT: String(PORT), ADMIN_HANDLES: 'bossadmin' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d.toString(); });

  try {
    // wait for health
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      try { const h = await api('GET', '/health'); up = h.status === 200; } catch (err) { await sleep(150); }
    }
    if (!up) throw new Error('server never came up: ' + serverLog);

    const sockets = [];
    const wsOf = async (token, ip) => { const s = new TestWs(token, ip); sockets.push(s); await s.ready(); return s; };

    // ================= REGISTRATION + LEGACY SANITY =================
    console.log('\n== registration & legacy sanity ==');
    const alice = await registerUser('alice', '10.0.1.1', { phone: '3205550101' });
    check('alice registers', alice.status === 200, JSON.stringify(alice.json));
    const bob = await registerUser('bob', '10.0.1.2');
    const carol = await registerUser('carol', '10.0.1.3');
    const dave = await registerUser('dave', '10.0.1.4');
    const erin = await registerUser('erin', '10.0.1.5');
    const frank = await registerUser('frank', '10.0.1.6');
    const grace = await registerUser('grace', '10.0.1.7');
    const heidi = await registerUser('heidi', '10.0.1.8');
    const boss = await registerUser('bossadmin', '10.0.1.50');
    check('all seed users register', [bob, carol, dave, erin, frank, grace, heidi, boss].every((r) => r.status === 200));
    const A = alice.json.token, B = bob.json.token, C = carol.json.token, D = dave.json.token,
          E = erin.json.token, F = frank.json.token, G = grace.json.token, H = heidi.json.token,
          BOSS = boss.json.token;

    check('register records legal acceptance', alice.json.user.legal && alice.json.user.legal.version === '1.0');
    check('register echoes own email/phone privately', alice.json.user.email === 'alice@example.com' && alice.json.user.phone === '3205550101');
    check('default privacy prefs', alice.json.user.privacy.dmFrom === 'everyone' && alice.json.user.privacy.videoEnabled === true && alice.json.user.privacy.invisible === false);

    const post1 = await api('POST', '/posts', { token: A, body: { text: 'hello world from alice' } });
    check('post creates', post1.status === 201);
    const feed1 = await api('GET', '/feed', { token: B });
    check('feed shows the post', feed1.json.posts.some((p) => p.text === 'hello world from alice'));
    const like = await api('POST', `/posts/${post1.json.post.id}/like`, { token: B });
    check('like works', like.json.liked === true && like.json.likeCount === 1);
    const comment = await api('POST', `/posts/${post1.json.post.id}/comments`, { token: C, body: { text: 'nice one' } });
    check('comment works', comment.status === 201);

    const av = await api('PUT', '/me', { token: A, body: { avatarMode: 'builder', avatar: { skin: '#f1c27d', hairStyle: 'short', hairColor: '#3b2314', eyes: 'dots', mouth: 'smile', accessory: 'none', bgColor: '#312e81', kind: 'ghost', kindColor: '#aef3ff' } } });
    check('menagerie avatar kind passthrough', av.status === 200 && av.json.user.avatar.kind === 'ghost');

    // ================= REGISTRATION INTEGRITY =================
    console.log('\n== registration integrity ==');
    const dupEmail = await registerUser('aliceclone', '10.0.2.1', { email: 'ALICE@example.com', phone: '3205559999' });
    check('duplicate email (case-insensitive) refused 409', dupEmail.status === 409, JSON.stringify(dupEmail.json));
    const dupPhone = await registerUser('phoneclone', '10.0.2.2', { email: 'fresh@example.com', phone: '+1 (320) 555-0101' });
    check('duplicate phone (reformatted) refused 409', dupPhone.status === 409, JSON.stringify(dupPhone.json));
    const noLegal = await registerUser('nolegal', '10.0.2.3', { legalAccepted: false });
    check('registration without legal agreement refused 400', noLegal.status === 400);
    const noPhone = await api('POST', '/auth/register', { ip: '10.0.2.4', body: { handle: 'nophone', password: 'pass1234', email: 'np@example.com', legalAccepted: true } });
    check('registration without phone refused 400', noPhone.status === 400);

    const old = await api('POST', '/auth/login', { ip: '10.0.2.9', body: { handle: 'oldtimer', password: 'oldpass123' } });
    check('grandfathered login works (no email/phone on record)', old.status === 200, JSON.stringify(old.json));
    const OLD = old.json.token;
    check('grandfathered user email is null, not locked out', old.json.user.email === null);
    const bind = await api('PUT', '/me', { token: OLD, body: { email: 'oldtimer@example.com', phone: '320-555-7777' } });
    check('grandfathered account can bind email+phone', bind.status === 200 && bind.json.user.email === 'oldtimer@example.com' && bind.json.user.phone === '3205557777', JSON.stringify(bind.json));
    const bindDupe = await api('PUT', '/me', { token: B, body: { email: 'oldtimer@example.com' } });
    check('binding an email owned by another account refused 409', bindDupe.status === 409);
    const acceptLegal = await api('PUT', '/me', { token: OLD, body: { acceptLegal: true } });
    check('existing account legal acceptance recorded', acceptLegal.status === 200 && acceptLegal.json.user.legal && acceptLegal.json.user.legal.version === '1.0');

    const bobPublic = await api('GET', '/users/bob', { token: A });
    const peopleList = await api('GET', '/users', { token: A });
    const feedJson = JSON.stringify(feed1.json) + JSON.stringify(bobPublic.json) + JSON.stringify(peopleList.json);
    check('email/phone absent from public payloads', !feedJson.includes('alice@example.com') && !feedJson.includes('3205550101'));

    // ================= DM REQUESTS =================
    console.log('\n== DM requests ==');
    const daveWs = await wsOf(D, '10.0.1.4');
    const erinWs = await wsOf(E, '10.0.1.5');
    await daveWs.join('dm:dave:erin', 'dave');
    await erinWs.join('dm:dave:erin', 'erin');
    daveWs.send({ type: 'msg', text: 'hey erin, first time messaging' });
    const reqSent = await daveWs.waitFor((m) => m.type === 'dm-request-sent');
    check('first-contact DM becomes a request', !!reqSent);
    await sleep(200);
    check('held message NOT delivered to recipient', !erinWs.messages.some((m) => m.type === 'msg' && m.text && m.text.includes('first time')));
    const reqs = await api('GET', '/dm/requests', { token: E });
    check('request inbox shows sender + preview', reqs.json.requests.length === 1 && reqs.json.requests[0].from.handle === 'dave' && reqs.json.requests[0].preview.includes('first time'));
    const statusPending = await api('GET', '/dm/status/erin', { token: D });
    check('sender sees pending state', statusPending.json.status === 'pending');
    daveWs.send({ type: 'msg', text: 'second while waiting' });
    const pendingErr = await daveWs.waitFor((m) => m.type === 'dm-request-pending');
    check('second message while pending is held back', !!pendingErr);
    const accept = await api('POST', '/dm/requests/dave/accept', { token: E });
    check('accept opens the conversation', accept.status === 200 && accept.json.status === 'open');
    const statusOpen = await api('GET', '/dm/status/erin', { token: D });
    check('sender status now open', statusOpen.json.status === 'open');
    daveWs.send({ type: 'msg', text: 'now it flows' });
    const delivered = await erinWs.waitFor((m) => m.type === 'msg' && m.text === 'now it flows');
    check('accepted pair messages flow', !!delivered);

    // deny flow
    const frankWs = await wsOf(F, '10.0.1.6');
    await frankWs.join('dm:erin:frank', 'frank');
    frankWs.send({ type: 'msg', text: 'hi erin im frank' });
    await frankWs.waitFor((m) => m.type === 'dm-request-sent');
    const deny = await api('POST', '/dm/requests/frank/deny', { token: E });
    check('deny closes the request', deny.status === 200);
    const frankStatus = await api('GET', '/dm/status/erin', { token: F });
    check('denied sender gets neutral not-accepted state', frankStatus.json.status === 'not-accepted');
    frankWs.send({ type: 'msg', text: 'please?' });
    const deniedErr = await frankWs.waitFor((m) => m.type === 'error' && m.code === 'dm-unavailable');
    check('message after deny refused', !!deniedErr);
    const erinReqs2 = await api('GET', '/dm/requests', { token: E });
    check('no new request appears after deny', !erinReqs2.json.requests.some((r) => r.from.handle === 'frank'));

    // ================= DM PRIVACY POLICY =================
    console.log('\n== DM privacy prefs ==');
    await api('PUT', '/me', { token: E, body: { privacy: { dmFrom: 'nobody' } } });
    const graceWs = await wsOf(G, '10.0.1.7');
    await graceWs.join('dm:erin:grace', 'grace');
    graceWs.send({ type: 'msg', text: 'hi erin' });
    const nobodyErr = await graceWs.waitFor((m) => m.type === 'error' && m.code === 'dm-unavailable');
    check("dmFrom 'nobody' refuses new requests", !!nobodyErr);
    const erinReqs3 = await api('GET', '/dm/requests', { token: E });
    check('no request created under nobody policy', !erinReqs3.json.requests.some((r) => r.from.handle === 'grace'));
    daveWs.send({ type: 'msg', text: 'still open pair works' });
    const stillFlows = await erinWs.waitFor((m) => m.type === 'msg' && m.text === 'still open pair works');
    check('accepted pairs unaffected by nobody policy', !!stillFlows);
    await api('PUT', '/me', { token: E, body: { privacy: { dmFrom: 'confidants' } } });
    await api('POST', '/users/erin/follow', { token: C });
    await api('POST', '/users/carol/follow', { token: E });
    const carolWs = await wsOf(C, '10.0.1.3');
    await carolWs.join('dm:carol:erin', 'carol');
    carolWs.send({ type: 'msg', text: 'confidant hello' });
    const confReq = await carolWs.waitFor((m) => m.type === 'dm-request-sent');
    check("dmFrom 'confidants' allows confidant requests", !!confReq);
    graceWs.send({ type: 'msg', text: 'not a confidant' });
    const confErr = await graceWs.waitFor((m) => m.type === 'error' && m.code === 'dm-unavailable', 1500);
    check("dmFrom 'confidants' refuses non-confidants", !!confErr);
    await api('PUT', '/me', { token: E, body: { privacy: { dmFrom: 'everyone' } } });
    await api('POST', '/dm/requests/carol/accept', { token: E });

    // ================= BLOCK =================
    console.log('\n== block ==');
    await api('POST', '/users/bob/follow', { token: A });
    await api('POST', '/users/alice/follow', { token: B });
    const confBefore = await api('GET', '/confidants', { token: A });
    check('precondition: alice & bob are confidants', confBefore.json.confidants.some((c) => c.handle === 'bob'));
    const bobPost = await api('POST', '/posts', { token: B, body: { text: 'bob post about engines' } });
    check('bob post created', bobPost.status === 201);
    const feedBeforeBlock = await api('GET', '/feed', { token: A });
    check('precondition: bob post in alice feed', feedBeforeBlock.json.posts.some((p) => p.text === 'bob post about engines'));
    const blk = await api('POST', '/users/bob/block', { token: A });
    check('block succeeds', blk.status === 200);
    const feedAfterBlock = await api('GET', '/feed', { token: A });
    check('blocked user posts hidden from feed', !feedAfterBlock.json.posts.some((p) => p.text === 'bob post about engines'));
    const peopleAfterBlock = await api('GET', '/users', { token: A });
    check('blocked user excluded from People', !peopleAfterBlock.json.users.some((u) => u.handle === 'bob'));
    const profileAfterBlock = await api('GET', '/users/bob', { token: A });
    check('blocked profile view 404', profileAfterBlock.status === 404);
    const folAfterBlock = await api('POST', '/users/alice/follow', { token: B });
    check('blocked user cannot follow', folAfterBlock.status === 403);
    const confAfter = await api('GET', '/confidants', { token: A });
    check('block severs confidant bond both ways', !confAfter.json.confidants.some((c) => c.handle === 'bob'));
    const bobPeople = await api('GET', '/users', { token: B });
    check('blocker excluded from blocked user People too', !bobPeople.json.users.some((u) => u.handle === 'alice'));

    const aliceWs = await wsOf(A, '10.0.1.1');
    const bobWs = await wsOf(B, '10.0.1.2');
    const alicePeer = await aliceWs.join('blockroom', 'alice');
    const bobPeer = await bobWs.join('blockroom', 'bob');
    await sleep(150);
    const alicePeers = aliceWs.messages.filter((m) => m.type === 'rtc-peers').pop();
    check('rtc-peers excludes blocked peer', alicePeers && !alicePeers.peers.some((p) => p.id === bobPeer));
    bobWs.send({ type: 'rtc-offer', to: alicePeer, payload: { sdp: 'x' } });
    await sleep(250);
    check('RTC signaling refused between blocked pair', !aliceWs.messages.some((m) => m.type === 'rtc-offer'));
    bobWs.send({ type: 'join', room: 'dm:alice:bob', user: 'bob' });
    await bobWs.waitFor((m) => m.type === 'joined' && m.room === 'dm:alice:bob');
    bobWs.send({ type: 'msg', text: 'can you see this alice' });
    const bobDmErr = await bobWs.waitFor((m) => m.type === 'error' && m.code === 'dm-unavailable');
    check('blocked user DM refused by server', !!bobDmErr);
    const unblk = await api('POST', '/users/bob/unblock', { token: A });
    check('unblock succeeds', unblk.status === 200);
    bobWs.send({ type: 'msg', text: 'after unblock this is a fresh request' });
    const reReq = await bobWs.waitFor((m) => m.type === 'dm-request-sent');
    check('after unblock a fresh request can be sent', !!reReq);
    await api('POST', '/dm/requests/bob/accept', { token: A });

    // ================= VIDEO: master switch + call flow =================
    console.log('\n== video prefs & call flow ==');
    await api('PUT', '/me', { token: H, body: { privacy: { videoEnabled: false } } });
    // open alice<->heidi pair
    await aliceWs.join('dm:alice:heidi', 'alice');
    const heidiWs = await wsOf(H, '10.0.1.8');
    await heidiWs.join('dm:alice:heidi', 'heidi');
    aliceWs.send({ type: 'msg', text: 'hi heidi' });
    await aliceWs.waitFor((m) => m.type === 'dm-request-sent');
    await api('POST', '/dm/requests/alice/accept', { token: H });
    const heidiPeerInDm = heidiWs.peerId;
    // need heidi's peerId in this room: from her joined message
    const heidiJoined = heidiWs.messages.find((m) => m.type === 'joined' && m.room === 'dm:alice:heidi');
    aliceWs.send({ type: 'call-invite', to: heidiJoined.peerId });
    const unavail = await aliceWs.waitFor((m) => m.type === 'call-unavailable');
    check('invite to video-disabled user refused (video-unavailable)', !!unavail && unavail.code === 'video-unavailable', JSON.stringify(unavail));
    check('video-disabled user never rang', !heidiWs.messages.some((m) => m.type === 'call-incoming'));
    // heidi cannot publish in a public room
    await heidiWs.join('vidroom', 'heidi');
    const aliceVidPeer = await aliceWs.join('vidroom', 'alice');
    heidiWs.send({ type: 'rtc-live', live: true });
    const liveErr = await heidiWs.waitFor((m) => m.type === 'error' && m.code === 'video-disabled');
    check('video-disabled user rtc-live refused', !!liveErr);
    const heidiVidPeer = heidiWs.messages.filter((m) => m.type === 'joined' && m.room === 'vidroom').pop().peerId;
    heidiWs.send({ type: 'rtc-offer', to: aliceVidPeer, payload: { sdp: 'x' } });
    await sleep(200);
    check('video-disabled user offer not delivered', !aliceWs.messages.some((m) => m.type === 'rtc-offer' && m.from === heidiVidPeer));
    heidiWs.send({ type: 'msg', text: 'text still works for heidi' });
    const heidiText = await aliceWs.waitFor((m) => m.type === 'msg' && m.text === 'text still works for heidi');
    check('text chat fully unaffected by video-off', !!heidiText);
    // cypher listening: performer offers TO the video-off user deliver
    await api('POST', '/createRoom', { token: A, body: { room: 'cyph', type: 'cypher', beatTitle: 'Test Beat', beatUrl: 'https://example.com/beat.mp3', bpm: 90, barsPerTurn: 8 } });
    await graceWs.join('cyph', 'grace');
    await heidiWs.join('cyph', 'heidi');
    await sleep(150);
    const graceCyphPeer = graceWs.messages.filter((m) => m.type === 'joined' && m.room === 'cyph').pop().peerId;
    const heidiCyphPeer = heidiWs.messages.filter((m) => m.type === 'joined' && m.room === 'cyph').pop().peerId;
    graceWs.send({ type: 'rtc-offer', to: heidiCyphPeer, payload: { sdp: 'cypher-audio' } });
    const cyphOffer = await heidiWs.waitFor((m) => m.type === 'rtc-offer' && m.from === graceCyphPeer);
    check('cypher listening receive still works for video-off user', !!cyphOffer);

    // full call flow: frank <-> grace (open pair first)
    await api('POST', '/users/grace/follow', { token: F });
    await api('POST', '/users/frank/follow', { token: G });
    await frankWs.join('dm:frank:grace', 'frank');
    await graceWs.join('dm:frank:grace', 'grace');
    frankWs.send({ type: 'msg', text: 'hey grace' });
    await frankWs.waitFor((m) => m.type === 'dm-request-sent');
    await api('POST', '/dm/requests/frank/accept', { token: G });
    const graceDmPeer = graceWs.messages.filter((m) => m.type === 'joined' && m.room === 'dm:frank:grace').pop().peerId;
    const frankDmPeer = frankWs.messages.filter((m) => m.type === 'joined' && m.room === 'dm:frank:grace').pop().peerId;
    frankWs.send({ type: 'call-invite', to: graceDmPeer });
    const incoming = await graceWs.waitFor((m) => m.type === 'call-incoming');
    check('call invite rings the accepted partner', !!incoming);
    graceWs.send({ type: 'call-decline', to: frankDmPeer });
    const declined = await frankWs.waitFor((m) => m.type === 'call-declined');
    check('decline ends the attempt cleanly', !!declined);
    frankWs.send({ type: 'call-invite', to: graceDmPeer });
    await graceWs.waitFor((m) => m.type === 'call-incoming' && m.from === frankDmPeer, 2000);
    graceWs.send({ type: 'call-accept', to: frankDmPeer });
    const acceptedCall = await frankWs.waitFor((m) => m.type === 'call-accepted');
    check('accept connects the call', !!acceptedCall);
    frankWs.send({ type: 'rtc-offer', to: graceDmPeer, payload: { sdp: 'call-media' } });
    const callMedia = await graceWs.waitFor((m) => m.type === 'rtc-offer' && m.payload && m.payload.sdp === 'call-media');
    check('media signaling flows after accept', !!callMedia);

    // videoFrom policy
    await api('PUT', '/me', { token: G, body: { privacy: { videoFrom: 'nobody' } } });
    frankWs.send({ type: 'call-invite', to: graceDmPeer });
    const nobodyCall = await frankWs.waitFor((m) => m.type === 'call-unavailable');
    check("videoFrom 'nobody' refuses invites", !!nobodyCall);
    await api('PUT', '/me', { token: G, body: { privacy: { videoFrom: 'confidants' } } });
    // dave is not grace's confidant
    await daveWs.join('dm:dave:grace', 'dave');
    await graceWs.join('dm:dave:grace', 'grace');
    daveWs.send({ type: 'msg', text: 'hi grace' });
    await daveWs.waitFor((m) => m.type === 'dm-request-sent');
    await api('POST', '/dm/requests/dave/accept', { token: G });
    const graceDavePeer = graceWs.messages.filter((m) => m.type === 'joined' && m.room === 'dm:dave:grace').pop().peerId;
    daveWs.send({ type: 'call-invite', to: graceDavePeer });
    const confCall = await daveWs.waitFor((m) => m.type === 'call-unavailable');
    check("videoFrom 'confidants' refuses non-confidant callers", !!confCall && confCall.code === 'confidants-only');
    await api('PUT', '/me', { token: G, body: { privacy: { videoFrom: 'everyone' } } });

    // mute / blackout state signaling
    console.log('\n== mute & blackout states ==');
    await frankWs.join('states', 'frank');
    await graceWs.join('states', 'grace');
    const graceStatePeer = graceWs.messages.filter((m) => m.type === 'joined' && m.room === 'states').pop().peerId;
    const frankStatePeer = frankWs.messages.filter((m) => m.type === 'joined' && m.room === 'states').pop().peerId;
    frankWs.send({ type: 'rtc-mute', muted: true });
    const muteMsg = await graceWs.waitFor((m) => m.type === 'rtc-mute' && m.from === frankStatePeer && m.muted === true);
    check('mute state signaled to peers', !!muteMsg);
    const peersAfterMute = graceWs.messages.filter((m) => m.type === 'rtc-peers' && m.room === 'states').pop();
    check('rtc-peers carries muted flag', peersAfterMute && peersAfterMute.peers.some((p) => p.id === frankStatePeer && p.muted === true));
    graceWs.send({ type: 'rtc-blackout', blackedOut: true });
    const boMsg = await frankWs.waitFor((m) => m.type === 'rtc-blackout' && m.from === graceStatePeer && m.blackedOut === true);
    check('blackout state signaled to peers (not a silent freeze)', !!boMsg);
    const peersAfterBo = frankWs.messages.filter((m) => m.type === 'rtc-peers' && m.room === 'states').pop();
    check('rtc-peers carries blackedOut flag', peersAfterBo && peersAfterBo.peers.some((p) => p.id === graceStatePeer && p.blackedOut === true));

    // ================= INVISIBLE PRESENCE =================
    console.log('\n== invisible presence ==');
    const judy = await registerUser('judy', '10.0.3.1');
    const J = judy.json.token;
    await api('PUT', '/me', { token: J, body: { privacy: { invisible: true } } });
    const watcher = await wsOf(A, '10.0.1.1');
    watcher.messages.length = 0;
    const judyWs = await wsOf(J, '10.0.3.1');
    // Force a visible presence change so a broadcast definitely fires.
    const kyle = await registerUser('kyle', '10.0.3.2');
    const kyleWs = await wsOf(kyle.json.token, '10.0.3.2');
    await sleep(300);
    const presenceMsgs = watcher.messages.filter((m) => m.type === 'presence');
    check('invisible user absent from presence broadcasts', presenceMsgs.length > 0 && presenceMsgs.every((m) => !m.online.includes('judy')), JSON.stringify(presenceMsgs.map((m) => m.online)));
    check('visible users still reported', presenceMsgs.some((m) => m.online.includes('alice') && m.online.includes('kyle')));
    const judyPost = await api('POST', '/posts', { token: J, body: { text: 'judy can still post while invisible' } });
    check('invisible user can still act fully', judyPost.status === 201);
    await judyWs.join('invisroom', 'judy');
    await aliceWs.join('invisroom', 'alice');
    await sleep(150);
    const invisPeers = aliceWs.messages.filter((m) => m.type === 'rtc-peers' && m.room === 'invisroom').pop();
    const judyEntry = invisPeers && invisPeers.peers.find((p) => p.id !== aliceWs.messages.filter((m) => m.type === 'joined' && m.room === 'invisroom').pop().peerId);
    check('room peer list redacts invisible user handle', !!judyEntry && judyEntry.name === '🤫 Someone', JSON.stringify(invisPeers));

    // ================= PROFILE VISIBILITY + INNER FIVE =================
    console.log('\n== profile visibility & Inner Five ==');
    await api('POST', '/posts', { token: E, body: { text: 'erin confidants-only post' } });
    await api('PUT', '/me', { token: E, body: { privacy: { profileVisibility: 'confidants' } } });
    const limitedView = await api('GET', '/users/erin', { token: D });
    check('confidants-only profile shows limited shell', limitedView.json.user.profilePrivate === true && limitedView.json.user.bio === undefined);
    const limitedPosts = await api('GET', '/users/erin/posts', { token: D });
    check('confidants-only posts refused to outsiders', limitedPosts.status === 403);
    const daveFeed = await api('GET', '/feed', { token: D });
    check('confidants-only posts excluded from outsider feed', !daveFeed.json.posts.some((p) => p.text === 'erin confidants-only post'));
    const carolFeed = await api('GET', '/feed', { token: C });
    check('confidants still see the posts', carolFeed.json.posts.some((p) => p.text === 'erin confidants-only post'));
    await api('PUT', '/me', { token: E, body: { privacy: { profileVisibility: 'everyone' } } });

    const badFive = await api('PUT', '/me', { token: A, body: { innerFive: ['dave'] } });
    check('Inner Five rejects non-confidants', badFive.status === 400);
    // The block test severed alice<->bob; rebuild the confidant circle:
    // bob, carol + four more = six confidants for alice.
    await api('POST', '/users/bob/follow', { token: A });
    await api('POST', '/users/alice/follow', { token: B });
    await api('POST', '/users/carol/follow', { token: A });
    await api('POST', '/users/alice/follow', { token: C });
    const fiveHandles = [];
    for (const h of ['five1', 'five2', 'five3', 'five4']) {
      const r = await registerUser(h, '10.0.4.' + (fiveHandles.length + 1));
      fiveHandles.push(h);
      await api('POST', `/users/${h}/follow`, { token: A });
      await api('POST', '/users/alice/follow', { token: r.json.token });
    }
    const sixFive = await api('PUT', '/me', { token: A, body: { innerFive: ['bob', 'carol', ...fiveHandles] } });
    check('Inner Five rejects more than 5', sixFive.status === 400, JSON.stringify(sixFive.json));
    const dupeFive = await api('PUT', '/me', { token: A, body: { innerFive: ['bob', 'bob', 'carol'] } });
    check('Inner Five dedupes repeats', dupeFive.status === 200 && dupeFive.json.user.innerFive.length === 2);
    const goodFive = await api('PUT', '/me', { token: A, body: { innerFive: ['bob', 'carol', 'five1', 'five2', 'five3'] } });
    check('Inner Five accepts five confidants', goodFive.status === 200 && goodFive.json.user.innerFive.length === 5);
    const aliceProfile = await api('GET', '/users/alice', { token: B });
    check('Inner Five shown on public profile', aliceProfile.json.user.innerFive.includes('bob') && (aliceProfile.json.user.innerFiveUsers || []).length === 5);

    // ================= OPENER TRIO =================
    console.log('\n== opener trio instant ban ==');
    const troll = await registerUser('trollx', '10.0.5.1');
    const victim1 = await registerUser('victim1', '10.0.5.2');
    const trollWs = await wsOf(troll.json.token, '10.0.5.1');
    await trollWs.join('dm:trollx:victim1', 'trollx');
    trollWs.send({ type: 'msg', text: 'how old are you?' });
    await sleep(120);
    trollWs.send({ type: 'msg', text: 'where are you from?' });
    await sleep(120);
    trollWs.send({ type: 'msg', text: 'what are you looking for here?' });
    await sleep(300);
    const trollLogin = await api('POST', '/auth/login', { ip: '10.0.5.1', body: { handle: 'trollx', password: 'pass1234' } });
    check('exact trio -> instant permanent ban', trollLogin.status === 403 && trollLogin.json.banned === true, JSON.stringify(trollLogin.json));
    const trollMe = await api('GET', '/me', { token: troll.json.token });
    check('banned user tokens are dead', trollMe.status === 401);
    const victimOk = await api('POST', '/auth/login', { ip: '10.0.5.2', body: { handle: 'victim1', password: 'pass1234' } });
    check('trio target unaffected', victimOk.status === 200);

    const troll2 = await registerUser('trolltwo', '10.0.5.3');
    const victim2 = await registerUser('victim2', '10.0.5.4');
    const troll2Ws = await wsOf(troll2.json.token, '10.0.5.3');
    await troll2Ws.join('dm:trolltwo:victim2', 'trolltwo');
    troll2Ws.send({ type: 'msg', text: 'hi how old are u' });
    await sleep(120);
    troll2Ws.send({ type: 'msg', text: 'where u from' });
    await sleep(120);
    troll2Ws.send({ type: 'msg', text: 'what are you looking for on here' });
    await sleep(300);
    const troll2Login = await api('POST', '/auth/login', { ip: '10.0.5.3', body: { handle: 'trolltwo', password: 'pass1234' } });
    check('variant trio -> instant ban', troll2Login.status === 403 && troll2Login.json.banned === true);

    // false positives: open pair + public room + partial sequence
    aliceWs.join('dm:alice:bob', 'alice');
    aliceWs.send({ type: 'msg', text: 'how old are you again? lol' });
    await sleep(100);
    aliceWs.send({ type: 'msg', text: 'and where are you from originally?' });
    await sleep(100);
    aliceWs.send({ type: 'msg', text: 'what are you looking for here, still just beats?' });
    await sleep(250);
    const aliceLogin = await api('POST', '/auth/login', { ip: '10.0.1.1', body: { handle: 'alice', password: 'pass1234' } });
    check('established friends chatting the same questions NOT banned', aliceLogin.status === 200);
    const rando = await registerUser('rando', '10.0.5.9');
    const randoWs = await wsOf(rando.json.token, '10.0.5.9');
    await randoWs.join('lobby', 'rando');
    randoWs.send({ type: 'msg', text: 'how old are you?' });
    randoWs.send({ type: 'msg', text: 'where are you from?' });
    randoWs.send({ type: 'msg', text: 'what are you looking for here?' });
    await sleep(250);
    const randoLogin = await api('POST', '/auth/login', { ip: '10.0.5.9', body: { handle: 'rando', password: 'pass1234' } });
    check('trio in a public room does not trip the DM rule', randoLogin.status === 200);

    // ================= SCAM LADDER =================
    console.log('\n== anti-scam ladder ==');
    const scammer = await registerUser('scamartist', '10.0.6.1');
    const S = scammer.json.token;
    const wave1 = [
      'Message me on WhatsApp to continue this chat over there',
      'Payment is easy, my paypal.me link is ready for you',
      'Guaranteed returns on your investment — double your money with my trading platform',
      'Just buy a gift card and send me the code today',
      'Act now, this is urgent, send your reply before it is too late — last chance',
      'Full details here bit.ly/xyz123deal'
    ];
    for (const text of wave1) await api('POST', '/posts', { token: S, body: { text } });
    const scamMe1 = await api('GET', '/me', { token: S });
    check('6 distinct playbook signals -> formal warning recorded', scamMe1.json.user.warnings.length >= 1, JSON.stringify(scamMe1.json.user.warnings));
    const scamLogin1 = await api('POST', '/auth/login', { ip: '10.0.6.1', body: { handle: 'scamartist', password: 'pass1234' } });
    check('warning comes FIRST (not banned yet)', scamLogin1.status === 200);
    const wave2 = [
      'Can you send me $250 to help with a bill',
      'Send me the verification code you received so I can confirm',
      'I am deployed overseas and stranded, I need a fee to process my leave to come home',
      'Brand new iPhone for sale, cheap price — pay with Venmo only',
      'Reply with your claimant code to proceed with your prize',
      'I won the Powerball lottery and I am giving away $50000 to the first 1000 people'
    ];
    for (const text of wave2) await api('POST', '/posts', { token: S, body: { text } });
    const scamLogin2 = await api('POST', '/auth/login', { ip: '10.0.6.1', body: { handle: 'scamartist', password: 'pass1234' } });
    check('fresh >5 signals after warning -> permanent ban', scamLogin2.status === 403 && scamLogin2.json.banned === true, JSON.stringify(scamLogin2.json));
    const scamRegReuse = await registerUser('scamartist2', '10.0.6.2', { email: 'scamartist@example.com' });
    check('registration with a banned email refused 403', scamRegReuse.status === 403);

    // fee-to-release weight: one fee post (3) + giftcard overlap + 2 more = over 5
    const fee = await registerUser('feeguy', '10.0.6.5');
    const FG = fee.json.token;
    await api('POST', '/posts', { token: FG, body: { text: 'You won a prize! Pay the processing fee and the delivery charge by gift cards to release it' } });
    const feeMe1 = await api('GET', '/me', { token: FG });
    check('fee-to-release alone (3) + giftcard (1) does not warn yet', feeMe1.json.user.warnings.length === 0, JSON.stringify(feeMe1.json.user.warnings));
    await api('POST', '/posts', { token: FG, body: { text: 'Add me on Telegram to finish this' } });
    await api('POST', '/posts', { token: FG, body: { text: 'Short link with the details tinyurl.com/abc999' } });
    const feeMe2 = await api('GET', '/me', { token: FG });
    check('fee-to-release weight pushes total over 5 -> warning', feeMe2.json.user.warnings.length >= 1);

    // innocent user: lyrics + repeats to ONE person — no warning
    const poet = await registerUser('poet', '10.0.6.9');
    const pal = await registerUser('pal', '10.0.6.10');
    const P = poet.json.token;
    await api('POST', '/posts', { token: P, body: { text: 'what is wrong with my little black heart, black heart' } });
    await api('POST', '/posts', { token: P, body: { text: 'I use this music to cope, let the triples ride the beat' } });
    const poetWs = await wsOf(P, '10.0.6.9');
    const palWs = await wsOf(pal.json.token, '10.0.6.10');
    await poetWs.join('dm:pal:poet', 'poet');
    await palWs.join('dm:pal:poet', 'pal');
    poetWs.send({ type: 'msg', text: 'check my new hook' });
    await poetWs.waitFor((m) => m.type === 'dm-request-sent');
    await api('POST', '/dm/requests/poet/accept', { token: pal.json.token });
    for (let i = 0; i < 5; i++) { poetWs.send({ type: 'msg', text: 'what is wrong with my little black heart' }); await sleep(30); }
    const poetMe = await api('GET', '/me', { token: P });
    check('song lyrics + repeats to one person -> no warning', poetMe.json.user.warnings.length === 0, JSON.stringify(poetMe.json.user.warnings));
    const poetLogin = await api('POST', '/auth/login', { ip: '10.0.6.9', body: { handle: 'poet', password: 'pass1234' } });
    check('innocent user not banned', poetLogin.status === 200);

    // ================= NAME SIGNALS =================
    console.log('\n== name signals ==');
    await registerUser('jmname', '10.0.7.1', { displayName: 'James Michael' });
    await registerUser('mavisw', '10.0.7.2', { displayName: 'Mavis Wanczyk' });
    await registerUser('kaym', '10.0.7.3', { displayName: 'Kay Michelle' });
    await registerUser('gensmith', '10.0.7.4', { displayName: 'General Smith' });
    const overview = await api('GET', '/admin/overview', { token: BOSS });
    check('admin overview available to admin', overview.status === 200);
    const hitsOf = (h) => { const f = (overview.json.flagged || []).find((x) => x.handle === h); return f ? Object.keys(f.signalHits || {}) : []; };
    check('"James Michael" scores two_first_names', hitsOf('jmname').includes('two_first_names'), JSON.stringify(hitsOf('jmname')));
    check('"Mavis Wanczyk" scores lottery_winner_name', hitsOf('mavisw').includes('lottery_winner_name'));
    check('"Kay Michelle" scores fake_name_archetype', hitsOf('kaym').includes('fake_name_archetype'));
    check('"General Smith" scores scammer_name_pattern', hitsOf('gensmith').includes('scammer_name_pattern'));
    const jmLogin = await api('POST', '/auth/login', { ip: '10.0.7.1', body: { handle: 'jmname', password: 'pass1234' } });
    check('a name alone never bans', jmLogin.status === 200);
    check('moderation log entries carry IP evidence', (overview.json.moderationLog || []).length > 0 && overview.json.moderationLog.every((e) => Array.isArray(e.ips)), JSON.stringify((overview.json.moderationLog || []).slice(0, 2)));
    check('ban records carry the banned IPs', (overview.json.records || []).some((r) => r.handle === 'trollx' && r.ips.includes('10.0.5.1')));

    // ================= BAN / UNBAN / ADMIN =================
    console.log('\n== ban machinery ==');
    const badactor = await registerUser('badactor', '10.0.9.9');
    const nonAdmin = await api('GET', '/admin/overview', { token: A });
    check('admin endpoints refuse non-admins', nonAdmin.status === 403);
    const banRes = await api('POST', '/admin/ban/badactor', { token: BOSS, body: { reason: 'test ban' } });
    check('admin can ban', banRes.status === 200);
    const badLogin = await api('POST', '/auth/login', { ip: '10.0.9.9', body: { handle: 'badactor', password: 'pass1234' } });
    check('banned login refused with banned state', badLogin.status === 403 && badLogin.json.banned === true);
    const bannedIpReg = await registerUser('sneakynew', '10.0.9.9');
    check('registration from a banned IP refused 403', bannedIpReg.status === 403);
    const unbanRes = await api('POST', '/admin/unban/badactor', { token: BOSS });
    check('admin unban works (mistake exception)', unbanRes.status === 200);
    const badLogin2 = await api('POST', '/auth/login', { ip: '10.0.9.9', body: { handle: 'badactor', password: 'pass1234' } });
    check('unbanned account logs in again', badLogin2.status === 200);

    // shared-IP guardrail: two legit accounts, same IP, distinct identifiers
    const roomie1 = await registerUser('roomie1', '10.0.10.10');
    const roomie2 = await registerUser('roomie2', '10.0.10.10');
    check('two legit accounts sharing an IP register fine', roomie1.status === 200 && roomie2.status === 200);
    const roomieLogin = await api('POST', '/auth/login', { ip: '10.0.10.10', body: { handle: 'roomie2', password: 'pass1234' } });
    check('shared-IP accounts are NOT auto-banned', roomieLogin.status === 200);

    sockets.forEach((s) => s.close());
  } finally {
    server.kill('SIGTERM');
    await sleep(300);
    try { server.kill('SIGKILL'); } catch (err) {}
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`\n==== ${passed} passed, ${failed} failed ====`);
  if (failures.length) console.log('FAILED: ' + failures.join(' | '));
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
