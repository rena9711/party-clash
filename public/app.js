const socket=io(),root=document.getElementById('app');const clashSession=localStorage.getItem('clashSession')||(crypto.randomUUID?crypto.randomUUID():Date.now().toString(16)+Math.random().toString(16).slice(2));localStorage.setItem('clashSession',clashSession);const games=[['tap','⚡','疯狂手速'],['precision','🎯','完美时机'],['stack','🧱','叠叠乐'],['memory','🧠','记忆爆炸'],['bomb','💥','大爆炸'],['mine','😾','愤怒小猫'],['race','🦊','跑得快'],['snake','🐍','贪吃蛇']];let room=null,myId=null,choice='tap',config=null,local={},timer=null,effect=null,notice='';const $=id=>document.getElementById(id),safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function stop(){if(timer)clearInterval(timer);timer=null}function wrap(body){root.innerHTML=`<header><img class="site-logo" src="/assets/party-clash-neon-logo.webp" alt="Party Clash" width="720" height="240"><div class="room-header-tools"><span class="pill">联机测试版</span><button type="button" class="pc-sound-toggle pc-sound-compact" data-pc-sound aria-label="游戏音效">🔊</button></div></header>${body}<div class="foot">1–10人房间 · 请理性选择惩罚</div>`}const rememberedRoom=code=>localStorage.getItem('clash-room-'+code)==='joined';
function emitAck(event,data,userInitiated=true){
 const requestedGame=new URLSearchParams(location.search).get('game');
 const status=$('identity-feedback');
 const buttons=[...document.querySelectorAll('[data-room-entry]')];
 buttons.forEach(button=>{button.disabled=true});
 socket.timeout(5000).emit(event,{...data,session:clashSession},(error,res)=>{
  if(error||!res?.ok){
   if(data.resume)localStorage.removeItem('clash-room-'+data.code);
   if(!userInitiated&&event==='join'&&data.resume){room=null;myId=null;home()}
   const target=$('identity-feedback')||status;
   $('name')?.dispatchEvent(new Event('input'));
   if(target)target.textContent=res?.error||'连接失败，请重试';
   return;
  }
  myId=res.id;
  if(res.code){
   localStorage.setItem('clash-room-'+res.code,'joined');
   const inviteUrl=roomInviteUrl(res.code);
   const roomUrl=inviteUrl.pathname+inviteUrl.search;
   history.replaceState({},'', window.RaceMulti?.route(roomUrl)??roomUrl);
   document.querySelector('meta[property="og:url"]')?.setAttribute('content',inviteUrl.href);
  }
  if(event==='create'&&games.some(g=>g[0]===requestedGame))socket.emit('select-game',{game:requestedGame});
  if(room)showRoom();
 });
}
function home(){
 const invite=(new URLSearchParams(location.search).get('room')||'').toUpperCase();
 wrap(`<div class="center"><div class="hero">🎮⚡</div><h1>聚会，开战！</h1><p class="muted">8款游戏 · 趣味互动 · 实时排行榜</p></div>
 <form id="identity-form" class="panel" novalidate>
  <h2><label for="name">请输入你的名字</label></h2>
  <input id="name" name="name" placeholder="输入你的昵称" autocomplete="off" required aria-describedby="identity-feedback">
  <p id="identity-feedback" role="status" class="muted"></p>
  ${invite||new URLSearchParams(location.search).has('join')?'':'<button class="btn" id="create" type="button" data-room-entry disabled>确认并创建房间</button>'}
  <label for="code">房间码</label>
  <input id="code" placeholder="输入6位房间码" maxlength="6" value="${safe(invite)}">
  <button class="btn secondary" id="join" type="submit" data-room-entry disabled>确认并加入房间</button>
 </form>`);
 const name=$('name'),code=$('code'),feedback=$('identity-feedback'),create=$('create'),join=$('join');
 function refreshEntry(showError){
  const result=PartyIdentity.validateName(name.value);
  if(showError)feedback.textContent=name.value?result.error||'':'';
  const invalid=Boolean(result.error);
  if(create)create.disabled=invalid;
  join.disabled=invalid||!(/^[a-f0-9]{6}$/i.test(code.value.trim()));
  return result;
 }
 name.oninput=()=>refreshEntry(true);
 code.oninput=()=>refreshEntry(false);
 if(create)create.onclick=()=>{const result=refreshEntry(true);if(!result.error)emitAck('create',{name:result.name})};
 $('identity-form').onsubmit=event=>{
  event.preventDefault();
  const result=refreshEntry(true);
  if(!join.disabled)emitAck('join',{name:result.name,code:code.value.trim()});
 };
}
function leaveRoom(toHome=false){
 if(room.passMode&&room.host===myId){location.assign('/');return}
 const disbanding=room.host===myId;
 if(!confirm(disbanding?'确认解散房间？所有玩家都会返回大厅。':'确认离开房间？之后可以用房间码重新加入。'))return;
 socket.timeout(3500).emit('leave-room',(error,result)=>{
  if(error||!result?.ok){alert(result?.error||'连接失败，请重试');return}
  localStorage.removeItem('clash-room-'+room.code);
  if(disbanding||toHome===true){location.replace('/');return}
  history.replaceState({},'', window.RaceMulti?.route('/multiplayer.html')??'/multiplayer.html');
  room=null;myId=null;config=null;home();
 });
}
function raceReady(){
 return room.players.filter(player=>player.online!==false).every(player=>player.character);
}
function stackModeMarkup(mode,host,multi){
 return '<h3 style="margin:0 0 12px;color:#ffc0df">🧱 选择叠叠乐模式</h3><div style="display:grid;gap:10px"><button type="button" class="tile '+(mode==='race'?'selected':'')+'" data-stack-mode="race" '+(!host?'disabled':'')+' style="text-align:left;padding:14px;min-height:72px">⚡ 层层攀升 '+(mode==='race'?'✓':'')+'<br><small>各自叠塔 · 45秒 · 越高越强</small></button><button type="button" class="tile '+(mode==='turn'?'selected':'')+'" data-stack-mode="turn" '+(!host?'disabled':'')+' style="text-align:left;padding:14px;min-height:72px">🔥 叠你一刀 '+(mode==='turn'?'✓':'')+'<br><small>共用一座塔 · 故意切细 · 谁失误谁输</small></button></div>'+(!multi?'<p class="muted">可先选择叠你一刀，至少2位玩家在线即可开始。</p>':'')+(host?'':'<p class="muted">由房主选择模式</p>');
}
function openStackMode(){
 if(room.host!==myId)return;
 document.getElementById('stack-mode-dialog')?.remove();
 const dialog=document.createElement('div');dialog.id='stack-mode-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.style.cssText='position:fixed;inset:0;z-index:1000;background:#100b1dcc;display:flex;align-items:center;justify-content:center;padding:18px';
 const panel=document.createElement('section');panel.className='panel';panel.style.cssText='width:100%;max-width:420px;background:#30233f;border:1px solid #bd83b2;border-radius:22px;padding:20px';
 panel.innerHTML=stackModeMarkup(null,true,room.players.filter(p=>p.online!==false).length>1)+'<button type="button" class="btn secondary" id="stack-mode-cancel">取消</button>';dialog.append(panel);document.body.append(dialog);
 panel.querySelector('#stack-mode-cancel').onclick=()=>dialog.remove();dialog.onclick=e=>{if(e.target===dialog)dialog.remove()};
 for(const btn of panel.querySelectorAll('[data-stack-mode]'))btn.onclick=()=>{const mode=btn.dataset.stackMode;dialog.remove();socket.emit('select-game',{game:'stack',mode});};
}
function stackModePicker(host){
 if(choice!=='stack')return;
 const box=document.createElement('section');box.className='panel';box.id='stack-mode-options';box.style.cssText='border:1px solid #c18bb5;margin:12px 0;padding:14px';
 const mode=room.stackMode||'race',multi=room.players.filter(p=>p.online!==false).length>1;
 box.innerHTML=stackModeMarkup(mode,host,multi);
 const tile=document.querySelector('[data-game="stack"]'),anchor=tile?.parentElement||$('start')||$('leave-room');if(anchor)anchor.before(box);
 for(const btn of box.querySelectorAll('[data-stack-mode]'))btn.onclick=()=>socket.emit('stack-mode',{mode:btn.dataset.stackMode});
 if(host&&$('start')&&mode==='turn'&&!multi){$('start').disabled=true;$('start').textContent='等待至少2位玩家'}
}
function gameChooser(host,next){
 const selected=games.find(g=>g[0]===choice)||games[0];
 const hostName=safe(room.players.find(p=>p.id===room.host)?.name||'房主');
 return '<section class="panel room-game-choice"><h3>'+ (next?'选择下一局游戏':'选择游戏')+'</h3><p class="muted">'+(host?'你是房主，由你决定游戏':'👑 '+hostName+' 正在选择游戏')+'</p><div class="grid">'+games.map(g=>'<button type="button" class="tile '+(choice===g[0]?'selected':'')+'" data-game="'+g[0]+'" aria-pressed="'+String(choice===g[0])+'" '+(host?'':'disabled')+'><span>'+g[1]+'</span>'+g[2]+(choice===g[0]?'<small class="room-game-selected">✓ 已选择</small>':'')+'</button>').join('')+'</div><p class="room-game-current" role="status">当前选择：'+selected[1]+' '+selected[2]+(choice==='stack'?' · '+(room.stackMode==='turn'?'叠你一刀':'层层攀升'):'')+'</p>'+(host?'<button class="btn" id="start" '+(choice==='race'&&!raceReady()?'disabled':'')+'>'+(next?'下一局 →':room.players.filter(p=>p.online!==false).length===1?'开始单人测试':'⚡ 全员同步开始')+'</button>':'<div class="status">等待房主开始'+(next?'下一局':'游戏')+'…</div>')+'</section>';
}
function bindRoomControls(host){
 stackModePicker(host);
 if(room.selectedGame==='race'&&document.querySelector('.character-picker'))RoomCharacters.bind(room,myId,socket);
 if(host&&$('start'))$('start').onclick=()=>socket.emit('start',{game:choice});
 $('leave-room').onclick=leaveRoom;
 if(room.passMode&&host)$('leave-room').textContent='返回大厅';
 window.RoomPass?.render(room,host,socket);
}
const rules={
 tap:'在倒计时内尽可能多地点按，点击次数最少的玩家接受惩罚。',
 precision:'指针越靠近中心，得分越高。三次机会取最高分。',
 stack:'点击屏幕堆叠移动方块，错位部分会被切除。',
 memory:'记住格子闪亮的顺序。看到“开始作答”后，按相同顺序点击。',
 bomb:'随机选一人先猜，之后轮流猜。只能选两个边界之间的整数，猜中炸弹就输。',
 mine:'20 只小猫里有一只会炸毛。每按一只得 10 分，至少按一次才能传给下一位。引爆的人接受惩罚，积分保留。',
 race:'左右移动躲避障碍，跳过跨栏并收集星星。进入赛道后可开启体感。',
 snake:'拖动摇杆转向，吃光点得分。避开边界和其他蛇身。'
};
function showRules(){document.getElementById('stack-mode-dialog')?.remove();
 const players=room.players.filter(p=>p.online!==false);
 const ready=players.find(p=>p.id===myId)?.ready;
 const intro=choice==='stack'&&window.StackGuide?window.StackGuide.markup(room.stackMode==='turn'?'turn':'race'):'<h2>'+games.find(g=>g[0]===choice)[2]+'</h2><p>'+rules[choice]+'</p>';
 wrap('<section class="panel center">'+intro+'<button class="btn" id="confirm-start" '+(ready?'disabled':'')+'>'+(ready?'等待其他玩家':choice==='stack'?'我明白了，开始':'开始')+'</button><p>'+players.filter(p=>p.ready).length+' / '+players.length+' 人已准备</p></section><button class="btn secondary" id="leave-room">离开房间</button>');
 $('confirm-start').onclick=()=>socket.emit('rules-ready',{round:room.round});
 $('leave-room').onclick=leaveRoom;
 if(room.passMode&&room.host===myId)$('leave-room').textContent='返回大厅';
}
function playMine(){
 stop();
 const b=room.bomb,wait=room.startsAt-Date.now(), own=b.turnId===myId && wait<=0;
 const name=room.players.find(p=>p.id===b.turnId)?.name;
 const used=new Set(b.history.map(h=>h.number));
 const players=room.players.map(p=>({name:p.name,points:p.minePoints||0}));
 wrap(`<h2>😾 愤怒小猫</h2><p>${wait>0?'即将开始':own?'轮到你了':'轮到 '+safe(name)} · 剩余 ${20-used.size} 只</p>${MineBoard.grid(used,own)}<button class="btn" id="pass" ${own&&b.picks?'':'disabled'}>传给下一位</button>${MineBoard.ranking(players)}`);
 root.querySelectorAll('[data-cell]').forEach(el=>el.onclick=()=>socket.emit('mine-action',{cell:Number(el.dataset.cell),round:room.round}));
 $('pass').onclick=()=>socket.emit('mine-action',{pass:true,round:room.round});
 if(wait>0)timer=setTimeout(playMine,wait+5);
}
let revealed='';
function roundResults(r){const ordered=r.results||[];return Array.isArray(r.roundPlayerIds)&&r.roundPlayerIds.length?ordered.filter(p=>r.roundPlayerIds.includes(p.id)):ordered}
function isMultiplayerRound(r,ordered){return (Array.isArray(r.roundPlayerIds)&&r.roundPlayerIds.length?r.roundPlayerIds.length:ordered.length)>1&&ordered.length>1}
function revealLoser(ordered){
 if(!isMultiplayerRound(room,ordered))return;
 const key=room.code+'-'+room.round;
 if(revealed===key||!ordered.length)return;
 revealed=key;
 const overlay=document.createElement('div');
 const mine=room.game==='mine';
 const stack=room.game==='stack';
 const loser=stack?ordered.find(p=>p.stackLost):mine||room.game==='bomb'?ordered.find(p=>p.exploded):ordered.at(-1);
 if(!loser)return;
 overlay.className='punishment'+(mine?' mine-detonation':'');
 overlay.innerHTML='<div>'+(stack?'<span style="display:inline-block;animation:stack-collapse .65s ease-in both">🧱</span><style>@keyframes stack-collapse{0%{transform:scale(1) rotate(0)}40%{transform:scale(1.35) rotate(-15deg)}100%{transform:scale(.85) rotate(26deg)}}</style>':mine?MineBoard.face():'<span>💣</span>')+'<strong>💥</strong><h2>恭喜'+safe(loser.name)+'，请接收惩罚</h2><button class="btn">查看排行榜</button></div>';
 document.body.append(overlay);
 overlay.querySelector('button').onclick=()=>overlay.remove();
}
function showRoom(){if(!room){window.StackRoom?.leave();return home()}if(room.phase!=='playing'||room.game!=='stack')window.StackRoom?.leave();if(room.phase!=='playing'||room.game!=='race')window.RaceMulti?.leave();if(room.phase!=='playing'||room.game!=='snake')window.SnakeRoom?.leave();if(room.phase!=='playing'||room.game!=='memory')window.MemoryMulti?.leave();let host=room.host===myId;choice=games.some(g=>g[0]===room.selectedGame)?room.selectedGame:'tap';if(room.phase==='rules')return showRules();if(room.phase==='playing'){if(!config||config.game!==room.game){config={game:room.game,startsAt:room.startsAt,endsAt:room.endsAt,seed:0};}return play()}if(room.phase==='results'){return results()}wrap(`<div class="center"><span class="pill">房间码：${room.code}</span><p class="muted">点击下方按钮，分享专属入场链接</p><h2>准备开战？</h2><p class="muted">${room.players.filter(p=>p.online!==false).length}/10 位玩家在线</p></div><div class="panel"><b>玩家列表</b>${room.players.map(p=>`<div class="person"><span>${p.id===room.host?'👑':'🎮'} ${safe(p.name)}${p.id===myId?' (你)':''}${p.online===false?'（暂时离线）':''}</span><b>${p.score}分</b></div>`).join('')}</div>${gameChooser(host,false)}${choice==='race'?RoomCharacters.markup(room,myId):''}<section class="room-pass" id="room-pass" hidden></section><button class="btn secondary" id="copy">复制邀请链接</button><button class="btn secondary" id="leave-room">离开房间</button>`);document.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>{if(room.host!==myId)return;if(b.dataset.game==='stack'){openStackMode();return}choice=b.dataset.game;socket.emit('select-game',{game:choice});showRoom()});bindRoomControls(host);$('copy').onclick=()=>shareRoom()}
function roomInviteUrl(code){
 const url=new URL('/multiplayer.html',location.origin);
 url.searchParams.set('room',code);
 const version=document.querySelector('meta[name="party-clash:invite-version"]')?.content;
 if(version)url.searchParams.set('invite',version);
 return url;
}
async function shareRoom(){
 const code=room?.code;
 if(!code)return;
 const url=roomInviteUrl(code).href;
 const title=document.title;
 const text=document.querySelector('meta[property="og:description"]')?.content;
 try{
  if(navigator.share){await navigator.share({title,text,url});return}
 }catch(e){if(e.name==='AbortError')return}
 try{
  await navigator.clipboard.writeText(url);
  alert('邀请链接已复制，发给好友即可直接入场');
 }catch(e){prompt('复制入场链接（房间码：'+code+'）',url)}
}
function personalResult(ordered){
 const index=ordered.findIndex(p=>p.id===myId);
 if(index<0)return '';
 const p=ordered[index],rank='第 '+(index+1)+' 名';
 let label='本局排名',value=rank;
 switch(room.game){
  case 'tap':label='点击次数';value=p.value+' 次';break;
  case 'precision':label='最佳命中';value=p.value+' 分';break;
  case 'race':label='收集星星';value=(p.stars ?? 0)+' 颗';break;
  case 'mine':case 'bomb':if(room.bomb?.finished){label=room.game==='mine'?'排雷结果':'猜数结果';value=p.exploded?'引爆炸弹':'安全过关'}break;
  case 'snake':if(Number.isFinite(p.foods)){label='吃豆数量';value=p.foods+' 颗'}break;
  case 'memory':if(Number.isFinite(p.correctCells)){label='累计答对';value=p.correctCells+' 格'}break;
  case 'stack':label=p.stackMode==='turn'?'成功放置':'堆叠层数';value=p.value+(p.stackMode==='turn'?' 块':' 层');break;
  case 'reaction':if(Number.isFinite(local.elapsedMs)){label='反应时间';value=local.elapsedMs+' 毫秒'}break;
 }
 return `<div class="panel center"><div class="muted">${label}</div><strong class="round-primary">${value}</strong><div class="muted">本局得分 ${room.game==='race'?(p.value ?? 0):p.earned} 分</div></div>`;
}
function results(){let ordered=roundResults(room),multi=isMultiplayerRound(room,ordered);if(!multi)document.querySelector('.punishment')?.remove();wrap(`<div class="center"><div class="hero">${multi&&room.game==='bomb'?'💥':'🏆'}</div><h2>${multi?'第 '+room.round+' 局结果':'游戏结束'}</h2>${room.game==='bomb'?`<p class="muted">${room.bomb?.loser?(multi?'💥 爆炸数字：':'目标数字：')+room.bomb.secret:'本轮无人猜中炸弹数字'}</p>`:''}</div>${personalResult(ordered)}${multi?`<div class="panel">${ordered.map((p,i)=>`<div class="person"><span>${['🥇','🥈','🥉'][i]||i+1} ${safe(p.name)}${room.game==='race'?` · ${RoomCharacters.icon(p.character)} · ${p.stars ?? 0} 颗星 · ${p.value ?? 0} 分`:room.game==='bomb'?(p.exploded?' · 💥 猜中炸弹':' · ✅ 安全') :room.game==='stack'?' · '+p.value+(p.stackMode==='turn'?' 块':' 层')+(p.stackLost?' · 挑战失败':''):room.game==='tap'?' · '+p.value+' 次':p.champion?' · 冠军':room.game==='snake'?' · '+p.value+' 分':''}</span>${room.game==='race'?'':`<b>+${p.earned}</b>`}</div>`).join('')}</div>`:''}${multi?`<div class="status">${room.game==='stack'&&ordered[0]?.stackMode==='turn'?'堆叠失败的玩家':room.game==='mine'?'引爆的玩家':'最后一名'}可以自选惩罚或由任意玩家指定惩罚，成年人自愿小酌。</div>`:''}<div class="panel"><b>累计积分</b>${[...room.players].filter(p=>multi||p.id===myId).sort((a,b)=>b.score-a.score).map(p=>`<div class="person"><span>${safe(p.name)}</span><b>${p.score}</b></div>`).join('')}</div>${gameChooser(room.host===myId,true)}${choice==='race'?RoomCharacters.markup(room,myId):''}<section class="room-pass" id="room-pass" hidden></section><button class="btn secondary" id="leave-room">离开房间</button>`);document.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>{if(room.host!==myId)return;if(b.dataset.game==='stack'){openStackMode();return}choice=b.dataset.game;socket.emit('select-game',{game:choice});results()});bindRoomControls(room.host===myId);revealLoser(ordered)}
function finish(v){if(local.submitted)return;local.submitted=true;stop();socket.emit('submit',{value:Math.max(0,Math.round(v))});renderArena()}function play(){if(config.game==='stack'){stop();return window.StackRoom.enter({room,myId,socket,root})}if(config.game==='mine')return playMine();if(config.game==='race')return playRace();if(config.game==='memory'){stop();return MemoryMulti.enter({room,myId,socket,root})}if(config.game==='snake'){stop();return SnakeRoom.enter({room,myId,socket,root})}if(config.game==='bomb')return playBomb();let g=games.find(x=>x[0]===config.game),now=Date.now(),remain=Math.max(0,Math.ceil((config.endsAt-now)/1000)),wait=Math.max(0,Math.ceil((config.startsAt-now)/1000));wrap(`<div class="center"><span class="pill">第 ${room.round} 局 · ${room.players.length} 位玩家</span><h2>${g[1]} ${g[2]}</h2><div class="big" id="clock">${wait?'准备 '+wait:remain+'s'}</div></div><div class="panel"><div class="arena" id="arena"></div></div><div class="panel"><b>🎭 指定陷害对手</b><div class="row" style="margin:10px 0"><select id="target" style="width:100%;padding:10px;background:#292341;color:white;border-radius:9px">${room.players.filter(p=>p.id!==myId).map(p=>`<option value="${p.id}">${safe(p.name)}</option>`).join('')}</select></div><div class="grid">${[['freeze','🧊冰封'],['reverse','🔄反转'],['ghost','👻遮挡'],['steal','💰偷分'],['shield','🛡️护盾']].map(x=>`<button class="tile" style="min-height:49px" data-card="${x[0]}">${x[1]}</button>`).join('')}</div><p class="muted">每局只可发动一次；护盾可抵挡攻击。</p></div><div id="notice" class="status" style="display:none"></div><div class="muted">已完成：${room.players.filter(p=>p.submitted).length}/${room.players.length}</div>`);document.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>{if(Date.now()<config.startsAt)return;socket.emit('attack',{target:$('target').value,card:b.dataset.card});b.disabled=true;document.querySelectorAll('[data-card]').forEach(x=>x.disabled=true)});renderArena();stop();timer=setInterval(()=>{if(!room||room.phase!=='playing'){stop();return}const n=Date.now();if($('clock'))$('clock').textContent=n<config.startsAt?'准备 '+Math.ceil((config.startsAt-n)/1000):Math.max(0,Math.ceil((config.endsAt-n)/1000))+'s';if(n>=config.startsAt&&!local.started){local.started=true;renderArena()}if(n>=config.endsAt&&!local.submitted)finish(score());if(config.game==='reaction'&&local.started&&!local.greenShown&&n>=local.greenAt){local.greenShown=true;local.greenPerf=performance.now();renderArena()}if(config.game==='precision'&&local.started&&!local.submitted){local.pos=(Math.sin((performance.now()-local.base)/400)+1)*50;let el=$('needle');if(el)el.style.left=local.pos+'%'}if(config.game==='bomb'&&local.started&&!local.submitted&&n-local.lastBomb>1700){local.lastBomb=n;if(local.holder!==0)local.holder=Math.random()>.4?0:1;renderArena()}},80)}
function playRace(){stop();if(!window.RaceMulti){wrap('<div class="status">正在加载多人跑酷…</div>');return}RaceMulti.enter({room,myId,socket,root})}
function playBomb(){stop();const b=room?.bomb;if(!b){wrap('<div class="status">💣 数字炸弹正在准备…</div>');return}
const myTurn=b.turnId===myId,active=Date.now()>=room.startsAt,actor=room.players.find(p=>p.id===b.turnId),history=b.history||[];
wrap(`<div class="center"><span class="pill">💣 大爆炸 · 轮流猜数字</span><div class="bomb-ball">💣</div><h2 class="bomb-range">${b.low} — ${b.high}</h2><p class="muted">系统已经藏好一个 1–100 的数字，猜中就爆炸！</p></div><div class="panel bomb-panel"><div class="status">${active?(myTurn?'🎯 轮到你猜！':`等待 ${safe(actor?.name||'下一位玩家')} 猜数字…`):'⏳ 即将开始…'}</div>${myTurn&&active?`<label for="bomb-number" class="muted">左右拖动滑杆，选择你要猜的数字</label><div class="bomb-picked" id="bomb-picked">${Math.floor((b.low+b.high)/2)}</div><input id="bomb-number" class="bomb-slider" aria-label="拖动选择猜测数字" type="range" min="${b.low+1}" max="${b.high-1}" value="${Math.floor((b.low+b.high)/2)}" step="1"><div class="bomb-slider-ends"><span>${b.low}</span><span>${b.high}</span></div><button id="bomb-send" class="btn">💣 确认猜测</button>`:'<p class="center muted">每位玩家轮流猜一次，范围会越来越小。</p>'}</div><div class="panel"><b>📝 猜测记录</b>${history.length?history.slice().reverse().map(h=>`<div class="person"><span>${safe(h.name)} 猜 <b>${h.number}</b></span><span>${h.result==='boom'?'💥 爆炸':h.result==='lower'?'⬇️ 缩小上限':'⬆️ 提高下限'}</span></div>`).join(''):'<p class="muted">等待第一位玩家猜数字…</p>'}</div><p class="muted center">猜中数字的玩家爆炸，其余玩家获胜。</p>`);
if(!active){stop();timer=setInterval(()=>{if(room?.phase!=='playing'||room?.game!=='bomb'){stop();return}if(Date.now()>=room.startsAt){stop();playBomb()}},100)}if($('bomb-send')){const send=()=>{const el=$('bomb-number'),n=Number(el.value);if(!Number.isInteger(n)||n<=b.low||n>=b.high){alert('请选择 '+b.low+' 至 '+b.high+' 之间的整数');return}socket.emit('bomb-guess',{number:n});$('bomb-send').disabled=true};$('bomb-send').onclick=send;$('bomb-number').addEventListener('input',e=>{$('bomb-picked').textContent=e.target.value});$('bomb-number').onkeydown=e=>{if(e.key==='Enter')send()}}
}
function score(){switch(config.game){case'tap':return local.hits;case'precision':return local.best;case'reaction':return local.reaction||0;case'bomb':return local.holder===0?0:90;case'mine':return local.hits*12;default:return 0}}
function renderArena(){let a=$('arena');if(!a)return;let s=local,active=s.started&&!s.submitted,disabled=active?'':'disabled',html='';if(s.submitted){a.innerHTML='<div class="hero">✅</div><h2>已提交！</h2><p class="muted">等待其他玩家完成…</p>';return}switch(config.game){case'tap':html=`<button class="tap" id="tap" ${disabled}>快点！</button><div>点击 ${s.hits} 次</div>`;break;case'precision':html=`<div class="big">${s.tries}/3</div><div class="meter"><div class="needle" id="needle" style="left:${s.pos}%"></div></div><button class="btn" id="hit" ${disabled}>🎯 停！</button><div>最佳 ${s.best} 分</div>`;break;case'reaction':html=`<div class="hero">${!active?'🟡':s.greenShown?'🟢':'🔴'}</div><button class="btn" id="react" ${disabled}>⚡ 按！</button><p class="muted">红灯不能偷按</p>`;break;break;}a.innerHTML=html;bindArena()}
function bindArena(){let s=local,g=config.game;if($('tap')){const button=$('tap');const press=()=>{if(!s.started||s.submitted||button.disabled)return;s.hits++;socket.emit('tap-count',{round:room.round,count:s.hits});$('arena').querySelector('div').textContent='点击 '+s.hits+' 次'};if(window.PointerEvent){button.onpointerdown=e=>{if(e.isPrimary===false||e.button!==0)return;e.preventDefault();press()};button.onclick=e=>{if(e.detail===0)press()}}else button.onclick=press;}if($('hit'))$('hit').onclick=()=>{s.tries++;s.best=Math.max(s.best,100-Math.abs(s.pos-50)*2);if(s.tries>=3)finish(s.best);else renderArena()};if($('react'))$('react').onclick=()=>{if(!s.greenShown){finish(0);return}s.elapsedMs=Math.round(performance.now()-s.greenPerf);s.reaction=Math.max(0,100-s.elapsedMs/9);finish(s.reaction)}}

