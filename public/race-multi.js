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
    window.scrollTo(0, 0);
    document.body.classList.add('rm-active');
    const stage = document.createElement('section');
    stage.className = 'race-room-stage';
    const loading = document.createElement('div');
    loading.className = 'entry-wait';
    loading.innerHTML = '<h2>跑得快</h2><p role="status"></p><button class="btn" type="button" hidden>重试轻量赛道</button>';
    const retry = loading.querySelector('button');
    const session = active = {code: room.code, round: room.round, playerId: myId, socket, stage, loading};
    stage.append(loading);
    root.replaceChildren(stage);
    function loadTrack(light) {
      clearTimeout(session.loadTimeout);
      session.ready = false;
      session.frame?.remove();
      const frame = document.createElement('iframe');
      frame.className = 'race-3d-frame';
      frame.title = '跑得快 · 多人赛道';
      frame.allow = 'accelerometer; gyroscope';
      frame.hidden = true;
      session.frame = frame;
      loading.hidden = false;
      loading.querySelector('p').textContent = '正在加载多人赛道…';
      retry.hidden = true;
      session.loadTimeout = setTimeout(() => {
        loading.querySelector('p').textContent = '赛道加载较慢，可以重试轻量赛道。';
        retry.hidden = false;
      }, 6000);
      const options = new URLSearchParams({mode:'room', v:'race-smooth-1'});
      if (light) options.set('view', 'light');
      frame.src = route('/race-v3/?'+options);
      stage.append(frame);
    }
    retry.onclick = () => loadTrack(true);
    loadTrack(false);
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
      clearTimeout(active.loadTimeout);
      active.loading.hidden = true;
      active.frame.hidden = false;
      window.scrollTo(0, 0);
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
    clearTimeout(active?.loadTimeout);
    active?.stage.remove();
    active = null;
    document.body.classList.remove('rm-active');
  }
  function route(url) {
    if(!diagnosing)return url;
    return url+(url.includes('?')?'&':'?')+'diagnostics=1&city='+city;
  }
  return {enter, receive, disconnect, leave, route};
})();
