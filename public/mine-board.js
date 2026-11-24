window.MineBoard = (() => {
  const escape = value => String(value).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  function face(){
    return '<img class="mine-cat" src="/assets/golden-cat.webp" alt="" draggable="false">';
  }
  function grid(used,enabled){
    return '<div class="foremen-grid">'+Array.from({length:20},(_,i)=>used.has(i+1)
      ? '<i class="empty-seat" aria-hidden="true"></i>'
      : `<button type="button" class="foreman" data-cell="${i+1}" aria-label="第${i+1}只小猫" ${enabled?'':'disabled'}>${face()}</button>`).join('')+'</div>';
  }
  function ranking(players){
    const sorted=[...players].sort((a,b)=>b.points-a.points);
    return '<section class="mine-ranking"><h3>实时积分榜</h3><ol>'+sorted.map(p=>`<li><span>${escape(p.name)}</span><b>${p.points} 分</b></li>`).join('')+'</ol></section>';
  }
  return {face,grid,ranking};
})();
