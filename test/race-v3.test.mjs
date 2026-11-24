import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutNameplates, raceModelScale, useDistantModel } from "../public/race-v3/presentation.mjs";
import { advance, boost, BOOST_COOLDOWN, BOUNDARY, createRun, createTrack, DURATION, jump, PROTECTION, screenTilt, STEP, tiltInput } from '../public/race-v3/simulation.mjs';

function tick(run, seconds, direction = 0) {
  for(let i=0;i<Math.ceil(seconds/STEP);i++)advance(run,STEP,direction);
}
function emptyRoad() {
  const run=createRun(()=>.5);
  run.nextDistance=Infinity;
  return run;
}
const hurdle=at=>({kind:'hurdle',x:0,at,height:.74,width:2.55});
const bomb=at=>({kind:'bomb',x:0,at,height:.85,width:1.05});
const star=(at,y=.65)=>({kind:'star',x:0,at,y});

test('screen orientation and sensitivity preserve signed movement and a neutral dead zone', () => {
  assert.equal(screenTilt(20, 7, 0),7);
  assert.ok(Math.abs(screenTilt(20, 7, 90)-20)<1e-9);
  assert.ok(Math.abs(screenTilt(20, 7, 270)+20)<1e-9);
  assert.equal(screenTilt(null, 7, 0),null);
  assert.equal(tiltInput(2.9,'high'),0);
  assert.ok(tiltInput(8,'high')>tiltInput(8,'medium'));
  assert.ok(tiltInput(8,'medium')>tiltInput(8,'low'));
  assert.equal(tiltInput(-99,'low'),-1);
});

test('continuous lateral motion, boundary clamp and no auto-centering after returning to neutral', () => {
  const slow=emptyRoad(),fast=emptyRoad();
  tick(slow,.3,.25);tick(fast,.3,1);
  assert.ok(slow.x>0 && fast.x>slow.x && fast.x<BOUNDARY);
  tick(fast,.7,0);
  const parked=fast.x;
  assert.ok(parked>0);
  assert.equal(fast.vx,0);
  tick(fast,1,0);
  assert.equal(fast.x,parked);
  tick(fast,2,-1);
  assert.equal(fast.x,-BOUNDARY);
});

test('jump cannot repeat in midair; height clears a hurdle and can collect an elevated star', () => {
  const run=emptyRoad();
  run.objects.push(hurdle(5),star(5,1.55));
  assert.equal(jump(run),true);
  assert.equal(jump(run),false);
  tick(run,.46);
  assert.ok(run.y>1);
  assert.equal(run.health,3);
  assert.equal(run.stars,1);
  tick(run,.44);
  assert.equal(run.y,0);
  assert.ok(run.landedAt>0);
  assert.equal(jump(run),true);
});

test('ground contact with a hurdle costs one life, while a laterally clear pass is harmless', () => {
  const run=emptyRoad();
  run.objects.push(hurdle(4));
  tick(run,.65);
  assert.equal(run.health,2);
  assert.equal(run.hit.kind,'hurdle');
  const clear=emptyRoad();
  clear.x=3;
  clear.objects.push(hurdle(4));
  tick(clear,.65);
  assert.equal(clear.health,3);
});

test('bomb damage preserves stars and grants 1.5 seconds of protection', () => {
  const run=emptyRoad();
  run.objects.push(star(2),bomb(4),bomb(7));
  tick(run,.65);
  assert.equal(run.health,2);
  assert.equal(run.stars,1);
  assert.equal(run.hit.kind,'bomb');
  assert.equal(run.protectedUntil-run.hit.time,PROTECTION);
  tick(run,1.6);
  run.objects.push(bomb(run.distance+3));
  tick(run,.4);
  assert.equal(run.health,1);
  assert.equal(run.stars,1);
});

