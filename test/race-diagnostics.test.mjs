import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDiagnostics} from '../public/race-v3/diagnostics.mjs';

test('diagnostics record a 45-second multiplayer window and keep per-frame and network channels separate', () => {
  const prior={performance:globalThis.performance,innerWidth:globalThis.innerWidth,
    innerHeight:globalThis.innerHeight,devicePixelRatio:globalThis.devicePixelRatio};
  let now=10;
  Object.assign(globalThis,{performance:{now:()=>now,timeOrigin:0,memory:{usedJSHeapSize:10485760}},innerWidth:390,innerHeight:800,devicePixelRatio:2});
  const tracker=createDiagnostics({city:'legacy',multiplayer:true});
  try{
    tracker.begin(now,{clock:99,startsAt:100});
    assert.equal(tracker.active,false);
    tracker.begin(now,{clock:100,startsAt:100,runners:Array(10)});
    for(let frame=0;frame<=2700;frame++){
      now=10+frame*1000/60;
      if(frame%6===0)tracker.snapshot(now,100+frame*1000/60,1200,.4);
      if(frame%120===0)tracker.rtt(18);
      tracker.beginFrame();
      tracker.render({calls:45,triangles:30000},3);
      tracker.frame(now,5);
    }
    tracker.finish(true);
    const data=tracker.export();
    assert.equal(data.summary.recordedMs,45000);
    assert.equal(data.summary.frames,2701);
    assert.equal(data.session.reachedScheduledEnd,true);
    assert.equal(data.session.players,10);
    assert.ok(Math.abs(data.summary.fps-60)<.01);
    assert.equal(data.summary.low1Fps,59.999);
    assert.equal(data.summary.jsP95Ms,2);
    assert.equal(data.summary.renderSubmitP95Ms,3);
    assert.equal(data.summary.heapP95MiB,10);
    assert.equal(data.summary.snapshotCount,451);
    assert.equal(data.summary.snapshotBytesP50,1200);
    assert.equal(data.summary.snapshotGapP95Ms,100);
    assert.equal(data.summary.rttP95Ms,18);
    assert.deepEqual(data.frames[0],[0,null,2,3,45,30000,10]);
    assert.equal(data.summary.gpuP95Ms,null);
  }finally{
    tracker.dispose();
    Object.assign(globalThis,prior);
  }
});
