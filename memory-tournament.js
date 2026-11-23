'use strict';

const { randomInt } = require('node:crypto');
const GAP = 200;
const LOOKAHEAD = 1000;
const ANSWER_TIME = 10000;

function create(ids) {
  return { active: [...ids], eliminated: [], round: 1, attempt: 0 };
}

function next(game, now, random = randomInt) {
  const count = Math.min(9, game.round + 3);
  const flash = Math.max(500, 800 - game.round * 50);
  const startsAt = now + 3000;
  const answerAt = startsAt + (count - 1) * (flash + GAP) + flash;
  const ids = game.tied || game.active;
  game.attempt += 1;
  game.turn = {
    startsAt, answerAt, endsAt: answerAt + ANSWER_TIME, flash,
    sequence: Array.from({ length: count }, () => random(9)),
    answers: new Map(ids.map(id => [id, { correct: 0, finishedAt: Infinity, done: false }]))
  };
}

function answer(game, id, attempt, index, cell, now) {
  const turn = game.turn;
  const player = turn.answers.get(id);
  if (attempt !== game.attempt || !player || player.done || now < turn.answerAt || now >= turn.endsAt ||
      index !== player.correct || !Number.isInteger(cell) || cell < 0 || cell >= 9) return false;
  if (cell !== turn.sequence[index]) {
    player.done = true;
  } else {
    player.correct += 1;
    if (player.correct === turn.sequence.length) {
      player.done = true;
      player.finishedAt = now - turn.answerAt;
    }
  }
  return true;
}

function resolve(game) {
  const answers = [...game.turn.answers.entries()].sort(([, a], [, b]) =>
    a.correct - b.correct || (a.finishedAt === b.finishedAt ? 0 : b.finishedAt - a.finishedAt));
  const [, worst] = answers[0];
  const losers = answers.filter(([, p]) => p.correct === worst.correct && p.finishedAt === worst.finishedAt);
  if (losers.length > 1) {
    game.tied = losers.map(([id]) => id);
    return;
  }
  const [id] = losers[0];
  game.eliminated.push(id);
  game.active = game.active.filter(player => player !== id);
  game.tied = null;
  game.round += 1;
}

function rename(game, oldId, newId) {
  game.active = game.active.map(id => id === oldId ? newId : id);
  game.eliminated = game.eliminated.map(id => id === oldId ? newId : id);
  if (game.tied) game.tied = game.tied.map(id => id === oldId ? newId : id);
  const answers = game.turn.answers;
  if (answers.has(oldId)) {
    answers.set(newId, answers.get(oldId));
    answers.delete(oldId);
  }
}

function snapshot(game, now) {
  const { startsAt, answerAt, endsAt, flash, sequence, answers } = game.turn;
  // Repeat only the current and imminent cues. Prebuffer short network delays
  // without publishing the remaining answer sequence at the start of the round.
  const cues = sequence.flatMap((cell, index) => {
    const on = startsAt + index * (flash + GAP);
    const off = on + flash;
    return off > now && on <= now + LOOKAHEAD ? [{ cell, on, off }] : [];
  });
  return { round: game.round, attempt: game.attempt, tie: Boolean(game.tied), startsAt, answerAt,
    endsAt, now, count: sequence.length, cues,
    eliminated: game.eliminated, answers: [...answers].map(([id, p]) => ({ id, correct: p.correct, done: p.done })) };
}

module.exports = { GAP, create, next, answer, resolve, rename, snapshot };
