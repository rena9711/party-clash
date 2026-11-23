window.RaceTouch = (() => {
  function bind(surface, move, jump) {
    let start;
    surface.onpointerdown = event => {
      if (start || event.button !== 0) return;
      start = { id: event.pointerId, x: event.clientX, y: event.clientY };
      surface.setPointerCapture(event.pointerId);
    };
    surface.onpointermove = event => {
      if (start?.id !== event.pointerId) return;
      const dx = event.clientX-start.x, dy = event.clientY-start.y;
      if (dy < -28 && -dy > Math.abs(dx)) jump();
      else if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) move(Math.sign(dx));
      else return;
      start = null;
    };
    surface.onpointerup = surface.onpointercancel = surface.onlostpointercapture = () => { start = null; };
  }
  function flash(layer) {
    layer.innerHTML = Array.from({length:12}, (_, i) => {
      const angle = i*Math.PI/6;
      return '<i style="--dx:'+Math.round(Math.cos(angle)*85)+'px;--dy:'+Math.round(Math.sin(angle)*85)+'px"></i>';
    }).join('');
    layer.classList.remove('active');
    void layer.offsetWidth;
    layer.classList.add('active');
  }
  function gain(target, count) {
    target.innerHTML = '<span class="race-star-gain">+'+count+' ⭐</span>';
  }
  return {bind, flash, gain};
})();
