window.MemoryMulti = (() => {
  const colors = ['#f26d9e','#65caff','#f6ca62','#70d6a0','#ad92ff','#ff966e','#57d9d4','#ea8091','#bacb73'];
  let view;

  function enter({room, myId, socket, root}) {
    if (view?.code === room.code && view.round === room.round && view.root.contains(view.status)) {
      view.myId = myId;
      return;
    }
    root.innerHTML = '<div class="center"><h2>🧠 记忆爆炸 · 淘汰赛</h2><p id="memory-status" class="status">等待题目同步…</p><div class="memory-colors"></div></div>';
    const grid = root.querySelector('.memory-colors');
    view = { code: room.code, round: room.round, myId, root, status: root.querySelector('#memory-status'), cells: [] };
    for (const [cell, color] of colors.entries()) {
      const button = document.createElement('button');
      button.className = 'memory-cell';
      button.style.setProperty('--cell', color);
      button.setAttribute('aria-label', '第 '+(cell+1)+' 格');
      button.disabled = true;
      button.onclick = () => {
        const round = view.state;
        const player = round?.answers.find(answer => answer.id === view.myId);
        if (!player || player.done || !socket.connected) return;
        view.cells.forEach(button => { button.disabled = true; });
        socket.emit('memory-answer', { attempt: round.attempt, index: player.correct, cell });
      };
      grid.append(button);
      view.cells.push(button);
    }
  }

  function receive(state) {
    if (!view || !view.root.contains(view.status)) return;
    view.state = state;
    const player = state.answers.find(p => p.id === view.myId);
    const answering = state.now >= state.answerAt && state.now < state.endsAt;
    const observing = !player;
    const prefix = '第 '+state.round+' 局'+(state.tie?' · 平手加赛':'')+' · ';
    const remaining = Math.max(0, Math.ceil((state.endsAt-state.now)/1000));
    view.status.textContent = prefix + (observing ? '观战' :
      state.now < state.startsAt ? '即将开始' :
      !answering ? '记住发光顺序' :
      player.done ? '作答结束 · 答对 '+player.correct+' 格' :
      '剩余 '+remaining+' 秒 · 答对 '+player.correct+' / '+state.count+' 格');
    for (const [i, button] of view.cells.entries()) {
      button.classList.toggle('is-lit', state.cell === i);
      button.disabled = !answering || observing || player.done;
    }
  }

  return { enter, receive, leave(){ view = null; } };
})();
