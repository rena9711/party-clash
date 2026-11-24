const MemoryTournament = require('./memory-tournament');
const {animals,validateName}=require('./public/player-identity');
const express=require('express');const http=require('http');const {Server}=require('socket.io');const crypto=require('crypto');
const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:'*'}});app.use(express.json({limit:'20kb'}));app.use(express.static('public'));
app.get('/race-v3/vendor/three.module.min.js', (_req, res) => {
  res.sendFile(require('node:path').join(__dirname, 'node_modules/three/build/three.module.min.js'));
});
const {init:loadSavedRooms,save:saveRoom,remove:removeRoom,configured:hasDatabase}=require('./roomStore');
const rooms=new Map(),GAMES=['tap','precision','reaction','memory','bomb','mine','race','snake'];

let RaceV3;
function broadcastRace(r, now = Date.now()) {
  const shared = RaceV3.sharedRaceSnapshot(r.race, now);
  for (const runner of r.race.runners) {
    if (r.players.get(runner.id)?.online !== false) {
      io.to(runner.id).volatile.emit('race-state', RaceV3.snapshotRace(r.race, runner.id, now, shared));
    }
  }
}
function raceTick(r) {
  if (r.phase !== 'playing' || r.game !== 'race') return;
  const now = Date.now();
  const done = RaceV3.advanceRace(r.race, now);
  if (now >= r.race.nextBroadcast || done) {
    r.race.nextBroadcast = now + 100;
    broadcastRace(r, now);
  }
  if (done) finish(r);
}
function finishRace(r) {
  for (const runner of r.race.runners) {
    const player = r.players.get(runner.id);
    if (player) {
      player.value = runner.run.stars * 10;
      player.submitted = true;
    }
  }
}

function newBombGame(r){const participants=[...r.players.values()].filter(p=>p.online!==false).map(p=>p.id);return {secret:2+rand(98),low:1,high:100,turn:rand(participants.length),order:participants,history:[],loser:null,finished:false}}
function bombPublic(r){const b=r.bomb;if(!b)return null;return {low:b.low,high:b.high,turnId:b.order[b.turn]||null,picks:b.picks,history:b.history.slice(),loser:b.loser,finished:b.finished,secret:b.finished?b.secret:undefined}}
function guessBomb(r,sid,n){const b=r.bomb;if(!b||r.phase!=='playing'||r.game!=='bomb'||b.finished||Date.now()<r.startsAt)return;if(b.order[b.turn]!==sid||!Number.isInteger(n)||n<=b.low||n>=b.high)return;
const p=r.players.get(sid);if(!p)return;
if(n===b.secret){b.finished=true;b.loser=sid;b.history.push({name:p.name,id:sid,number:n,result:'boom',low:b.low,high:b.high});for(const pp of r.players.values()){pp.value=pp.id===sid?0:100;pp.submitted=true}finish(r);return}
if(n>b.secret)b.high=n;else b.low=n;
b.history.push({name:p.name,id:sid,number:n,result:n>b.secret?'lower':'higher',low:b.low,high:b.high});
let next=b.turn;do{next=(next+1)%b.order.length}while(next!==b.turn&&r.players.get(b.order[next])?.online===false);b.turn=next;emit(r)
}

