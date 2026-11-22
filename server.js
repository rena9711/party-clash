const express=require('express');const http=require('http');const {Server}=require('socket.io');const crypto=require('crypto');
const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:'*'}});app.use(express.json({limit:'20kb'}));app.use(express.static('public'));
const {init:loadSavedRooms,save:saveRoom,remove:removeRoom,configured:hasDatabase}=require('./roomStore');
const rooms=new Map(),GAMES=['tap','precision','reaction','memory','dodge','rps','bomb','mine','race'];
const RACE_ANIMALS=['🐰','🦊','🐻','🐼','🐸','🐯','🦁','🐵','🐷','🐨'];

// 跑得快：服务器权威计时、障碍、星星与移动状态（仅测试玩法）
function makeRace(r){const participants=[...r.players.values()].filter(p=>p.online!==false);
  const obstacles=[],stars=[];let oid=0,sid=0;
  for(let p=175;p<3900;p+=105+rand(37)){
    const blocked=rand(3),lanes=[0,1,2].filter(l=>l!==blocked);
    obstacles.push({id:oid++,p,l:blocked,kind:rand(100)<35?'hole':'box'});
    if(p>310&&rand(100)<39){const second=lanes[rand(lanes.length)];obstacles.push({id:oid++,p:p+rand(10)-5,l:second,kind:'box'});lanes.splice(lanes.indexOf(second),1)}
    const safe=lanes[rand(lanes.length)];for(let j=0;j<3;j++)stars.push({id:sid++,p:p+24+j*28,l:safe});
  }
  return {runners:participants.map((p,i)=>({id:p.id,name:p.name,animal:RACE_ANIMALS.includes(p.animal)?p.animal:RACE_ANIMALS[i%RACE_ANIMALS.length],lane:1,p:0,hp:3,stars:0,energy:100,autoUntil:0,jumpUntil:0,stunUntil:0,boost:false,hits:0,score:0,taken:[],collided:[],finished:false})),obstacles,stars,lastTick:Date.now(),duration:30000};
}
function raceSnapshot(r){const g=r.race;if(!g)return null;return {startsAt:r.startsAt,endsAt:r.endsAt,runners:g.runners.map(p=>({id:p.id,name:p.name,animal:p.animal,lane:p.lane,p:Math.round(p.p),hp:p.hp,stars:p.stars,energy:Math.round(p.energy),boost:p.boost,autoUntil:p.autoUntil,jumpUntil:p.jumpUntil,stunUntil:p.stunUntil,finished:p.finished,taken:p.taken})),obstacles:g.obstacles,stars:g.stars};}
function raceTick(r){if(r.phase!=='playing'||r.game!=='race'||!r.race)return;const g=r.race,now=Date.now();
  if(now<r.startsAt){io.to(r.code).emit('race-state',raceSnapshot(r));return}
  const delta=Math.max(0,Math.min(.25,(now-g.lastTick)/1000));g.lastTick=now;
  for(const p of g.runners){if(p.finished)continue;
    const speeding=(p.boost&&p.energy>0||now<p.autoUntil)&&now>=p.stunUntil;
    const elapsed=Math.max(0,(now-r.startsAt)/1000),base=72+Math.min(33,elapsed*.74);
    const speed=now<p.stunUntil?base*.56:speeding?base+28:base;
    p.p+=speed*delta;p.energy=Math.min(100,Math.max(0,p.energy+(p.boost&&now>=p.autoUntil&&speeding?-32:12)*delta));
    const previous=p.p-speed*delta;
    for(const o of g.obstacles){if(o.p>p.p+5||o.p<previous-12||o.l!==p.l||p.collided.includes(o.id))continue;
      p.collided.push(o.id);if(now<p.jumpUntil){p.score+=12}else if(now>=p.stunUntil){p.hp--;p.hits++;p.stunUntil=now+1150;if(p.hp<=0){p.finished=true;p.boost=false}}
    }
    for(const star of g.stars){if(star.p>p.p+5||star.p<previous-13||star.l!==p.l||p.taken.includes(star.id))continue;
      p.taken.push(star.id);p.stars++;p.score+=10;p.energy=Math.min(100,p.energy+10);
      if(p.stars%5===0)p.autoUntil=Math.max(p.autoUntil,now)+2500;
    }
    if(p.p>=3900)p.finished=true;
  }
  io.to(r.code).emit('race-state',raceSnapshot(r));
  if(g.runners.every(p=>p.finished))finish(r);
}
function finishRace(r){const racers=r.race?.runners||[];for(const runner of racers){const p=r.players.get(runner.id);if(p){p.value=runner.stars*10;p.submitted=true;}}}