test('zero lives stops a run immediately and a timed result retains its star count', () => {
  const fatal=emptyRoad();
  fatal.health=1;
  fatal.objects.push(bomb(3));
  tick(fatal,1);
  assert.equal(fatal.done,true);
  assert.equal(fatal.health,0);
  assert.ok(fatal.time<1);
  const timed=emptyRoad();
  timed.stars=6;
  tick(timed,DURATION+1);
  assert.equal(timed.time,DURATION);
  assert.equal(timed.stars,6);
  assert.equal(timed.done,true);
});

test('successive obstacle waves reserve a bypass and repeated complete runs keep the object list bounded', () => {
  for(let attempt=0;attempt<12;attempt++){
    const run=createRun(()=>attempt/12);
    const seen=new Map();
    while(!run.done){
      advance(run,STEP,run.x>2.5?0:1);
      for(const object of run.objects){
        if(object.kind!=='star')seen.set(object.at,object);
      }
      assert.ok(run.objects.length<=24);
    }
    const waves=[...seen.values()];
    for(let i=0;i<waves.length;i++){
      const object=waves[i];
      const bypass=object.x>0?-BOUNDARY:BOUNDARY;
      assert.ok(Math.abs(object.x-bypass)>object.width/2+.34);
      if(i>0){
        assert.ok(object.at-waves[i-1].at>=19);
        assert.notEqual(object.kind,waves[i-1].kind);
      }
    }
  }
});

test('denser waves have three separated ground stars and one additional reachable hurdle star', () => {
  for (const sample of [0, .5, .999]) {
    const run = createRun(() => sample);
    advance(run, STEP, 0);
    const waves = run.objects.filter(item => item.kind !== 'star');
    assert.ok(waves.length >= 2);
    let previous = -Infinity;
    let total = 0;
    let previousDensity = 0;
    for (const obstacle of waves) {
      const stars = run.objects.filter(item => item.kind === 'star' && item.at > previous && item.at <= obstacle.at);
      const ground = stars.filter(item => item.y < 1);
      assert.equal(ground.length, 3);
      assert.deepEqual(ground.map(item => obstacle.at - item.at), [14, 10.5, 7]);
      assert.ok(ground.every(item => Math.abs(item.x) <= BOUNDARY && item.y === .65));
      assert.ok(ground.every((item,i) => i===0 || Math.abs(item.x-ground[i-1].x) <= .45));
      const elevated = stars.find(item => item.y >= 1);
      if (obstacle.kind === 'hurdle') {
        assert.ok(elevated && elevated.y - .38 > obstacle.height);
        assert.equal(elevated.x, obstacle.x);
        assert.equal(elevated.at, obstacle.at);
      } else {
        assert.equal(elevated, undefined);
      }
      total += stars.length;
      previousDensity += obstacle.kind === 'hurdle' ? 2 : 1;
      previous = obstacle.at;
    }
    assert.ok(total / previousDensity >= 2 && total / previousDensity <= 3);
  }
  const trail = createRun(() => .5);
  trail.x = -(1.55 + .5 * 1.25);
  tick(trail, 1.6);
  assert.equal(trail.stars, 3);
  assert.equal(trail.health, 3);
});