const SNAKE_W=48,SNAKE_H=26;
function makeSnake(r){
 const colors=['#f8bbd0','#ffe1a0','#8bd8c8','#ada6ff','#ff9e9e','#82bce8','#f8d38d','#b2e58d','#e6a5ef','#f8b9a0'];
 const players=[...r.players.values()].filter(p=>p.online!==false).map((p,i)=>({id:p.id,name:p.name,color:colors[i%colors.length],body:[],dir:{x:i%2?0:1,y:i%2?1:0},next:null,score:0,foods:0,kills:0,deaths:0,respawnAt:0,shieldUntil:0,magnetUntil:0,ghostUntil:0,cooldowns:{},online:true}));
 const g={players,foods:[],width:SNAKE_W,height:SNAKE_H,step:0,last:Date.now(),lastBroadcast:0};players.forEach((p,i)=>spawnSnake(g,p,i));for(let attempt=g.foods.length;attempt<22;attempt++)addSnakeFood(g);return g
}
function isSnakeCellBusy(g,x,y){return g.players.some(p=>p.body.some(b=>b.x===x&&b.y===y))||g.foods.some(f=>f.x===x&&f.y===y)}
function addSnakeFood(g){for(let t=0;t<130;t++){const x=1+rand(SNAKE_W-2),y=1+rand(SNAKE_H-2);if(!isSnakeCellBusy(g,x,y)){g.foods.push({x,y,kind:['double','shield'][rand(12)]||'normal'});return}}}
function spawnSnake(g,p,i){for(let attempt=0;attempt<180;attempt++){const x=5+rand(SNAKE_W-10),y=5+rand(SNAKE_H-10),d=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}][rand(4)],body=Array.from({length:5},(_,j)=>({x:x-d.x*j,y:y-d.y*j}));if(body.every(c=>c.x>=1&&c.x<SNAKE_W-1&&c.y>=1&&c.y<SNAKE_H-1&&!isSnakeCellBusy(g,c.x,c.y))){p.body=body;p.dir=d;p.next=null;p.doubleUntil=p.ghostUntil=p.magnetUntil=0;p.respawnAt=0;p.shieldUntil=Date.now()+900;return}}p.respawnAt=Date.now()+500;p.body=[]}
function snakeSnapshot(r){const g=r.snake;if(!g)return null;return {startsAt:r.startsAt,endsAt:r.endsAt,now:Date.now(),width:g.width,height:g.height,foods:g.foods,players:g.players.map(p=>({id:p.id,name:p.name,color:p.color,body:p.body,score:p.score,foods:p.foods,kills:p.kills,deaths:p.deaths,respawnAt:p.respawnAt,shieldUntil:p.shieldUntil,magnetUntil:p.magnetUntil,ghostUntil:p.ghostUntil,doubleUntil:p.doubleUntil,cooldowns:p.cooldowns}))}}
function snakeTick(r){if(r.phase!=='playing'||r.game!=='snake'||!r.snake)return;const g=r.snake,now=Date.now();if(now<r.startsAt){io.to(r.code).emit('snake-state',snakeSnapshot(r));return}
 for(const p of g.players)if(!p.body.length&&p.respawnAt&&now>=p.respawnAt&&r.players.get(p.id)?.online!==false)spawnSnake(g,p,0);
 const live=g.players.filter(p=>p.body.length);
 const moves=live.map(p=>{const d=p.next&&!(p.next.x===-p.dir.x&&p.next.y===-p.dir.y)?p.next:p.dir;p.dir=d;p.next=null;return {p,d,head:{x:p.body[0].x+d.x,y:p.body[0].y+d.y},food:null,dead:false,killer:null}});
 for(const m of moves){if(m.p.magnetUntil>now)for(const f of g.foods){
   const dx=m.head.x-f.x,dy=m.head.y-f.y,d=Math.hypot(dx,dy);
   if(d>0&&d<7){const pull=Math.min(1,1.5/d);f.x+=dx*pull;f.y+=dy*pull}
 }m.food=g.foods.find(f=>Math.hypot(f.x-m.head.x,f.y-m.head.y)<.85)}
 for(const m of moves){if(m.head.x<0||m.head.x>=g.width||m.head.y<0||m.head.y>=g.height){m.dead=true;continue}
 for(const other of live){if(other===m.p||m.p.ghostUntil>now||other.ghostUntil>now)continue;const hit=other.body.some(c=>Math.hypot(c.x-m.head.x,c.y-m.head.y)<.75);if(hit){m.dead=true;m.killer=other;break}}
 }
 for(let a=0;a<moves.length;a++)for(let b=a+1;b<moves.length;b++){const x=moves[a],y=moves[b];if(x.p.ghostUntil<=now&&y.p.ghostUntil<=now&&Math.hypot(x.head.x-y.head.x,x.head.y-y.head.y)<.8){x.dead=true;y.dead=true}}
 for(const m of moves){const p=m.p;if(m.dead&&now>=p.shieldUntil){p.body=[];p.deaths++;p.score=Math.max(0,p.score-10);p.respawnAt=now+2000;if(m.killer&&m.killer!==p){m.killer.kills++;m.killer.score+=20}continue}if(m.dead){m.next=null;continue}
 if(p.doubleUntil&&p.doubleUntil<=now){p.body.splice(Math.max(2,p.body.length-p.extraLength));p.doubleUntil=0}
 p.body.unshift(m.head);const index=g.foods.indexOf(m.food);if(index>=0){g.foods.splice(index,1);p.foods++;p.score+=10;
 if(m.food.kind==='shield')p.shieldUntil=now+3000;
 if(m.food.kind==='double'){
   if(!p.doubleUntil){p.extraLength=p.body.length;p.body.push(...p.body.map(()=>({...p.body.at(-1)})))}
   p.doubleUntil=now+3000;
 }}else p.body.pop();
 }
 for(let attempt=g.foods.length;attempt<22;attempt++)addSnakeFood(g);
 io.to(r.code).emit('snake-state',snakeSnapshot(r));
}
function finishSnake(r){for(const snake of r.snake?.players||[]){const p=r.players.get(snake.id);if(p){p.value=snake.score;p.submitted=true}}}

