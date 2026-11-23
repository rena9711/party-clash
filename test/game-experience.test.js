const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const tournament = require('../memory-tournament');

test('memory flash timing, repeated cells, cutoff, timing ranks and tiebreak', () => {
  const game = tournament.create(['a','b','c']);
  tournament.next(game, 1000, () => 6);
  const turn = game.turn;
  assert.equal(turn.answerAt - turn.startsAt, 6000);
  assert.equal(tournament.snapshot(game, turn.startsAt).cell, 6);
  assert.equal(tournament.snapshot(game, turn.startsAt + 1199).cell, 6);
  assert.equal(tournament.snapshot(game, turn.startsAt + 1200).cell, null);
  assert.equal(tournament.snapshot(game, turn.startsAt + 1600).cell, 6);
  assert.equal(tournament.snapshot(game, turn.answerAt).cell, null);
  assert.equal('sequence' in tournament.snapshot(game, turn.startsAt), false);
  assert.equal(tournament.answer(game, 'a', 1, 0, 6, turn.answerAt - 1), false);
  assert.equal(tournament.answer(game, 'a', 1, 0, 6, turn.endsAt), false);
  assert.equal(tournament.answer(game, 'a', 1, 0, 2, turn.answerAt), true);
  assert.equal(tournament.answer(game, 'a', 1, 0, 6, turn.answerAt + 1), false);
  for (let i=0; i<4; i++) assert(tournament.answer(game, 'c', 1, i, 6, turn.answerAt+i));
  tournament.resolve(game);
  assert.deepEqual(game.tied, ['a','b']);
  tournament.next(game, 20000, () => 2);
  assert.equal(game.round, 1);
  assert.equal(game.turn.answers.has('c'), false);
  tournament.rename(game, 'b', 'reconnected');
  assert.equal(tournament.answer(game, 'reconnected', 1, 0, 2, game.turn.answerAt), false);
  assert(tournament.answer(game, 'reconnected', 2, 0, 2, game.turn.answerAt));
  tournament.resolve(game);
  assert.deepEqual(game.eliminated, ['a']);
  tournament.next(game, 40000, () => 3);
  assert.equal(game.turn.sequence.length, 5);
  assert.equal(game.turn.flash, 1100);
  for (let i=0; i<5; i++) {
    assert(tournament.answer(game, 'reconnected', 3, i, 3, game.turn.answerAt+10+i));
    assert(tournament.answer(game, 'c', 3, i, 3, game.turn.answerAt+100+i));
  }
  tournament.resolve(game);
  assert.deepEqual(game.active, ['reconnected']);
  assert.deepEqual(game.eliminated, ['a','c']);
  for (let round=3; round<=8; round++) {
    game.round=round;
    tournament.next(game,50000,()=>0);
    assert.equal(game.turn.flash,Math.max(700,1300-round*100));
    assert.equal(game.turn.sequence.length,Math.min(9,round+3));
  }
});

const source = fs.readFileSync(require.resolve('../server'), 'utf8');
const mobile = fs.readFileSync(require.resolve('../public/mobile'), 'utf8');
test('reaction uses unrounded event time and scores exact boundaries', () => {
  const block = mobile.slice(mobile.indexOf('let readyAt=0'),mobile.indexOf('function start(){'));
  const nodes = {react:{}};
  const ctx = vm.createContext({$:(id)=>nodes[id],window:{PointerEvent:true},performance:{timeOrigin:0}});
  vm.runInContext('let stage,extra,ms,score;function finish(n){score=n;stage="result"};'+block,ctx);
  const checks = [[0,100],[200,100],[200.01,95],[350,95],[500,90],[700,85],[1000,75],[1500,60],[2000,45],[3000,30],[3000.01,0]];
  for(const [elapsed,points] of checks){
    vm.runInContext('readyAt=100;stage="green";extra={};renderReaction({})',ctx);
    nodes.react.onpointerdown({isPrimary:true,button:0,timeStamp:100+elapsed,preventDefault(){}});
    assert.equal(vm.runInContext('score',ctx),points);
  }
  vm.runInContext('stage="waiting";extra={};renderReaction({})',ctx);
  nodes.react.onpointerdown({isPrimary:true,button:0,timeStamp:0,preventDefault(){}});
  assert.equal(vm.runInContext('reactionResult()',ctx),'抢跑 · 请等绿灯亮起');
});

test('race authority awards stars by lane and prevents repeated bomb damage', () => {
  let now=1000;
  const ctx={Date:{now:()=>now},io:{to:()=>({emit(){}})},finish(){}};
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function raceSnapshot'),source.indexOf('function finishRace')),ctx);
  const runner={id:'1',lane:1,p:100,hp:3,hits:0,stars:0,energy:100,protectedUntil:0,stunUntil:0,taken:[],collided:[],score:0};
  const game={phase:'playing',game:'race',startsAt:900,race:{runners:[runner],lastTick:900,obstacles:[{id:1,p:102,l:1},{id:2,p:107,l:1}],stars:[{id:3,p:103,l:1},{id:4,p:103,l:2}]}};
  ctx.raceTick(game);
  assert.equal(runner.hp,2);
  assert.equal(runner.hits,1);
  assert.equal(runner.stars,1);
  now+=100;
  ctx.raceTick(game);
  assert.equal(runner.hp,2);
  assert.deepEqual(runner.taken,[3]);
  for(let i=0;i<2;i++){
    now+=1501;
    game.race.lastTick=now-20;
    game.race.obstacles.push({id:5+i,p:runner.p+1,l:1});
    ctx.raceTick(game);
  }
  assert.equal(runner.hp,0);
  assert.equal(runner.finished,true);
  assert.equal(runner.stars,1);
});

test('existing Snake engine counts distinct food in one tick, wall death and respawn', () => {
  let now=1000;
  const ctx={Date:{now:()=>now},rand:max=>Math.floor(Math.random()*max),io:{to:()=>({emit(){}})}};
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('const SNAKE_W'),source.indexOf('function finishSnake')),ctx);
  const a={id:'a',body:[{x:4,y:4}],dir:{x:1,y:0},shieldUntil:0,foods:0,score:0,deaths:0};
  const b={id:'b',body:[{x:7,y:7}],dir:{x:0,y:1},shieldUntil:0,foods:0,score:0,deaths:0};
  const room={phase:'playing',game:'snake',startsAt:0,players:new Map([['a',{}],['b',{}]]),snake:{width:26,height:34,players:[a,b],foods:[{x:5,y:4},{x:7,y:8}]}};
  ctx.snakeTick(room);
  assert.equal(a.foods,1);
  assert.equal(b.foods,1);
  assert.equal(a.score,10);
  a.body=[{x:25,y:4}];
  now+=155;
  ctx.snakeTick(room);
  assert.equal(a.deaths,1);
  assert.equal(a.body.length,0);
  now+=2000;
  ctx.snakeTick(room);
  assert.ok(a.body.length>0);
});