test('server race uses one seeded course, authoritative action limits and runner-owned pickups', async () => {
  const {createRace, advanceRace, applyInput, clearInput, snapshotRace, standings} = await import('../race-v3-room.mjs');
  const roster=Array.from({length:10},(_,i)=>({id:String(i),name:'玩家 '+i}));
  const race=createRace(roster,42,3000);
  const [a,b]=race.runners;
  assert.equal(race.endsAt-race.startsAt,45000);
  assert.deepEqual(a.run.track,b.run.track);
  assert.deepEqual(a.run.track,createTrack(42));
  assert.notDeepEqual(a.run.track,createTrack(43));
  applyInput(race,a.id,{axis:1,jump:true,boost:true},2999);
  assert.equal(a.axis,0);
  applyInput(race,a.id,{axis:20,stars:999,health:99},3000);
  assert.equal(a.axis,0);
  applyInput(race,a.id,{axis:.75,jump:true,boost:true},3000);
  assert.equal(advanceRace(race,3250),false);
  assert.ok(a.run.y>0 && a.run.x>b.run.x-.65);
  assert.equal(a.run.boostReadyAt,BOOST_COOLDOWN);
  assert.ok(a.run.distance>b.run.distance);
  assert.equal(a.run.stars,0);
  assert.equal(a.run.health,3);
  assert.equal(boost(a.run),false);
  clearInput(a);
  a.id='reconnected';
  const {unpackRace}=await import('../public/race-v3/wire.mjs');
  const resumed=unpackRace(snapshotRace(race,'reconnected',3250));
  assert.ok(resumed.runners.some(runner=>runner.id==='reconnected'&&runner.slot===0));
  assert.ok(!resumed.runners.some(runner=>runner.id==='0'));
  const x=a.run.x;
  applyInput(race,'0',{axis:1,boost:true},3250);
  assert.equal(a.axis,0);
  advanceRace(race,3600);
  assert.ok(Math.abs(a.run.x-x)<.5);
  assert.equal(advanceRace(race,48000),true);
  assert.deepEqual(unpackRace(snapshotRace(race,a.id,48000)).runners.map(p=>p.id),standings(race).map(p=>p.id));
});

test('reconnect preserves consumed star identity and cannot award it again', async () => {
  const {createRace, advanceRace, clearInput, snapshotRace} = await import('../race-v3-room.mjs');
  const race=createRace([{id:'before',name:'跑手'},{id:'other',name:'好友'}],5,3000);
  const runner=race.runners[0];
  runner.run.track=[{id:77,kind:'star',at:.5,x:runner.run.x,y:.65}];
  advanceRace(race,3025);
  assert.equal(runner.run.stars,1);
  assert.deepEqual(snapshotRace(race,runner.id,3025).consumed,[[77,null]]);
  clearInput(runner);
  runner.id='after';
  advanceRace(race,3075);
  assert.equal(runner.run.stars,1);
  assert.deepEqual(snapshotRace(race,'after',3075).consumed,[[77,null]]);
  assert.deepEqual(snapshotRace(race,'other',3075).consumed,[]);
});

test('race model scale follows roster size and distant models activate beyond 22 units', () => {
  assert.deepEqual(Array.from({length:9},(_,i)=>raceModelScale(i+2)),
    [1,1,.85,.85,.75,.75,.65,.65,.65]);
  assert.equal(useDistantModel(-23),true);
  assert.equal(useDistantModel(-22),false);
  assert.equal(useDistantModel(25),false);
});

test('small viewports prioritize the self label and keep placed names apart', () => {
  const crowded=Array.from({length:10},(_,id)=>({id,self:id===9,name:'玩家姓名 '+id,x:.98,y:.46,z:-id}));
  for(const width of [320,375,393]){
    const labels=layoutNameplates(crowded,width,760,caption=>caption.length*12);
    assert.ok(labels.length>1);
    assert.equal(labels[0].caption,'我 · 玩家姓名 9');
    for(const [i,label] of labels.entries()){
      assert.ok(label.left>=0&&label.left+label.width<=width);
      for(const other of labels.slice(i+1)){
        assert.ok(label.left+label.width<=other.left||other.left+other.width<=label.left||
          label.top+19<=other.top||other.top+19<=label.top);
      }
    }
  }
});

test('compact race snapshots round only display coordinates and preserve recipient effects', async () => {
  const {createRace, sharedRaceSnapshot, snapshotRace}=await import('../race-v3-room.mjs');
  const {unpackRace}=await import('../public/race-v3/wire.mjs');
  const race=createRace([{id:'a',name:'跑手🦊',character:'fox'},{id:'b',name:'跑手🐰',character:'rabbit'}],123,1000);
  const run=race.runners[0].run;
  run.x=.123456;
  run.stars=2;
  run.objects.push({id:7,used:true,impactTime:.42});
  const shared=sharedRaceSnapshot(race,2000);
  const a=snapshotRace(race,'a',2000,shared), b=snapshotRace(race,'b',2000,shared);
  assert.equal(a.rows,b.rows);
  const decoded=unpackRace(JSON.parse(JSON.stringify(a)));
  assert.deepEqual(decoded.consumed,[[7,.42]]);
  assert.deepEqual(b.consumed,[]);
  assert.equal(decoded.runners[0].name,'跑手🦊');
  assert.equal(decoded.runners[0].stars,2);
  assert.equal(decoded.runners[0].x,.123);
  assert.equal(decoded.runners[1].rank,2);
  assert.ok(JSON.stringify(a).length<JSON.stringify(decoded).length);
});

