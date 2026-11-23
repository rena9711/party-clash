import {createTrack} from './simulation.mjs';

export function connectRaceView() {
  let packet, seed, track, receivedAt;
  const poses = new Map();
  const origin = location.origin;

  window.addEventListener('message', event => {
    if (event.origin !== origin || event.source !== window.parent ||
        event.data?.type !== 'party-race-state') return;
    const {state, playerId, connected} = event.data;
    if (state?.version !== 3 || (packet && packet.state.tick > state.tick)) return;
    if (state.tick !== packet?.state.tick || state.now !== packet?.state.now) receivedAt = performance.now();
    packet = {state, playerId, connected};
    if (state.seed !== seed) {
      seed = state.seed;
      track = createTrack(seed);
    }
  });

  window.parent.postMessage({type:'party-race-ready'}, origin);
  return {
    input(input) {
      if (packet?.connected) window.parent.postMessage({type:'party-race-input', input}, origin);
    },
    sample(now, delta) {
      if (!packet) return null;
      const {state, playerId, connected} = packet;
      const maxAge = 600;
      const age = now - receivedAt;
      const mine = state.runners.find(runner => runner.id === playerId);
      const clock = state.now + Math.max(0, Math.min(maxAge, age));
      const connectedNow = connected && age < maxAge;
      if (!mine) return {clock, startsAt:state.startsAt, endsAt:state.endsAt, connected:connectedNow};
      const moving = !mine.done && clock >= state.startsAt;
      const approach = 1 - Math.exp(-delta * 20);
      const players = state.runners.map(runner => {
        const target = {x:runner.x, y:runner.y, distance:runner.distance, vx:runner.vx};
        const pose = poses.get(runner.slot) ?? {...target};
        for (const key of Object.keys(target)) pose[key] += (target[key]-pose[key])*approach;
        poses.set(runner.slot, pose);
        return {...runner, ...pose};
      });
      const run = players.find(runner => runner.id === playerId);
      const taken = new Map(state.consumed);
      const objects = track.filter(item => item.at >= run.distance-6 && item.at < run.distance+76)
        .map(item => taken.has(item.id) ? {...item, used:true, impactTime:taken.get(item.id)} : item);
      return {clock, startsAt:state.startsAt, endsAt:state.endsAt, connected:connectedNow, moving,
        run:{...run, objects}, others:players.filter(runner => runner.id!==playerId && !runner.done)};
    }
  };
}
