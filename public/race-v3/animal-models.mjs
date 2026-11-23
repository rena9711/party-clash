import * as T from './vendor/three.module.min.js';

const profiles = {
  fox:     {coat:'#7544c6', fur:'#ed793d', trim:'#ffdbac', body:[.39,.51,.28], head:[.42,.34,.31]},
  rabbit:  {coat:'#e45b9f', fur:'#dfd8e9', trim:'#f7accc', body:[.32,.52,.24], head:[.38,.34,.30]},
  panda:   {coat:'#41a668', fur:'#f0ecea', trim:'#262433', body:[.46,.49,.33], head:[.47,.33,.33]},
  cat:     {coat:'#e5b634', fur:'#f6b952', trim:'#fff0b9', body:[.34,.48,.24], head:[.42,.31,.30]},
  frog:    {coat:'#21a99c', fur:'#78cc5f', trim:'#dfedaa', body:[.43,.41,.32], head:[.51,.26,.34]},
  bear:    {coat:'#d54c58', fur:'#a96d4d', trim:'#efbe8a', body:[.45,.51,.34], head:[.44,.37,.34]},
  penguin: {coat:'#4279dc', fur:'#263653', trim:'#f7eef1', body:[.41,.49,.34], head:[.38,.35,.32]},
  dog:     {coat:'#e87a2d', fur:'#e7b98e', trim:'#fff0db', body:[.37,.47,.28], head:[.41,.34,.32]},
  lion:    {coat:'#d9a43e', fur:'#edbb6a', trim:'#ffe0a0', body:[.43,.50,.31], head:[.41,.33,.29]},
  pig:     {coat:'#e0528c', fur:'#f0a5bd', trim:'#eb779d', body:[.46,.44,.34], head:[.46,.33,.33]}
};

