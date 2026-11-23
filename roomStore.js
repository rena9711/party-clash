'use strict';
const { Pool } = require('pg');
const configured = Boolean(process.env.DATABASE_URL);
const pool = configured ? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
}) : null;
const pending = new Map();
const LIFETIME_MS = 24 * 60 * 60 * 1000;
function state(room) {
  return {
    code: room.code, host: room.host, phase: room.phase,
    round: room.round, game: room.game, selectedGame: room.selectedGame, results: room.results || [],
    log: room.log || [], createdAt: room.createdAt || Date.now(),
    players: [...room.players.values()].map(p => ({
      id:p.id, session:p.session || '', name:p.name, character:p.character, score:p.score || 0,
      ready: false, submitted: Boolean(p.submitted),
      value: p.value || 0, online: false
    }))
  };
}
function save(room) {
  if (!pool) return Promise.resolve();
  const code = room.code, data = state(room);
  const previous = pending.get(code) || Promise.resolve();
  const next = previous.catch(() => {}).then(() =>
    pool.query(
      'INSERT INTO party_rooms (code, payload, expires_at) VALUES ($1,$2::jsonb,NOW()+INTERVAL \'24 hours\') ON CONFLICT (code) DO UPDATE SET payload=EXCLUDED.payload, expires_at=EXCLUDED.expires_at',
      [code, JSON.stringify(data)]
    )
  );
  pending.set(code, next);
  next.finally(() => { if (pending.get(code) === next) pending.delete(code); }).catch(() => {});
  return next;
}
async function remove(code) {
  if (!pool) return;
  await (pending.get(code) || Promise.resolve()).catch(() => {});
  await pool.query('DELETE FROM party_rooms WHERE code=$1',[code]);
}
async function init(rooms) {
  if (!pool) {
    console.warn('Room persistence unavailable: DATABASE_URL is not set; rooms are memory-only');
    return { persistent:false, restored:0 };
  }
  await pool.query('CREATE TABLE IF NOT EXISTS party_rooms (code VARCHAR(12) PRIMARY KEY, payload JSONB NOT NULL, expires_at TIMESTAMPTZ NOT NULL)');
  await pool.query('DELETE FROM party_rooms WHERE expires_at < NOW()');
  const rows = await pool.query('SELECT payload FROM party_rooms WHERE expires_at >= NOW()');
  for (const {payload:p} of rows.rows) {
    if (!p || !/^[A-F0-9]{6}$/.test(p.code) || !Array.isArray(p.players)) continue;
    const players = new Map(p.players.map(player => [player.id, {
      ...player, online:false, ready:false, submitted:false, attackCount:0, shield:false
    }]));
    if (!players.size) continue;
    const room = {
      ...p, players, phase: p.phase === 'playing' ? 'lobby' : p.phase,
      timer:null, expireTimer:null, startsAt:null, endsAt:null, seed:null,
      log:p.log || [], results:p.results || [], createdAt:p.createdAt || Date.now()
    };
    rooms.set(room.code, room);
  }
  console.log('Restored',rooms.size,'rooms from PostgreSQL');
  return { persistent:true, restored:rooms.size };
}
module.exports = {init, save, remove, configured, LIFETIME_MS};
