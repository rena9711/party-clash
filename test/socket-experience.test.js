const { before, after, test } = require('node:test');
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
  const started=until(owner.socket,'room',r=>r.phase==='playing'&&r.game===game);
  owner.socket.emit('start',{game});
  await started;
  return code;
}

test('memory synchronizes, reconnects, breaks a bottom tie and crowns one winner', {concurrency:true,timeout:65000}, async ()=>{
  const [a,b,c]=await Promise.all([player('甲'),player('乙'),player('丙')]);
  const results=until(a.socket,'room',r=>r.game==='memory'&&r.phase==='results',60000);
  const firstA=until(a.socket,'memory-state',s=>s.attempt===1&&s.cell!==null);
  const firstB=until(b.socket,'memory-state',s=>s.attempt===1&&s.cell!==null);
  const tracked=new Map();
  a.socket.on('memory-state',s=>{
    if(s.cell!==null){
      const flash=Math.max(700,1300-s.round*100);
      const index=Math.floor((s.now-s.startsAt)/(flash+400));
      const sequence=tracked.get(s.attempt)||[];
      sequence[index]=s.cell;
      tracked.set(s.attempt,sequence);
    }
  });
  const code=await start('memory',[a,b,c]);
  const [sa,sb]=await Promise.all([firstA,firstB]);
  assert.equal(sa.startsAt,sb.startsAt);
  assert.equal(sa.cell,sb.cell);
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