const rand=(n)=>crypto.randomInt(n),code=()=>crypto.randomBytes(3).toString('hex').toUpperCase();
const clean=s=>String(s||'Player').trim().slice(0,16).replace(/[<>]/g,'');
function publicRoom(r){return {code:r.code,host:r.host,phase:r.phase,round:r.round,game:r.game,selectedGame:GAMES.includes(r.selectedGame)?r.selectedGame:'tap',players:[...r.players.values()].map(p=>({id:p.id,name:p.name,character:p.character??null,score:p.score,minePoints:r.game==='mine'?p.value:undefined,ready:p.ready,submitted:p.submitted,online:p.online!==false})),endsAt:r.endsAt,startsAt:r.startsAt,answerAt:r.game==='memory'?r.answerAt:undefined,race:r.game==='race'?{runners:r.race?.runners?.map(p=>({id:p.id,name:p.name}))}:null,bomb:['mine','bomb'].includes(r.game)?bombPublic(r):null,snake:r.game==='snake'?{players:r.snake?.players?.map(p=>({id:p.id,name:p.name}))}:null,log:r.log.slice(-6),results:r.results||[]}}
function emit(r){io.to(r.code).emit('room',publicRoom(r));saveRoom(r).catch(e=>console.error('Room save failed:',e.message))}
function onlineCount(r){return [...r.players.values()].filter(p=>p.online!==false).length}
const ROOM_LIFETIME=24*60*60*1000;
function roomExpiry(r){clearTimeout(r.expireTimer);r.expireTimer=setTimeout(()=>{if(rooms.get(r.code)!==r)return;clearTimeout(r.timer);for(const interval of [r.raceInterval,r.snakeInterval,r.memoryInterval])clearInterval(interval);rooms.delete(r.code);io.to(r.code).emit('room-closed');for(const id of io.sockets.adapter.rooms.get(r.code)||[]){const peer=io.sockets.sockets.get(id);if(peer){peer.data.room=null;peer.leave(r.code)}}removeRoom(r.code).catch(e=>console.error('Room delete failed:',e.message))},Math.max(0,r.createdAt+ROOM_LIFETIME-Date.now()));r.expireTimer.unref?.()}
app.post('/api/my-rooms',(req,res)=>{res.set('Cache-Control','no-store');const token=validSession(req.body?.session),now=Date.now();if(!token)return res.json({now,rooms:[]});const list=[];for(const r of rooms.values()){const p=[...r.players.values()].find(p=>p.session===token);const expiresAt=r.createdAt+ROOM_LIFETIME;if(p&&expiresAt>now)list.push({code:r.code,hostName:r.players.get(r.host)?.name||'玩家',owner:p.id===r.host,online:onlineCount(r),expiresAt});}res.json({now,rooms:list.sort((a,b)=>a.expiresAt-b.expiresAt)})});
function get(socket){const code=socket.data.room;return code&&rooms.get(code)}
function submit(r,p,value){if(r.phase!=='playing'||p.submitted)return;p.submitted=true;p.value=Math.max(0,Math.min(r.game==='tap'?Number.MAX_SAFE_INTEGER:100,Math.floor(Number(value)||0)));emit(r);if([...r.players.values()].every(x=>x.submitted))finish(r)}
function finish(r){if(r.phase!=='playing')return;clearTimeout(r.timer);clearInterval(r.raceInterval);clearInterval(r.snakeInterval);r.raceInterval=null;r.snakeInterval=null;if(r.game==='race')finishRace(r);if(r.game==='snake')finishSnake(r);if(r.game==='bomb'&&!r.bomb?.finished){r.bomb.finished=true;for(const p of r.players.values()){p.value=50;p.submitted=true}}r.phase='results';const ordered=r.game==='race'
 ? RaceV3.standings(r.race).map(runner=>r.players.get(runner.id))
 : [...r.players.values()].sort((a,b)=>b.value-a.value);const points=[100,70,50,30,20,10,5,3,2,1];r.results=ordered.map((p,i)=>({id:p.id,name:p.name,character:r.game==='race'?p.character:undefined,value:p.value,foods:r.game==='snake'?r.snake?.players.find(s=>s.id===p.id)?.foods:undefined,exploded:['mine','bomb'].includes(r.game)&&r.bomb?.loser===p.id,stars:r.game==='race'?r.race?.runners.find(x=>x.id===p.id)?.run.stars:undefined,distance:r.game==='race'?Math.round(r.race?.runners.find(x=>x.id===p.id)?.run.distance||0):undefined,earned:r.game==='mine'?p.value:r.game==='bomb'&&r.bomb?.loser?(p.id===r.bomb.loser?0:100):points[i]}));ordered.forEach((p,i)=>p.score+=r.results[i].earned);emit(r)}
