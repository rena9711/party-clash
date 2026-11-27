// Draw the current simulation or room snapshot while the 3D renderer is unavailable.
export function createLightScene(canvas, animals) {
  const ctx = canvas.getContext('2d');
  const portraits = new Map(animals.map(([id, emoji]) => {
    const image = new Image();
    image.src = './portraits/' + id + '.webp';
    const stride = new Image();
    stride.src = './portraits/' + id + '-run.webp';
    return [id, {image, stride, emoji}];
  }));
  let width, height;

  function resize(w, h) {
    width = w;
    height = h;
    const ratio = Math.min(1.5, devicePixelRatio || 1);
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function line(x1, y1, x2, y2, color, weight) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    ctx.stroke();
  }
  function render(run, time, preview, others = [], rosterSize = 1, projectNames = true) {
    const horizon = height * .21;
    const ground = height * (preview ? .48 : .78);
    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, '#170e38');
    sky.addColorStop(.42, '#78457d');
    sky.addColorStop(1, '#211635');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    function point(x, ahead, y = 0) {
      const scale = 10 / (10 + Math.max(-3, ahead));
      return {x: width * (.5 + x * .105 * scale), y: horizon + (ground - horizon) * scale - y * Math.min(width,height) * .12 * scale, scale};
    }
    ctx.fillStyle = '#312343';
    ctx.beginPath();
    for (const [x,d] of [[-4,80],[4,80],[4,-3],[-4,-3]]) {
      const p = point(x,d);
      ctx.lineTo(p.x,p.y);
    }
    ctx.fill();
    for (const x of [-4,-1.3,1.3,4]) {
      const a = point(x,80), b = point(x,-3);
      line(a.x,a.y,b.x,b.y,Math.abs(x)===4?'#ff97db':'#695087',2);
    }
    for(let d=6-run.distance%6; d<80; d+=6) {
      const a=point(-4,d), b=point(4,d);
      line(a.x,a.y,b.x,b.y,'#674674',a.scale);
    }
    const items = (run.objects || []).filter(o=>!o.used).map(o=>({object:o,ahead:o.at-run.distance}));
    for (const runner of [...others,run]) items.push({runner,ahead:runner.distance-run.distance});
    items.sort((a,b)=>b.ahead-a.ahead);
    const labels=[];
    ctx.textAlign='center';
    ctx.textBaseline='bottom';
    for (const {runner,object,ahead} of items) {
      if(ahead < -3 || ahead > 80) continue;
      const item=runner || object;
      const p=point(item.x,ahead,item.y || 0);
      const size=Math.min(width,height)*(runner ? .21 : .095)*p.scale;
      const portrait=runner && (portraits.get(runner.character)||portraits.get('fox'));
      if (!preview && portrait?.stride.naturalWidth) {
        const frameSize = portrait.stride.naturalHeight;
        const count = portrait.stride.naturalWidth / frameSize;
        const phase = (runner.distance * 1.18) % (2 * Math.PI);
        const frame = runner.y > 0 ? 1 : Math.floor(phase * count / (2 * Math.PI));
        ctx.drawImage(portrait.stride, frame * frameSize, 0, frameSize, frameSize, p.x-size/2, p.y-size, size, size);
      } else if (preview && portrait?.image.naturalWidth) {
        ctx.drawImage(portrait.image,p.x-size/2,p.y-size,size,size);
      }
      else {
        ctx.font=size+'px system-ui';
        ctx.fillText((portrait && (preview ? portrait.emoji : '💨')) || ({star:'⭐',bomb:'💣',hurdle:'🚧'}[object?.kind]),p.x,p.y);
      }
      if(runner?.id && !preview && projectNames) labels.push({id:runner.id,name:runner.name,self:runner===run,z:-ahead,x:p.x/width,y:(p.y-size)/height});
    }
    return labels;
  }
  return {resize,render,resetDiagnostics(){},dispose(){}};
}
