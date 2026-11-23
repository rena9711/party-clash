const { before, after, describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const connect = require(path.resolve(require.resolve('socket.io'), '../../client-dist/socket.io.js'));

let child, origin;
const sockets = new Set();

function until(socket, event, matches = () => true, milliseconds = 15000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error('Timed out waiting for '+event));
    }, milliseconds);
    function listener(data) {
      if (!matches(data)) return;
      clearTimeout(timeout);
      socket.off(event, listener);
      resolve(data);
    }
    socket.on(event, listener);
  });
}

before(async () => {
  const port = 32000 + process.pid % 20000;
  child = spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),DATABASE_URL:''},stdio:['ignore','pipe','inherit']});
  origin = 'http://127.0.0.1:'+port;
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Local server did not start')),5000);
    child.once('error',reject);
    child.stdout.on('data',data=>{
      if(String(data).includes('Party Clash running')){
        clearTimeout(timeout);
        resolve();
      }
    });
  });
});
after(() => {
  for(const socket of sockets) socket.disconnect();
  child?.kill();
});

async function player(name, session=randomUUID()){
  const socket=connect(origin,{transports:['websocket'],reconnection:false,forceNew:true});
  sockets.add(socket);
  await until(socket,'connect',()=>true,5000);
  return {socket,name,session};
}
async function request(p,event,fields={}){
  const answer=await p.socket.timeout(5000).emitWithAck(event,{name:p.name,session:p.session,...fields});
  assert.equal(answer.ok,true);
  p.id=answer.id;
  return answer;
}
async function start(game,players){
  const [owner,...guests]=players;
  const {code}=await request(owner,'create');
  for(const guest of guests)await request(guest,'join',{code});
  const selected=until(owner.socket,'room',r=>r.selectedGame===game);
  owner.socket.emit('select-game',{game});
  await selected;
  if(game==='race'){
    const {animals}=require('../public/player-identity');
    const all=await Promise.all(players.map((p,index)=>p.socket.timeout(5000).emitWithAck('race-character',animals[index][0])));
    assert.ok(all.every(result=>result.ok));
  }
  const started=until(owner.socket,'room',r=>r.phase==='playing'&&r.game===game);
  owner.socket.emit('start',{game});
  await started;
  return code;
}

