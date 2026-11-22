const passPlans = [
  { id: 'room-day', name: '房间日卡', price: '19.9', duration: '24 小时' },
  { id: 'room-month', name: '房间月卡', price: '69.9', duration: '30 日' },
  { id: 'skill-day', name: '技能日卡', price: '9.9', duration: '24 小时' },
  { id: 'skill-month', name: '技能月卡', price: '29.9', duration: '30 日' },
];

let previewRounds = 3;
let passView = 'center';
let selectedPass = null;

function openPass(view = 'center') {
  game = null;
  tab = 'pass';
  passView = view;
  render();
  window.scrollTo(0, 0);
  $('pass-title').focus({ preventScroll: true });
}

function passHomeSummary() {
  return `<section class="panel pass-summary" aria-label="免费试玩">
    <div><strong>免费剩余 ${previewRounds} 局</strong><small>测试数据 · 实际游戏照常开放</small></div>
    <button type="button" class="btn secondary" id="home-pass">通行证</button>
  </section>`;
}

function passCards(plans) {
  return `<div class="pass-grid">${plans.map(plan => `<button type="button" class="game pass-card" data-plan="${plan.id}">
    <strong>${plan.name}</strong><b>¥${plan.price}</b><small>${plan.duration}</small><span>查看方案</span>
  </button>`).join('')}</div>`;
}

function passPage() {
  const title = { center: '通行证', unlock: '免费 3 局已用完', review: '方案确认', result: '演示已完成', rights: '我的权益' }[passView];
  let content;
  switch (passView) {
    case 'unlock':
      content = `<section class="panel pass-section"><p>正式方案设想由房主开通房间通行证，受邀好友可免费加入。</p>
        <p>这是解锁提示预览。现在仍可返回大厅继续游戏。</p>
        <button class="btn block" data-pass="center">查看通行证</button>
        <button class="btn secondary block" data-pass="home">继续游戏</button></section>`;
      break;
    case 'review':
      content = `<section class="panel pass-section"><h2>${selectedPass.name}</h2>
        <p>¥${selectedPass.price} / ${selectedPass.duration}</p>
        <p>仅演示确认流程，无支付请求，无订单，无权益开通。</p>
        <button class="btn block" data-pass="result">模拟确认</button>
        <button class="btn secondary block" data-pass="center">返回方案列表</button></section>`;
      break;
    case 'result':
      content = `<section class="panel pass-section"><p>已完成 ${selectedPass.name} 的确认演示。</p>
        <p>实际支付 ¥0，未生成订单或开通权益。</p>
        <button class="btn block" data-pass="rights">查看我的权益</button></section>`;
      break;
    case 'rights':
      content = `<section class="panel pass-section"><dl class="pass-rights">
        <div><dt>房间通行证</dt><dd>未开通</dd></div><div><dt>技能通行证</dt><dd>未开通</dd></div>
        <div><dt>有效期</dt><dd>—</dd></div><div><dt>订单状态</dt><dd>暂无订单</dd></div>
        </dl><button class="btn secondary block" data-pass="center">返回通行证</button></section>`;
      break;
    default:
      content = `<section class="panel pass-section"><h2>房间通行证</h2><p>房主开通后，受邀好友可免费加入。</p>${passCards(passPlans.slice(0, 2))}</section>
        <section class="panel pass-section"><h2>技能通行证</h2>${passCards(passPlans.slice(2))}
          <p>规划共 8 种技能，其中 2 种免费、6 种付费。技能名单待确认。</p></section>
        <section class="panel pass-section"><h2>免费额度演示</h2><p>剩余 ${previewRounds} / 3 局。仅用于预览用完提示，刷新后恢复 3 局。</p>
          <button class="btn block" id="simulate-round">${previewRounds ? '模拟用掉 1 局' : '查看用完提示'}</button>
          <button class="btn secondary block" id="reset-rounds">重置为 3 局</button></section>`;
  }

  shell(`<main class="pass-page"><div class="pass-actions">
    <button class="chip" data-pass="home">返回大厅</button>
    <button class="chip" data-pass="rights">我的权益</button>
    </div><h1 id="pass-title" tabindex="-1">${title}</h1>
    <p class="pass-note">测试预览 · 不扣款，不影响现有游戏</p>${content}</main>`);

  document.querySelectorAll('[data-pass]').forEach(button => {
    button.onclick = () => {
      if (button.dataset.pass === 'home') {
        tab = 'home';
        render();
        window.scrollTo(0, 0);
        $('home-pass').focus({ preventScroll: true });
      } else {
        openPass(button.dataset.pass);
      }
    };
  });
  document.querySelectorAll('[data-plan]').forEach(button => {
    button.onclick = () => {
      selectedPass = passPlans.find(plan => plan.id === button.dataset.plan);
      openPass('review');
    };
  });
  if (passView === 'center') {
    $('simulate-round').onclick = () => {
      previewRounds = Math.max(0, previewRounds - 1);
      if (previewRounds === 0) {
        openPass('unlock');
      } else {
        passPage();
        $('simulate-round').focus({ preventScroll: true });
      }
    };
    $('reset-rounds').onclick = () => {
      previewRounds = 3;
      passPage();
      $('reset-rounds').focus({ preventScroll: true });
    };
  }
}
