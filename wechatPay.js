'use strict';

const crypto = require('node:crypto');

const price = 990;
const currency = 'CNY';

function createWechatPay(env = process.env, request = fetch) {
  const {
    WECHAT_PAY_APP_ID: appid,
    WECHAT_PAY_MERCHANT_ID: mchid,
    WECHAT_PAY_MERCHANT_SERIAL: merchantSerial,
    WECHAT_PAY_PRIVATE_KEY: privateKey,
    WECHAT_PAY_PUBLIC_KEY_ID: publicKeyId,
    WECHAT_PAY_PUBLIC_KEY: publicKey,
    WECHAT_PAY_API_V3_KEY: apiKey,
    WECHAT_PAY_NOTIFY_URL: notifyUrl
  } = env;
  if (!/^wx[a-zA-Z0-9]+$/.test(appid || '') || !/^\d+$/.test(mchid || '') ||
      !/^[a-fA-F0-9]+$/.test(merchantSerial || '') || !/^PUB_KEY_ID_\d+$/.test(publicKeyId || '') ||
      Buffer.byteLength(apiKey || '') !== 32 || !/^https:\/\/[^/?#]+\/api\/room-pass\/wechat-notify$/.test(notifyUrl || '')) {
    throw new Error('Invalid WeChat Pay configuration');
  }
  const signer = crypto.createPrivateKey(privateKey.replace(/\\n/g, '\n'));
  const verifier = crypto.createPublicKey(publicKey.replace(/\\n/g, '\n'));

  function verify(headers, body) {
    const timestamp = headers.get('wechatpay-timestamp');
    const nonce = headers.get('wechatpay-nonce');
    const signature = headers.get('wechatpay-signature');
    return headers.get('wechatpay-serial') === publicKeyId && /^\d+$/.test(timestamp || '') &&
      Math.abs(Date.now() / 1000 - Number(timestamp)) <= 300 && nonce && signature &&
      crypto.verify('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${body}\n`), verifier, Buffer.from(signature, 'base64'));
  }

  async function call(method, path, payload) {
    const body = payload ? JSON.stringify(payload) : '';
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(16).toString('hex');
    const signature = crypto.sign('RSA-SHA256', Buffer.from(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`), signer).toString('base64');
    const response = await request('https://api.mch.weixin.qq.com' + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(4500),
      headers: {
        Accept: 'application/json', 'Content-Type': 'application/json', 'Wechatpay-Serial': publicKeyId,
        Authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${merchantSerial}",signature="${signature}"`
      },
      body: payload ? body : undefined
    });
    const raw = await response.text();
    if (response.status === 204 && path.endsWith('/close')) return null;
    if (!verify(response.headers, raw)) throw new Error('Unverified WeChat Pay response');
    if (!response.ok) {
      const error = new Error('WeChat Pay request failed');
      error.providerCode = JSON.parse(raw).code;
      throw error;
    }
    return JSON.parse(raw);
  }

  function payment(transaction) {
    if (transaction.mchid !== mchid || transaction.appid !== appid || transaction.trade_state !== 'SUCCESS' ||
        transaction.trade_type !== 'NATIVE' || transaction.amount?.total !== price ||
        transaction.amount?.currency !== currency || !/^\d+$/.test(transaction.transaction_id || '')) return null;
    const paidAt = Date.parse(transaction.success_time);
    if (!Number.isFinite(paidAt) || paidAt > Date.now() + 60_000) return null;
    return { id: transaction.out_trade_no, paidAt, transactionId: transaction.transaction_id };
  }

  return {
    async create(id, expiresAt) {
      const result = await call('POST', '/v3/pay/transactions/native', {
        appid, mchid, description: '大乱斗-24小时开房卡', out_trade_no: id,
        time_expire: new Date(expiresAt).toISOString().replace(/\.\d{3}Z$/, '+00:00'),
        notify_url: notifyUrl, amount: { total: price, currency }
      });
      if (!/^weixin:\/\/wxpay\//.test(result.code_url || '')) throw new Error('Invalid WeChat Pay code');
      return result.code_url;
    },
    async query(id) {
      const result = await call('GET', `/v3/pay/transactions/out-trade-no/${id}?mchid=${mchid}`);
      if (result.out_trade_no !== id || result.mchid !== mchid || result.appid !== appid) {
        throw new Error('Mismatched WeChat Pay order');
      }
      const paid = payment(result);
      if (result.trade_state === 'SUCCESS' && !paid) throw new Error('Unmatched WeChat Pay payment');
      return { state: result.trade_state, paid };
    },
    async close(id) {
      await call('POST', `/v3/pay/transactions/out-trade-no/${id}/close`, { mchid });
    },
    notification(headers, body) {
      if (!verify(headers, body)) return null;
      const notice = JSON.parse(body);
      const resource = notice.resource;
      if (notice.event_type !== 'TRANSACTION.SUCCESS' || resource?.algorithm !== 'AEAD_AES_256_GCM' ||
          resource.original_type !== 'transaction') return null;
      const encrypted = Buffer.from(resource.ciphertext, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(apiKey), Buffer.from(resource.nonce));
      decipher.setAuthTag(encrypted.subarray(-16));
      decipher.setAAD(Buffer.from(resource.associated_data || ''));
      const clear = Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]);
      return payment(JSON.parse(clear.toString('utf8')));
    }
  };
}

module.exports = { createWechatPay, price, currency };