function start(r,game){clearTimeout(r.timer);clearInterval(r.raceInterval);clearInterval(r.snakeInterval);r.game=GAMES.includes(game)?game:'tap';r.round++;r.phase='playing';r.startsAt=Date.now()+3000;r.race=null;r.bomb=['mine','bomb'].includes(r.game)?newBombGame(r):null;if(r.game==='mine'){r.bomb.secret=1+rand(20);r.bomb.picks=0};r.snake=r.game==='snake'?makeSnake(r):null;r.memory=null;r.endsAt=r.startsAt+(r.game==='snake'?60000:r.game==='bomb'?180000:12000);r.results=[];r.log=[];r.players.forEach(p=>{p.submitted=false;p.value=0;p.correctCells=0;p.ready=false;p.shield=false;p.attackCount=0;p.effects=[]});r.seed=rand(100000);if(r.game==='race'){
  r.race=RaceV3.createRace([...r.players.values()].filter(p=>p.online!==false),r.seed,r.startsAt);
  r.endsAt=r.race.endsAt;
}if(r.game==='memory'){
  r.memory=MemoryTournament.create([...r.players.values()].filter(p=>p.online!==false).map(p=>p.id));
  nextMemoryTurn(r,Date.now());
}io.to(r.code).emit('game-config',{game:r.game,startsAt:r.startsAt,answerAt:r.game==='memory'?r.answerAt:undefined,endsAt:r.endsAt,seed:r.seed});emit(r);if(r.game==='memory'){startMemory(r);return}if(r.game==='race'){r.race.nextBroadcast=Date.now()+100;r.raceInterval=setInterval(()=>raceTick(r),25);broadcastRace(r);return}if(r.game==='snake'){r.snakeInterval=setInterval(()=>snakeTick(r),155);io.to(r.code).emit('snake-state',snakeSnapshot(r))}if(r.bomb)return;r.timer=setTimeout(()=>finish(r),r.endsAt-Date.now()+150)}
function sendMemory(r, now = Date.now()) {
  io.to(r.code).emit('memory-state', MemoryTournament.snapshot(r.memory, now));
}

function nextMemoryTurn(r, now) {
  MemoryTournament.next(r.memory, now);
  const {startsAt, answerAt, endsAt} = r.memory.turn;
  Object.assign(r, {startsAt, answerAt, endsAt});
}

function startMemory(r) {
  const game = r.memory;
  sendMemory(r);
  r.memoryInterval = setInterval(() => {
    const now = Date.now();
    if (now >= game.turn.endsAt || [...game.turn.answers.values()].every(p => p.done)) {
      if(game.active.length>1)MemoryTournament.resolve(game);
      if (game.active.length === 1) {
        clearInterval(r.memoryInterval);
        r.memoryInterval = null;
        const placement = [game.active[0], ...game.eliminated.reverse()];
        const points = [100,70,50,30,20,10,5,3,2,1];
        r.results = placement.map((id, i) => {
          const player = r.players.get(id);
          player.score += points[i];
          return { id, name: player.name, earned: points[i], correctCells:player.correctCells, champion: i === 0 };
        });
        r.phase = 'results';
        emit(r);
        return;
      }
      nextMemoryTurn(r, now);
    }
    sendMemory(r, now);
  }, 80);
}