describe('independent room regressions', {concurrency:true}, ()=>{
test('memory synchronizes, reconnects, breaks a bottom tie and crowns one winner', {concurrency:true,timeout:65000}, async ()=>{
  const [a,b,c]=await Promise.all([player('甲'),player('乙'),player('丙')]);
  const results=until(a.socket,'room',r=>r.game==='memory'&&r.phase==='results',60000);
  const firstA=until(a.socket,'memory-state',s=>s.attempt===1&&s.cues.length>0);
  const firstB=until(b.socket,'memory-state',s=>s.attempt===1&&s.cues.length>0);
  const tracked=new Map();
  a.socket.on('memory-state',s=>{
    const flash=Math.max(500,800-s.round*50);
    const sequence=tracked.get(s.attempt)||[];
    for(const cue of s.cues) {
      const index=Math.round((cue.on-s.startsAt)/(flash+200));
      sequence[index]=cue.cell;
    }
    tracked.set(s.attempt,sequence);
  });
  const code=await start('memory',[a,b,c]);
  const [sa,sb]=await Promise.all([firstA,firstB]);
  assert.equal(sa.startsAt,sb.startsAt);
  assert.deepEqual(sa.cues,sb.cues);
  assert.equal(sa.answerAt-sa.startsAt,3600);
  assert.equal(sa.endsAt-sa.answerAt,10000);
  assert.equal(typeof await a.socket.timeout(5000).emitWithAck('memory-clock'),'number');
  b.socket.disconnect();
  const resumed=await player(b.name,b.session);
  const resumedState=until(resumed.socket,'memory-state',s=>s.attempt===1);
  await request(resumed,'join',{code});
  assert.equal((await resumedState).startsAt,sa.startsAt);
  async function submit(p,attempt,cellFor,count=1){
    await until(p.socket,'memory-state',s=>s.attempt===attempt&&s.now>=s.answerAt,35000);
    for(let index=0;index<count;index++){
      const accepted=until(p.socket,'memory-state',s=>s.attempt===attempt&&s.answers.some(x=>x.id===p.id&&(x.correct>index||x.done)));
      p.socket.emit('memory-answer',{attempt,index,cell:cellFor(tracked.get(attempt)[index])});
      await accepted;
    }
  }
  const wrong=(x)=>(x+1)%9;
  const correct=x=>x;
  // Two mistakes tie at the bottom. The third player advances on correct count.
  await Promise.all([submit(a,1,wrong),submit(resumed,1,wrong),submit(c,1,correct,4)]);
  await Promise.all([submit(a,2,wrong),submit(resumed,2,correct,4)]);
  // A watches round 2. C deliberately lets the deadline elapse.
  const next=await until(a.socket,'memory-state',s=>s.round===2);
  assert.deepEqual(next.eliminated,[a.id]);
  assert.equal(next.answers.some(x=>x.id===a.id),false);
  await submit(resumed,3,correct,5);
  const final=await results;
  assert.equal(final.results[0].id,resumed.id);
  assert.equal(final.results[0].earned,100);
  assert.deepEqual(final.results.map(x=>x.id),[resumed.id,c.id,a.id]);
});

test('Snake selection, input, disconnect/rejoin and server settlement', {concurrency:true,timeout:75000},async()=>{
  const [a,b]=await Promise.all([player('蛇甲'),player('蛇乙')]);
  const initial=until(a.socket,'snake-state',s=>s.players.length===2);
  const final=until(a.socket,'room',r=>r.game==='snake'&&r.phase==='results',70000);
  const code=await start('snake',[a,b]);
  const state=await initial;
  assert.ok(state.foods.length>0);
  let live=await until(a.socket,'snake-state',s=>s.now>=s.startsAt&&s.players.find(x=>x.id===a.id)?.body.length>=2);
  let snake=live.players.find(x=>x.id===a.id);
  const [head,next]=snake.body;
  const direction=head.x!==next.x?{x:0,y:head.y<live.height/2?1:-1}:{x:head.x<live.width/2?1:-1,y:0};
  const turned=until(a.socket,'snake-state',s=>{
    const p=s.players.find(x=>x.id===a.id);
    return p?.body.length>=2&&p.body[0].x-p.body[1].x===direction.x&&p.body[0].y-p.body[1].y===direction.y;
  },5000);
  a.socket.emit('snake-input',direction);
  await turned;
  b.socket.disconnect();
  const resumed=await player(b.name,b.session);
  const respawn=until(resumed.socket,'snake-state',s=>s.players.some(p=>p.id===resumed.id&&p.body.length>0),7000);
  await request(resumed,'join',{code});
  await respawn;
  const result=await final;
  assert.equal(result.results.length,2);
  assert.equal(result.results.some(p=>p.id===resumed.id),true);
});


test('all eight games can be selected and start in two-player rooms', {timeout:20000},async()=>{
  for (const game of ['tap','precision','reaction','memory','bomb','mine','race','snake']) {
    const players=await Promise.all([player('主 '+game),player('客 '+game)]);
    await start(game,players);
    for(const p of players) p.socket.disconnect();
  }
});

test('identity validation, atomic character reservation, start gate, and release', {timeout:16000},async()=>{
  const [a,b,c]=await Promise.all([player('狐狸甲'),player('狐狸乙'),player('第三位')]);
  const ack=(p,event,data)=>p.socket.timeout(5000).emitWithAck(event,data);
  assert.equal((await ack(a,'create',{session:a.session})).error,'请输入你的名字');
  assert.equal((await ack(a,'create',{name:'　 ',session:a.session})).error,'请输入你的名字');
  assert.equal((await ack(a,'create',{name:'中'.repeat(13),session:a.session})).error,'昵称最多 12 个字符');
  const {code}=await request(a,'create');
  assert.equal((await ack(b,'join',{code,session:b.session})).error,'请输入你的名字');
  assert.equal((await ack(b,'join',{code,session:b.session,name:' 狐狸甲 '})).error,'该昵称已被使用，请换一个名字');
  await request(b,'join',{code,name:'👨‍👩‍👧‍👦'.repeat(12)});
  const selected=until(a.socket,'room',r=>r.selectedGame==='race');
  a.socket.emit('select-game',{game:'race'});
  await selected;
  a.socket.emit('start',{game:'race'});
  const attempts=await Promise.all([ack(a,'race-character','fox'),ack(b,'race-character','fox')]);
  assert.equal(attempts.filter(r=>r.ok).length,1);
  assert.equal(attempts.filter(r=>r.error==='该角色已被选择').length,1);
  const winner=attempts[0].ok?a:b;
  const loser=winner===a?b:a;
  const stillLobby=until(loser.socket,'room',r=>r.phase==='lobby');
  assert.equal((await ack(loser,'race-character','rabbit')).ok,true);
  await stillLobby;
  assert.equal((await loser.socket.timeout(5000).emitWithAck('leave-room')).ok,true);
  await request(c,'join',{code});
  assert.equal((await ack(c,'race-character','rabbit')).ok,true);
  winner.socket.disconnect();
  const again=await player(winner.name,winner.session);
  const originalName=winner===a?'狐狸甲':'👨‍👩‍👧‍👦'.repeat(12);
  const reconnected=until(again.socket,'room',r=>r.players.some(p=>p.name===originalName&&p.character==='fox'));
  await request(again,'join',{code,resume:true,name:'不能覆盖原昵称'});
  const state=await reconnected;
  assert.equal(state.players.length,2);
  assert.equal(state.players.find(p=>p.id===again.id).name,originalName);
  assert.equal(state.players.find(p=>p.id===c.id).character,'rabbit');
});
for (const count of [2,5,10]) {
  test('3D race synchronizes '+count+' players, reconnects and settles once', {timeout:62000},async()=>{
    const {createTrack}=await import('../public/race-v3/simulation.mjs');
    const roster=await Promise.all(Array.from({length:count},(_,i)=>player('跑手 '+i)));
    const [host,guest]=roster;
    const initial=roster.map(p=>until(p.socket,'race-state',s=>s.version===3&&s.runners.length===count));
    const finished=until(host.socket,'room',s=>s.game==='race'&&s.phase==='results',58000);
    const code=await start('race',roster);
    const states=await Promise.all(initial);
    const first=states[0];
    for(const state of states){
      assert.equal(state.seed,first.seed);
      assert.equal(state.startsAt,first.startsAt);
      assert.equal(state.endsAt-state.startsAt,45000);
      assert.equal(new Set(state.runners.map(p=>p.slot)).size,count);
      assert.ok(state.runners.every(p=>p.health===3&&p.stars===0));
      assert.deepEqual(state.runners.map(p=>p.character),first.runners.map(p=>p.character));
      assert.equal(new Set(state.runners.map(p=>p.character)).size,count);
    }
    let last=first;
    const collect=until(host.socket,'race-state',s=>s.runners.some(p=>p.id===host.id&&p.stars>0),10000);
    host.socket.on('race-state',state=>{last=state});
    const track=createTrack(first.seed);
    const hazards=track.filter(item=>item.kind!=='star');
    const firstStar=track[0];
    const drive=setInterval(()=>{
      const mine=last.runners.find(p=>p.id===host.id);
      const next=hazards.find(item=>item.at>mine.distance-.9);
      if(!next||mine.done||last.now<first.startsAt)return;
      const target=next===hazards[0]?firstStar.x:(next.x>=0?-3.15:3.15);
      const axis=Math.max(-1,Math.min(1,(target-mine.x-mine.vx*.11)*2));
      host.socket.volatile.emit('race-input',{axis});
    },40);
    try{
      const gathered=await collect;
      assert.ok(gathered.consumed.length>0);
      const guestBefore=gathered.runners.find(r=>r.id===guest.id);
      assert.ok(guestBefore.distance>0);
      guest.socket.disconnect();
      const rejoined=await player(guest.name,guest.session);
      const recovery=until(rejoined.socket,'race-state',s=>s.runners.some(r=>r.id===rejoined.id));
      await request(rejoined,'join',{code,name:undefined,resume:true});
      const snapshot=await recovery;
      const resumed=snapshot.runners.find(r=>r.id===rejoined.id);
      assert.equal(snapshot.seed,first.seed);
      assert.equal(snapshot.startsAt,first.startsAt);
      assert.equal(resumed.slot,guestBefore.slot);
      assert.equal(resumed.character,guestBefore.character);
      assert.equal(resumed.name,guestBefore.name);
      assert.ok(resumed.stars>=guestBefore.stars && resumed.stars<100);
      assert.ok(resumed.distance>=guestBefore.distance);
      assert.equal(snapshot.runners.length,count);
      rejoined.socket.emit('submit',{value:100});
      rejoined.socket.emit('race-input',{axis:200,stars:900,health:90,boost:true});
      const boost=await until(rejoined.socket,'race-state',s=>s.runners.some(r=>r.id===rejoined.id&&r.boostUntil>r.time));
      assert.ok(boost.runners.find(r=>r.id===rejoined.id).health<=3);
      const results=await finished;
      assert.equal(results.results.length,count);
      assert.equal(new Set(results.results.map(r=>r.id)).size,count);
      assert.ok(results.results.filter(r=>r.id===rejoined.id).length===1);
      assert.ok(results.results.every(r=>r.value===r.stars*10&&r.stars<100&&r.character));
      assert.ok(results.results.every((r,i)=>i===0||results.results[i-1].stars>=r.stars));
      assert.ok(results.players.every(p=>p.score===results.results.find(r=>r.id===p.id).earned));
      if (count===2)assert.ok(Date.now()>=first.endsAt,'steering player completes the full 45 second race');
    }finally{
      clearInterval(drive);
    }
  });
}
});
