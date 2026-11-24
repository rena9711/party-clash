window.SnakeRoom = (() => {
  let view;

  function enter({room, myId, socket, root}) {
    if (view?.round === room.round && view.code === room.code) {
      view.myId = myId;
      return;
    }
    leave();
    const frame = document.createElement('iframe');
    frame.title = '贪吃蛇 · 房间对战';
    frame.className = 'snake-room-frame';
    frame.allowFullscreen = true;
    frame.src = '/snake-demo.html?mode=room';
    view = {frame, round:room.round, code:room.code, socket, myId};
    root.replaceChildren();
    document.body.classList.add('snake-room-active');
    document.body.append(frame);
  }

  function receive(state) {
    view?.frame.contentWindow?.renderSnakeRoom?.(state, view.myId);
  }

  function leave() {
    view?.frame.remove();
    view = null;
    document.body.classList.remove('snake-room-active');
  }

  return {enter, receive, leave,
    steer(x,y){view?.socket.emit('snake-input',{x,y})},
    skill(kind){view?.socket.emit('snake-skill',kind)},
    exit(){if(view)leaveRoom(true)}
  };
})();
