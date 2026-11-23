import {packRunner} from './public/race-v3/wire.mjs';
import {advance, boost, createRun, createTrack, DURATION, jump, STEP} from './public/race-v3/simulation.mjs';

const INPUT_LEASE = 500;

export function createRace(players, seed, startsAt) {
  const track = createTrack(seed);
  return {
    seed, startsAt, endsAt: startsAt + DURATION * 1000, tick: 0,
    runners: players.map(({id, name, character}, slot) => {
      const run = createRun(undefined, track);
      run.x = (slot - (players.length - 1) / 2) * .65;
      return {id, name, character, slot, run, axis: 0, lastInput: -Infinity, jump: false, boost: false};
    })
  };
}

export function applyInput(race, id, input, now) {
  const runner = race.runners.find(player => player.id === id);
  if (!runner || !input || typeof input !== 'object' || runner.run.done ||
      now < race.startsAt || now >= race.endsAt) return;
  const axis = input.axis;
  if (Number.isFinite(axis) && Math.abs(axis) <= 1) runner.axis = axis;
  runner.jump ||= input.jump === true;
  runner.boost ||= input.boost === true;
  runner.lastInput = now;
}

export function clearInput(runner) {
  if (!runner) return;
  runner.axis = 0;
  runner.jump = false;
  runner.boost = false;
  runner.lastInput = -Infinity;
}

export function advanceRace(race, now) {
  const seconds = Math.min(DURATION, (now - race.startsAt) / 1000);
  const target = Math.floor(seconds / STEP + 1e-8);
  while (race.tick < target) {
    race.tick++;
    for (const player of race.runners) {
      const run = player.run;
      if (run.done) continue;
      if (player.jump) jump(run);
      if (player.boost) boost(run);
      player.jump = player.boost = false;
      advance(run, STEP, now - player.lastInput <= INPUT_LEASE ? player.axis : 0);
    }
  }
  return now >= race.endsAt || race.runners.every(player => player.run.done);
}

export function standings(race) {
  return [...race.runners].sort((a, b) =>
    b.run.stars - a.run.stars || b.run.distance - a.run.distance || a.slot - b.slot);
}

export function sharedRaceSnapshot(race, now) {
  const runners = standings(race).map(({id: playerId, name, character, slot, run}, index) => ({
    id: playerId, name, character, slot, rank: index + 1, x: run.x, y: run.y, vx: run.vx, vy: run.vy, distance: run.distance,
    time: run.time, health: run.health, stars: run.stars, done: run.done,
    hit: run.hit, landedAt: run.landedAt, protectedUntil: run.protectedUntil,
    boostUntil: run.boostUntil, boostReadyAt: run.boostReadyAt
  }));
  return {
    version: 3, seed: race.seed, tick: race.tick, now, startsAt: race.startsAt, endsAt: race.endsAt,
    rows: runners.map(packRunner)
  };
}

export function snapshotRace(race, id, now, shared = sharedRaceSnapshot(race, now)) {
  const mine = race.runners.find(player => player.id === id);
  return {...shared, consumed: mine?.run.objects.filter(object => object.used)
    .map(({id, impactTime}) => [id, impactTime ?? null]) ?? []};
}
