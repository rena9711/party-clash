window.StackRoom=(()=>{
 const S=window.StackCore;
 let state=null,root=null,socket=null,myId=null,key='',frame=0,offset=0,round=0,waiting=false,solo=false,lastTime=0,cam=0,lastView='',lastRank='',ctx,canvas,stamp='',flashAt=0,localStart=0,soloDone=false;
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let names={};
 function leave(){cancelAnimationFrame(frame);frame=0;key='';state=null;root=null;waiting=false;lastRank='';lastView='';stamp='';cam=0}
 function html(){return '<section class="panel stack-panel" style="padding:12px;max-width:640px;margin:12px auto;text-align:center"><h2 style="margin:6px 0">🧱 叠叠乐</h2><p id="stack-mode-label" style="color:#f7bddb;margin:4px"></p><div style="display:flex;justify-content:space-around;gap:8px;margin:12px 0"><div><small>堆叠层数</small><div id="stack-score" style="font-size:28px;font-weight:800;color:#ffc0df">0</div></div><div><small>剩余时间</small><div id="stack-time" style="font-size:28px;font-weight:800">45s</div></div><div><small>完美连击</small><div id="stack-combo" style="font-size:28px;font-weight:800;color:#ffe4a1">0</div></div></div><div id="stack-status" role="status" style="min-height:28px;color:#ffd0e4;font-size:17px;font-weight:700"></div><canvas id="stack-canvas" aria-label="点击屏幕堆叠方块" style="display:block;width:100%;height:min(48vh,430px);touch-action:none;border-radius:16px;background:radial-gradient(ellipse at center,#52334f,#1b152b);cursor:pointer"></canvas><div id="stack-flash" style="height:24px;color:#ffe4a1;font-weight:bold"></div><button class="btn" id="stack-place" style="width:100%;touch-action:manipulation">点击放下方块</button><div id="stack-rank" style="margin:12px 0;text-align:left"></div><p style="opacity:.7;font-size:12px">点击方块 · 精准重合 · 错位切割</p><a href="/" style="color:#f7bddb">返回大厅</a></section>'}
 function mount(){root.innerHTML=html();canvas=$('stack-canvas');ctx=canvas.getContext('2d');canvas.addEventListener('pointerdown',e=>{e.preventDefault();place()});$('stack-place').addEventListener('click',place);lastTime=performance.now();frame=requestAnimationFrame(draw)}
 function beginSolo(el){leave();root=el;solo=true;soloDone=false;myId='solo';names={solo:'你'};key='solo';localStart=Date.now()+1000;state=S.make('race',['solo'],localStart);offset=0;mount()}
 function enter({room,myId:id,socket:s,root:el}){
  const k=room.code+'-'+room.round;
  if(!room.stack)return;
  if(key!==k){leave();root=el;solo=false;socket=s;myId=id;round=room.round;key=k;state=room.stack;offset=(room.serverNow||Date.now())-Date.now();names=Object.fromEntries(room.players.map(p=>[p.id,p.name]));mount();const sent=Date.now();s.timeout(2000).emit('memory-clock',(err,now)=>{if(!err&&key===k&&Number.isFinite(now))offset=now-(sent+Date.now())/2})}
  else{myId=id;state=room.stack;names=Object.fromEntries(room.players.map(p=>[p.id,p.name]))}
 }
 function receive(data){if(!solo&&state&&data.round===round){state=data.game;waiting=false}}
 function now(){return Date.now()+offset}
 function place(){
  if(!state)return;
  if(solo&&state.finished){beginSolo(root);return}
  if(waiting||state.finished)return;
  const g=state,t=g.towers[g.mode==='turn'?'shared':myId],time=now();
  if(!t||t.done||time<g.start||time>=g.deadline||(g.mode==='turn'&&g.order[g.turn]!==myId))return;
  const seq=g.mode==='turn'?g.version:t.n;
  if(solo){S.act(g,myId,seq,time);return}
  waiting=true;const k=key;
  socket.timeout(1800).emit('stack-drop',{round,seq,pressed:time},(err,result)=>{if(key===k){if(err||!result?.ok)waiting=false;else setTimeout(()=>{if(key===k)waiting=false},250)}})
 }
 const hues=[338,320,295,270,245,215,190,165,145,45,30];
 function paint(t,time,dt,collapse){
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
  ctx.setTransform(w/640,0,0,h/720,0,0);ctx.clearRect(0,0,640,720);
  const top=t.blocks.at(-1),n=t.n;
  const tx=top.x+top.w/2,tz=top.z+top.d/2;
  const target=Math.max(0,(n-7)*28);cam+=(target-cam)*Math.min(1,dt*9);
  function project(x,z,y){return [320+(x-tx-z+tz)*1.20,560+(x-tx+z-tz)*.52-y*1.33+cam]}
  function poly(p,color){ctx.beginPath();p.forEach((q,i)=>i?ctx.lineTo(...q):ctx.moveTo(...q));ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#ffffff18';ctx.lineWidth=1;ctx.stroke()}
  function block(b,i,y=i*21){const {x,z,w,d}=b,hue=hues[i%hues.length],height=21;const a=project(x,z,y+height),c=project(x+w,z,y+height),e=project(x+w,z+d,y+height),f=project(x,z+d,y+height);poly([f,e,project(x+w,z+d,y),project(x,z+d,y)],'hsl('+hue+' 54% 49%)');poly([c,e,project(x+w,z+d,y),project(x+w,z,y)],'hsl('+hue+' 53% 36%)');poly([a,c,e,f],'hsl('+hue+' 76% 75%)')}
  const first=n-t.blocks.length+1;
  t.blocks.forEach((b,i)=>block(b,first+i));
  if(!t.done&&!state.finished&&time>=t.at)block(S.moving(t,time),n+1);
  if(t.cut&&time-t.cut.at<700){const age=Math.max(0,time-t.cut.at)/1000;ctx.save();ctx.globalAlpha=1-age/.7;const c=t.cut;block({...c,x:c.x+age*55,z:c.z+age*20},c.n,c.n*21-age*age*280);ctx.restore()}
 }
 function draw(ts){
  if(!state||!canvas?.isConnected){leave();return}
  const time=now(),g=state,dt=Math.min(.05,(ts-lastTime)/1000);lastTime=ts;
  if(solo)S.tick(g,time);
  let id=myId,t=g.towers[g.mode==='turn'?'shared':id],watch='';
  if(g.mode==='race'&&(!t||t.done)&&!g.finished){const other=S.standings(g).find(x=>x!==id&&!g.towers[x].done);if(other){t=g.towers[other];watch=names[other]||'其他玩家';id=other}}
  if(!t)t=g.towers.shared||Object.values(g.towers)[0];
  if(!t){frame=requestAnimationFrame(draw);return}
  if(lastView!==id){cam=Math.max(0,(t.n-7)*28);lastView=id;stamp=''}
  const own=g.mode==='turn'?g.order[g.turn]===myId:!g.towers[myId]?.done;
  $('stack-mode-label').textContent=g.mode==='turn'?'轮流挑战':'个人竞速';
  $('stack-score').textContent=t.n;$('stack-combo').textContent=t.combo;
  $('stack-time').textContent=Math.max(0,Math.ceil((g.deadline-time)/1000))+'s';
  $('stack-status').textContent=g.finished?'挑战结束':time<g.start?'准备 '+Math.ceil((g.start-time)/1000):watch?'观战 · '+watch:g.mode==='turn'?(own?'轮到你了！':'轮到 '+(names[g.order[g.turn]]||'玩家')):own?'看准时机，点击放置':'等待其他玩家完成';
  const btn=$('stack-place');btn.disabled=!(solo&&g.finished)&&(g.finished||!own||time<g.start||waiting||time>=g.deadline);btn.textContent=solo&&g.finished?'再玩一次':own?'点击放下方块':'等待其他玩家';
  const nextStamp=id+':'+t.n;if(stamp&&stamp!==nextStamp&&t.combo){flashAt=ts+650}stamp=nextStamp;
  $('stack-flash').textContent=ts<flashAt?(t.combo%3===0&&g.mode==='race'?'完美三连击 · 恢复面积':'PERFECT!'):'';
  const ranking=g.mode==='turn'?g.order.map((p,i)=>({p,txt:(g.turn===i&&!g.finished?'操作中 · ':'')+g.counts[p]+' 块'})):S.standings(g).map(p=>({p,txt:g.towers[p].n+' 层'+(g.towers[p].done?' · 已结束':'')}));
  const label=JSON.stringify(ranking);if(label!==lastRank){lastRank=label;$('stack-rank').innerHTML=ranking.map((x,i)=>'<div style="display:flex;justify-content:space-between;background:#ffffff0b;border-radius:10px;padding:8px;margin:5px 0;color:'+(x.p===myId?'#ffc0df':'inherit')+'"><span>'+(i+1)+'. '+esc(names[x.p]||'玩家')+(x.p===myId?'（你）':'')+'</span><b>'+esc(x.txt)+'</b></div>').join('')}
  if(solo&&g.finished&&!soloDone){soloDone=true;try{const best=Math.max(t.n,Number(localStorage.stackBest)||0);localStorage.stackBest=best;$('stack-status').textContent='挑战结束 · 历史最高 '+best+' 层'}catch{}}
  paint(t,time,dt);frame=requestAnimationFrame(draw)
 }
 return {enter,receive,leave,beginSolo}
})();