function startWhenReady(r){
  const active=[...r.players.values()].filter(p=>p.online!==false);
  if(r.phase==='rules'&&active.length>=1&&active.every(p=>p.ready))start(r,r.selectedGame);
}
function markOffline(r,s){const p=r.players.get(s.id);if(!p)return;p.online=false;if(r.race)RaceV3.clearInput(r.race.runners.find(runner=>runner.id===s.id));if(r.snake){const sp=r.snake.players.find(x=>x.id===s.id);if(sp){sp.body=[];sp.respawnAt=0}}if(r.bomb&&r.phase==='playing'&&r.bomb&&!r.bomb.finished&&r.bomb.order[r.bomb.turn]===s.id){let next=r.bomb.turn;do{next=(next+1)%r.bomb.order.length}while(next!==r.bomb.turn&&r.players.get(r.bomb.order[next])?.online===false);r.bomb.turn=next;r.bomb.picks=0}if(onlineCount(r)===0)roomExpiry(r);emit(r);startWhenReady(r)}

const validSession=value=>typeof value==='string'&&value.length>=12&&value.length<=80?value:'';
io.on('connection',s=>{
s.on('memory-clock',ack=>{if(typeof ack==='function')ack(Date.now())});
s.on('create',async(input,ack)=>{
  const {name,session}=input||{};
  const identity=validateName(name);
  if(identity.error)return ack?.(identity);
  if(get(s))return ack?.({error:'请先离开当前房间'});
  let c=code();
  while(rooms.has(c))c=code();
  const r={code:c,host:s.id,phase:'lobby',round:0,game:null,selectedGame:'tap',players:new Map(),log:[],timer:null,expireTimer:null,createdAt:Date.now()};
  rooms.set(c,r);
  roomExpiry(r);
  r.players.set(s.id,{id:s.id,name:identity.name,session:validSession(session),score:0,ready:false,online:true});
  s.join(c);
  s.data.room=c;
  try {
    await saveRoom(r);
    ack?.({ok:true,code:c,id:s.id});
    emit(r);
  } catch(e) {
    rooms.delete(c);
    s.leave(c);
    s.data.room=null;
    ack?.({error:'房间保存失败，请重试'});
    console.error('Create room persistence:',e.message);
  }
});
s.on('join',(input,ack)=>{
  const {code:raw,name,session,resume}=input||{};
  const c=String(raw||'').trim().toUpperCase(),r=rooms.get(c);
  if(!r||r.createdAt+ROOM_LIFETIME<=Date.now())return ack?.({error:'房间已失效，请房主重新建立房间并分享新链接'});
  if(get(s)&&get(s)!==r)return ack?.({error:'请先离开当前房间'});
  const token=validSession(session);
  const old=token&&[...r.players.values()].find(player=>player.session===token);
  if(resume&&!old)return ack?.({error:'未找到原玩家，请确认昵称后加入'});
  if(get(s)&&!old)return ack?.({error:'请先离开当前房间'});
  const identity=old?null:validateName(name);
  if(identity?.error)return ack?.(identity);
  if(identity && [...r.players.values()].some(p=>p.name===identity.name)) {
    return ack?.({error:'该昵称已被使用，请换一个名字'});
  }
  if(!old&&r.phase!=='lobby'&&r.phase!=='results')return ack?.({error:'游戏进行中，请稍后加入'});
  if(!old&&r.players.size>=10)return ack?.({error:'房间已满'});
  roomExpiry(r);
  if(old) {
    if(old.id!==s.id){
      const oldSocket=io.sockets.sockets.get(old.id);
      if(oldSocket){oldSocket.leave(c);oldSocket.data.room=null}
      r.players.delete(old.id);
      if(r.host===old.id)r.host=s.id;
      if(r.race)for(const runner of r.race.runners)if(runner.id===old.id){runner.id=s.id;RaceV3.clearInput(runner)}
      if(r.bomb)r.bomb.order=r.bomb.order.map(id=>id===old.id?s.id:id);
      if(r.snake)for(const player of r.snake.players)if(player.id===old.id){
        player.id=s.id;
        if(!player.body.length&&!player.respawnAt)player.respawnAt=Date.now()+500;
      }
      if(r.memory&&r.phase==='playing')MemoryTournament.rename(r.memory,old.id,s.id);
      for(const result of r.results||[])if(result.id===old.id)result.id=s.id;
    }
    r.players.set(s.id,{...old,id:s.id,online:true});
  } else {
    r.players.set(s.id,{id:s.id,name:identity.name,session:token,score:0,ready:false,online:true});
  }
  s.join(c);
  s.data.room=c;
  ack?.({ok:true,code:c,id:s.id});
  emit(r);
  if(r.phase==='playing'&&r.game==='memory')s.emit('memory-state',MemoryTournament.snapshot(r.memory,Date.now()));
  if(r.phase==='playing'&&r.game==='snake')s.emit('snake-state',snakeSnapshot(r));
  if(r.phase==='playing'&&r.game==='race')s.emit('race-state',RaceV3.snapshotRace(r.race,s.id,Date.now()));
});
s.on('race-character',(character,ack)=>{
  const room=get(s),player=room?.players.get(s.id);
  if(!player||!['lobby','results'].includes(room.phase)||room.selectedGame!=='race'||!animals.some(([id])=>id===character)){
    return ack?.({error:'当前不能选择该角色'});
  }
  if([...room.players.values()].some(other=>other.id!==s.id&&other.character===character)){
    return ack?.({error:'该角色已被选择'});
  }
  player.character=character;
  ack?.({ok:true});
  emit(room);
});
s.on('leave-room',ack=>{
  const room=get(s);
  if(!room)return ack?.({error:'房间已关闭'});
  if(room.host===s.id){
    clearTimeout(room.expireTimer);
    clearTimeout(room.timer);
    for(const interval of [room.memoryInterval,room.snakeInterval,room.raceInterval])clearInterval(interval);
    rooms.delete(room.code);
    s.to(room.code).emit('room-closed');
    for(const peer of io.sockets.adapter.rooms.get(room.code)||[]){
      const client=io.sockets.sockets.get(peer);
      if(client){client.data.room=null;client.leave(room.code)}
    }
    removeRoom(room.code).catch(error=>console.error('Room delete failed:',error.message));
  }else{
    s.leave(room.code);
    s.data.room=null;
    if(room.phase==='playing')markOffline(room,s);
    else{
      room.players.delete(s.id);
      if(!onlineCount(room))roomExpiry(room);
      emit(room);startWhenReady(room);
    }
  }
  ack?.({ok:true});
});
s.on('select-game',({game}={})=>{const r=get(s);if(r&&r.host===s.id&&['lobby','results'].includes(r.phase)&&GAMES.includes(game)){r.selectedGame=game;emit(r)}});
s.on('start',({game}={})=>{
  const r=get(s);
  if(!r||r.host!==s.id||onlineCount(r)<1||!['lobby','results'].includes(r.phase))return;
  const chosen=r.selectedGame||game;
  if(chosen==='race'&&[...r.players.values()].some(player=>player.online!==false&&!player.character))return;
  r.phase='rules'; r.selectedGame=chosen; r.players.forEach(p=>p.ready=false); emit(r);
});
s.on('rules-ready',({round}={})=>{
  const r=get(s);
  if(r?.phase!=='rules'||r.round!==round)return;
  r.players.get(s.id).ready=true;
  emit(r);startWhenReady(r);
});
s.on('mine-action',({cell,pass,round}={})=>{
  const r=get(s), b=r?.bomb;
  if(!b || r.game!=='mine' || r.round!==round || r.phase!=='playing' || Date.now()<r.startsAt || b.order[b.turn]!==s.id)return;
  if(pass){
    if(!b.picks)return;
    do { b.turn=(b.turn+1)%b.order.length; } while(r.players.get(b.order[b.turn])?.online===false);
    b.picks=0;
  }else{
    if(!Number.isInteger(cell)||cell<1||cell>20||b.history.some(h=>h.number===cell))return;
    b.history.push({number:cell});
    r.players.get(s.id).value+=10;
    b.picks++;
    if(cell===b.secret){
      b.loser=s.id;b.finished=true;

      return finish(r);
    }
  }
  emit(r);
});
s.on('tap-count',({count,round}={})=>{
 const r=get(s),p=r?.players.get(s.id);
 if(!p||r.phase!=='playing'||r.game!=='tap'||r.round!==round||Date.now()<r.startsAt||Date.now()>r.endsAt||!Number.isSafeInteger(count))return;
 p.value=Math.max(p.value,count);
});
s.on('bomb-guess',({number}={})=>{const r=get(s);if(r&&typeof number==='number')guessBomb(r,s.id,number)});
s.on('snake-skill',skill=>{
 const r=get(s),p=r?.snake?.players.find(p=>p.id===s.id),now=Date.now();
 if(!p?.body.length||r.phase!=='playing'||r.game!=='snake'||now<r.startsAt||!['ghost','magnet'].includes(skill)||p.cooldowns[skill]>now)return;
 p[skill+'Until']=now+4000;p.cooldowns[skill]=now+12000;
});
s.on('snake-input',({x,y}={})=>{const r=get(s),p=r?.snake?.players.find(p=>p.id===s.id);if(!r||r.phase!=='playing'||r.game!=='snake'||!p||!p.body.length||Date.now()<r.startsAt)return;const length=Math.hypot(x,y);if(!Number.isFinite(x)||!Number.isFinite(y)||length<0.01||length>1.5)return;x/=length;y/=length;if(x===-p.dir.x&&y===-p.dir.y)return;p.next={x,y}});
s.on('race-input', input=>{
  const room=get(s);
  if(room?.phase==='playing'&&room.game==='race'&&room.players.has(s.id)) {
    RaceV3.applyInput(room.race,s.id,input,Date.now());
  }
});
s.on('memory-answer',({attempt,index,cell}={})=>{
 const r=get(s);
 if(r?.phase!=='playing'||r.game!=='memory'||!r.memory)return;
 if(MemoryTournament.answer(r.memory,s.id,attempt,index,cell,Date.now())){
   const p=r.players.get(s.id);
   if(r.memory.turn.answers.get(s.id).correct>index)p.correctCells++;
   sendMemory(r);
 }
});
s.on('submit',({value}={})=>{const r=get(s),p=r?.players.get(s.id);if(!p||r.game==='mine'||r.game==='race'||r.game==='bomb'||r.game==='snake'||r.game==='memory'||Date.now()<r.startsAt-250||Date.now()>r.endsAt+1000)return;submit(r,p,value)});
s.on('attack',({target,card}={})=>{const r=get(s),p=r?.players.get(s.id),t=r?.players.get(target);if(!r||r.phase!=='playing'||(r.game==='memory'||r.game==='race')||!p||!t||p.id===t.id||p.attackCount>=1||Date.now()<r.startsAt||Date.now()>r.endsAt)return;if(!['freeze','reverse','ghost','steal','shield'].includes(card))return;p.attackCount++;if(card==='shield'){p.shield=true;r.log.push(`${p.name} 启动防护盾`)}else if(t.shield){t.shield=false;s.emit('notice','对方护盾挡住了攻击');r.log.push(`${t.name} 挡住了 ${p.name} 的攻擊`)}else{io.to(t.id).emit('effect',{card,until:Date.now()+1200,from:p.name});if(card==='steal'){p.score+=5;t.score=Math.max(0,t.score-5)}r.log.push(`${p.name} 对 ${t.name} 使用 ${card}`)}emit(r)});
s.on('disconnect',()=>{const r=get(s);if(r)markOffline(r,s)});
});

