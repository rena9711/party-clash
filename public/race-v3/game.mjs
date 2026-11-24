import {createLightScene} from './light-scene.mjs';
import '../player-identity.js';
import {layoutNameplates} from './presentation.mjs';
import { advance, boost, createRun, DURATION, jump, screenTilt, STEP, tiltInput, clamp } from './simulation.mjs';

const get = id => document.getElementById(id);
const canvas = get('scene');
const settings = get('sensitivity');
const query=new URLSearchParams(location.search);
const multiplayer=query.get('mode')==='room'&&window.parent!==window;
const diagnosticMode=query.get('diagnostics')==='1';
const cityMode=diagnosticMode&&query.get('city')==='legacy'?'legacy':'optimized';
let diagnostics, createDiagnostics;
if(diagnosticMode){
  const module=await import('./diagnostics.mjs');
  createDiagnostics=module.createDiagnostics;
  diagnostics=createDiagnostics({city:cityMode,multiplayer});
  module.diagnosticsPanel(()=>diagnostics.export(),{city:cityMode});
  if(multiplayer)window.partyRaceDiagnostics=()=>{
    diagnostics.finish(Boolean(roomState&&roomState.clock>=roomState.endsAt-120));
    return diagnostics.export();
  };
}
let network, roomState, roomHealth, roomStars;
const roomNotice = get('room-status');
const nameplates=new Map();
const labelMetrics=document.createElement('canvas').getContext('2d');
labelMetrics.font='11.52px system-ui';
let leaderboardKey='', leaderboardRunners;
const labelWidths=new Map();
let labelsAt=-Infinity;

