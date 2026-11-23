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
    ball:new T.SphereGeometry(1,12,8),
    oval:new T.SphereGeometry(1,8,4),
    lowBall:new T.SphereGeometry(1,6,3),
    ear:new T.SphereGeometry(1,8,5),
    smile:new T.TubeGeometry(new T.QuadraticBezierCurve3(
      new T.Vector3(-1,.2,.25),new T.Vector3(0,-.95,-.25),new T.Vector3(1,.2,.25)
    ),8,.095,4,false),
    shadow:new T.CircleGeometry(1,16), ring:new T.RingGeometry(.72,1,28)
  };
  const ear=shapes.ear.attributes.position;
  for(let i=0;i<ear.count;i++){
    const taper=.74-.28*ear.getY(i);
    ear.setX(i,ear.getX(i)*taper);
    ear.setZ(i,ear.getZ(i)*taper);
  }
  shapes.ear.computeVertexNormals();
  const skin=new T.MeshStandardMaterial({roughness:.66});
  const ground=new T.MeshBasicMaterial();
  const halo=new T.MeshBasicMaterial({transparent:true,opacity:.87,side:T.DoubleSide});
  const baseMaterial = shape => shape==='ring'?halo:shape==='shadow'?ground:skin;
  const colors=new Map();
  const materials=new Map();
  const batches=new Map();
  const nodes=[];
  const parents=new Set();
  function mesh(parent, shape, color, x,y,z,sx,sy,sz) {
    let item;
    if(batchedScene){
      if(!batches.has(shape)){
        const batch=new T.InstancedMesh(shapes[shape],baseMaterial(shape),512);
        batch.count=0;
        batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
        batch.frustumCulled=false;
        batchedScene.add(batch);
        batches.set(shape,{batch,instanceColors:[]});
      }
      if(!colors.has(color))colors.set(color,new T.Color(color));
      item=new T.Object3D();
      nodes.push({item,group:batches.get(shape),color:colors.get(color)});
    }else{
      const key=shape+'/'+color;
      if(!materials.has(key)){
        const material=baseMaterial(shape).clone();
        material.color.set(color);
        materials.set(key,material);
      }
      item=new T.Mesh(shapes[shape],materials.get(key));
    }
    item.position.set(x,y,z);
    item.scale.set(sx,sy,sz);
    parent.add(item);
    return item;
  }
  function create(parent, requested, {self=false}={}) {
    if(batchedScene)parents.add(parent);
    const id=Object.hasOwn(profiles,requested)?requested:'fox';
    const {coat,fur,trim,body:bodySize,head:headSize}=profiles[id];
    const root=new T.Group();
    parent.add(root);
    const shadow=mesh(parent,'shadow','#100b22',0,.018,0,.58,.34,1);
    shadow.rotation.x=-Math.PI/2;
    const ring=self?mesh(parent,'ring','#5afaff',0,.035,0,.63,.49,1):null;
    if(ring)ring.rotation.x=-Math.PI/2;
    const body=mesh(root,'ball',coat,0,.81,0,...bodySize);
    mesh(root,'oval',coat,0,1.22,.05,.31,.19,.26);
    mesh(root,'oval','#f8dfef',0,.79,-bodySize[2]*.88,.16,.125,.04);
    const head=new T.Group();
    head.position.set(0,1.51,-.10);
    root.add(head);
    const face=new T.Group();
    head.add(face);
    const [hx,hy,hz]=headSize;
    const headWidth=hx*1.14, headHeight=hy*1.2, headDepth=hz*1.17;
    const dot=(color,x,y,z,sx,sy,sz)=>mesh(head,'oval',color,x,y,z,sx,sy,sz);
    const facial=(color,x,y,z,sx,sy,sz)=>mesh(face,'oval',color,x,y,z,sx,sy,sz);
    const mouth=(color,y,z,width,height)=>mesh(face,'smile',color,0,y,z,width,height,.07);
    if(id==='lion')mesh(head,'ball','#b56c36',0,.03,.09,.61,.52,.30);
    mesh(head,'ball',fur,0,0,0,headWidth,headHeight,headDepth);
    if(id==='penguin')facial(trim,0,-.04,-.264,.37,.30,.137);
    if(id==='frog')facial(trim,0,-.13,-.248,.43,.16,.161);

    for(const side of [-1,1]){
      if(['fox','cat','pig'].includes(id)){
        const x=side*(id==='pig'?.34:.29);
        const outer=mesh(head,'ear',id==='fox'?'#db6740':fur,x,.33,.015,.24,id==='fox'?.31:.25,.16);
        outer.rotation.z=-side*.30;
        const inner=mesh(head,'ear',id==='cat'?'#f4a192':trim,x,.355,-.066,.14,.16,.085);
        inner.rotation.z=outer.rotation.z;
      }else if(id==='rabbit'){
        dot(fur,side*.25,.48,.01,.14,.36,.115).rotation.z=-side*.17;
        dot(trim,side*.255,.50,-.072,.085,.275,.05).rotation.z=-side*.17;
      }else if(id==='dog'){
        dot('#a06b53',side*.44,.04,.012,.15,.28,.15).rotation.z=side*.27;
      }else if(id==='frog'){
        dot(fur,side*.29,.246,-.073,.199,.212,.198);
      }else if(id!=='penguin'){
        dot(id==='panda'?trim:fur,side*.34,.295,.035,.16,.16,.13);
        if(id!=='panda')dot(trim,side*.345,.303,-.066,.095,.09,.045);
      }
      const eyeX=id==='frog'?.29:id==='rabbit'?.175:.185;
      const eyeY=id==='frog'?.29:.062;
      const eyeZ=id==='frog'?-.247:-headDepth*.91;
      if(id==='panda')facial(trim,side*.188,.057,eyeZ+.008,.154,.15,.073).rotation.z=-side*.32;
      facial('#fffaf4',side*eyeX,eyeY,eyeZ-.045,.097,.118,.060);
      facial('#282032',side*eyeX,eyeY+.003,eyeZ-.092,.065,.087,.027);
      facial('#fff9f1',side*eyeX-side*.017,eyeY+.035,eyeZ-.116,.022,.024,.011);
      if(id==='rabbit'||id==='pig'||id==='frog')
        facial(id==='frog'?'#9ed174':'#e997ab',side*.272,-.105,-headDepth*.89,.078,.043,.027);
    }

    if(id==='frog'){
      mouth('#316341',-.134,-.422,.229,.125);
    }else if(id==='penguin'){
      facial('#f6b859',0,-.11,-.412,.116,.057,.094);
    }else if(id==='pig'){
      facial('#eb7da8',0,-.098,-headDepth,.181,.121,.103);
      for(const side of [-1,1])facial('#a94f74',side*.069,-.094,-headDepth-.093,.029,.038,.015);
      mouth('#9f4769',-.248,-headDepth+.033,.132,.100);
    }else{
      const muzzleColor=id==='panda'?fur:id==='rabbit'?'#f4eaf6':trim;
      const muzzleDepth=id==='dog'?.14:.082;
      for(const side of [-1,1])facial(muzzleColor,side*.102,-.11,-headDepth*.9,.16,.109,muzzleDepth);
      facial(id==='rabbit'?'#be7298':'#4b3039',0,-.078,-headDepth*.90-muzzleDepth,.059,.041,.033);
      mouth('#804b61',-.157,-headDepth*.90-muzzleDepth-.012,.105,.077);
      if(id==='cat')for(const side of [-1,1])for(let i=0;i<2;i++)
        facial('#b3785d',side*.293,-.095-i*.047,-headDepth*.92,.092,.011,.015).rotation.z=side*(.15-i*.29);
    }
    if(['fox','dog','penguin'].includes(id)){
      dot(coat,0,headHeight*.82,.036,.34,.135,.269);
      dot(coat,0,headHeight*.73,-.225,.27,.034,.199);
    }
    const tail=new T.Group();
    tail.position.set(0,.67,.188);
    root.add(tail);
    if(id==='fox'){
      mesh(tail,'ball',fur,0,.18,.30,.145,.17,.30).rotation.x=-.56;
      mesh(tail,'oval',trim,0,.335,.51,.114,.123,.16).rotation.x=-.56;
    }else if(id==='cat'||id==='lion'){
      mesh(tail,'oval',fur,0,.17,.24,.065,.075,.28).rotation.x=-.71;
      mesh(tail,'oval',id==='lion'?'#a26339':fur,0,.38,.46,.087,.102,.12);
    }else if(id==='pig'){
      mesh(tail,'smile','#e984ad',0,.122,.272,.081,.115,.07).rotation.set(0,Math.PI,.62);
    }else if(id!=='frog'){
      mesh(tail,'oval',id==='dog'?'#a06b53':fur,0,.12,.193,.112,.112,.135);
    }
    const legs=[],arms=[];
    for(const side of [-1,1]){
      const leg=new T.Group();
      leg.position.set(.179*side,.47,0);
      root.add(leg);
      mesh(leg,'oval','#3c3049',0,-.155,0,.101,.205,.109);
      mesh(leg,'oval','#f4e7ec',0,-.337,-.073,.136,.094,.188);
      mesh(leg,'oval',coat,0,-.388,-.073,.139,.043,.184);
      legs.push(leg);
      const arm=new T.Group();
      arm.position.set((bodySize[0]-.048)*side,.99,0);
      root.add(arm);
      mesh(arm,'oval',coat,0,-.124,0,.109,.241,.111);
      mesh(arm,'oval',fur,0,-.305,-.014,.095,.108,.095);
      arm.rotation.z=side*.18;
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
        // Selection cameras show the face. On the track the chase camera stays behind the runners.
        face.visible=preview;
        shadow.scale.set(.58*scale,.34*scale,1);
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
    if(batchedScene)parents.add(parent);
    const id=Object.hasOwn(profiles,requested)?requested:'fox';
    const profile=profiles[id];
    const root=new T.Group();
    parent.add(root);
    const {coat,fur,trim,body,head}=profile;
    mesh(root,'lowBall',coat,0,.86,0,...body);
    mesh(root,'lowBall',fur,0,1.51,-.1,head[0]*1.14,head[1]*1.2,head[2]*1.17);
    if(id==='lion')mesh(root,'lowBall','#ad622e',0,1.47,.04,.51,.46,.17);
    if(id!=='penguin'){
      const pointed=['fox','cat','pig'].includes(id);
      for(const side of [-1,1]){
        const rabbit=id==='rabbit';
        const frog=id==='frog';
        const floppy=id==='dog';
        mesh(root,pointed?'ear':'lowBall',id==='panda'?trim:floppy?'#a06b53':fur,side*(floppy?.43:.29),
          rabbit?1.98:frog?1.76:floppy?1.55:1.83,0,.14,rabbit?.34:floppy?.26:pointed?.29:.16,.12);
      }
    }
    const legs=[-1,1].map(side=>mesh(root,'lowBall',coat,side*.17,.32,0,.17,.44,.17));
    const feet=[-1,1].map(side=>mesh(root,'lowBall','#f3e6f4',side*.17,.09,-.08,.22,.13,.33));
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
      for(const parent of parents)parent.updateWorldMatrix(true,true);
      for(const group of batches.values()){
        group.batch.count=0;
        group.colorDirty=false;
      }
      for(const {item,group,color} of nodes){
        let node=item;
        while(node?.visible)node=node.parent;
        if(node)continue;
        const {batch,instanceColors}=group;
        const index=batch.count++;
        batch.setMatrixAt(index,item.matrixWorld);
        if(instanceColors[index]!==color){
          batch.setColorAt(index,color);
          instanceColors[index]=color;
          group.colorDirty=true;
        }
      }
      for(const {batch,colorDirty} of batches.values())if(batch.count){
        batch.instanceMatrix.addUpdateRange(0,batch.count*16);
        batch.instanceMatrix.needsUpdate=true;
        if(colorDirty){
          batch.instanceColor.addUpdateRange(0,batch.count*3);
          batch.instanceColor.needsUpdate=true;
        }
      }
    },
    dispose(){
      for(const {batch} of batches.values())batch.dispose();
      for(const material of [skin,ground,halo])material.dispose();
      for(const value of Object.values(shapes))value.dispose();
      for(const value of materials.values())value.dispose();
    }
  };
}