const rand=(n)=>crypto.randomInt(n),code=()=>crypto.randomBytes(3).toString('hex').toUpperCase();
const clean=s=>String(s||'Player').trim().slice(0,16).replace(/[<>]/g,'');
function publicRoom(r){return {code:r.code,host:r.host,phase:r.phase,round:r.round,game:r.game,selectedGame:r.selectedGame||'tap',players:[...r.players.values()].map(p=>({id:p.id,name:p.name,animal:p.animal||'',score:p.score,ready:p.ready,submitted:p.submitted,online:p.online!==false})),endsAt:r.endsAt,startsAt:r.startsAt,race:r.game==='race'?{runners:r.race?.runners?.map(p=>({id:p.id,name:p.name,animal:p.animal}))}:null,log:r.log.slice(-6),results:r.results||[]}}
function emit(r){io.to(r.code).emit('room',publicRoom(r));saveRoom(r).catch(e=>console.error('Room save failed:',e.message))}
function onlineCount(r){return [...r.players.values()].filter(p=>p.online!==false).length}
function roomExpiry(r){clearTimeout(r.expireTimer);r.expireTimer=setTimeout(()=>{if(onlineCount(r)===0){clearTimeout(r.timer);clearInterval(r.raceInterval);rooms.delete(r.code);removeRoom(r.code).catch(e=>console.error('Room delete failed:',e.message))}},24*60*60*1000)}
function get(socket){const code=socket.data.room;return code&&rooms.get(code)}
function submit(r,p,value){if(r.phase!=='playing'||p.submitted)return;p.submitted=true;p.value=Math.max(0,Math.min(100,Number(value)||0));emit(r);if([...r.players.values()].every(x=>x.submitted))finish(r)}
function finish(r){if(r.phase!=='playing')return;clearTimeout(r.timer);clearInterval(r.raceInterval);r.raceInterval=null;if(r.game==='race')finishRace(r);r.phase='results';const ordered=[...r.players.values()].sort((a,b)=>{if(r.game==='race'){const ra=r.race?.runners.find(x=>x.id===a.id),rb=r.race?.runners.find(x=>x.id===b.id);return b.value-a.value||(rb?.p||0)-(ra?.p||0)}return b.value-a.value});const points=[100,70,50,30,20,10,5,3,2,1];r.results=ordered.map((p,i)=>({id:p.id,name:p.name,value:p.value,stars:r.game==='race'?r.race?.runners.find(x=>x.id===p.id)?.stars:undefined,distance:r.game==='race'?Math.round(r.race?.runners.find(x=>x.id===p.id)?.p||0):undefined,earned:points[i]}));ordered.forEach((p,i)=>p.score+=points[i]);emit(r)}
function start(r,game){clearTimeout(r.timer);clearInterval(r.raceInterval);r.game=GAMES.includes(game)?game:'tap';r.round++;r.phase='playing';r.startsAt=Date.now()+3000;r.race=r.game==='race'?makeRace(r):null;r.endsAt=r.startsAt+(r.game==='race'?30000:r.game==='memory'?22000:r.game==='rps'?18000:r.game==='bomb'?15000:12000);r.results=[];r.log=[];r.players.forEach(p=>{p.submitted=false;p.value=0;p.ready=false;p.shield=false;p.attackCount=0;p.effects=[]});r.seed=rand(100000);io.to(r.code).emit('game-config',{game:r.game,startsAt:r.startsAt,endsAt:r.endsAt,seed:r.seed});emit(r);if(r.game==='race'){r.race.lastTick=r.startsAt;r.raceInterval=setInterval(()=>raceTick(r),100);io.to(r.code).emit('race-state',raceSnapshot(r))}r.timer=setTimeout(()=>finish(r),r.endsAt-Date.now()+150)}
io.on('connection',s=>{
s.on('create',async({name,session}={},ack)=>{let c=code();while(rooms.has(c))c=code();const r={code:c,host:s.id,phase:'lobby',round:0,game:null,selectedGame:'tap',players:new Map(),log:[],timer:null,expireTimer:null};rooms.set(c,r);r.players.set(s.id,{id:s.id,name:clean(name),session:typeof session==='string'?session.slice(0,80):'',score:0,ready:false,online:true});s.join(c);s.data.room=c;try{await saveRoom(r);ack?.({ok:true,code:c,id:s.id});emit(r)}catch(e){rooms.delete(c);s.leave(c);s.data.room=null;ack?.({error:'房间保存失败，请重试'});console.error('Create room persistence:',e.message)}});
s.on('join',({code:raw,name,session}={},ack)=>{const c=String(raw||'').trim().toUpperCase(),r=rooms.get(c);if(!r)return ack?.({error:'房间已失效，请房主重新建立房间并分享新链接'});let old=null;if(typeof session==='string'&&session.length>=12){for(const p of r.players.values()){if(p.session===session){old=p;break}}}if(!old&&r.phase!=='lobby'&&r.phase!=='results')return ack?.({error:'游戏进行中，请稍后加入'});if(!old&&r.players.size>=10)return ack?.({error:'房间已满'});clearTimeout(r.expireTimer);r.expireTimer=null;if(old){r.players.delete(old.id);if(r.host===old.id)r.host=s.id;if(r.race)for(const runner of r.race.runners){if(runner.id===old.id)runner.id=s.id}r.players.set(s.id,{...old,id:s.id,name:clean(name),online:true})}else r.players.set(s.id,{id:s.id,name:clean(name),session:typeof session==='string'?session.slice(0,80):'',score:0,ready:false,online:true});s.join(c);s.data.room=c;ack?.({ok:true,code:c,id:s.id});emit(r)});
s.on('select-game',({game}={})=>{const r=get(s);if(r&&r.host===s.id&&r.phase!=='playing'&&GAMES.includes(game)){r.selectedGame=game;emit(r)}});
s.on('animal-choice',({animal}={})=>{const r=get(s),p=r?.players.get(s.id);if(r&&p&&r.phase!=='playing'&&RACE_ANIMALS.includes(animal)){p.animal=animal;emit(r)}});
s.on('start',({game}={})=>{const r=get(s);if(r&&r.host===s.id&&onlineCount(r)>=2&&r.phase!=='playing')start(r,r.selectedGame||game)});
s.on('race-input',({lane,jump,boost}={})=>{const r=get(s),g=r?.race,p=g?.runners.find(x=>x.id===s.id),now=Date.now();if(!r||r.phase!=='playing'||r.game!=='race'||!p||p.finished||now<r.startsAt||now>=r.endsAt)return;if(Number.isInteger(lane)&&lane>=0&&lane<=2)p.lane=lane;if(jump===true&&now>=p.jumpUntil)p.jumpUntil=now+850;if(typeof boost==='boolean')p.boost=boost});
s.on('submit',({value}={})=>{const r=get(s),p=r?.players.get(s.id);if(!p||r.game==='race'||Date.now()<r.startsAt-250||Date.now()>r.endsAt+1000)return;submit(r,p,value)});
s.on('attack',({target,card}={})=>{const r=get(s),p=r?.players.get(s.id),t=r?.players.get(target);if(!r||r.phase!=='playing'||!p||!t||p.id===t.id||p.attackCount>=1||Date.now()<r.startsAt||Date.now()>r.endsAt)return;if(!['freeze','reverse','ghost','steal','shield'].includes(card))return;p.attackCount++;if(card==='shield'){p.shield=true;r.log.push(`${p.name} 啟動防護盾`)}else if(t.shield){t.shield=false;s.emit('notice','對方護盾擋住了攻擊');r.log.push(`${t.name} 擋住了 ${p.name} 的攻擊`)}else{io.to(t.id).emit('effect',{card,until:Date.now()+1200,from:p.name});if(card==='steal'){p.score+=5;t.score=Math.max(0,t.score-5)}r.log.push(`${p.name} 對 ${t.name} 使用 ${card}`)}emit(r)});
s.on('disconnect',()=>{const r=get(s);if(!r)return;const p=r.players.get(s.id);if(!p)return;p.online=false;if(onlineCount(r)===0)roomExpiry(r);emit(r)})
});

