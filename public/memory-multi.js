window.MemoryMulti = (() => {
  const colors = ['#f26d9e','#65caff','#f6ca62','#70d6a0','#ad92ff','#ff966e','#57d9d4','#ea8091','#bacb73'];
  let view;

  function syncClock(current) {
    const start = performance.now();
    current.socket.timeout(1500).emit('memory-clock', (error, serverTime) => {
      if (error || !Number.isFinite(serverTime) || view !== current) return;
      const received = performance.now();
      const delay = (received - start) / 2;
      // Midpoint for visuals; receipt-time estimate is a lower bound for opening input.
      current.clock = { visual: serverTime + delay - received, safe: serverTime - received };
    });
  }

  function enter({room, myId, socket, root}) {
    if (view?.code === room.code && view.round === room.round && view.root.contains(view.status)) {
      if (view.myId !== myId) {
        view.myId = myId;
        view.clock = null;
        syncClock(view);
      }
      return;
    }
    leave();
    root.innerHTML = '<div class="center"><h2>🧠 记忆爆炸 · 淘汰赛</h2><p id="memory-status" class="status">等待题目同步…</p><div class="memory-colors"></div></div>';
    const grid = root.querySelector('.memory-colors');
    view = { code: room.code, round: room.round, myId, socket, root, status: root.querySelector('#memory-status'), cells: [], cues: new Map(), frame: 0 };
    const current = view;
    for (const [cell, color] of colors.entries()) {
      const button = document.createElement('button');
      button.className = 'memory-cell';
      button.style.setProperty('--cell', color);
      button.setAttribute('aria-label', '第 '+(cell+1)+' 格');
      button.disabled = true;
      const answer = () => {
        const state = current.state;
        const player = state?.answers.find(answer => answer.id === current.myId);
        if (view !== current || button.disabled || !player || player.done || !socket.connected) return;
        const index = Math.max(player.correct,current.nextIndex || 0);
        if(index>=state.count)return;
        current.nextIndex=index+1;
        socket.emit('memory-answer', { attempt: state.attempt, index, cell });
      };
      button.onpointerdown = event => {
        if(event.isPrimary && event.button===0){event.preventDefault();answer()}
      };
      button.onclick = event => {if(!window.PointerEvent || event.detail===0)answer()};
      grid.append(button);
      current.cells.push(button);
    }
    syncClock(current);
    current.frame = requestAnimationFrame(paint);
  }

  function receive(state) {
    if (!view || !view.root.contains(view.status) || state.attempt < view.state?.attempt) return;
    if (view.state?.attempt !== state.attempt) {
      view.cues.clear();
      view.nextIndex=0;
      view.visualTime = -Infinity;
    }
    view.state = state;
    const offset = state.now - performance.now();
    view.latestOffset = Math.max(view.latestOffset ?? -Infinity, offset);
    for (const cue of state.cues) view.cues.set(cue.on, cue);
    const player = state.answers.find(answer => answer.id === view.myId);

  }

  function paint(time) {
    if (!view) return;
    view.frame = requestAnimationFrame(paint);
    const state = view.state;
    if (!state) return;
    const visual = time + (view.clock?.visual ?? view.latestOffset);
    const now = view.visualTime = Math.max(view.visualTime, visual);
    const safe = time + Math.max(view.latestOffset, view.clock?.safe ?? -Infinity);
    const player = state.answers.find(p => p.id === view.myId);
    const answering = safe >= state.answerAt && now >= state.answerAt && now < state.endsAt;
    const prefix = '第 '+state.round+' 局'+(state.tie?' · 平手加赛':'')+(player?'':' · 观战')+' · ';
    const remaining = Math.max(0, Math.ceil((state.endsAt - now) / 1000));
    const status = prefix + (now < state.startsAt ? '准备 '+Math.ceil((state.startsAt - now) / 1000)+' 秒' :
      !answering ? (now >= state.answerAt ? '等待同步' : '记住发光顺序') :
      !player ? '答题中' : player.done ? '作答结束 · 答对 '+player.correct+' 格' :
      '开始作答 · 剩余 '+remaining+' 秒 · 答对 '+player.correct+' / '+state.count+' 格');
    if (view.status.textContent !== status) view.status.textContent = status;
    let lit = null;
    for (const [start, cue] of view.cues) {
      if (cue.off <= now) view.cues.delete(start);
      else if (start <= now) lit = cue.cell;
    }
    const locked = !answering || !player || player.done;
    for (const [i, button] of view.cells.entries()) {
      button.classList.toggle('is-lit', i === lit);
      if(button.disabled !== locked)button.disabled = locked;
    }
  }

  function leave() {
    if (view) cancelAnimationFrame(view.frame);
    view = null;
  }

  return { enter, receive, leave };
})();