let view;
const characterPicker=get('solo-character');
get('solo-character-label').hidden=multiplayer;
if(!multiplayer){
 for(const [id,icon,name] of PartyIdentity.animals)characterPicker.add(new Option(icon+' '+name,id));
 characterPicker.onchange=()=>{run.character=characterPicker.value};
}
function newRun(){const run=createRun();if(!multiplayer)run.character=characterPicker.value;return run}
let run = newRun();
let mode = 'intro';
let frameId = 0;
let lastFrame = null;
let timeDebt = 0;
let previewTime = 0;
let sensorAccepted = false;
let permissionDenied = false;
let nextReading = null;
let rotationPending = false;
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
  return ((screen.orientation?.angle ?? Number(window.orientation || 0))%360+360)%360;
}
function updateControls() {
  const controls=get('controls');
  const hide=mode !== 'running' || baseline !== null || rotationPending || (multiplayer && Boolean(roomState?.run?.done));
  if(controls.hidden!==hide)controls.hidden=hide;
}
function show(next) {
  mode = next;
  for (const panel of ['intro','paused','result','error']) get(panel).hidden = panel !== next;
  get('hud').hidden = next !== 'running';
  get('room-leaderboard').hidden = !multiplayer || next !== 'running';
  get('nameplates').hidden = !multiplayer || next !== 'running';
  get('orientation-calibration').hidden=next!=='running'||!rotationPending;
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
    recalibrateOrientation();
    return;
  }
  rawAngle = value;
}
function firstReading(settle=0) {
  return new Promise(resolve => {
    let currentAngle=angle();
    let acceptAfter=performance.now()+settle;
    const finish = reading => {
      clearTimeout(timer);
      nextReading = null;
      resolve(reading);
    };
    const timer = setTimeout(()=>finish(null),2000);
    nextReading = reading => {
      const now=performance.now();
      if (reading.orientation!==currentAngle) {
        currentAngle=reading.orientation;
        acceptAfter=now+150;
      }
      if(now>=acceptAfter)finish(reading);
    };
  });
}
function applyReading(reading) {
  screenAngle=reading?.orientation??null;
  baseline=rawAngle=reading?.value??null;
  filtered=0;
}
async function recalibrateOrientation() {
  if (baseline===null || screenAngle===angle() || starting || rotationPending) return;
  rotationPending=true;
  applyReading(null);
  network?.input({axis:0});
  applyReading(await firstReading(150));
  rotationPending=false;
  updateControls();
}
async function prepareSensor() {
  applyReading(null);
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
    applyReading(await firstReading());
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
async function recalibrateManually() {
  if(starting||rotationPending)return;
  starting=true;
  const button=get('recalibrate');
  const status=get('calibration-status');
  button.disabled=true;
  get('resume').disabled=true;
  status.textContent='请保持当前握姿，正在校准…';
  await prepareSensor();
  status.textContent=baseline===null?'感应器不可用。继续比赛可使用触控方向键。':'校准完成。当前握姿已设为中位。';
  button.disabled=false;
  get('resume').disabled=false;
  starting=false;
}
function resetInput() {
  keys.clear();
  touches.clear();
  touchAxis=0;
  swipe=null;
}
function play() {
  if (!multiplayer) {
    run=newRun();
    if(createDiagnostics){
      diagnostics.dispose();
      diagnostics=createDiagnostics({city:cityMode,multiplayer});
      view.resetDiagnostics();
    }
  }
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
  get('final-distance').textContent=Math.round(run.distance)+' 米';
  get('final-score').textContent='本局得分 '+(run.stars*10)+' 分';
  get('final-stars').textContent='收集星星：'+run.stars+' 颗';
  get('survival').textContent='存活时间：'+run.time.toFixed(1)+' 秒';
  resetInput();
  show('result');
  get('again').focus();
}
function frame(now) {
  if(!diagnostics||mode!=='running'){
    updateFrame(now);
    return;
  }
  const started=performance.now();
  if(!multiplayer)diagnostics.begin(now);
  diagnostics.beginFrame();
  updateFrame(now);
  diagnostics.frame(now,performance.now()-started);
  if(multiplayer&&roomState?.clock>=roomState?.endsAt)diagnostics.finish(true);
  if(!multiplayer&&run.done)diagnostics.finish(run.time>=DURATION);
}
function updateFrame(now) {
  frameId=0;
  const delta=lastFrame===null ? 0 : Math.min(.10,(now-lastFrame)/1000);
  lastFrame=now;
  if (mode==='running') {
    const previousHealth=run.health, previousStars=run.stars;
    if (baseline!==null && angle()!==screenAngle) recalibrateOrientation();
    const orientationNotice=get('orientation-calibration');
    if(orientationNotice.hidden===rotationPending)orientationNotice.hidden=!rotationPending;
    if (baseline !== null && rawAngle !== null) {
      const sample=clamp(rawAngle-baseline,-70,70);
      filtered+=(sample-filtered)*(1-Math.exp(-delta*17));
    }
    const keyboard=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
    const direction=keyboard || (rotationPending ? 0 : baseline===null ? touchAxis : tiltInput(filtered,settings.value));
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
  roomState = network?.sample(now, delta, direction);
  const state = roomState;
  diagnostics?.begin(now,state);
  const upcoming = state && state.clock < state.startsAt;
  const label = !state?.connected ? '正在连接比赛…' :
    upcoming ? '准备 '+Math.ceil((state.startsAt-state.clock)/1000)+' 秒' :
    state.run?.done ? '本场已结束，等待其他玩家结算' : '';
  if(roomNotice.hidden===Boolean(label))roomNotice.hidden=!label;
  if (roomNotice.textContent!==label) roomNotice.textContent=label;
  if (!state?.run) return;
  run=state.run;
  if (roomHealth!==undefined && run.health<roomHealth && run.hit) pulse('effect',run.hit.kind);
  if (roomStars!==undefined && run.stars>roomStars) pulse('pickup');
  roomHealth=run.health;
  roomStars=run.stars;
  const rank='第 '+run.rank+' 名';
  if(get('rank').textContent!==rank)get('rank').textContent=rank;
  const cooldown=Math.ceil(run.boostReadyAt-run.time);
  const boostLabel=cooldown>0?cooldown+' 秒':'加速';
  if(get('boost').textContent!==boostLabel)get('boost').textContent=boostLabel;
  const boostDisabled=cooldown>0 || !state.connected || !state.moving;
  if(get('boost').disabled!==boostDisabled)get('boost').disabled=boostDisabled;
  updateHud(Math.max(0,(state.endsAt-Math.max(state.clock,state.startsAt))/1000));
  updateControls();
  const updateLabels=now-labelsAt>=50;
  const labels=view.render(run,run.time,false,state.others,state.runners.length,updateLabels);
  if(updateLabels){
    renderNameplates(labels);
    labelsAt=now;
  }
  updateLeaderboard(state.runners);
}
function updateLeaderboard(runners) {
  if(runners===leaderboardRunners)return;
  leaderboardRunners=runners;
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
  const placed=layoutNameplates(labels,canvas.clientWidth,canvas.clientHeight,text=>{
    if(!labelWidths.has(text))labelWidths.set(text,labelMetrics.measureText(text).width);
    return labelWidths.get(text);
  });
  for(const label of placed){
    visible.add(label.id);
    let node=nameplates.get(label.id);
    if(!node){
      node=document.createElement('span');
      get('nameplates').append(node);
      nameplates.set(label.id,node);
    }
    node.classList.toggle('self',label.self);
    if(node.textContent!==label.caption)node.textContent=label.caption;
    const transform='translate('+Math.round(label.left)+'px,'+Math.round(label.top)+'px)';
    if(node.style.transform!==transform)node.style.transform=transform;
    const width=label.width+'px';
    if(node.style.width!==width)node.style.width=width;
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
  network=connectRaceView(diagnostics);
  if(diagnostics)window.addEventListener('message',event=>{
    if(event.origin===location.origin&&event.source===window.parent&&event.data?.type==='party-race-rtt'&&
      Number.isFinite(event.data.ms))diagnostics.rtt(event.data.ms);
  });
  get('start').textContent='进入比赛';
  get('mode').textContent='进入时请自然握住手机，当前角度会自动设为中位。无感应器时使用左右键。比赛按房间时间开始。';
  get('rank').hidden=false;
  get('boost').hidden=false;
  get('reset').hidden=true;
  get('race-paused-status').hidden=false;
  get('intro').querySelector('a').hidden=true;
  get('error').querySelector('a').hidden=true;
}
function intro() {
  run=newRun();
  lastFrame=null;
  show('intro');
  schedule();
}
function resize() {
  if (!view) return;
  view.resize(Math.max(1,canvas.clientWidth),Math.max(1,canvas.clientHeight));
  view.render(run,mode==='intro'?previewTime:run.time,mode==='intro',roomState?.others,roomState?.runners?.length);
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
get('recalibrate').onclick=recalibrateManually;
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
window.addEventListener('orientationchange',recalibrateOrientation);
screen.orientation?.addEventListener?.('change',recalibrateOrientation);
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
const lightCanvas = document.createElement('canvas');
lightCanvas.className = 'light-scene';
lightCanvas.setAttribute('aria-hidden', 'true');
canvas.after(lightCanvas);
const lightView = createLightScene(lightCanvas, PartyIdentity.animals);
let richView;
function useView(next) {
  view = next;
  lightCanvas.hidden = next !== lightView;
  resize();
  schedule();
}
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  useView(lightView);
});
canvas.addEventListener('webglcontextrestored', () => {
  if (richView) useView(richView);
});
useView(lightView);
get('start').disabled = false;
try {
  const {createScene} = await import('./scene.mjs');
  richView = createScene(canvas,{cityMode,diagnostics:diagnosticMode?{
    get active(){return diagnostics.active},
    gpu:ms=>diagnostics.gpu(ms),
    render:(stats,ms)=>diagnostics.render(stats,ms)
  }:null});
  useView(richView);
} catch (error) {
  console.warn('3D race rendering unavailable', error);
  useView(lightView);
}
