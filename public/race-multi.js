/* The lobby owns the Socket.IO connection; the race view only exchanges inputs and snapshots. */
window.RaceMulti = (() => {
  let active;
  const origin = location.origin;

  function send() {
    if (!active?.ready || !active.latest) return;
    active.frame.contentWindow.postMessage({
      type: 'party-race-state', state: active.latest, playerId: active.playerId,
      connected: active.socket.connected
    }, origin);
  }

  function enter({room, myId, socket, root}) {
    if (active?.code === room.code && active.round === room.round) {
      if(active.playerId!==myId){
        active.playerId = myId;
        send();
      }
      return;
    }
    leave();
    document.body.classList.add('rm-active');
    const frame = document.createElement('iframe');
    frame.className = 'race-3d-frame';
    frame.title = '跑得快 · 多人 3D';
    frame.allow = 'accelerometer; gyroscope';
    active = {code: room.code, round: room.round, playerId: myId, socket, frame};
    frame.src = '/race-v3/?mode=room';
    root.replaceChildren(frame);
  }

  function receive(state) {
    if (!active || state?.version !== 3) return;
    active.latest = state;
    send();
  }

  window.addEventListener('message', event => {
    if (!active || event.origin !== origin || event.source !== active.frame.contentWindow) return;
    if (event.data?.type === 'party-race-ready') {
      active.ready = true;
      send();
    } else if (event.data?.type === 'party-race-input' && active.socket.connected) {
      const input = event.data.input;
      if (input?.jump || input?.boost || input?.axis === 0) active.socket.emit('race-input', input);
      else active.socket.volatile.emit('race-input', input);
    }
  });

  function disconnect() {
    send();
  }

  function leave() {
    active?.frame.remove();
    active = null;
    document.body.classList.remove('rm-active');
  }
  return {enter, receive, disconnect, leave};
})();
