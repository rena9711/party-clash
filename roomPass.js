'use strict';

const { createHash, randomBytes } = require('node:crypto');
const QRCode = require('qrcode');
const { createWechatPay, price } = require('./wechatPay');

const lifetime = 24 * 60 * 60 * 1000;
const orderLifetime = 5 * 60 * 1000;
const trials = 3;
const playerKey = session => createHash('sha256').update(session).digest('hex');

function createRoomPass(pool, mode) {
  if (!mode || mode === 'off') return null;
  if (!['qa', 'wechat'].includes(mode) || !pool) throw new Error('Room passes require PostgreSQL and a supported mode');
  const provider = mode === 'wechat' ? createWechatPay() : null;

  async function init() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS party_room_pass_trials (
        mode TEXT NOT NULL,
        player_key TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0 CHECK (used BETWEEN 0 AND 3),
        PRIMARY KEY (mode, player_key)
      );
      CREATE TABLE IF NOT EXISTS party_room_pass_orders (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        room_code TEXT NOT NULL,
        room_created_ms BIGINT NOT NULL,
        owner_key TEXT NOT NULL,
        deadline_ms BIGINT NOT NULL,
        paid_ms BIGINT,
        transaction_id TEXT UNIQUE,
        code_url TEXT,
        closed BOOLEAN NOT NULL DEFAULT false
      );
      CREATE UNIQUE INDEX IF NOT EXISTS party_room_pass_open_room
        ON party_room_pass_orders (mode, room_code, room_created_ms) WHERE NOT closed;
    `);
  }

  async function transaction(operation) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const roomId = room => [mode, room.code, room.createdAt];
  async function orderFor(room) {
    const result = await pool.query(`
      SELECT * FROM party_room_pass_orders
      WHERE mode=$1 AND room_code=$2 AND room_created_ms=$3 AND NOT closed
    `, roomId(room));
    return result.rows[0];
  }

  async function status(room, session) {
    const { rows } = await pool.query('SELECT used FROM party_room_pass_trials WHERE mode=$1 AND player_key=$2', [mode, playerKey(session)]);
    const order = await orderFor(room);
    return {
      mode, price, trialsLeft: trials - (rows[0]?.used ?? 0),
      expiresAt: order?.paid_ms ? Number(order.paid_ms) + lifetime : null
    };
  }

  async function consumeTrial(sessions) {
    if (sessions.some(session => !session)) return false;
    const keys = [...new Set(sessions.map(playerKey))].sort();
    return transaction(async client => {
      await client.query(`
        INSERT INTO party_room_pass_trials (mode, player_key)
        SELECT $1, player_key FROM unnest($2::text[]) AS player_key ORDER BY player_key
        ON CONFLICT DO NOTHING
      `, [mode, keys]);
      const { rows } = await client.query(`
        SELECT used FROM party_room_pass_trials WHERE mode=$1 AND player_key=ANY($2)
        ORDER BY player_key FOR UPDATE
      `, [mode, keys]);
      if (rows.some(row => row.used >= trials)) return false;
      await client.query('UPDATE party_room_pass_trials SET used=used+1 WHERE mode=$1 AND player_key=ANY($2)', [mode, keys]);
      return true;
    });
  }

  async function settle({ id, paidAt, transactionId }) {
    return transaction(async client => {
      const { rows: [order] } = await client.query('SELECT * FROM party_room_pass_orders WHERE id=$1 AND mode=$2 FOR UPDATE', [id, mode]);
      if (!order || order.closed || paidAt > Number(order.deadline_ms) + 1000 ||
          paidAt < Number(order.deadline_ms) - orderLifetime - 1000) return null;
      if (order.paid_ms && order.transaction_id !== transactionId) return null;
      const expiresAt = Number(order.paid_ms ?? paidAt) + lifetime;
      if (!order.paid_ms) {
        const result = await client.query(`
          UPDATE party_rooms SET expires_at=GREATEST(expires_at,$3), payload=payload || jsonb_build_object('passExpiresAt',$4::bigint,'passMode',$5::text)
          WHERE code=$1 AND (payload->>'createdAt')::bigint=$2
        `, [order.room_code, order.room_created_ms, new Date(expiresAt), expiresAt, mode]);
        if (!result.rowCount) throw new Error('Paid room cannot be located');
        await client.query('UPDATE party_room_pass_orders SET paid_ms=$2, transaction_id=$3 WHERE id=$1', [id, paidAt, transactionId]);
      }
      return { code: order.room_code, createdAt: Number(order.room_created_ms), expiresAt };
    });
  }

  async function reconcile(order) {
    if (!order || order.paid_ms) return null;
    if (!provider) return null;
    try {
      const result = await provider.query(order.id);
      if (result.paid) return settle(result.paid);
      if (result.state !== 'CLOSED') await provider.close(order.id);
    } catch (error) {
      if (error.providerCode !== 'ORDER_NOT_EXIST' && error.providerCode !== 'ORDERCLOSED') throw error;
    }
    await pool.query('UPDATE party_room_pass_orders SET closed=true WHERE id=$1 AND paid_ms IS NULL', [order.id]);
    return null;
  }

  async function begin(room, session) {
    let order = await orderFor(room);
    if (order?.paid_ms) return { expiresAt: Number(order.paid_ms) + lifetime };
    if (order && Number(order.deadline_ms) <= Date.now()) {
      const receipt = await reconcile(order);
      if (receipt) return receipt;
      order = await orderFor(room);
      if (order?.paid_ms) return { expiresAt: Number(order.paid_ms) + lifetime };
    }
    if (!order) {
      // Leave enough time for WeChat to report payment before the original room expires.
      if (room.createdAt + lifetime <= Date.now() + orderLifetime + 15 * 60 * 1000) {
        return { error: '此房间即将到期，请创建新房间后购买' };
      }
      await pool.query(`
        INSERT INTO party_room_pass_orders (id, mode, room_code, room_created_ms, owner_key, deadline_ms)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING
      `, [randomBytes(16).toString('hex'), ...roomId(room), playerKey(session), Date.now() + orderLifetime]);
      order = await orderFor(room);
    }
    if (!order || order.owner_key !== playerKey(session)) return { error: '订单不可用，请重试' };
    if (mode === 'qa') {
      return settle({ id: order.id, paidAt: Date.now(), transactionId: 'qa-' + order.id });
    }
    let codeUrl = order.code_url;
    if (!codeUrl) {
      try {
        codeUrl = await provider.create(order.id, Number(order.deadline_ms));
      } catch (error) {
        if (error.providerCode !== 'ORDERPAID') throw error;
        const result = await provider.query(order.id);
        if (!result.paid) throw error;
        return settle(result.paid);
      }
      await pool.query('UPDATE party_room_pass_orders SET code_url=$2 WHERE id=$1', [order.id, codeUrl]);
    }
    return { qrCode: await QRCode.toDataURL(codeUrl, { width: 240, margin: 2 }), deadline: Number(order.deadline_ms) };
  }

  async function check(room, session) {
    const order = await orderFor(room);
    if (!order || order.owner_key !== playerKey(session)) return {};
    if (order.paid_ms) return { expiresAt: Number(order.paid_ms) + lifetime };
    if (!provider) return {};
    if (Date.now() >= Number(order.deadline_ms)) {
      return await reconcile(order) || { error: '订单已结束，请重新购买' };
    }
    const result = await provider.query(order.id);
    return result.paid ? settle(result.paid) : {};
  }

  return { mode, init, status, consumeTrial, begin, check, settle, provider };
}

module.exports = { createRoomPass, lifetime };