// V0.6 prototype social API. No authentication: test data only; NOT secure for production/ranked use.
const fs=require('fs'),path=require('path');
const DATA=process.env.DATA_DIR||path.join(__dirname,'data');fs.mkdirSync(DATA,{recursive:true});
const DBFILE=path.join(DATA,'demo.json');let db={players:{},scores:[],challenges:[],matches:[]};
try{db={...db,...JSON.parse(fs.readFileSync(DBFILE,'utf8'))}}catch{}
function persist(){const tmp=DBFILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db));fs.renameSync(tmp,DBFILE)}
function sid(v){return typeof v==='string'&&/^[a-f0-9-]{12,80}$/i.test(v)}
function gameId(g){return ['tap','precision','reaction','memory','bomb','mine'].includes(g)}
function player(id){return db.players[id]}
function display(id){return player(id)?.name||'玩家'}
function weekStart(t){const d=new Date(t),day=(d.getUTCDay()+6)%7;return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-day)-8*3600000+(d.getUTCHours()<8? -7*86400000:0)}
app.post('/api/profile',(req,res)=>{let id=req.body?.id,name=clean(req.body?.name||'玩家');if(!sid(id))return res.status(400).json({error:'无效玩家标识'});db.players[id]={name,updated:Date.now()};persist();res.json({id,name})});
app.get('/api/leaderboard',(req,res)=>{const game=String(req.query.game||'all'),weekly=req.query.period==='week';const cutoff=Date.now()-7*86400000;const scores=db.scores.filter(x=>(game==='all'||x.game===game)&&(!weekly||x.at>=cutoff));const best=new Map();for(const x of scores){const prev=best.get(x.id);if(!prev||x.score>prev.score)best.set(x.id,x)}res.json([...best.values()].sort((a,b)=>b.score-a.score).slice(0,50).map((x,i)=>({rank:i+1,name:display(x.id),score:x.score,id:x.id}))) });
app.post('/api/score',(req,res)=>{const {id,game}=req.body||{},score=Number(req.body?.score);if(!sid(id))return res.status(400).json({error:'玩家标识无效，请重新进入大厅'});if(!gameId(game)||!Number.isInteger(score)||score<0||score>(game==='mine'?200:100))return res.status(400).json({error:'本局成绩无效，未能保存'});if(!player(id))db.players[id]={name:clean(req.body.name||'玩家'),updated:Date.now()};const item={id,game,score,at:Date.now(),key:crypto.randomUUID()};db.scores.push(item);db.scores=db.scores.slice(-10000);persist();res.json({ok:true,key:item.key})});
app.post('/api/challenge',(req,res)=>{const {id,game}=req.body||{},score=Number(req.body?.score);if(!sid(id)||!player(id)||!gameId(game)||!Number.isInteger(score)||score<0||score>(game==='mine'?200:100))return res.status(400).json({error:'挑战数据错误'});const c={id:crypto.randomBytes(6).toString('hex'),owner:id,game,score,created:Date.now(),expires:Date.now()+48*3600000,entries:[]};db.challenges.push(c);db.challenges=db.challenges.slice(-1000);persist();res.json({id:c.id,expires:c.expires})});
app.get('/api/challenge/:id',(req,res)=>{const c=db.challenges.find(x=>x.id===req.params.id);if(!c)return res.status(404).json({error:'挑战不存在'});res.json({id:c.id,ownerName:display(c.owner),game:c.game,score:c.score,expires:c.expires,entries:c.entries.map(x=>({name:display(x.id),score:x.score,at:x.at}))})});
app.post('/api/challenge/:id/submit',(req,res)=>{const c=db.challenges.find(x=>x.id===req.params.id),id=req.body?.id,score=Number(req.body?.score);if(!c||c.expires<Date.now())return res.status(404).json({error:'挑战已过期或不存在'});if(!sid(id)||!player(id)||id===c.owner||c.entries.some(x=>x.id===id)||!Number.isInteger(score)||score<0||score>(c.game==='mine'?200:100))return res.status(400).json({error:'提交不符合规则'});c.entries.push({id,score,at:Date.now()});db.matches.push({a:c.owner,b:id,game:c.game,aScore:c.score,bScore:score,at:Date.now()});persist();res.json({ok:true,won:score>c.score,tie:score===c.score})});
app.get('/api/rivals/:id',(req,res)=>{const id=req.params.id;if(!sid(id))return res.status(400).json({error:'无效玩家'});const rivals=new Map();for(const m of db.matches){if(m.a!==id&&m.b!==id)continue;const other=m.a===id?m.b:m.a;const x=rivals.get(other)||{id:other,wins:0,losses:0,draws:0,last:0};const a=m.a===id?m.aScore:m.bScore,b=m.a===id?m.bScore:m.aScore;if(a>b)x.wins++;else if(a<b)x.losses++;else x.draws++;x.last=m.at;rivals.set(other,x)}res.json([...rivals.values()].sort((a,b)=>b.last-a.last).map(x=>({...x,name:display(x.id)})))});
app.get('/api/health',(req,res)=>res.json({ok:true,version:'0.9-room-storage',roomStorage:hasDatabase?'postgres':'memory',roomCount:rooms.size}));

const PORT=process.env.PORT||3000;import('./race-v3-room.mjs').then(core=>{RaceV3=core;return loadSavedRooms(rooms)}).then(()=>{for(const r of rooms.values())roomExpiry(r);server.listen(PORT,()=>console.log('Party Clash running on http://localhost:'+PORT))}).catch(err=>{console.error('Persistent room store unavailable:',err);process.exit(1)});
