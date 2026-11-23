/* The lobby owns the Socket.IO connection; the race view only exchanges inputs and snapshots. */
window.RaceMulti = (() => {
  let active, resultPanel, savedResult;
  const query=new URLSearchParams(location.search);
  const diagnosing=query.get('diagnostics')==='1';
  const city=query.get('city')==='legacy'?'legacy':'optimized';
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
    savedResult=null;
    resultPanel?.remove();
    document.body.classList.add('rm-active');
    const frame = document.createElement('iframe');
    frame.className = 'race-3d-frame';
    frame.title = '跑得快 · 多人 3D';
    frame.allow = 'accelerometer; gyroscope';
    active = {code: room.code, round: room.round, playerId: myId, socket, frame};
    frame.src='/race-v3/?mode=room'+(diagnosing?'&diagnostics=1&city='+city:'');
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
      if(diagnosing&&!active.probe){
        const session=active;
        active.probe=setInterval(()=>{
          if(!session.socket.connected)return;
          const start=performance.now();
          session.socket.timeout(1000).emit('memory-clock',error=>{
            if(!error&&active===session)session.frame.contentWindow.postMessage({
              type:'party-race-rtt',ms:performance.now()-start
            },origin);
          });
        },2000);
      }
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
    if(diagnosing&&active){
      clearInterval(active.probe);
      const data=active.frame.contentWindow.partyRaceDiagnostics?.();
      if(data?.frames.length){
        savedResult=data;
        import('/race-v3/diagnostics.mjs').then(({diagnosticsPanel})=>{
          if(savedResult===data){
            resultPanel?.remove();
            resultPanel=diagnosticsPanel(()=>data,{floating:true});
            resultPanel.open=true;
          }
        });
      }
    }
    active?.frame.remove();
    active = null;
    document.body.classList.remove('rm-active');
  }
  function route(url) {
    if(!diagnosing)return url;
    return url+(url.includes('?')?'&':'?')+'diagnostics=1&city='+city;
  }
  return {enter, receive, disconnect, leave, route};
})();
