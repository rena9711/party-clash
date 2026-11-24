import {advanceMotion, BOUNDARY, clamp, createTrack, DURATION, jump, raceSpeed} from './simulation.mjs?v=race-watch-1';
import {unpackRace} from './wire.mjs';

const MAX_AGE = 600;
const INTERPOLATION_MS = 135;
const MAX_INTERPOLATION_MS = 250;
const MAX_EXTRAPOLATION_MS = 100;
const SEND_INTERVAL = 65;
const MAX_SPEED = raceSpeed(DURATION, Infinity);
const KEEPALIVE = 200;
const interpolate = (a,b,t) => a+(b-a)*t;
const poseRate={x:10,y:10,distance:27,vx:Infinity};

export function connectRaceView(diagnostics) {
  let packet, seed, track, mine, display, receivedAt, clockOffset;
  let watchedSlot, watchedObjects, displayedObjects, lastSent=-Infinity, sentAxis;
  let interpolationDelay=INTERPOLATION_MS, playback=-Infinity;
  const history=[];
  const remote=new Map();
  const origin = location.origin;
  const encoder=diagnostics?new TextEncoder():null;

  window.addEventListener('message', event => {
    if (event.origin !== origin || event.source !== window.parent ||
        event.data?.type !== 'party-race-state') return;
    const {state:raw, playerId, connected} = event.data;
    if (raw?.version !== 3 || (packet && (packet.state.tick > raw.tick || packet.state.now > raw.now))) return;
    if (packet?.state.now === raw.now && packet?.playerId === playerId && packet.state.tick === raw.tick) {
      packet.connected=connected;
      if(!connected) sentAxis=undefined;
      return;
    }
    const now=performance.now();
    const state=unpackRace(raw);
    if (state.seed!==seed) {
      seed=state.seed;
      track=createTrack(seed);
      history.length=0;
      remote.clear();
      display=null;
      watchedSlot=undefined;
      clockOffset=undefined;
      interpolationDelay=INTERPOLATION_MS;
      playback=-Infinity;
    }
    const offset=now-state.now;
    // Prefer low-delay observations and slew slowly as a connection's baseline changes.
    clockOffset=clockOffset===undefined?offset:Math.min(offset,clockOffset+.5);
    const latest=history.at(-1);
    if(latest){
      const gap=state.now-latest.now;
      const desired=clamp(INTERPOLATION_MS+Math.max(0,offset-clockOffset,gap-105),INTERPOLATION_MS,MAX_INTERPOLATION_MS);
      interpolationDelay=Math.max(desired,interpolationDelay-2);
    }
    receivedAt=now;
    packet={state, playerId, connected};
    mine=state.runners.find(runner=>runner.id===playerId);
    if(mine){
      if(!display || display.id!==mine.id || mine.done || !connected) display={...mine};
      else {
        const position={x:display.x,vx:display.vx,y:display.y,vy:display.vy,distance:display.distance};
        Object.assign(display,mine,position);
      }
      const watched = mine.done && (state.runners.find(runner=>runner.slot===watchedSlot && !runner.done) ||
        state.runners.find(runner=>!runner.done));
      watchedSlot=watched?.slot;
      const taken=new Map(state.consumed);
      displayedObjects=nearbyObjects(mine.distance,taken);
      watchedObjects=watched ? nearbyObjects(watched.distance,taken) : null;
    }

    history.push({now:state.now, runners:new Map(state.runners.map(runner=>[runner.slot,runner]))});
    if(history.length>12)history.shift();
    if(diagnostics?.active){
      const decode=performance.now()-now;
      const size=encoder.encode('42'+JSON.stringify(['race-state',raw])).byteLength;
      diagnostics.snapshot(now,state.now,size,decode);
    }
  });

  function nearbyObjects(distance,taken) {
    const objects=[];
    for(const item of track){
      if(item.at<distance-8)continue;
      if(item.at>=distance+79)break;
      objects.push(taken.has(item.id)?{...item,used:true,impactTime:taken.get(item.id)}:item);
    }
    return objects;
  }

  function send(input) {
    if(packet?.connected)window.parent.postMessage({type:'party-race-input', input}, origin);
  }
  const others=[];
  const result={others};
  return {
    input(input) {
      if(input.axis===0) sentAxis=undefined;
      if(input.jump && display && result.connected && result.moving) jump(display);
      send(input);
    },
    sample(now, delta, direction=0) {
      if (!packet) return null;
      const {state, connected}=packet;
      const age=now-receivedAt;
      const clock=state.now+clamp(age,0,MAX_AGE);
      Object.assign(result,{clock, startsAt:state.startsAt, endsAt:state.endsAt,
        connected:connected&&age<MAX_AGE, moving:Boolean(mine&&!mine.done&&clock>=state.startsAt),
        run:display, watched:null, runners:state.runners});
      if(!mine)return result;
      if(result.connected&&result.moving){
        const axis=Math.round(direction*20)/20;
        const changed=sentAxis!==axis;
        if((changed && (axis===0 || now-lastSent>=SEND_INTERVAL)) ||
           (axis!==0 && now-lastSent>=KEEPALIVE)){
          send({axis});
          lastSent=now;
          sentAxis=axis;
        }
        advanceMotion(display,delta,direction);
        const correction=1-Math.exp(-delta*9);
        const overhang=clamp(clock-state.now,0,160)/1000;
        const targetX=clamp(mine.x+mine.vx*overhang,-BOUNDARY,BOUNDARY);
        display.x+=(targetX-display.x)*correction;
        // A predicted jump may be briefly ahead of the server; reconcile against
        // airborne samples without continually restarting a jump on the ground.
        if(mine.y>.02 && Math.abs(display.y-mine.y)>.24)
          display.y+=(mine.y-display.y)*correction;
        const speed=raceSpeed(mine.time,mine.boostUntil);
        display.distance=interpolate(display.distance,mine.distance+speed*overhang,1-Math.exp(-delta*20));
      } else {
        sentAxis=undefined;
      }
      display.objects=displayedObjects;
      others.length=0;
      playback=Math.max(playback,now-clockOffset-interpolationDelay);
      const upper=history.findIndex(frame=>frame.now>=playback);
      const next=history[upper<0?history.length-1:upper];
      const previous=history[upper<0?history.length-1:Math.max(upper-1,0)];
      const blend=clamp((playback-previous.now)/Math.max(1,next.now-previous.now),0,1);
      const beyond=result.connected&&(result.moving||watchedSlot!==undefined) ? clamp(playback-next.now,0,MAX_EXTRAPOLATION_MS)/1000 : 0;
      const earlier=history.at(-2);
      for(const runner of next.runners.values()){
        if(runner.slot===mine.slot||runner.done||state.runners.find(current=>current.slot===runner.slot)?.done)continue;
        const from=previous.runners.get(runner.slot)??runner;
        let pose=remote.get(runner.slot);
        if(!pose){
          pose={...runner, runner};
          remote.set(runner.slot,pose);
        } else if(pose.runner!==runner){
          const {x,y,distance,vx}=pose;
          Object.assign(pose,runner,{runner,x,y,distance,vx});
        }
        for(const key of Object.keys(poseRate)){
          let target=interpolate(from[key],runner[key],blend);
          if(beyond>0 && earlier){
            const last=earlier.runners.get(runner.slot);
            if(key==='distance' && last)
              target+=clamp((runner.distance-last.distance)*1000/Math.max(1,next.now-earlier.now),0,MAX_SPEED)*beyond;
            if(key==='x')target=clamp(target+runner.vx*beyond,-BOUNDARY,BOUNDARY);
          }
          const limit=key==='vx'?Infinity:poseRate[key]*delta;
          pose[key]+=clamp(target-pose[key],-limit,limit);
        }
        if (runner.slot===watchedSlot) {
          pose.objects=watchedObjects;
          result.watched=pose;
        } else others.push(pose);
      }
      return result;
    }
  };
}
