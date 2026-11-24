window.MineBoard = (() => {
  const hues = [191, 17, 282, 150, 345];
  const escape = value => String(value).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  function face(i=0){
    return `<i aria-hidden="true" class="miner" style="--cap:hsl(${hues[(i*3+Math.floor(i/5))%5]} 56% 43%)"><i class="miner-cap">ϟ</i><i class="miner-brows"></i><i class="miner-eyes"></i><i class="miner-nose"></i><i class="miner-stache"></i></i>`;
  }
  function grid(used,enabled){
    return '<div class="foremen-grid">'+Array.from({length:20},(_,i)=>used.has(i+1)
      ? '<i class="empty-seat" aria-hidden="true"></i>'
      : `<button type="button" class="foreman" data-cell="${i+1}" aria-label="第${i+1}位大叔" ${enabled?'':'disabled'}>${face(i)}</button>`).join('')+'</div>';
  }
  function ranking(players){
    const sorted=[...players].sort((a,b)=>b.points-a.points);
    return '<section class="mine-ranking"><h3>实时积分榜</h3><ol>'+sorted.map(p=>`<li><span>${escape(p.name)}</span><b>${p.points} 分</b></li>`).join('')+'</ol></section>';
  }
  return {face,grid,ranking};
})();
