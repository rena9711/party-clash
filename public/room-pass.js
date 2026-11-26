'use strict';

window.RoomPass = (() => {
  let clock;
  let cachedStatus;
  let statusKey;
  let checkout;
  let notice = '';

  function render(room, host, socket) {
    if (!room.passMode) return;
    const mount = document.getElementById('room-pass');
    if (!mount) return;
    clearInterval(clock);
    const active = room.passExpiresAt > Date.now();
    const test = room.passMode === 'qa';
    mount.hidden = false;
    mount.innerHTML = `
      <div class="pass-heading"><strong>房间通行证</strong><span>${active ? (test ? '模拟开通' : '已开通') : '¥9.90 · 24 小时'}</span></div>
      <p>${active ? '全部 8 款游戏 · 不限局数' : '房主一人付费，好友免费加入。全部 8 款游戏，有效期内不限局数。'}</p>
      <p class="pass-remaining" id="pass-remaining"></p>
      <p class="pass-notice" id="pass-notice" role="status"></p>
      ${host && !active ? '<button class="btn" id="pass-buy" type="button">购买开房卡 ¥9.90</button>' : ''}
      ${test ? '<small>支付测试模式，实际扣款 ¥0</small>' : ''}`;
    const remaining = mount.querySelector('#pass-remaining');
    const feedback = mount.querySelector('#pass-notice');
    feedback.textContent = notice;
    if (active) {
      const tick = () => {
        if (!mount.isConnected) return clearInterval(clock);
        const seconds = Math.max(0, Math.ceil((room.passExpiresAt - Date.now()) / 1000));
        const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
        remaining.textContent = '剩余有效时间 ' + parts.map(part => String(part).padStart(2, '0')).join(':');
        if (!seconds) clearInterval(clock);
      };
      tick();
      clock = setInterval(tick, 1000);
      return;
    }
    const key = `${room.code}:${room.round}:${room.phase}`;
    if (statusKey !== key) {
      statusKey = key;
      cachedStatus = null;
      socket.timeout(4500).emit('room-pass', { action: 'status' }, (error, status) => {
        if (error || statusKey !== key || !Number.isInteger(status?.trialsLeft)) return;
        cachedStatus = status.trialsLeft;
        const label = document.getElementById('pass-remaining');
        if (label) label.textContent = trialText(cachedStatus);
      });
    }
    if (cachedStatus !== null) remaining.textContent = trialText(cachedStatus);
    const buy = mount.querySelector('#pass-buy');
    if (buy) buy.onclick = () => openCheckout(room, socket);
  }

  const trialText = left => `我的免费体验剩余 ${left} / 3 局`;

  function feedback(message) {
    notice = message;
    const label = document.getElementById('pass-notice');
    if (label) label.textContent = message;
  }

  function openCheckout(room, socket) {
    if (checkout?.open) return;
    const simulated = room.passMode === 'qa';
    const popup = document.createElement('dialog');
    checkout = popup;
    popup.className = 'pass-checkout';
    popup.setAttribute('aria-labelledby', 'pass-checkout-title');
    popup.innerHTML = `
      <h2 id="pass-checkout-title">房间通行证 ¥9.90</h2>
      <p>仅用于房间 ${room.code}，从支付成功起 24 小时有效。</p>
      <p>好友免费加入，全部 8 款游戏不限局数。一次购买，无需订阅。</p>
      <p data-checkout-status role="status">${simulated ? '模拟结账，实际扣款 ¥0。' : '使用微信扫一扫付款。'}</p>
      <img hidden alt="微信支付二维码" width="240" height="240">
      <button class="btn" type="button" data-checkout-action>${simulated ? '确认模拟支付' : '生成微信支付二维码'}</button>
      <form method="dialog"><button class="btn secondary">关闭</button></form>`;
    document.body.append(popup);
    popup.showModal();
    popup.addEventListener('close', () => popup.remove(), { once: true });
    const button = popup.querySelector('[data-checkout-action]');
    const label = popup.querySelector('[data-checkout-status]');
    const qr = popup.querySelector('img');
    let action = 'begin';
    button.onclick = () => {
      button.disabled = true;
      label.textContent = '正在核对…';
      socket.timeout(12000).emit('room-pass', { action }, (error, result) => {
        if (!popup.open) return;
        button.disabled = false;
        if (error || result?.error) {
          label.textContent = result?.error || '连接超时，请重试';
          if (result?.error === '订单已结束，请重新购买') {
            action = 'begin';
            qr.hidden = true;
            button.textContent = '重新生成支付二维码';
          }
          return;
        }
        if (result?.expiresAt > Date.now()) {
          feedback(simulated ? '模拟支付成功，开房卡已开通。' : '支付成功，开房卡已开通。');
          popup.close();
          return;
        }
        if (result?.qrCode) {
          qr.src = result.qrCode;
          qr.hidden = false;
          action = 'check';
          button.textContent = '我已支付，查询结果';
          label.textContent = '请在 5 分钟内扫码完成支付。';
        } else {
          label.textContent = '暂未查到支付结果，请完成支付后重试。';
        }
      });
    };
  }

  return { render, feedback };
})();
