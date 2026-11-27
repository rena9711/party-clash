/* Short synthesized cues, unlocked by the player's first browser gesture. */
(function () {
  if (window.PartySound) return;

  const key = 'party-clash-sound';
  const tones = {
    speed: [[780, .045, 'triangle']],
    precision: [[620, .065, 'triangle'], [930, .08, 'sine', .04]],
    memory: [[550, .075, 'sine'], [825, .065, 'triangle', .035]],
    mine: [[280, .07, 'triangle'], [490, .08, 'triangle', .045]],
    stack: [[230, .075, 'triangle'], [380, .08, 'triangle', .025]],
    joystick: [[285, .055, 'triangle']],
    normal: [[480, .06, 'triangle']],
    jump: [[440, .07, 'triangle'], [680, .08, 'triangle', .04]],
    boost: [[180, .08, 'sawtooth'], [360, .12, 'triangle', .045]],
    guess: [[330, .075, 'triangle'], [500, .09, 'triangle', .04]],
    skill: [[580, .075, 'sine'], [880, .1, 'triangle', .045]],
    star: [[850, .065, 'triangle'], [1200, .08, 'sine', .035]],
    bean: [[720, .075, 'sine'], [500, .06, 'triangle', .03]],
    start: [[440, .09, 'triangle'], [660, .09, 'triangle', .1], [880, .12, 'triangle', .2]],
    finish: [[660, .1, 'sine'], [880, .12, 'triangle', .12], [1040, .16, 'triangle', .26]],
    fail: [[310, .12, 'triangle'], [170, .16, 'triangle', .09]],
    blast: [[120, .19, 'sawtooth'], [68, .28, 'triangle', .04]],
  };

  let enabled = true;
  try { enabled = localStorage.getItem(key) !== 'off'; } catch {}
  let parentSound;
  try { if (window.parent !== window) parentSound = window.parent.PartySound; } catch {}

  let audio, output, pending, voices = 0, lastTap = -Infinity;

  function sync() {
    const label = enabled ? '🔊 音效开启' : '🔇 音效关闭';
    document.querySelectorAll('[data-pc-sound]').forEach(button => {
      button.textContent = button.classList.contains('pc-sound-compact') ? (enabled ? '🔊' : '🔇') : label;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(enabled));
      button.title = label;
    });
  }

  function flush() {
    if (audio?.state !== 'running' || !pending) return;
    const cue = pending;
    pending = null;
    if (performance.now() - cue.at < 450) play(cue.kind);
  }

  function unlock() {
    if (!enabled || document.hidden) return;
    if (parentSound) { parentSound.unlock(); return; }
    try {
      if (!audio) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        audio = new Audio();
        output = audio.createGain();
        output.gain.value = .78;
        output.connect(audio.destination);
        audio.addEventListener('statechange', flush);
      }
      if (audio.state !== 'running') audio.resume().then(flush, () => {});
    } catch {}
  }

  function play(kind = 'normal') {
    if (!enabled || document.hidden) return;
    if (parentSound) { parentSound.play(kind); return; }
    if (!audio || audio.state !== 'running') {
      pending = { kind, at: performance.now() };
      return;
    }

    const now = audio.currentTime;
    if (kind === 'speed') {
      if (now - lastTap < .045) return;
      lastTap = now;
    }
    for (const [pitch, duration, wave, delay = 0] of tones[kind] || tones.normal) {
      if (voices >= 8) break;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const from = now + delay;
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(pitch, from);
      gain.gain.setValueAtTime(.0001, from);
      gain.gain.exponentialRampToValueAtTime(kind === 'speed' ? .12 : kind === 'blast' ? .17 : .20, from + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, from + duration);
      oscillator.connect(gain);
      gain.connect(output);
      oscillator.onended = () => { voices--; oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(from);
      oscillator.stop(from + duration + .01);
      voices++;
    }
  }

  function setEnabled(value) {
    enabled = value;
    pending = null;
    if (output) output.gain.value = enabled ? .78 : 0;
    sync();
  }

  const onGesture = event => { if (event.isTrusted) unlock(); };
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']) {
    document.addEventListener(type, onGesture, { capture: true, passive: true });
  }
  document.addEventListener('click', event => {
    if (!event.target.closest?.('[data-pc-sound]')) return;
    setEnabled(!enabled);
    parentSound?.setEnabled(enabled);
    try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch {}
    if (enabled) { unlock(); play('normal'); }
  }, true);
  window.addEventListener('storage', event => { if (event.key === key) setEnabled(event.newValue !== 'off'); });
  new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node =>
      node.nodeType === 1 && (node.matches('[data-pc-sound]') || node.querySelector('[data-pc-sound]'))))) sync();
  }).observe(document.body, { childList: true, subtree: true });

  sync();
  window.PartySound = { play, unlock, setEnabled };
})();