export function createAnimalFactory({batchedScene}={}) {
  const shapes={
    ball:new T.SphereGeometry(1,10,7), lowBall:new T.SphereGeometry(1,6,4), cube:new T.BoxGeometry(1,1,1),
    cone:new T.ConeGeometry(1,1,4), ring:new T.RingGeometry(.72,1,28)
  };
  const materials=new Map();
  const batches=new Map();
  const nodes=[];
  function mesh(parent, shape, color, x,y,z,sx,sy,sz) {
    const key=shape+'/'+color;
    if(!materials.has(key))materials.set(key,shape==='ring'
      ?new T.MeshBasicMaterial({color,transparent:true,opacity:.87,side:T.DoubleSide})
      :new T.MeshStandardMaterial({color,roughness:.78,flatShading:true}));
    let item;
    if(batchedScene){
      if(!batches.has(key)){
        const batch=new T.InstancedMesh(shapes[shape],materials.get(key),128);
        batch.count=0;
        batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
        batch.frustumCulled=false;
        batchedScene.add(batch);
        batches.set(key,batch);
      }
      item=new T.Object3D();
      nodes.push({item,batch:batches.get(key)});
    }else{
      item=new T.Mesh(shapes[shape],materials.get(key));
    }
    item.position.set(x,y,z);
    item.scale.set(sx,sy,sz);
    parent.add(item);
    return item;
  }
  function create(parent, requested, {self=false}={}) {
    const id=profiles[requested]?requested:'fox';
    const {coat,fur,trim,body:bodySize,head:headSize}=profiles[id];
    const root=new T.Group();
    parent.add(root);
    const shadow=mesh(parent,'ball','#100b22',0,.018,0,.58,.012,.34);
    const ring=self?mesh(parent,'ring','#5afaff',0,.035,0,.63,.49,1):null;
    if(ring)ring.rotation.x=-Math.PI/2;
    const body=mesh(root,'ball',coat,0,.87,0,...bodySize);
    mesh(root,'cube',trim,0,.79,-bodySize[2],.23,.075,.025);
    for(const side of [-1,1])mesh(root,'cube','#fff0ed',side*.07,1.02,-bodySize[2],.018,.17,.023).rotation.z=side*.14;
    const head=new T.Group();
    head.position.set(0,1.39,-.13);
    root.add(head);
    mesh(head,'ball',coat,0,.01,.11,headSize[0]*1.05,headSize[1]*1.07,headSize[2]*1.1);
    mesh(head,'ball',fur,0,.11,-.12,...headSize);
    const point=(shape,color,x,y,z,sx,sy,sz)=>mesh(head,shape,color,x,y,z,sx,sy,sz);
    if(id==='lion'){
      point('ball','#9e552d',0,.08,.0,.58,.51,.28);
      for(let i=0;i<10;i++){
        const angle=i*Math.PI/5;
        const tuft=point('cone','#bc6e2e',Math.cos(angle)*.47,.08+Math.sin(angle)*.41,-.08,.105,.27,.12);
        tuft.rotation.z=angle-Math.PI/2;
      }
      point('ball',fur,0,.11,-.17,...headSize);
    }
    for(const side of [-1,1]){
      const x=side*.28;
      if(id==='fox'||id==='cat'||id==='pig'){
        const ear=point('cone',id==='fox'?'#c94d32':fur,x,.48,-.14,.17,id==='fox' ? .43:.30,.13);
        ear.rotation.z=-side*.27;
        point('cone',trim,x,.48,-.23,.085,.21,.055).rotation.z=ear.rotation.z;
      }else if(id==='rabbit'){
        point('ball',fur,x,.59,-.10,.115,.34,.08).rotation.z=-side*.17;
        point('ball',trim,x,.62,-.158,.065,.247,.034).rotation.z=-side*.17;
      }else if(id==='dog'){
        point('ball','#95623f',side*.39,.17,-.10,.117,.285,.105).rotation.z=side*.25;
      }else if(id==='frog'){
        point('ball',fur,side*.27,.33,-.18,.16,.18,.145);
      }else if(id!=='penguin'){
        point('ball',id==='panda'?trim:fur,x,.39,-.10,.14,.14,.105);
        if(id!=='panda')point('ball',trim,x,.40,-.178,.082,.080,.045);
      }
      if(id==='panda')point('ball',trim,side*.19,.15,-.38,.136,.114,.045).rotation.z=side*.35;
      if(id==='penguin')point('ball',trim,side*.15,.095,-.365,.17,.23,.079);
      if(id==='frog')point('ball','#f7f5cf',side*.27,.35,-.306,.088,.093,.04);
      const eyeX=id==='frog' ? .27:.16;
      point('ball','#191628',side*eyeX,id==='frog' ? .354:.155,id==='frog'?-.345:-headSize[2]-.14,.043,.058,.033);
    }
    if (id==='frog') {
      point('ball',trim,0,-.038,-.359,.34,.091,.09);
      point('ball','#2a694b',0,-.015,-.442,.22,.021,.015);
    } else if (id==='penguin') {
      const beak=point('cone','#ffc947',0,-.03,-.448,.115,.24,.075);
      beak.rotation.x=-Math.PI/2;
    } else if(id==='pig'){
      point('ball',trim,0,-.024,-.445,.205,.119,.112);
      for(const side of [-1,1])point('ball','#a54b76',side*.078,-.025,-.547,.031,.045,.017);
    } else {
      const muzzle=id==='dog' ? .19:id==='bear' ? .17:id==='fox' ? .15:.12;
      for(const side of [-1,1])point('ball',id==='panda'?fur:trim,side*.125,-.033,-.39,.155,.105,muzzle);
      point('ball','#292031',0,.009,-.43-muzzle*.62,.079,.051,.05);
      if(id==='rabbit')for(const side of [-1,1])point('cube','#fff8ed',side*.038,-.129,-.506,.06,.095,.04);
      if(id==='cat')for(const side of [-1,1])for(let n=0;n<2;n++){
        point('cube','#74443d',side*.33,-.034+n*.05,-.445,.19,.012,.018).rotation.z=side*(.15-n*.22);
      }
    }
    if(['fox','dog','penguin'].includes(id)){
      point('ball',coat,0,.34,-.16,.33,.12,.27);
      point('cube',coat,0,.31,-.39,.39,.038,.28);
    }
    if(id==='frog'){
      point('ball','#5bb4e2',-.27,.35,-.349,.099,.098,.025);
      point('ball','#5bb4e2',.27,.35,-.349,.099,.098,.025);
      point('ball','#16253a',-.27,.35,-.375,.047,.06,.017);
      point('ball','#16253a',.27,.35,-.375,.047,.06,.017);
      point('cube',coat,0,.366,-.33,.38,.022,.022);
    }
    const tail=new T.Group();
    tail.position.set(0,.80,.18);
    root.add(tail);
    const long=['fox','cat','lion'].includes(id);
    mesh(tail,'ball',fur,0,.18,long ? .32:.23,id==='fox' ? .16:.095,.14,long ? .39:.22).rotation.x=-.50;
    if(long)mesh(tail,'ball',id==='lion'?'#9e552d':trim,0,.31,.57,.105,.12,.17).rotation.x=-.50;
    const legs=[],arms=[];
    for(const side of [-1,1]){
      const leg=new T.Group();
      leg.position.set(.19*side,.54,0);
      root.add(leg);
      mesh(leg,'cube','#241b36',0,-.22,0,.18,.39,.19);
      mesh(leg,'cube','#f3e6f4',0,-.46,-.085,.24,.15,.37);
      mesh(leg,'cube',coat,0,-.52,-.085,.23,.04,.35);
      legs.push(leg);
      const arm=new T.Group();
      arm.position.set((bodySize[0]-.03)*side,1.08,0);
      root.add(arm);
      mesh(arm,id==='penguin'?'ball':'cube',coat,0,-.18,0,.18,.34,.18);
      mesh(arm,'ball',fur,0,-.35,0,.087,.10,.093);
      arm.rotation.z=side*.15;
      arms.push(arm);
    }
    return {
      hide(){root.visible=false;shadow.visible=false;if(ring)ring.visible=false},
      update(run, time, preview, z=0, scale=1){
        const phase=run.distance*1.18;
        const fly=run.y>0;
        const hit=run.hit?Math.max(0,1-(run.time-run.hit.time)/.42):0;
        const landing=Math.max(0,1-(run.time-run.landedAt)/.18);
        root.position.set(run.x,run.y+(preview ? .03*Math.sin(time*2):fly?0:Math.abs(Math.sin(phase))*.045),z);
        root.scale.setScalar(scale);
        shadow.scale.set(.58*scale,.012,.34*scale);
        root.rotation.set(0,preview?Math.PI+.38:-run.vx*.025,-run.vx*.023+hit*Math.sin(hit*11)*.32);
        body.scale.y=bodySize[1]*(1-landing*.13);
        head.rotation.x=preview ? .04*Math.sin(time*2):fly?-.14:hit*.29;
        tail.rotation.y=Math.sin(preview?time*2:phase*.55)*.26;
        legs.forEach((leg,i)=>{leg.rotation.x=preview?0:fly?(i===0?-.65:.43):Math.sin(phase+i*Math.PI)*.77});
        arms.forEach((arm,i)=>{arm.rotation.x=preview?0:fly?-.45:Math.sin(phase+(i+1)*Math.PI)*.53});
        root.visible=preview||run.time>=run.protectedUntil||hit>0||Math.floor(run.time*11)%2===0;
        shadow.visible=true;
        shadow.position.set(run.x,.018,z);
        if(ring){ring.visible=!preview;ring.position.set(run.x,.035,z);ring.scale.set(.63*scale,.49*scale,1)}
      }
    };
  }
  function createDistant(parent, requested) {
    const profile=profiles[requested]??profiles.fox;
    const root=new T.Group();
    parent.add(root);
    const {coat,fur,trim,body,head}=profile;
    mesh(root,'lowBall',coat,0,.86,0,...body);
    mesh(root,'lowBall',fur,0,1.49,-.13,...head);
    if(requested==='lion')mesh(root,'lowBall','#ad622e',0,1.47,.04,.51,.46,.17);
    if(requested!=='penguin'){
      const pointed=['fox','cat','pig'].includes(requested);
      for(const side of [-1,1]){
        const rabbit=requested==='rabbit';
        const frog=requested==='frog';
        mesh(root,pointed?'cone':'lowBall',requested==='panda'?trim:fur,side*.28,
          rabbit?1.96:frog?1.73:1.79,-.10,.12,rabbit ? .31 : pointed ? .30:.13,.10);
      }
    }
    const legs=[-1,1].map(side=>mesh(root,'cube',coat,side*.17,.32,0,.17,.44,.17));
    const feet=[-1,1].map(side=>mesh(root,'cube','#f3e6f4',side*.17,.09,-.08,.22,.13,.33));
    return {
      hide(){root.visible=false},
      update(run,_time,_preview,z,scale){
        root.visible=true;
        root.position.set(run.x,run.y,z);
        root.scale.setScalar(scale);
        for(let i=0;i<2;i++){
          const stride=run.y>0?0:Math.sin(run.distance*1.18+i*Math.PI)*.17;
          feet[i].position.z=-.08+stride;
          legs[i].rotation.x=stride*2;
        }
      }
    };
  }

  return {
    create, createDistant,
    flush(){
      if(!batchedScene)return;
      batchedScene.updateMatrixWorld(true);
      for(const batch of batches.values())batch.count=0;
      for(const {item,batch} of nodes){
        let node=item;
        while(node?.visible)node=node.parent;
        if(!node)batch.setMatrixAt(batch.count++,item.matrixWorld);
      }
      for(const batch of batches.values())if(batch.count)batch.instanceMatrix.needsUpdate=true;
    },
    dispose(){
      for(const value of Object.values(shapes))value.dispose();
      for(const value of materials.values())value.dispose();
    }
  };
}
