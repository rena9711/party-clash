import { advance, createRun, DURATION, jump, screenTilt, STEP, tiltInput, clamp } from './simulation.mjs';

const get = id => document.getElementById(id);
const canvas = get('scene');
const settings = get('sensitivity');

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
  get('controls').hidden = mode !== 'running' || baseline !== null;
}
function show(next) {
  mode = next;
  for (const panel of ['intro','paused','result','error']) get(panel).hidden = panel !== next;
  get('hud').hidden = next !== 'running';
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
  run = createRun();
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
function updateHud() {
  const health=get('health');
  const hearts='❤️'.repeat(run.health)+'♡'.repeat(3-run.health);
  if(health.textContent!==hearts) {
    health.textContent=hearts;
    health.setAttribute('aria-label','生命 '+run.health);
  }
  for(const [id,value] of [['stars',run.stars],['time',Math.ceil(DURATION-run.time)]]) {
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
    view.render(run,previewTime,true);
  }
  schedule();
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
get('jump').onclick=()=>{if(mode==='running')jump(run);};
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
    jump(run);
    swipe=null;
  }
};
const clearSwipe=event=>{if(swipe?.id===event.pointerId)swipe=null;};
canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=clearSwipe;
window.addEventListener('keydown',event=>{
  if(mode!=='running')return;
  if(['ArrowLeft','ArrowRight','ArrowUp',' '].includes(event.key))event.preventDefault();
  keys.add(event.key);
  if(!event.repeat && (event.key==='ArrowUp'||event.key===' '))jump(run);
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
  get('error-message').textContent='请确认浏览器支持 WebGL 2，或使用原版继续游戏。';
  show('error');
}
