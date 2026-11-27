/* Local input feedback only: never submits inputs, never waits for network. */
(function(){
 if(window.PartyFeedback)return;
 const pool=[],animations=new WeakMap();
 let cursor=0;
 const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 function item(){
  if(pool.length<5){const el=document.createElement('span');el.className='pc-touch-ring';el.setAttribute('aria-hidden','true');document.body.append(el);pool.push(el);return el}
  return pool[cursor++%pool.length];
 }
 function animate(el,keyframes,options){
  if(typeof el.animate!=='function')return;
  animations.get(el)?.cancel();animations.set(el,el.animate(keyframes,options));
 }
 function pulse(el,kind='normal',point){
  if(!el||el.disabled||el.getAttribute('aria-disabled')==='true'||!el.isConnected)return;
  const rect=el.getBoundingClientRect();if(!rect.width||!rect.height)return;
  if(!el.hasAttribute('data-pc-sound'))window.PartySound?.play(el.id==='jump'?'jump':el.id==='boost'?'boost':el.id==='bomb-send'||el.id==='guess'?'guess':el.id.startsWith('skill-')||el.dataset?.card?'skill':kind);
  const speed=kind==='speed',circle=speed||kind==='joystick'||kind==='stack',cell=kind==='memory'||kind==='mine';
  const duration=reduced()?100:speed?160:220;
  const color=kind==='memory'?'#ffffff':kind==='mine'?'#ffe0a2':kind==='stack'?'#ffe3a9':'#ffc0e3';
  const mark=item();const size=kind==='stack'?38:Math.min(rect.width,rect.height);
  const width=circle?size:rect.width,height=circle?size:rect.height;
  const x=kind==='stack'&&point?point.x-width/2:rect.left+(rect.width-width)/2,y=kind==='stack'&&point?point.y-height/2:rect.top+(rect.height-height)/2;
  Object.assign(mark.style,{left:x+'px',top:y+'px',width:width+'px',height:height+'px',borderRadius:circle?'50%':cell?'14px':'12px',borderColor:color,color});
  if(typeof mark.animate==='function'){
   animate(mark,[{opacity:.95,transform:'scale(.97)'},{opacity:0,transform:reduced()?'scale(.97)':speed?'scale(1.11)':'scale(1.08)'}],{duration,easing:'ease-out'});
   if(kind!=='stack'&&kind!=='joystick')animate(el,[{filter:'brightness(1.55)'},{filter:cell&&kind==='memory'?'brightness(.76)':'brightness(1)'}],{duration,easing:'ease-out'});
  }else{mark.classList.remove('pc-ring-fallback');requestAnimationFrame(()=>{mark.classList.add('pc-ring-fallback')})}
 }
 function type(el){
  if(el.matches('.tap'))return 'speed';
  if(el.matches('.memory-cell'))return 'memory';
  if(el.matches('.foreman'))return 'mine';
  if(el.matches('#stick,.snake-stick'))return 'joystick';
  return 'normal';
 }
 function target(event){const el=event.target?.closest?.('button,[role="button"],#stick,.snake-stick,input[type="range"]');if(!el||el.id==='stack-place'||el.disabled||el.getAttribute('aria-disabled')==='true')return null;return el}
 const down=event=>{if(event.isPrimary===false||event.button!=null&&event.button!==0)return;const el=target(event);if(el)pulse(el,type(el))};
 if(window.PointerEvent)document.addEventListener('pointerdown',down,{capture:true,passive:true});
 else document.addEventListener('touchstart',down,{capture:true,passive:true});
 document.addEventListener('click',event=>{if(event.detail!==0)return;const el=target(event);if(el)pulse(el,type(el))},true);
 window.PartyFeedback={pulse};
})();