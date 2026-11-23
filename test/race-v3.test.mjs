import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, BOUNDARY, createRun, DURATION, jump, PROTECTION, screenTilt, STEP, tiltInput } from '../public/race-v3/simulation.mjs';

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
      assert.ok(run.objects.length<=18);
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