function startLocal(){local={started:false,submitted:false,hits:0,tries:0,best:0,pos:0,base:performance.now(),reaction:0,lane:1,hazard:0,lastHazard:Date.now(),holder:0,lastBomb:Date.now(),note:'',open:[],mine:config.seed%9};if(config.game==='reaction'){local.greenAt=config.startsAt+1200+(config.seed%2500);local.greenPerf=performance.now()+(local.greenAt-Date.now())}}
socket.on('room-pass-required',message=>window.RoomPass?.feedback(message));
socket.on('room-closed',()=>{if(room)localStorage.removeItem('clash-room-'+room.code);location.replace('/')});
socket.on('stack-state',data=>window.StackRoom?.receive(data));socket.on('snake-state',data=>SnakeRoom.receive(data));socket.on('memory-state',data=>MemoryMulti.receive(data));socket.on('race-state',data=>window.RaceMulti?.receive(data));socket.on('room',r=>{const previous=room;if(previous?.code===r.code&&previous?.phase==='playing'&&r.phase==='results')window.PartySound?.play('finish');room=r;if(!myId&&r.players.some(p=>p.id===socket.id))myId=socket.id;if(room.phase!=='playing')stop();if(room.phase!=='results')document.querySelector('.punishment')?.remove();showRoom()});socket.on('game-config',c=>{window.PartySound?.play('start');config=c;startLocal();if(room?.phase==='playing')showRoom()});socket.on('effect',e=>{effect=e;notice=`${e.from} 对你使用 ${e.card}！`;const n=$('notice');if(n){n.style.display='block';n.textContent=notice}if(e.card==='freeze'){const a=$('arena');if(a){a.style.pointerEvents='none';setTimeout(()=>a.style.pointerEvents='',1200)}}if(e.card==='ghost'){const a=$('arena');if(a){a.style.filter='blur(7px)';setTimeout(()=>a.style.filter='',1200)}}});socket.on('notice',t=>{notice=t;alert(t)});socket.on('disconnect',()=>{window.RaceMulti?.disconnect();notice='连接暂时中断，恢复网络后将自动重连'});socket.on('connect',()=>{const invite=new URLSearchParams(location.search).get('room');if(invite&&/^[A-F0-9]{6}$/i.test(invite)&&rememberedRoom(invite.toUpperCase()))emitAck('join',{resume:true,code:invite.toUpperCase()},false)});home();
