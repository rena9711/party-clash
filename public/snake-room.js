window.SnakeRoom = (() => {
  let view;
  function leave() {
    view = null;
    document.body.classList.remove('snake-room-active');
  }

  function enter({room, myId, socket, root}) {
    if (view?.code === room.code && view.round === room.round) {
      view.myId = myId;
      return;
    }
    leave();
    document.body.classList.add('snake-room-active');
    root.innerHTML = `<main class="snake-room"><canvas aria-label="贪吃蛇游戏区域"></canvas>
      <div class="snake-room-stats" aria-live="off">等待同步…</div>
      <button type="button" class="snake-stick" aria-label="拖动摇杆控制方向">●</button>
      <div class="snake-rotate">请横握手机。<button type="button" class="btn snake-full">全屏</button></div>
    </main>`;
    const board = root.querySelector('canvas');
    const stick = root.querySelector('.snake-stick');
    const host = root.querySelector('.snake-room');
    view = {code:room.code, round:room.round, myId, board, context:board.getContext('2d'), stats:root.querySelector('.snake-room-stats')};
    let pointer, previous = '';
    const steer = event => {
      const box = stick.getBoundingClientRect();
      const x = event.clientX - box.left - box.width/2;
      const y = event.clientY - box.top - box.height/2;
      if (Math.hypot(x,y) < 10) return;
      const length = Math.max(1, Math.hypot(x,y));
      stick.style.setProperty('--dx', Math.round(x/length*24)+'px');
      stick.style.setProperty('--dy', Math.round(y/length*24)+'px');
      const horizontal = Math.abs(x) >= Math.abs(y);
      const direction = {x: horizontal ? Math.sign(x) : 0, y: horizontal ? 0 : Math.sign(y)};
      const key = direction.x+','+direction.y;
      if (key !== previous) socket.emit('snake-input', direction);
      previous = key;
    };
    stick.onpointerdown = event => {
      if (pointer !== undefined) return;
      pointer = event.pointerId;
      stick.setPointerCapture(pointer);
      steer(event);
    };
    stick.onpointermove = event => { if (pointer === event.pointerId) steer(event); };
    const release = () => {
      pointer = undefined;
      previous = '';
      stick.style.removeProperty('--dx');
      stick.style.removeProperty('--dy');
    };
    stick.onlostpointercapture = release;
    stick.onpointercancel = release;
    stick.onpointerup = release;
    stick.onkeydown = event => {
      const move = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
      if (move) {
        event.preventDefault();
        socket.emit('snake-input',{x:move[0],y:move[1]});
      }
    };
    root.querySelector('.snake-full').onclick = async () => {
      try {
        await host.requestFullscreen?.();
        await screen.orientation?.lock?.('landscape');
      } catch {}
    };
  }

  function receive(state) {
    if (!view) return;
    const {board,context:ctx,myId,stats} = view;
    const ratio = Math.min(2, devicePixelRatio || 1);
    const width = Math.round(board.clientWidth*ratio), height = Math.round(board.clientHeight*ratio);
    if (board.width !== width || board.height !== height) { board.width=width; board.height=height; }
    if (!width || !height) return;
    const scale = Math.min(width/state.width,height/state.height);
    const ox = (width-state.width*scale)/2, oy = (height-state.height*scale)/2;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,width,height);
    ctx.setTransform(scale,0,0,scale,ox,oy);
    ctx.fillStyle='#231938';
    ctx.fillRect(0,0,state.width,state.height);
    for (const food of state.foods) {
      ctx.fillStyle='#ffdc69';
      ctx.beginPath();
      ctx.arc(food.x+.5,food.y+.5,.26,0,Math.PI*2);
      ctx.fill();
    }
    for (const player of state.players) {
      ctx.fillStyle=player.color;
      player.body.forEach((cell,i) => {
        ctx.globalAlpha=i===0?1:.78;
        ctx.fillRect(cell.x+.08,cell.y+.08,.84,.84);
      });
    }
    ctx.globalAlpha=1;
    const mine=state.players.find(p=>p.id===myId);
    const now=state.now;
    const time=now<state.startsAt?'准备 '+Math.ceil((state.startsAt-now)/1000)+' 秒':
      '剩余 '+Math.max(0,(state.endsAt-now)/1000).toFixed(1)+' 秒';
    const rank=[...state.players].sort((a,b)=>b.score-a.score).findIndex(p=>p.id===myId)+1;
    stats.textContent=time+' · 积分 '+(mine?.score||0)+' · 排名 '+(rank||'—')+
      (mine?.respawnAt?' · 等待重生':'');
  }
  return {enter, receive, leave};
})();