test('room input predicts local motion, coalesces steady input and retains authoritative stars', async () => {
  const {connectRaceView}=await import('../public/race-v3/room-client.mjs');
  const {createRace,snapshotRace}=await import('../race-v3-room.mjs');
  const originalWindow=globalThis.window, originalLocation=globalThis.location, originalPerformance=globalThis.performance;
  let time=1000;
  globalThis.performance={now:()=>time};
  const messages=[];
  const parent={postMessage(message){messages.push(message)}};
  let receive;
  globalThis.window={parent,addEventListener(_event,callback){receive=callback}};
  globalThis.location={origin:'https://race.test'};
  try {
    const view=connectRaceView();
    const race=createRace([{id:'local',name:'甲',character:'fox'},{id:'other',name:'乙',character:'rabbit'}],99,1000);
    const deliver=(time,connected=true)=>{
      receive({origin:location.origin,source:parent,data:{
        type:'party-race-state',state:snapshotRace(race,'local',time),playerId:'local',connected
      }});
    };
    deliver(1100);
    const now=performance.now();
    const initial=view.sample(now,0).run.x;
    for(let step=1;step<=7;step++)view.sample(now+step*16,.016,1);
    const predicted=view.sample(now+128,.016,1).run;
    assert.ok(predicted.x>initial+.1);
    assert.equal(predicted.stars,0);
    assert.equal(messages.filter(p=>p.input?.axis===1).length,1);
    view.sample(now+150,.016,0);
    assert.equal(messages.at(-1).input.axis,0);
    const releases=messages.filter(p=>p.input?.axis===0).length;
    view.sample(now+450,.016,0);
    assert.equal(messages.filter(p=>p.input?.axis===0).length,releases);
    race.runners[0].run.stars=3;
    time=1450;
    deliver(1550);
    assert.equal(view.sample(time,0).run.stars,3);
    race.runners[1].run.distance=1.2;
    time=1550;
    deliver(1650);
    const receipt=performance.now();
    view.sample(receipt+150,.06);
    const early=view.sample(receipt+195,.06).others[0].distance;
    const later=view.sample(receipt+225,.03).others[0].distance;
    assert.ok(later>early && later<=2.4);
    const capped=view.sample(receipt+350,.10).others[0].distance;
    assert.ok(Math.abs(capped-2.4)<.01);
    assert.equal(view.sample(receipt+395,.045).others[0].distance,capped);
    deliver(1650,false);
    assert.equal(view.sample(performance.now(),0).connected,false);
    race.runners[0].run.done=true;
    race.runners[0].run.health=0;
    race.runners[1].run.distance=120;
    time=1750;
    deliver(1850);
    const spectating=view.sample(time+180,.10,1);
    assert.equal(spectating.run.id,'local');
    assert.equal(spectating.moving,false);
    assert.equal(spectating.watched.id,'other');
    assert.ok(spectating.watched.objects.some(object=>object.at>120));
    const previousDistance=spectating.watched.distance;
    race.runners[1].run.distance=126;
    time=1950;
    deliver(2050);
    assert.ok(view.sample(time+180,.10,1).watched.distance>previousDistance);
    race.runners[1].run.done=true;
    time=2150;
    deliver(2250);
    assert.equal(view.sample(time+180,.10).watched,null);

  } finally {
    globalThis.performance=originalPerformance;
    if(originalWindow===undefined)delete globalThis.window;
    else globalThis.window=originalWindow;
    if(originalLocation===undefined)delete globalThis.location;
    else globalThis.location=originalLocation;
  }
});
