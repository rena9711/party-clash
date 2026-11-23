const $=x=>document.getElementById(x),G=[['tap','⚡','疯狂手速'],['precision','🎯','完美时机'],['reaction','🚦','极限反应'],['memory','🧠','记忆爆炸'],['bomb','💥','大爆炸'],['mine','💎','踩雷大师']];const id=localStorage.pc_id||(localStorage.pc_id=(crypto.randomUUID?crypto.randomUUID():Math.random().toString(16).slice(2).padEnd(16,'0')));let name=localStorage.pc_name||'玩家'+id.slice(0,4),tab='home',game=null,stage='ready',count=0,tries=0,best=0,pos=0,score=0,ms=null,interval=null,timeout=null,challenge=null,challengeId=new URLSearchParams(location.search).get('challenge'),rivals=[],board=[],period='week',selected='all',error='',extra={},timerStart=0;const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function api(path,body){let r=await fetch('/api/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});let j=await r.json();if(!r.ok)throw Error(j.error||'网络错误');return j}async function init(){const roomCode=new URLSearchParams(location.search).get('room');if(roomCode&&/^[a-f0-9]{6}$/i.test(roomCode)){location.replace('/multiplayer.html?room='+encodeURIComponent(roomCode.toUpperCase()));return}try{await api('profile',{id,name});if(challengeId){challenge=await api('challenge/'+encodeURIComponent(challengeId));tab='challenge'}else{await refresh()}}catch(e){error=e.message}render()}async function refresh(){try{board=await api('leaderboard?period='+period+'&game='+selected);rivals=await api('rivals/'+id)}catch(e){error=e.message}}function clear(){clearInterval(interval);clearTimeout(timeout);interval=timeout=null}function shell(body){$('app').innerHTML=`<div class="head"><div class="logo"><span>⚡</span> 大乱斗</div><span class="pill">PARTY CLASH · 测试版</span></div>${error?`<div class="notice">${esc(error)}</div>`:''}${body}<div class="foot">研发测试版 · 测试成绩可修改 · 不用于正式竞技排名</div><nav class="nav">${[['home','🏠','大厅'],['rank','🏆','排行榜'],['rivals','⚔️','宿敌'],['profile','👤','我的']].map(x=>`<button data-tab="${x[0]}" class="${tab===x[0]||(tab==='solo'&&x[0]==='home')?'active':''}"><i>${x[1]}</i>${x[2]}</button>`).join('')}</nav>`;document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=async()=>{clear();tab=b.dataset.tab;game=null;error='';await refresh();render()})}function render(){if(game)return renderGame();if(tab==='home')return home();if(tab==='solo')return soloHome();if(tab==='rank')return ranks();if(tab==='rivals')return rivalPage();if(tab==='profile')return profile();if(tab==='challenge')return challengePage()}function home(){const desc={tap:'10秒手速挑战',precision:'挑战精准时机',reaction:'看看谁反应最快',memory:'记忆力大考验',bomb:'轮流猜数 · 多人',mine:'步步惊心'};shell(`
<section class="home-hero">
 <div class="home-hero-copy">
  <div class="home-kicker"><span class="pulse-dot"></span> PARTY CLASH · 好友派对游戏</div>
  <h1>来来来，<span>一起大乱斗！</span></h1>
  <p>不用下载，即开即玩。叫上朋友，欢乐对决。</p>
  <div class="home-main-actions">
   <button class="btn home-primary" id="room">👥 创建多人房间 <span>→</span></button>
   <button class="btn home-secondary" id="quick">⚡ 单人热身</button>
  </div>
 </div>
 <div class="home-hero-art" aria-hidden="true"><div class="art-halo"></div><span class="art-star s1">✦</span><span class="art-star s2">★</span><span class="art-star s3">✧</span><div class="art-character character-left">🦊</div><div class="art-character character-main">🐰</div><div class="art-character character-right">🐼</div><div class="art-burst">GO!</div></div>
 <div class="hero-foot"><span>🎮 即开即玩</span><span>👫 2–10 人联机</span><span>🏆 实时比拼</span></div>
</section>
<section class="panel home-games-panel">
 <div class="section home-section-title"><span>✨ 全部小游戏</span><small>随时来一局</small></div>
 <div class="games">${G.filter(g=>g[0]!=='bomb').map(g=>`<button class="game" data-game="${g[0]}"><span class="emoji">${g[1]}</span><b>${g[2]}</b><small>${desc[g[0]]}</small><span class="game-chevron">↗</span></button>`).join('')}
  <button class="game" id="raceRoom"><span class="emoji">🏁</span><b>跑得快</b><small>30秒跑酷 · 多人</small></button>
  <button class="game" id="bombRoom"><span class="emoji">💣</span><b>大爆炸</b><small>轮流猜数 · 多人</small></button>
  <button class="game" id="snakeRoom"><span class="emoji">🐍</span><b>贪吃蛇</b><small>多人竞技 · 实时对战</small></button>
 </div>
</section>
<section class="home-challenge"><div><div class="home-challenge-title">⚔️ 好友挑战</div><p>赢了一局还不够？分享成绩，邀请朋友来复仇。</p></div><button id="goRivals" aria-label="查看好友挑战">→</button></section>
`);$('quick').onclick=()=>{tab='solo';render()};$('room').onclick=()=>location.href='/multiplayer.html';$('raceRoom').onclick=()=>location.href='/multiplayer.html?game=race';$('bombRoom').onclick=()=>location.href='/multiplayer.html?game=bomb';$('snakeRoom').onclick=()=>location.href='/multiplayer.html?game=snake';$('goRivals').onclick=()=>{tab='rivals';render()};document.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>begin(b.dataset.game))}
function soloHome(){const desc={tap:'10秒内尽可能多地点按，挑战手速极限',precision:'把握最佳时机，停在目标中心',reaction:'红灯变绿，测试你的反应速度',memory:'记住发光格子的顺序',mine:'翻开安全格子，避开地雷'};const solo=G.filter(g=>g[0]!=='bomb');shell(`<div class="solo-hero"><span class="home-kicker">⚡ SOLO MODE · 单人热身</span><h1>先来一局，<span>热热身！</span></h1><p>任选一款小游戏，随时开始挑战，完成后还能继续换游戏。</p><div class="solo-count">🎮 ${solo.length + 2}款单人游戏</div></div><section class="panel home-games-panel solo-games-panel"><div class="section home-section-title"><span>🎮 选择游戏</span><small>点击游戏即可开始</small></div><div class="games">${solo.map(g=>`<button class="game" data-solo="${g[0]}"><span class="emoji">${g[1]}</span><b>${g[2]}</b><small>${desc[g[0]]}</small><span class="game-chevron">↗</span></button>`).join('')}</div></section><button class="solo-race-link" id="soloRace"><span class="solo-race-emoji">🏁🐰</span><span><strong>跑得快 · 单人试玩</strong><small>30秒动物跑酷，收集星星冲刺</small></span><span class="game-chevron">↗</span></button><a class="solo-race-link" href="/snake-demo.html"><span class="solo-race-emoji">🐍</span><span><strong>贪吃蛇 V12 · 隨心试玩</strong><small>横屏摇杆 · 单人对战</small></span></a><button class="btn secondary block solo-return" id="soloBack">← 返回大厅</button>`);document.querySelectorAll('[data-solo]').forEach(b=>b.onclick=()=>begin(b.dataset.solo));$('soloRace').onclick=()=>location.href='/race-demo.html';$('soloBack').onclick=()=>{tab='home';render()}}
function begin(g){if(!G.some(x=>x[0]===g)||g==='bomb'){if(g==='bomb')location.href='/multiplayer.html?game=bomb';else{game=null;render()}return}clear();game=g;stage='ready';count=0;tries=0;best=0;score=0;ms=null;extra={};render()}function renderGame(){const g=G.find(x=>x[0]===game);shell(`<button class="chip" id="back">← 返回大厅</button><div class="panel"><div class="section">${g[1]} ${g[2]}</div><div class="arena" id="arena"></div></div>`);$('back').onclick=()=>{clear();game=null;tab=challenge?'challenge':tab==='solo'?'solo':'home';render()};arena()}function arena(){const a=$('arena');if(!a)return;if(stage==='ready'){a.innerHTML=`<div class="big">${G.find(x=>x[0]===game)[1]}</div><div class="muted">${game==='tap'?'10秒内尽可能多地点击':game==='precision'?'三次机会，停在中央目标区域':game==='reaction'?'等待红灯变绿，立即点击':({memory:'记住闪烁顺序，依次点亮格子',bomb:'轮流猜数字，猜中即爆炸',mine:'九宫格排雷，及时收手保住积分'})[game]}</div><button class="btn block" id="start">开始挑战</button>`;$('start').onclick=start;return}if(stage==='result'){a.innerHTML=`<div class="big">${score>=80?'🏆':'✨'}</div><div class="muted">本局得分</div><div class="big gold">${score}</div><div class="muted">${game==='tap'?`点击${count}次`:game==='precision'?`最佳命中${best}分`:game==='reaction'?reactionResult():(extra.summary||'挑战完成')}</div><button class="btn block" id="again">再玩一次</button>${challenge&&challenge.game===game?'<button class="btn secondary block" id="reply">提交复仇成绩</button>':'<button class="btn secondary block" id="share">发起48小时挑战</button>'}${tab==='solo'?'<button class="btn secondary block" id="changeSolo">🎮 选择其他游戏</button>':''}`;$('again').onclick=()=>begin(game);if($('share'))$('share').onclick=shareScore;if($('reply'))$('reply').onclick=replyScore;if($('changeSolo'))$('changeSolo').onclick=()=>{clear();game=null;render()};return}if(['memory','bomb','mine'].includes(game)){return extraArena(a)}if(game==='tap'){a.innerHTML=`<div class="big" id="clock">10.0s</div><button class="tap" id="hit">狂点！</button><div class="muted">有效点击 <b id="hits">${count}</b> 次</div>`;$('hit').onpointerdown=e=>{e.preventDefault();if(stage==='playing'){count++;$('hits').textContent=count}}}else if(game==='precision'){a.innerHTML=`<div class="big">${tries+1} / 3</div><div class="meter"><div class="needle" id="needle"></div></div><div class="muted">最佳命中 ${best} 分</div><button class="btn block" id="stop">🎯 现在停！</button>`;$('stop').onpointerdown=e=>{e.preventDefault();if(stage!=='playing')return;let points=Math.max(0,Math.round(100-Math.abs(pos-50)*2));best=Math.max(best,points);tries++;if(tries>=3)finish(best);else arena()}}else{renderReaction(a)}}let readyAt=0;
const reactionScores=[[200,100],[350,95],[500,90],[700,85],[1000,75],[1500,60],[2000,45],[3000,30]];
function reactionResult(){
 if(extra.reaction==='early')return '抢跑 · 请等绿灯亮起';
 if(extra.reaction==='timeout')return '超时 · 超过 3.00 秒';
 return '有效点击 · '+(ms/1000).toFixed(2)+' 秒 · '+(score>=90?'反应极快':score>=60?'反应不错':'继续练习');
}
function renderReaction(a){
 a.innerHTML='<div class="light" id="reaction-light"></div><div class="section" id="reaction-status">等待绿灯…</div><button class="btn block" id="react">不要抢跑</button>';
 const button=$('react');
 function press(event){
  if(stage!=='waiting'&&stage!=='green')return;
  const timestamp=event.timeStamp;
  const pressedAt=timestamp>1e12?timestamp-performance.timeOrigin:timestamp;
  if(stage==='waiting'||pressedAt<readyAt){extra.reaction='early';finish(0);return}
  ms=Math.max(0,pressedAt-readyAt);
  extra.reaction=ms<=3000?'valid':'timeout';
  finish(reactionScores.find(([limit])=>ms<=limit)?.[1]||0);
 }
 if(window.PointerEvent)button.onpointerdown=e=>{if(e.isPrimary&&e.button===0){e.preventDefault();press(e)}};
 else button.ontouchstart=e=>{e.preventDefault();press(e)};
 button.onclick=e=>{if(e.detail===0||!window.PointerEvent)press(e)};
}
function start(){clear();stage='playing';let started=performance.now();if(game==='tap'){arena();interval=setInterval(()=>{let rem=Math.max(0,10-(performance.now()-started)/1000);if($('clock'))$('clock').textContent=rem.toFixed(1)+'s';if(rem<=0)finish(Math.min(100,Math.round(count*1.5)))},40)}else if(game==='precision'){arena();interval=setInterval(()=>{pos=(Math.sin((performance.now()-started)/560)+1)*50;if($('needle'))$('needle').style.left=pos+'%'},16)}else if(game==='reaction'){stage='waiting';arena();timeout=setTimeout(()=>{if(stage!=='waiting')return;requestAnimationFrame(()=>{if(game!=='reaction'||stage!=='waiting'||!$('reaction-light'))return;readyAt=performance.now();stage='green';$('reaction-light').classList.add('green');$('reaction-status').textContent='立即点击！';$('react').textContent='点击！';timeout=setTimeout(()=>{if(stage==='green'){extra.reaction='timeout';finish(0)}},3150)})},1300+Math.random()*2400)}else startExtra()}async function finish(n){if(stage==='result')return;clear();score=Math.max(0,Math.min(100,Math.round(n)));stage='result';arena();try{await api('score',{id,game,score})}catch(e){error=e.message}}async function shareScore(){try{let c=await api('challenge',{id,game,score});let url=location.origin+'/?challenge='+c.id;await shareLink(url);$('arena').insertAdjacentHTML('beforeend',`<div class="share">${esc(url)}</div>`)}catch(e){alert(e.message)}}async function shareLink(url){if(navigator.share){try{await navigator.share({title:'大乱斗 · 复仇挑战',text:'敢不敢超过我的成绩？',url});return}catch{}}if(navigator.clipboard){await navigator.clipboard.writeText(url);alert('挑战链接已复制，发给好友即可')}else prompt('复制挑战链接',url)}async function replyScore(){try{const r=await api('challenge/'+challengeId+'/submit',{id,score});alert(r.tie?'双方打平！':r.won?'复仇成功！':'挑战失败，再接再厉！');challenge=null;challengeId=null;history.replaceState({},'',location.pathname);tab='rivals';game=null;await refresh();render()}catch(e){alert(e.message)}}function challengePage(){if(!challenge){tab='home';return home()}let g=G.find(x=>x[0]===challenge.game);shell(`<div class="hero"><div class="eyebrow">⚔️ 48小时复仇挑战</div><h1>${esc(challenge.ownerName)} 向你宣战！</h1><p>${g[1]} ${g[2]} · 对手成绩 <b class="gold">${challenge.score}分</b></p><div class="actions"><button class="btn" id="accept">接受挑战</button><button class="btn secondary" id="cancel">先逛大厅</button></div></div>`);$('accept').onclick=()=>begin(challenge.game);$('cancel').onclick=()=>{challenge=null;challengeId=null;history.replaceState({},'',location.pathname);tab='home';render()}}function ranks(){shell(`<div class="section">🏆 竞技排行榜</div><div class="chips">${[['week','本周'],['all','历史']].map(x=>`<button class="chip ${period===x[0]?'on':''}" data-period="${x[0]}">${x[1]}</button>`).join('')}</div><div style="height:10px"></div><div class="chips">${[['all','全部'],...G.filter(x=>x[0]!=='bomb').map(x=>[x[0],x[2]])].map(x=>`<button class="chip ${selected===x[0]?'on':''}" data-filter="${x[0]}">${x[1]}</button>`).join('')}</div><div class="panel">${board.length?board.map(x=>`<div class="row"><span class="rank">#${x.rank}</span><b>${esc(x.name)}${x.id===id?'（我）':''}</b><span class="gold">${x.score}分</span></div>`).join(''):'<div class="muted center">暂无成绩，先玩一局吧</div>'}</div><div class="muted" style="margin-top:14px">测试排行榜：成绩由客户端提交，不具备正式竞技防作弊能力。</div>`);document.querySelectorAll('[data-period]').forEach(b=>b.onclick=async()=>{period=b.dataset.period;await refresh();render()});document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=async()=>{selected=b.dataset.filter;await refresh();render()})}function rivalPage(){shell(`<div class="section">⚔️ 我的宿敌</div><div class="panel"><div class="muted">通过48小时复仇挑战产生双方历史对战记录。</div>${rivals.length?rivals.map(x=>`<div class="row"><div><b>${esc(x.name)}</b><div class="muted">胜 ${x.wins} · 负 ${x.losses} · 平 ${x.draws}</div></div><span class="gold">${x.wins+x.losses?Math.round(100*x.wins/(x.wins+x.losses))+'%':'—'} 胜率</span></div>`).join(''):'<div class="center" style="padding:35px 0"><div class="big">⚔️</div><div class="muted">还没有宿敌记录，分享一局挑战给好友吧！</div></div>'}</div><button class="btn block" id="play">去挑战好友</button>`);$('play').onclick=()=>{tab='home';render()}}function profile(){shell(`<div class="section">👤 我的资料</div><div class="panel"><label class="muted">玩家昵称</label><input class="field" id="name" maxlength="16" value="${esc(name)}"><button class="btn block" id="save">保存昵称</button><div class="row"><span class="muted">测试玩家ID</span><span class="muted">${id.slice(0,8)}…</span></div><div class="row"><span class="muted">测试版说明</span><span>不含支付</span></div></div>`);$('save').onclick=async()=>{name=$('name').value.trim().slice(0,16)||'玩家';localStorage.pc_name=name;try{await api('profile',{id,name});alert('已保存')}catch(e){alert(e.message)}}}
// 五款新增手机触控游戏；全部为研发演示规则，正式竞技需服务端权威判定。
const SOLO_MEMORY_FLASH=750, SOLO_MEMORY_GAP=200;
const SOLO_MEMORY_STEP=SOLO_MEMORY_FLASH+SOLO_MEMORY_GAP;
function startExtra(){clear();stage='playing';extra={summary:'',points:0};if(game==='memory'){
 extra.seq=Array.from({length:4},()=>Math.floor(Math.random()*9));
 extra.input=0;
 extra.startAt=performance.now()+3000;
 extra.answerAt=extra.startAt+(extra.seq.length-1)*SOLO_MEMORY_STEP+SOLO_MEMORY_FLASH;
 extra.endsAt=extra.answerAt+10000;
 arena();interval=setInterval(updateSoloMemory,30);updateSoloMemory();
}
else if(game==='bomb'){extra.passes=0;extra.bomb=1;extra.remaining=10;extra.explodes=3+Math.floor(Math.random()*5);arena();interval=setInterval(()=>{if(stage!=='playing')return;extra.remaining--;if(extra.remaining<=0){extra.summary=`成功传递 ${extra.passes} 次`;finish(Math.min(100,extra.passes*15));return}arena()},1000)}
else if(game==='mine'){extra.traps=new Set();while(extra.traps.size<2)extra.traps.add(Math.floor(Math.random()*9));extra.open=new Set();extra.points=0;extra.summary='';arena()}}
const soloMemoryColors=['#f26d9e','#65caff','#f6ca62','#70d6a0','#ad92ff','#ff966e','#57d9d4','#ea8091','#bacb73'];
function endSoloMemory(reason){
 extra.summary=reason+' · 答对 '+extra.input+' / 4 格';
 finish(extra.input*25);
}
function updateSoloMemory(){
 const now=performance.now(),elapsed=now-extra.startAt;
 const answering=now>=extra.answerAt;
 if(now>=extra.endsAt){endSoloMemory('时间到');return}
 const lit=!answering&&elapsed>=0&&elapsed%SOLO_MEMORY_STEP<SOLO_MEMORY_FLASH?extra.seq[Math.floor(elapsed/SOLO_MEMORY_STEP)]:-1;
 const status=$('solo-memory-status');
 if(status)status.textContent=answering?'剩余 '+Math.ceil((extra.endsAt-now)/1000)+' 秒 · 已答对 '+extra.input+' / 4 格':elapsed<0?'准备 '+Math.ceil(-elapsed/1000)+' 秒':'记住发光顺序';
 document.querySelectorAll('[data-cell]').forEach(cell=>{
  cell.disabled=!answering;
  cell.classList.toggle('is-lit',Number(cell.dataset.cell)===lit);
 });
}
function extraArena(a){if(game==='memory'){
 a.innerHTML=`<div id="solo-memory-status"></div><div class="memory-colors">${soloMemoryColors.map((color,i)=>`<button type="button" class="memory-cell" style="--cell:${color}" data-cell="${i}" aria-label="第 ${i+1} 格" disabled></button>`).join('')}</div>`;
 a.querySelectorAll('[data-cell]').forEach(button=>button.onclick=()=>{
  const now=performance.now();
  if(now<extra.answerAt)return;
  if(now>=extra.endsAt){endSoloMemory('时间到');return}
  if(Number(button.dataset.cell)!==extra.seq[extra.input]){endSoloMemory('顺序错误');return}
  extra.input+=1;
  if(extra.input===4)endSoloMemory('全部正确');else updateSoloMemory();
 });
 return;
}
if(game==='bomb'){a.innerHTML=`<div class="big">💣</div><div class="big gold">${extra.remaining}s</div><div class="muted">已传递 ${extra.passes} 次 · 每次传递有风险</div><button class="btn block" id="pass">💨 立即传递炸弹</button>`;$('pass').onclick=()=>{extra.passes++;if(extra.passes===extra.explodes){extra.summary=`第 ${extra.passes} 次传递时炸弹爆炸`;finish(Math.min(100,(extra.passes-1)*15));return}extra.remaining=Math.min(10,extra.remaining+1);arena()};return}
if(game==='mine'){a.innerHTML=`<div class="muted">九宫格中有2颗地雷 · 当前 ${extra.points} 分</div><div class="tilegrid">${Array.from({length:9},(_,i)=>`<button class="tile" data-mine="${i}" ${extra.open.has(i)?'disabled':''}>${extra.open.has(i)?'💎':'❔'}</button>`).join('')}</div><button class="btn block" id="cash">💰 见好就收</button>`;a.querySelectorAll('[data-mine]').forEach(b=>b.onclick=()=>{let i=Number(b.dataset.mine);if(extra.traps.has(i)){extra.summary=`踩中地雷，已发现 ${extra.open.size} 个宝石`;finish(0);return}extra.open.add(i);extra.points=Math.min(100,extra.open.size*15);if(extra.open.size===7){extra.summary='全部安全格子已打开';finish(100)}else arena()});$('cash').onclick=()=>{extra.summary=`安全收手，带走 ${extra.points} 分`;finish(extra.points)};return}}

init();
