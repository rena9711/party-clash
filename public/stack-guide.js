window.StackGuide=(()=>{
 const colors={base:'#a47cc8',moving:'#ffc1df',cut:'#f18b78',good:'#9ce1c9'};
 const top=(x,y,w,h,fill,extra='')=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="2" fill="'+fill+'" '+extra+'/>';
 function diagram(kind){
  const base=top(24,27,72,46,colors.base,'stroke="#d6b9f0"');
  let art='';
  if(kind==='move')art=base+top(4,12,72,46,colors.moving,'fill-opacity=".74" stroke="#ffe6f2"')+'<path d="M12 85H108 M18 80L12 85L18 90 M102 80L108 85L102 90" stroke="#ffe4a2" stroke-width="2" fill="none"/><path d="M112 10V69 M107 16L112 10L117 16 M107 63L112 69L117 63" stroke="#ffe4a2" stroke-width="2" fill="none"/>';
  if(kind==='perfect')art=base+top(24,27,72,46,colors.good,'stroke="#defbed" stroke-width="2"')+'<path d="M47 50L57 60L76 40" stroke="#244d48" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  if(kind==='cut')art=base+top(58,27,38,46,colors.good,'stroke="#defbed"')+top(101,27,34,46,colors.cut,'stroke="#ffbba7" stroke-dasharray="3 3"')+'<path d="M118 76v14m-5-5 5 5 5-5" stroke="#ffbba7" stroke-width="2" fill="none"/>';
  if(kind==='thin')art=base+top(88,27,8,46,colors.good,'stroke="#defbed"')+top(101,27,64,46,colors.cut,'fill-opacity=".45" stroke="#ffbba7" stroke-dasharray="3 3"')+'<path d="M92 20V8M88 12L92 8L96 12" stroke="#ffe4a2" stroke-width="2" fill="none"/>';
  if(kind==='miss')art=top(14,27,18,46,colors.base)+top(61,27,18,46,colors.cut,'stroke="#ffbba7"')+'<path d="M105 40l17 17m0-17-17 17" stroke="#ff938f" stroke-width="4" stroke-linecap="round"/>';
  if(kind==='height'){for(let j=0;j<3;j++){const count=[3,7,5][j],x=22+j*56;for(let i=0;i<count;i++){const y=83-i*10;art+='<path d="M'+x+' '+y+'l16 -8 16 8 -16 8z" fill="'+['#e2a8df','#ffc1df','#b6a1ee'][j]+'"/><path d="M'+x+' '+y+'l16 8 16 -8v7l-16 8 -16 -8z" fill="'+['#825b9e','#b6709b','#7660b1'][j]+'"/>'}if(j===1)art+='<path d="M74 10l5 9 10-5 4 5 8-9-3 15H77Z" fill="#ffe4a2"/>'}}
  return '<svg viewBox="0 0 190 100" width="100%" height="94" aria-hidden="true" style="display:block;max-width:170px;margin:auto">'+art+'</svg>';
 }
 function markup(mode){
  const turn=mode==='turn';
  const rows=[['move','看准时机','每块方块随机沿两个轴移动，点击屏幕立即放置。'],[turn?'thin':'perfect',turn?'故意切细':'精准重合',turn?'只保留一小条重合面积，留给下一位玩家。':'重合得越准，保留的面积越大；完美连击也不会恢复面积。'],['cut','错位切割','只有重合部分留下，切掉的方块不会变回来。'],[turn?'miss':'height',turn?'谁失误谁输':'最高者获胜',turn?'每人只放一块，限时10秒；完全没有重合或超时，整局结束。':'45秒内每人叠自己的塔，成功堆叠层数最多者获胜；失败后可观战。']];
  return '<div class="stack-guide" style="text-align:left"><h2 style="text-align:center;color:#ffc1df;margin:4px 0">🧱 '+(turn?'叠你一刀':'层层攀升')+'</h2><p style="text-align:center;color:#e2c7eb;margin:8px 0 14px">'+(turn?'轮流陷害 · 2–10人 · 每人10秒':'各自叠塔 · 1–10人 · 45秒')+'</p>'+rows.map(([kind,title,desc],i)=>'<article style="display:grid;grid-template-columns:minmax(85px,36%) 1fr;align-items:center;gap:10px;padding:9px;margin:8px 0;border:1px solid #ffffff19;border-radius:12px;background:#2a2037"><div>'+diagram(kind)+'</div><div><strong style="color:#ffc1df">'+(i+1)+'. '+title+'</strong><p style="font-size:13px;line-height:1.55;margin:5px 0;color:#f5e6f4">'+desc+'</p></div></article>').join('')+'</div>';
 }
 return {markup};
})();