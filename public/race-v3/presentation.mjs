export function raceModelScale(rosterSize) {
  if (rosterSize>=8) return .65;
  if (rosterSize>=6) return .75;
  if (rosterSize>=4) return .85;
  return 1;
}

export function useDistantModel(relativeZ) {
  return relativeZ < -22;
}

export function layoutNameplates(labels,width,height,measure) {
  const placed=[];
  const ordered=[...labels].sort((a,b)=>Number(b.self)-Number(a.self)||Math.abs(a.z)-Math.abs(b.z));
  for(const label of ordered){
    const caption=(label.self?'我 · ':'')+label.name;
    const w=Math.min(width*.42,Math.ceil(measure(caption))+14);
    const x=Math.max(4,Math.min(width-w-4,label.x*width-w/2));
    const baseY=label.y*height-20;
    for(let row=0;row<5;row++){
      const y=baseY-row*21;
      if(y<48||y+19>height-8)continue;
      if(placed.some(other=>x<other.left+other.width+4&&x+w+4>other.left&&y<other.top+19&&y+19>other.top))continue;
      placed.push({...label,caption,left:x,top:y,width:w});
      break;
    }
  }
  return placed;
}
