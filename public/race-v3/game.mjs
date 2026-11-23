import '../player-identity.js';
import { advance, boost, createRun, DURATION, jump, screenTilt, STEP, tiltInput, clamp } from './simulation.mjs';

const get = id => document.getElementById(id);
const canvas = get('scene');
const settings = get('sensitivity');
const multiplayer = new URLSearchParams(location.search).get('mode') === 'room' && window.parent !== window;
let network, lastSent = -Infinity, roomState, roomHealth, roomStars;
const roomNotice = get('room-status');
const nameplates=new Map();
let leaderboardKey='';

let view;
let run = createRun();
let mode = 'intro';
let frameId = 0;
let lastFrame = null;
let timeDebt = 0;
let previewTime = 0;
let sensorAccepted = false;
let permissionDenied = false;
let nextReading = null;
let starting = false;
let baseline = null;
let filtered = 0;
let screenAngle = null;
let rawAngle = null;
let swipe;
let touchAxis = 0;
const keys = new Set();
const touches = new Map();

function angle() {
  return screen.orientation?.angle ?? Number(window.orientation || 0);
}
function updateControls() {
  get('controls').hidden = mode !== 'running' || baseline !== null || (multiplayer && Boolean(roomState?.run?.done));
}
function show(next) {
  mode = next;
  for (const panel of ['intro','paused','result','error']) get(panel).hidden = panel !== next;
  get('hud').hidden = next !== 'running';
  get('room-leaderboard').hidden = !multiplayer || next !== 'running';
  get('nameplates').hidden = !multiplayer || next !== 'running';
  if (next==='paused'||next==='error') roomNotice.hidden=true;
  updateControls();
}
function readSensor(event) {
  if (!sensorAccepted) return;
  const orientation = angle();
  const value = screenTilt(event.beta,event.gamma,orientation);
  if (value === null) return;
  if (nextReading) {
    nextReading({ orientation, value });
    return;
  }
  if (baseline === null) return;
  if (screenAngle !== orientation) {
    screenAngle = orientation;
    baseline = value;
    filtered = 0;
  }
  rawAngle = value;
}
function firstReading() {
  return new Promise(resolve => {
    const finish = reading => {
      clearTimeout(timer);
      nextReading = null;
      resolve(reading);
    };
    const timer = setTimeout(()=>finish(null),2000);
    nextReading = finish;
  });
}
async function prepareSensor() {
  baseline = rawAngle = screenAngle = null;
  filtered = 0;
  const Orientation = window.DeviceOrientationEvent;
  if (!Orientation || !window.isSecureContext || permissionDenied) return;
  try {
    if (!sensorAccepted && typeof Orientation.requestPermission === 'function') {
      if (await Orientation.requestPermission() !== 'granted') {
        permissionDenied = true;
        return;
      }
    }
    sensorAccepted = true;
    const reading = await firstReading();
    if (reading) {
      screenAngle = reading.orientation;
      baseline = rawAngle = reading.value;
    }
  } catch {
    // A browser-level permission error still leaves touch controls available.
  }
}
async function startWithControls(event) {
  if (starting) return;
  starting = true;
  const button = event.currentTarget;
  const label = button.textContent;
  button.disabled = true;
  get('back').disabled = true;
  button.textContent = '正在读取重力感应…';
  await prepareSensor();
  button.textContent = label;
  button.disabled = false;
  get('back').disabled = false;
  starting = false;
  play();
  if (document.hidden) pause();
}
function resetInput() {
  keys.clear();
  touches.clear();
  touchAxis=0;
  swipe=null;
}
function play() {
  if (!multiplayer) run = createRun();
  lastSent = -Infinity;
  lastFrame = null;
  timeDebt = 0;
  resetInput();
  show('running');
  updateHud();
  schedule();
}
function pause() {
  if (mode !== 'running') return;
  resetInput();
  network?.input({axis:0});
  stopFrames();
  show('paused');
}
function stopFrames() {
  cancelAnimationFrame(frameId);
  frameId=0;
  lastFrame=null;
  timeDebt=0;
}
function schedule() {
  if (view && !frameId && !document.hidden && (mode==='running'||mode==='intro')) {
    frameId=requestAnimationFrame(frame);
  }
}
function updateHud(remaining = DURATION-run.time) {
  const health=get('health');
  const hearts='❤️'.repeat(run.health)+'♡'.repeat(3-run.health);
  if(health.textContent!==hearts) {
    health.textContent=hearts;
    health.setAttribute('aria-label','生命 '+run.health);
  }
  for(const [id,value] of [['stars',run.stars],['time',Math.ceil(remaining)]]) {
    const label = get(id);
    if(label.textContent!==String(value)) label.textContent=value;
  }
}
function pulse(id,flicker) {
  const element=get(id);
  if(id==='effect')element.dataset.kind='';
  else element.classList.remove('active');
  void element.offsetWidth;
  if(id==='effect') element.dataset.kind=flicker;
  else element.classList.add('active');
}
function finish() {
  updateHud();
  get('final-stars').textContent='收集星星：'+run.stars+' 颗';
  get('survival').textContent='存活时间：'+run.time.toFixed(1)+' 秒';
  resetInput();
  show('result');
  get('again').focus();
}
function frame(now) {
  frameId=0;
  const delta=lastFrame===null ? 0 : Math.min(.10,(now-lastFrame)/1000);
  lastFrame=now;
  if (mode==='running') {
    const previousHealth=run.health, previousStars=run.stars;
    if (baseline !== null && rawAngle !== null) {
      const sample=clamp(rawAngle-baseline,-70,70);
      filtered+=(sample-filtered)*(1-Math.exp(-delta*17));
    }
    const keyboard=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
    const direction=keyboard || (baseline===null ? touchAxis : tiltInput(filtered,settings.value));
    if (multiplayer) {
      renderRoom(now,delta,direction);
      schedule();
      return;
    }
    timeDebt+=delta;
    while(timeDebt>=STEP && !run.done){
      advance(run,STEP,direction);
      timeDebt-=STEP;
    }
    if(run.health<previousHealth) pulse('effect',run.hit.kind);
    if(run.stars>previousStars) pulse('pickup');
    updateHud();
    view.render(run,run.time,false);
    if(run.done)finish();
  } else if (mode==='intro') {
    previewTime+=delta;
    if (multiplayer) {
      const clock=network.sample(now,delta);
      if(clock?.run?.character) run.character=clock.run.character;
      const text=clock?.startsAt>clock?.clock ? '房间倒数 '+Math.ceil((clock.startsAt-clock.clock)/1000)+' 秒' :
        clock?.connected ? '比赛进行中，点击进入' : '等待房间同步…';
      roomNotice.hidden=false;
      if(roomNotice.textContent!==text)roomNotice.textContent=text;
    }
    view.render(run,previewTime,true);
  }
  schedule();
}
function renderRoom(now, delta, direction) {
  roomState = network?.sample(now, delta);
  const state = roomState;
  const upcoming = state && state.clock < state.startsAt;
  const label = !state?.connected ? '正在连接比赛…' :
    upcoming ? '准备 '+Math.ceil((state.startsAt-state.clock)/1000)+' 秒' :
    state.run?.done ? '本场已结束，等待其他玩家结算' : '';
  roomNotice.hidden=!label;
  if (roomNotice.textContent!==label) roomNotice.textContent=label;
  if (!state?.run) return;
  run=state.run;
  if (state.connected && state.moving && now-lastSent>=65) {
    network.input({axis:direction});
    lastSent=now;
  }
  if (roomHealth!==undefined && run.health<roomHealth && run.hit) pulse('effect',run.hit.kind);
  if (roomStars!==undefined && run.stars>roomStars) pulse('pickup');
  roomHealth=run.health;
  roomStars=run.stars;
  get('rank').textContent='第 '+run.rank+' 名';
  const cooldown=Math.ceil(run.boostReadyAt-run.time);
  get('boost').textContent=cooldown>0?cooldown+' 秒':'加速';
  get('boost').disabled=cooldown>0 || !state.connected || !state.moving;
  updateHud(Math.max(0,(state.endsAt-Math.max(state.clock,state.startsAt))/1000));
  updateControls();
  renderNameplates(view.render(run,run.time,false,state.others));
  updateLeaderboard(state.runners);
}
function updateLeaderboard(runners) {
  const key=JSON.stringify(runners.map(p=>[p.id,p.rank,p.name,p.character,p.stars]));
  if(key===leaderboardKey)return;
  leaderboardKey=key;
  const list=get('room-leaderboard-list');
  list.replaceChildren(...runners.map(runner=>{
    const row=document.createElement('li');
    const icon=PartyIdentity.animals.find(([id])=>id===runner.character)?.[1]??'';
    row.textContent=icon+' '+runner.name+' · '+runner.stars*10+' 分';
    return row;
  }));
}
function renderNameplates(labels) {
  const visible=new Set();
  for(const label of labels){
    visible.add(label.id);
    let node=nameplates.get(label.id);
    if(!node){
      node=document.createElement('span');
      get('nameplates').append(node);
      nameplates.set(label.id,node);
    }
    node.classList.toggle('self',label.self);
    node.classList.toggle('staggered',!label.self&&label.slot%2===1);
    node.classList.toggle('left-edge',label.x<.13);
    node.classList.toggle('right-edge',label.x>.87);
    const text=(label.self?'我 · ':'')+label.name;
    if(node.textContent!==text)node.textContent=text;
    node.style.left=label.x*100+'%';
    node.style.top=label.y*100+'%';
  }
  for(const [id,node] of nameplates)if(!visible.has(id)){node.remove();nameplates.delete(id)}
}
function performAction(action) {
  if (mode!=='running') return;
  if (multiplayer) {
    if (roomState?.connected && roomState.moving) network.input({[action]:true});
  } else if (action==='jump') {
    jump(run);
  } else {
    boost(run);
  }
}
if (multiplayer) {
  const {connectRaceView} = await import('./room-client.mjs');
  network=connectRaceView();
  get('start').textContent='进入比赛';
  get('mode').textContent='进入时自动校准；无感应器时可触控。比赛按房间时间开始。';
  get('rank').hidden=false;
  get('boost').hidden=false;
  get('reset').hidden=true;
  get('race-paused-status').hidden=false;
  get('intro').querySelector('a').hidden=true;
  get('error').querySelector('a').hidden=true;
}
function intro() {
  run=createRun();
  lastFrame=null;
  show('intro');
  schedule();
}
function resize() {
  if (!view) return;
  view.resize(Math.max(1,canvas.clientWidth),Math.max(1,canvas.clientHeight));
  view.render(run,mode==='intro'?previewTime:run.time,mode==='intro');
}
function refreshTouch() {
  touchAxis=clamp([...touches.values()].reduce((sum,value)=>sum+value,0),-1,1);
}

