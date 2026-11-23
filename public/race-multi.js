/* 跑得快 Multiplayer playfield */
window.RaceMulti=(()=>{
 const q=id=>document.getElementById(id),clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 let active=false,room='',round=0,socket,me='',root,canvas,ctx,state=null,raf=0,pointer=null,startX=0,startLane=1,lane=1,boost=false,visualLane=1,previousHits=null,previousStars=null;
 function leave(){active=false;cancelAnimationFrame(raf);raf=0;state=null;pointer=null;boost=false;document.body.classList.remove('rm-active')}
 function emit(fields){if(active&&socket)socket.emit('race-input',fields)}
 function enter({room:rm,myId,socket:sk,root:mount}){
  if(active&&room===rm.code&&round===rm.round){me=myId;return}
  leave();active=true;room=rm.code;round=rm.round;me=myId;socket=sk;root=mount;lane=1;visualLane=1;previousHits=null;previousStars=null;document.body.classList.add('rm-active');
  root.innerHTML='<div id="rm-root"><canvas class="race-surface" id="rm-canvas"></canvas><div id="rm-hud"><div id="rm-head"><span>⏱ <b id="rm-clock">30.0</b>s</span><span>⭐ <b id="rm-stars">0</b>颗 <span id="rm-gain"></span></span><span id="rm-hp" aria-label="生命">♥♥♥</span><span>🏆 第<b id="rm-rank">-</b>名</span></div><div id="rm-meter"><div id="rm-meter-fill"></div></div><div id="rm-tip">即将开跑…</div><div id="rm-board"></div></div><div id="rm-pad"><div id="rm-actions"><div class="race-touch"><button id="rm-left" aria-label="向左换道">←</button><button id="rm-right" aria-label="向右换道">→</button></div><button id="rm-jump">⬆ 跳跃</button><button id="rm-boost">🔥 加速</button></div><div id="rm-joy"><div id="rm-knob"></div><span>左右移动</span></div></div><div class="race-blast" id="rm-blast"></div></div>';
  canvas=q('rm-canvas');ctx=canvas.getContext('2d');
  const joy=q('rm-joy'),knob=q('rm-knob'),boostBtn=q('rm-boost');
  joy.addEventListener('pointerdown',e=>{e.preventDefault();pointer=e.pointerId;startX=e.clientX;startLane=lane;try{joy.setPointerCapture(e.pointerId)}catch{}});
  joy.addEventListener('pointermove',e=>{if(e.pointerId!==pointer)return;e.preventDefault();const dx=e.clientX-startX;knob.style.transform='translate(calc(-50% + '+clamp(dx,-38,38)+'px),-50%)';const to=clamp(startLane+Math.round(dx/34),0,2);if(to!==lane){lane=to;emit({lane})}});
  const joyUp=e=>{if(e.pointerId!==pointer)return;pointer=null;knob.style.transform='translate(-50%,-50%)'};
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(ev,joyUp);
  q('rm-jump').addEventListener('pointerdown',e=>{e.preventDefault();emit({jump:true})});
  boostBtn.addEventListener('pointerdown',e=>{e.preventDefault();boost=true;emit({boost:true});try{boostBtn.setPointerCapture(e.pointerId)}catch{}});
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])boostBtn.addEventListener(ev,()=>{if(boost){boost=false;emit({boost:false})}});
  const move = delta => {lane=clamp(lane+delta,0,2);emit({lane})};
  q('rm-left').onclick=()=>move(-1);
  q('rm-right').onclick=()=>move(1);
  RaceTouch.bind(canvas,move,()=>emit({jump:true}));
  raf=requestAnimationFrame(draw);
 }
 function receive(data){if(!active||!data||!Array.isArray(data.runners))return;state=data;const p=data.runners.find(x=>x.id===me);if(p){if(previousStars===null)lane=p.lane;q('rm-stars').textContent=p.stars;q('rm-hp').textContent='♥'.repeat(p.hp)+'♡'.repeat(3-p.hp);if(previousStars!==null&&p.stars>previousStars)RaceTouch.gain(q('rm-gain'),p.stars-previousStars);if(previousHits!==null&&p.hits>previousHits)RaceTouch.flash(q('rm-blast'));previousStars=p.stars;previousHits=p.hits;q('rm-meter-fill').style.width=p.energy+'%';const rankings=[...data.runners].sort((a,b)=>b.stars-a.stars||b.p-a.p);q('rm-rank').textContent=rankings.findIndex(x=>x.id===me)+1;const auto=Date.now()<p.autoUntil;q('rm-tip').textContent=p.hp<=0?'💥 已撞倒，等待本局结算':auto?'🔥 集满5颗星星！自动喷火加速中！':p.stars%5+'/5 颗星星 · 集满5颗自动加速';}
  const now=Date.now();q('rm-clock').textContent=(Math.max(0,(data.endsAt-Math.max(now,data.startsAt))/1000)).toFixed(1);
  const rows=[...data.runners].sort((a,b)=>b.stars-a.stars||b.p-a.p);
  q('rm-board').innerHTML=rows.map((x,i)=>'<div class="rm-entry '+(x.id===me?'you':'')+'">'+(i+1)+'. '+x.animal+' '+escapeHtml(x.name)+' <strong>'+x.stars*10+'分</strong></div>').join('');
 }
 function escapeHtml(t){return String(t||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
 function draw(ts){if(!active)return;raf=requestAnimationFrame(draw);let w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,devicePixelRatio||1);if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr)){canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr)}ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);let g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#25213b');g.addColorStop(.5,'#49354b');g.addColorStop(1,'#25282c');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  const horizon=h*.22,foot=h*.86,topW=w*.37,bottomW=w*.98;ctx.fillStyle='#2b4338';ctx.fillRect(0,horizon,w,h-horizon);
  ctx.fillStyle='#56505b';ctx.beginPath();ctx.moveTo(w/2-topW/2,horizon);ctx.lineTo(w/2+topW/2,horizon);ctx.lineTo(w/2+bottomW/2,foot);ctx.lineTo(w/2-bottomW/2,foot);ctx.fill();
  for(let i=1;i<3;i++){ctx.strokeStyle='#e6d6bb88';ctx.lineWidth=2;ctx.setLineDash([13,14]);ctx.beginPath();ctx.moveTo(w/2-topW/2+topW*i/3,horizon);ctx.lineTo(w/2-bottomW/2+bottomW*i/3,foot);ctx.stroke()}ctx.setLineDash([]);
  if(!state)return;
  const p=state.runners.find(x=>x.id===me);if(!p)return;
  const now=Date.now(),clock=Math.max(0,(state.endsAt-Math.max(now,state.startsAt))/1000);q('rm-clock').textContent=clock.toFixed(1);
  const lerpPos=(l,d)=>{const z=clamp(d/235,0,1),v=Math.pow(1-z,1.32);const width=topW*(1-v)+bottomW*v;return {x:w/2+(l-1)*width/3,y:horizon+(foot-horizon)*v,s:Math.max(.19,v*1.12)}};
  const objects=[];
  for(const ob of state.obstacles||[]){const d=ob.p-p.p;if(d>=-14&&d<235)objects.push({...lerpPos(ob.l,d),kind:'bomb'})}
  const collected=new Set(p.taken||[]); // client may omit taken; stars in lane remain cosmetic
  for(const star of state.stars||[]){const d=star.p-p.p;if(d>=-14&&d<235&&!collected.has(star.id))objects.push({...lerpPos(star.l,d),kind:'star'})}
  for(const other of state.runners){if(other.id===me)continue;const d=other.p-p.p;if(d>=-28&&d<235)objects.push({...lerpPos(other.lane,d),kind:'animal',animal:other.animal,name:other.name})}
  objects.sort((a,b)=>a.s-b.s);
  ctx.textAlign='center';ctx.textBaseline='middle';for(const ob of objects){ctx.font=Math.round((ob.kind==='bomb'?58:ob.kind==='star'?44:ob.kind==='hole'?52:43)*ob.s)+'px system-ui';ctx.fillText(ob.kind==='bomb'?'💣':ob.kind==='star'?'⭐':ob.kind==='hole'?'🕳️':ob.animal,ob.x,ob.y-14*ob.s)}
  visualLane+=(p.lane-visualLane)*.22;
  const x=lerpPos(visualLane,0).x,auto=now<p.autoUntil,flame=(auto||p.boost)&&p.energy>0;
  if(flame&&now>=p.stunUntil){for(let i=0;i<3;i++){ctx.fillStyle=['#ff6425','#ffb42d','#fff2ad'][i];ctx.beginPath();ctx.ellipse(x+(i-1)*10,foot-19+Math.sin(ts*.025+i)*6,10-i*2,18-i*3,0,0,Math.PI*2);ctx.fill()}}
  ctx.font='61px system-ui';ctx.fillText(p.animal,x,foot-60-(now<p.jumpUntil?42:0));
  ctx.fillStyle='#fff';ctx.font='bold 13px system-ui';ctx.fillText('你 · '+p.stars*10+'分',x,foot-111-(now<p.jumpUntil?42:0));
  if(now<state.startsAt){ctx.fillStyle='#ffe9f1';ctx.font='bold 35px system-ui';ctx.fillText('准备 '+Math.ceil((state.startsAt-now)/1000),w/2,h*.45)}
 }
 return {enter,receive,leave};
})();

