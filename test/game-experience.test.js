const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const tournament = require('../memory-tournament');

test('memory flash timing, repeated cells, cutoff, timing ranks and tiebreak', () => {
  const game = tournament.create(['a','b','c']);
  tournament.next(game, 1000, () => 6);
  const turn = game.turn;
  assert.equal(turn.startsAt, 4000);
  assert.equal(turn.answerAt - turn.startsAt, 3600);
  const cueAt = now => tournament.snapshot(game, now).cues.find(cue => cue.on <= now && cue.off > now)?.cell;
  assert.equal(cueAt(turn.startsAt), 6);
  assert.equal(cueAt(turn.startsAt + 749), 6);
  assert.equal(cueAt(turn.startsAt + 750), undefined);
  assert.equal(cueAt(turn.startsAt + 949), undefined);
  assert.equal(cueAt(turn.startsAt + 950), 6);
  assert.equal(cueAt(turn.answerAt), undefined);
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
  assert.equal(game.turn.flash, turn.flash);
  assert.equal(game.turn.answerAt-game.turn.startsAt, turn.answerAt-turn.startsAt);
  assert.equal(game.turn.answers.has('c'), false);
  tournament.rename(game, 'b', 'reconnected');
  assert.equal(tournament.answer(game, 'reconnected', 1, 0, 2, game.turn.answerAt), false);
  assert(tournament.answer(game, 'reconnected', 2, 0, 2, game.turn.answerAt));
  tournament.resolve(game);
  assert.deepEqual(game.eliminated, ['a']);
  tournament.next(game, 40000, () => 3);
  assert.equal(game.turn.sequence.length, 5);
  assert.equal(game.turn.flash, 700);
  for (let i=0; i<5; i++) {
    assert(tournament.answer(game, 'reconnected', 3, i, 3, game.turn.answerAt+10+i));
    assert(tournament.answer(game, 'c', 3, i, 3, game.turn.answerAt+100+i));
  }
  tournament.resolve(game);
  assert.deepEqual(game.active, ['reconnected']);
  assert.deepEqual(game.eliminated, ['a','c']);
  for (const [round, flash, count, total] of [
    [1,750,4,3600],[2,700,5,4300],[3,650,6,4900],
    [4,600,7,5400],[5,550,8,5800],[6,500,9,6100],[7,500,9,6100]
  ]) {
    game.round=round;
    tournament.next(game,50000,()=>0);
    const active=game.turn;
    assert.equal(active.flash,flash);
    assert.equal(active.sequence.length,count);
    assert.equal(active.startsAt,53000);
    assert.equal(active.answerAt-active.startsAt,total);
    assert.equal(active.endsAt-active.answerAt,10000);
    const [first, second]=tournament.snapshot(game,active.startsAt).cues;
    assert.equal(first.off-first.on,flash);
    assert.equal(second.on-first.off,200);
    assert.deepEqual(tournament.snapshot(game,active.answerAt).cues,[]);
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

test('solo memory prepares, shows four 750 ms cues with 200 ms gaps, and scores 100', () => {
  let now = 1000;
  let html = '';
  const cells = Array.from({length:9}, (_, i) => ({
    dataset: {cell: String(i)},
    disabled: true,
    lit: false,
    classList: {toggle(_name, on) { cells[i].lit = on; }}
  }));
  const arena = {
    set innerHTML(value) { html = value; },
    querySelectorAll() { return cells; }
  };
  const status = {};
  const context = vm.createContext({
    performance: {now: () => now},
    Math: Object.assign(Object.create(Math), {random: () => .5}),
    document: {querySelectorAll: () => cells},
    $: () => status,
    setInterval() {}
  });
  const block = mobile.slice(mobile.indexOf('const SOLO_MEMORY_FLASH'), mobile.indexOf("if(game==='bomb'){",mobile.indexOf('function extraArena')));
  // Only the solo memory branch needs a mounted arena or score handler.
  vm.runInContext('let extra, interval, stage, score;const game="memory";function clear(){};' +
    'function finish(n){score=n};function arena(){extraArena(mount)};' +
    block + '}', Object.assign(context, {mount: arena}));
  vm.runInContext('startExtra()', context);
  assert.equal(status.textContent, '准备 3 秒');
  assert.equal((html.match(/data-cell=/g) || []).length, 9);
  for (let cue = 0; cue < 4; cue++) {
    now = 4000 + cue * 950;
    vm.runInContext('updateSoloMemory()', context);
    assert.deepEqual(cells.filter(cell => cell.lit), [cells[4]]);
    assert.ok(cells.every(cell => cell.disabled));
    now += 750;
    vm.runInContext('updateSoloMemory()', context);
    assert.ok(cells.every(cell => !cell.lit));
    assert.equal(cells[4].disabled, cue !== 3);
  }
  assert.equal(now, 7600);
  assert.match(status.textContent, /剩余 10 秒/);
  for (let i = 0; i < 4; i++) cells[4].onclick();
  assert.equal(vm.runInContext('score', context), 100);
  now += 10000;
  vm.runInContext('updateSoloMemory()', context);
  assert.match(vm.runInContext('extra.summary', context), /时间到/);
});