get('start').onclick=startWithControls;
get('again').onclick=startWithControls;
get('back').onclick=intro;
get('pause').onclick=pause;
get('reset').onclick=intro;
get('resume').onclick=()=>{show('running');schedule();};
get('jump').onclick=()=>performAction('jump');
get('boost').onclick=()=>performAction('boost');
for(const [id,direction] of [['left',-1],['right',1]]) {
  const control=get(id);
  control.onpointerdown=event=>{
    if(mode!=='running')return;
    control.setPointerCapture(event.pointerId);
    touches.set(event.pointerId,direction);
    refreshTouch();
  };
  const release=event=>{touches.delete(event.pointerId);refreshTouch();};
  control.onpointerup=control.onpointercancel=control.onlostpointercapture=release;
  control.onkeydown=event=>{if(['Enter',' '].includes(event.key))keys.add(direction<0?'ArrowLeft':'ArrowRight');};
  control.onkeyup=event=>{if(['Enter',' '].includes(event.key))keys.delete(direction<0?'ArrowLeft':'ArrowRight');};
}
canvas.onpointerdown=event=>{
  if(mode!=='running'||swipe||event.button!==0)return;
  swipe={id:event.pointerId,x:event.clientX,y:event.clientY};
  canvas.setPointerCapture(event.pointerId);
};
canvas.onpointermove=event=>{
  if(swipe?.id!==event.pointerId)return;
  const x=event.clientX-swipe.x,y=event.clientY-swipe.y;
  if (y < -28 && -y > Math.abs(x)) {
    performAction('jump');
    swipe=null;
  }
};
const clearSwipe=event=>{if(swipe?.id===event.pointerId)swipe=null;};
canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=clearSwipe;
window.addEventListener('keydown',event=>{
  if(mode!=='running')return;
  if(['ArrowLeft','ArrowRight','ArrowUp',' '].includes(event.key))event.preventDefault();
  keys.add(event.key);
  if(!event.repeat && (event.key==='ArrowUp'||event.key===' '))performAction('jump');
  if(event.key==='Escape')pause();
});
window.addEventListener('keyup',event=>keys.delete(event.key));
window.addEventListener('blur',resetInput);
window.addEventListener('deviceorientation',readSensor);
window.addEventListener('resize',resize);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden) {pause();stopFrames();}
  else schedule();
});
window.addEventListener('pagehide',event=>{
  pause();
  stopFrames();
  if (!event.persisted) view?.dispose();
});
window.addEventListener('pageshow',schedule);
canvas.addEventListener('webglcontextlost',event=>{
  event.preventDefault();
  pause();
});
canvas.addEventListener('webglcontextrestored',resize);

try {
  const {createScene}=await import('./scene.mjs');
  view=createScene(canvas);
  resize();
  get('start').disabled=false;
  schedule();
} catch {
  get('error-message').textContent=multiplayer?'此设备无法显示多人 3D。可等待比赛结算。':'请确认浏览器支持 WebGL 2，或使用原版继续游戏。';
  show('error');
}
