window.RoomCharacters = (() => {
  const {animals} = PartyIdentity;
  let draft;
  let previews;

  function icon(character) {
    return animals.find(([id])=>id===character)?.[1] ?? '';
  }

  function markup(room, myId) {
    const own = room.players.find(player=>player.id===myId)?.character;
    return `<section class="panel character-picker" aria-labelledby="character-title">
      <h2 id="character-title">选择你的角色</h2>
      <div class="character-grid">${animals.map(([id,emoji,name])=>`<button type="button" class="character-card" data-character="${id}" aria-pressed="false">
        <span class="character-preview" data-preview="${id}"></span>
        <b>${emoji} ${name}</b><small></small>
      </button>`).join('')}</div>
      <p id="character-feedback" role="status">${own?'当前角色已确认':'每个角色只能由一位玩家选择'}</p>
      <button class="btn" id="confirm-character" type="button">确认选择</button>
    </section>`;
  }

  function bind(room, myId, socket) {
    if (draft?.code!==room.code) draft={code:room.code};
    const panel=document.querySelector('.character-picker');
    const confirm=panel.querySelector('#confirm-character');
    const feedback=panel.querySelector('#character-feedback');
    const cards=[...panel.querySelectorAll('[data-character]')];
    const owned=new Set(room.players.filter(p=>p.id!==myId).map(p=>p.character));
    const own=room.players.find(player=>player.id===myId)?.character;
    const selected=()=>owned.has(draft.id)?own:(draft.id||own);
    let confirming=false;

    function draw() {
      for (const card of cards) {
        const id=card.dataset.character;
        const used=owned.has(id);
        card.disabled=used||confirming;
        card.setAttribute('aria-pressed',String(id===selected()));
        card.querySelector('small').textContent=used?'已被选择':id===own?'✓ 已确认':id===selected()?'✓ 已选中':'';
      }
      confirm.disabled=confirming||!selected()||selected()===own;
    }
    for(const card of cards)card.onclick=()=>{draft.id=card.dataset.character;feedback.textContent='';draw()};
    confirm.onclick=()=>{
      confirming=true;
      draw();
      socket.timeout(3500).emit('race-character',selected(),(error,result)=>{
        confirming=false;
        if(error||!result?.ok)feedback.textContent=result?.error||'连接失败，请重试';
        else draft.id=null;
        draw();
      });
    };
    draw();
    previews ??= import('/race-v3/character-previews.mjs')
      .then(module=>module.characterPreviews(animals.map(([id])=>id)))
      .catch(()=>new Map());
    previews.then(images=>{
      if(!panel.isConnected)return;
      for(const card of cards){
        const url=images.get(card.dataset.character);
        if(!url)continue;
        const img=document.createElement('img');
        img.src=url;
        img.alt='';
        card.querySelector('[data-preview]').append(img);
      }
    });
  }
  return {icon, markup, bind};
})();
