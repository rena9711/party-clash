/* Original synthesized game cues. No downloads, autoplay or background music. */
(function(){
 if(window.PartySound)return;
 const key='party-clash-sound';let enabled=true,ctx=null,last=0,voices=0;
 try{enabled=localStorage.getItem(key)!=='off'}catch{}
 const tones={
 speed:[[720,.035,'triangle']],memory:[[520,.07,'sine'],[780,.055,'sine',.035]],mine:[[330,.07,'triangle'],[510,.06,'triangle',.04]],stack:[[280,.055,'triangle'],[420,.07,'triangle',.025]],joystick:[[240,.055,'sine']],normal:[[480,.055,'triangle']],jump:[[440,.06,'triangle'],[680,.07,'triangle',.035]],boost:[[180,.07,'sawtooth'],[360,.09,'triangle',.045]],guess:[[300,.06,'triangle'],[450,.08,'triangle',.04]],skill:[[580,.07,'sine'],[880,.09,'triangle',.045]],start:[[440,.08,'triangle'],[660,.08,'triangle',.1],[880,.11,'triangle',.2]],finish:[[660,.1,'sine'],[880,.12,'triangle',.12],[1040,.16,'triangle',.26]],fail:[[300,.11,'triangle'],[190,.18,'triangle',.1]]
 };
 function sync(){document.querySelectorAll('[data-pc-sound]').forEach(b=>{const label=enabled?'🔊 音效开启':'🔇 音效关闭';b.textContent=b.classList.contains('pc-sound-compact')?(enabled?'🔊':'🔇'):label;b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(enabled));b.title=label})}
 function unlock(){if(!enabled||document.hidden)return;try{if(!ctx){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;ctx=new Audio()}if(ctx.state==='suspended')ctx.resume().catch(()=>{})}catch{}}
 function play(kind='normal'){
  if(!enabled||document.hidden||!ctx||ctx.state!=='running')return;
  const now=ctx.currentTime;if(kind==='speed'&&now-last<.035)return;if(kind==='speed')last=now;
  for(const [hz,len,type,delay=0] of tones[kind]||tones.normal){
   if(voices>=6)break;
   try{const o=ctx.createOscillator(),g=ctx.createGain(),at=now+delay;voices++;o.type=type;o.frequency.setValueAtTime(hz,at);g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(kind==='speed'?.035:.055,at+.008);g.gain.exponentialRampToValueAtTime(.0001,at+len);o.connect(g);g.connect(ctx.destination);o.onended=()=>{voices=Math.max(0,voices-1);o.disconnect();g.disconnect()};o.start(at);o.stop(at+len+.01)}catch{}
  }
 }
 const activate=e=>{if(e.isTrusted!==false)unlock()};
 document.addEventListener('pointerdown',activate,{capture:true,passive:true});document.addEventListener('touchend',activate,{capture:true,passive:true});document.addEventListener('keydown',activate,true);
 document.addEventListener('click',e=>{const b=e.target.closest?.('[data-pc-sound]');if(!b)return;enabled=!enabled;try{localStorage.setItem(key,enabled?'on':'off')}catch{}if(enabled){unlock();play('normal')}sync()},true);
 window.addEventListener('storage',e=>{if(e.key===key){enabled=e.newValue!=='off';sync()}});
 if(typeof MutationObserver!=='undefined')new MutationObserver(records=>{if(records.some(r=>Array.from(r.addedNodes).some(n=>n.nodeType===1&&(n.matches?.('[data-pc-sound]')||n.querySelector?.('[data-pc-sound]')))))sync()}).observe(document.body,{childList:true,subtree:true});
 sync();window.PartySound={play,sync};
})();