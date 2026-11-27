const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { setTimeout: wait } = require('node:timers/promises');
const connect = require(path.resolve(require.resolve('socket.io'), '../../client-dist/socket.io.js'));
const { createWechatPay } = require('../wechatPay');

test('WeChat notifications require valid signature, merchant and amount', () => {
  const merchant = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const platform = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const env = {
    WECHAT_PAY_APP_ID: 'wxTest',
    WECHAT_PAY_MERCHANT_ID: '12345678',
    WECHAT_PAY_MERCHANT_SERIAL: 'ABC123',
    WECHAT_PAY_PRIVATE_KEY: merchant.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    WECHAT_PAY_PUBLIC_KEY_ID: 'PUB_KEY_ID_1234',
    WECHAT_PAY_PUBLIC_KEY: platform.publicKey.export({ type: 'spki', format: 'pem' }),
    WECHAT_PAY_API_V3_KEY: '0123456789abcdef0123456789abcdef',
    WECHAT_PAY_NOTIFY_URL: 'https://example.test/api/room-pass/wechat-notify'
  };
  const provider = createWechatPay(env);
  const paidAt = Date.now();
  function fixture(fields = {}) {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = 'a8be21';
    const cipherNonce = '0123456789ab';
    const data = {
      mchid: env.WECHAT_PAY_MERCHANT_ID, appid: env.WECHAT_PAY_APP_ID,
      out_trade_no: 'test-room-order', transaction_id: '123456789',
      trade_type: 'NATIVE', trade_state: 'SUCCESS', success_time: new Date(paidAt).toISOString(),
      amount: { total: 990, currency: 'CNY' }, ...fields
    };
    const cipher = crypto.createCipheriv('aes-256-gcm', env.WECHAT_PAY_API_V3_KEY, cipherNonce);
    cipher.setAAD(Buffer.from('transaction'));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final(), cipher.getAuthTag()]).toString('base64');
    const body = JSON.stringify({ event_type: 'TRANSACTION.SUCCESS', resource: {
      algorithm: 'AEAD_AES_256_GCM', original_type: 'transaction',
      associated_data: 'transaction', nonce: cipherNonce, ciphertext
    } });
    const signature = crypto.sign('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${body}\n`), platform.privateKey);
    const headers = new Headers({
      'wechatpay-serial': env.WECHAT_PAY_PUBLIC_KEY_ID, 'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce, 'wechatpay-signature': signature.toString('base64')
    });
    return { body, headers };
  }
  const valid = fixture();
  assert.deepEqual(provider.notification(valid.headers, valid.body), {
    id: 'test-room-order', paidAt, transactionId: '123456789'
  });
  assert.equal(provider.notification(valid.headers, valid.body + ' '), null);
  for (const invalid of [fixture({ amount: { total: 1, currency: 'CNY' } }), fixture({ mchid: '0000' })]) {
    assert.equal(provider.notification(invalid.headers, invalid.body), null);
  }
});

const databaseUrl = process.env.ROOM_PASS_TEST_DATABASE_URL;
test('Room trial is per player and held pass persists through restart', { skip: !databaseUrl, timeout: 30000 }, async t => {
  const port = 24500 + process.pid % 3000;
  const base = 'http://127.0.0.1:' + port;
  const clients = new Set();
  let child;
  async function boot() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, PORT: String(port), DATABASE_URL: databaseUrl, ROOM_PASS_MODE: 'qa' },
      stdio: ['ignore', 'pipe', 'inherit']
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server did not start')), 5000);
      child.once('exit', code => { clearTimeout(timeout); reject(new Error('Server exited: ' + code)); });
      child.stdout.on('data', data => {
        if (String(data).includes('Party Clash running')) { clearTimeout(timeout); resolve(); }
      });
    });
  }
  async function stop() {
    for (const socket of clients) socket.disconnect();
    clients.clear();
    if (child?.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
    }
  }
  t.after(stop);
  function event(socket, name, predicate = () => true) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { socket.off(name, handler); reject(new Error('Timed out: ' + name)); }, 5000);
      function handler(value) {
        if (!predicate(value)) return;
        clearTimeout(timeout);
        socket.off(name, handler);
        resolve(value);
      }
      socket.on(name, handler);
    });
  }
  async function player() {
    const s = connect(base, { transports: ['websocket'], reconnection: false, forceNew: true });
    clients.add(s);
    await event(s, 'connect');
    return s;
  }
  const ack = (socket, event, input) => socket.timeout(4000).emitWithAck(event, input);
  const status = socket => ack(socket, 'room-pass', { action: 'status' });
  const hostSession = crypto.randomUUID(), guestSession = crypto.randomUUID();
  await boot();
  let host = await player(), guest = await player();
  const created = await ack(host, 'create', { name: 'QA房主', session: hostSession });
  assert.equal(created.ok, true);
  assert.equal((await ack(guest, 'join', { name: 'QA好友', session: guestSession, code: created.code })).ok, true);
  assert.match((await ack(guest, 'room-pass', { action: 'begin' })).error, /仅房主/);

  async function round(number, blocked = false) {
    const rules = event(host, 'room', r => r.phase === 'rules');
    host.emit('start', { game: 'tap' });
    await rules;
    const progress = blocked ? event(host, 'room-pass-required') : event(host, 'room', r => r.phase === 'playing' && r.round === number + 1);
    host.emit('rules-ready', { round: number });
    guest.emit('rules-ready', { round: number });
    const started = await progress;
    if (blocked) return;
    await wait(Math.max(0, started.startsAt - Date.now()));
    const results = event(host, 'room', r => r.phase === 'results');
    host.emit('submit', { value: 3 });
    guest.emit('submit', { value: 4 });
    await results;
  }
  for (let i = 0; i < 3; i++) await round(i);
  assert.equal((await status(host)).trialsLeft, 0);
  assert.equal((await status(guest)).trialsLeft, 0);
  await round(3, true);

  const otherHostSocket = await player();
  assert.equal((await ack(otherHostSocket, 'create', { name: 'QA房主', session: hostSession })).ok, true);
  assert.equal((await status(otherHostSocket)).trialsLeft, 0);
  assert.equal((await status(otherHostSocket)).expiresAt, null);

  const purchasedAt = Date.now();
  const receipt = await ack(host, 'room-pass', { action: 'begin' });
  assert.ok(receipt.expiresAt >= purchasedAt + 86400000);
  assert.ok(receipt.expiresAt <= Date.now() + 86400000);
  await wait(1550);
  assert.equal((await ack(host, 'room-pass', { action: 'begin' })).expiresAt, receipt.expiresAt);
  await round(3);
  await stop();
  await boot();
  host = await player();
  guest = await player();
  assert.equal((await ack(host, 'join', { session: hostSession, code: created.code, resume: true })).ok, true);
  assert.equal((await ack(guest, 'join', { session: guestSession, code: created.code, resume: true })).ok, true);
  assert.equal((await status(host)).expiresAt, receipt.expiresAt);
  await round(4);
});