// V0.6 prototype social API. No authentication: test data only; NOT secure for production/ranked use.
const fs=require('fs'),path=require('path');
const DATA=process.env.DATA_DIR||path.join(__dirname,'data');fs.mkdirSync(DATA,{recursive:true});
const DBFILE=path.join(DATA,'demo.json');let db={players:{},scores:[],challenges:[],matches:[]};
try{db={...db,...JSON.parse(fs.readFileSync(DBFILE,'utf8'))}}catch{}
function persist(){const tmp=DBFILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db));fs.renameSync(tmp,DBFILE)}
function sid(v){return typeof v==='string'&&/^[a-f0-9-]{12,80}$/i.test(v)}
function gameId(g){return ['tap','precision','reaction','memory','dodge','rps','bomb','mine'].includes(g)}
function player(id){return db.players[id]}
function display(id){return player(id)?.name||'玩家'}
function weekStart(t){const d=new Date(t),day=(d.getUTCDay()+6)%7;return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-day)-8*3600000+(d.getUTCHours()<8? -7*86400000:0)}
app.post('/api/profile',(req,res)=>{let id=req.body?.id,name=clean(req.body?.name||'玩家');if(!sid(id))return res.status(400).json({error:'无效玩家标识'});db.players[id]={name,updated:Date.now()};persist();res.json({id,name})});
app.get('/api/leaderboard',(req,res)=>{const game=String(req.query.game||'all'),weekly=req.query.period==='week';const cutoff=Date.now()-7*86400000;const scores=db.scores.filter(x=>(game==='all'||x.game===game)&&(!weekly||x.at>=cutoff));const best=new Map();for(const x of scores){const prev=best.get(x.id);if(!prev||x.score>prev.score)best.set(x.id,x)}res.json([...best.values()].sort((a,b)=>b.score-a.score).slice(0,50).map((x,i)=>({rank:i+1,name:display(x.id),score:x.score,id:x.id}))) });
app.post('/api/score',(req,res)=>{const {id,game}=req.body||{},score=Number(req.body?.score);if(!sid(id)||!player(id)||!gameId(game)||!Number.isInteger(score)||score<0||score>100)return res.status(400).json({error:'成绩格式错误'});const item={id,game,score,at:Date.now(),key:crypto.randomUUID()};db.scores.push(item);db.scores=db.scores.slice(-10000);persist();res.json({ok:true,key:item.key})});
app.post('/api/challenge',(req,res)=>{const {id,game}=req.body||{},score=Number(req.body?.score);if(!sid(id)||!player(id)||!gameId(game)||!Number.isInteger(score)||score<0||score>100)return res.status(400).json({error:'挑战数据错误'});const c={id:crypto.randomBytes(6).toString('hex'),owner:id,game,score,created:Date.now(),expires:Date.now()+48*3600000,entries:[]};db.challenges.push(c);db.challenges=db.challenges.slice(-1000);persist();res.json({id:c.id,expires:c.expires})});
app.get('/api/challenge/:id',(req,res)=>{const c=db.challenges.find(x=>x.id===req.params.id);if(!c)return res.status(404).json({error:'挑战不存在'});res.json({id:c.id,ownerName:display(c.owner),game:c.game,score:c.score,expires:c.expires,entries:c.entries.map(x=>({name:display(x.id),score:x.score,at:x.at}))})});
app.post('/api/challenge/:id/submit',(req,res)=>{const c=db.challenges.find(x=>x.id===req.params.id),id=req.body?.id,score=Number(req.body?.score);if(!c||c.expires<Date.now())return res.status(404).json({error:'挑战已过期或不存在'});if(!sid(id)||!player(id)||id===c.owner||c.entries.some(x=>x.id===id)||!Number.isInteger(score)||score<0||score>100)return res.status(400).json({error:'提交不符合规则'});c.entries.push({id,score,at:Date.now()});db.matches.push({a:c.owner,b:id,game:c.game,aScore:c.score,bScore:score,at:Date.now()});persist();res.json({ok:true,won:score>c.score,tie:score===c.score})});
app.get('/api/rivals/:id',(req,res)=>{const id=req.params.id;if(!sid(id))return res.status(400).json({error:'无效玩家'});const rivals=new Map();for(const m of db.matches){if(m.a!==id&&m.b!==id)continue;const other=m.a===id?m.b:m.a;const x=rivals.get(other)||{id:other,wins:0,losses:0,draws:0,last:0};const a=m.a===id?m.aScore:m.bScore,b=m.a===id?m.bScore:m.aScore;if(a>b)x.wins++;else if(a<b)x.losses++;else x.draws++;x.last=m.at;rivals.set(other,x)}res.json([...rivals.values()].sort((a,b)=>b.last-a.last).map(x=>({...x,name:display(x.id)})))});
app.get('/api/health',(req,res)=>res.json({ok:true,version:'0.9-room-storage',roomStorage:hasDatabase?'postgres':'memory',roomCount:rooms.size}));

const PORT=process.env.PORT||3000;loadSavedRooms(rooms).then(()=>server.listen(PORT,()=>console.log('Party Clash running on http://localhost:'+PORT))).catch(err=>{console.error('Persistent room store unavailable:',err);process.exit(1)});
