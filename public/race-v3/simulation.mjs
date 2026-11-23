export const DURATION = 45;
export const BOUNDARY = 3.5;
export const PROTECTION = 1.5;
export const STEP = 1 / 120;
const GRAVITY = 16.8;
const JUMP_SPEED = 6.8;
const FOX_RADIUS = .34;

export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function screenTilt(beta, gamma, angle) {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const radians = angle * Math.PI / 180;
  return gamma * Math.cos(radians) + beta * Math.sin(radians);
}

export function tiltInput(delta, sensitivity) {
  const limits = { low: 30, medium: 22, high: 15 };
  const strength = clamp((Math.abs(delta) - 3) / (limits[sensitivity] - 3), 0, 1);
  return Math.sign(delta) * strength;
}

export function createRun(random = Math.random) {
  return {
    random, time: 0, distance: 0, speed: 12, x: 0, y: 0, vy: 0, vx: 0,
    health: 3, stars: 0, protectedUntil: 0, hit: null, lastPickup: -1,
    objects: [], nextDistance: 27, wave: 0, landedAt: -1, done: false
  };
}

export function jump(run) {
  if (run.done || run.y > 0 || run.vy > 0) return false;
  run.vy = JUMP_SPEED;
  return true;
}

function spawnWave(run) {
  const kind = (run.wave++ % 2 === 0) ? 'bomb' : 'hurdle';
  const x = (run.random() * 2 - 1) * 2.35;
  const at = run.nextDistance;
  const side = x < 0 ? 1 : -1;
  const trailX = side * (1.55 + run.random() * 1.25);
  // Lead-in stars stay away from the obstacle silhouette. The last
  // hurdle star is high enough for the jump arc and out of ground reach.
  for (let i = 0; i < 3; i++) {
    const lateral = kind === 'hurdle' ? trailX * (1 - i * .16) : trailX;
    run.objects.push({ kind: 'star', x: lateral, at: at - 14 + i * 3.5, y: .65 });
  }
  run.objects.push({ kind, x, at, height: kind === 'bomb' ? .85 : .74, width: kind === 'bomb' ? 1.05 : 2.55 });
  if (kind === 'hurdle') run.objects.push({ kind: 'star', x, at, y: 1.55 });
  run.nextDistance += Math.max(19, 27 - run.time * .19) + run.random() * 5;
}

function collide(run, before) {
  for (const object of run.objects) {
    if (object.used) continue;
    const depth = object.kind === 'bomb' ? .72 : object.kind === 'hurdle' ? .51 : .69;
    if (run.distance + depth < object.at || before - depth > object.at) continue;
    if (object.kind === 'star') {
      if (Math.hypot(run.x - object.x, run.y + .63 - object.y) > .73) continue;
      object.used = true;
      run.stars += 1;
      run.lastPickup = run.time;
      continue;
    }
    if (Math.abs(run.x - object.x) >= object.width / 2 + FOX_RADIUS || run.y >= object.height) continue;
    object.used = true;
    object.impactTime = run.time;
    if (run.time < run.protectedUntil) continue;
    run.health -= 1;
    run.protectedUntil = run.time + PROTECTION;
    run.hit = { kind: object.kind, time: run.time };
    if (!run.health) break;
  }
}

export function advance(run, dt, direction) {
  if (run.done || dt <= 0) return;
  const before = run.distance;
  run.time = Math.min(DURATION, run.time + dt);
  run.speed = 12 + Math.min(run.time * .12, 5.4);
  run.distance += run.speed * dt;
  const target = clamp(direction, -1, 1) * 7.2;
  run.vx += (target - run.vx) * (1 - Math.exp(-dt * 16));
  if (!target && Math.abs(run.vx) < .08) run.vx = 0;
  run.x = clamp(run.x + run.vx * dt, -BOUNDARY, BOUNDARY);
  if (run.y > 0 || run.vy > 0) {
    run.y += run.vy * dt - .5 * GRAVITY * dt * dt;
    run.vy -= GRAVITY * dt;
    if (run.y <= 0) {
      run.y = 0;
      run.vy = 0;
      run.landedAt = run.time;
    }
  }
  while (run.nextDistance < run.distance + 76) spawnWave(run);
  collide(run, before);
  while (run.objects.length && run.objects[0].at < run.distance - 5) run.objects.shift();
  run.done = run.health === 0 || run.time >= DURATION;
}
