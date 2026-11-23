import * as T from './vendor/three.module.min.js';

// The contours are normalized horizontal cross-sections: height, width,
// depth, and front/back offset. One surface runs through the entire silhouette.
const contours = {
  head: [[-1,.02,.02,.08],[-.89,.49,.52,.07],[-.66,.81,.81,.01],[-.33,.98,.96,-.05],[.04,1,1,-.03],[.42,.89,.92,.02],[.73,.68,.73,.04],[.93,.39,.43,.06],[1,.02,.02,.06]],
  fox: [[-1,.02,.02,0],[-.82,.65,.72,0],[-.48,.85,.90,-.04],[-.04,.77,.83,0],[.39,.94,1,.02],[.77,.84,.84,.07],[1,.02,.02,.04]],
  slender: [[-1,.02,.02,0],[-.87,.61,.70,.03],[-.6,.91,.90,.01],[-.18,.82,.85,-.02],[.30,.92,.97,.02],[.72,.75,.78,.03],[1,.02,.02,.03]],
  pear: [[-1,.02,.02,0],[-.87,.68,.74,.02],[-.56,.94,.98,-.04],[-.16,1,1,-.05],[.26,.88,.87,0],[.65,.68,.72,.02],[1,.02,.02,.05]],
  broad: [[-1,.02,.02,0],[-.86,.68,.69,.03],[-.49,.94,.94,-.03],[-.06,1,1,0],[.36,1,.89,.03],[.72,.85,.75,.05],[1,.02,.02,.03]],
  limb: [[-1,.02,.02,-.18],[-.87,.62,.67,-.16],[-.52,.88,.95,-.09],[-.09,.79,.87,0],[.40,1,1,.03],[.76,.72,.78,.02],[1,.02,.02,0]],
  tail: [[-1,.02,.02,0],[-.76,.42,.59,-.12],[-.41,.80,.89,-.06],[0,1,1,.09],[.36,.88,.87,.18],[.70,.59,.63,.25],[1,.02,.02,.18]]
};

function contourGeometry(rings, segments) {
  const positions=[], indices=[];
  for(const [y,rx,rz,shift] of rings){
    for(let i=0;i<segments;i++){
      const a=i*2*Math.PI/segments;
      positions.push(rx*Math.cos(a),y,shift+rz*Math.sin(a));
    }
  }
  for(let j=1;j<rings.length;j++)for(let i=0;i<segments;i++){
    const a=(j-1)*segments+i,b=(j-1)*segments+(i+1)%segments,c=a+segments,d=b+segments;
    indices.push(a,c,b,b,c,d);
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function smileGeometry() {
  const line=new T.Shape();
  line.moveTo(-1,.35);
  line.quadraticCurveTo(0,.09,1,.35);
  line.bezierCurveTo(.86,-.60,.48,-1,0,-1);
  line.bezierCurveTo(-.48,-1,-.86,-.60,-1,.35);
  const g=new T.ShapeGeometry(line,10);
  g.rotateY(Math.PI);
  return g;
}

const styling = {
  fox:     {fur:'#ee8638', skin:'#fff1d9', coat:'#ee8638', dark:'#6c3825', shape:'fox',     body:[.29,.48,.25], head:[.49,.42,.35], h:1.65, hip:.655, tail:1},
  rabbit:  {fur:'#f9eef7', skin:'#fff7fa', coat:'#ee88b0', dark:'#ddd1e6', shape:'slender',body:[.29,.39,.23], head:[.47,.43,.34], h:1.65, hip:.64, tail:.31},
  panda:   {fur:'#f7f2fa', skin:'#fff9fc', coat:'#f8f3fa', dark:'#42364e', shape:'pear',   body:[.48,.46,.35], head:[.53,.42,.35], h:1.49, hip:.45, tail:.24},
  cat:     {fur:'#b6a5c9', skin:'#fbecf2', coat:'#b6a5c9', dark:'#776389', shape:'pear',   body:[.36,.40,.27], head:[.52,.41,.34], h:1.51, hip:.50, tail:.66},
  frog:    {fur:'#92d654', skin:'#ebefad', coat:'#f5cd4e', dark:'#61a94f', shape:'slender',body:[.31,.33,.26], head:[.51,.33,.31], h:1.38, hip:.42, tail:0},
  bear:    {fur:'#b97c50', skin:'#f6cc9d', coat:'#ffd14e', dark:'#9b603e', shape:'broad',  body:[.47,.51,.35], head:[.48,.44,.36], h:1.66, hip:.60, tail:.18},
  penguin: {fur:'#445aaa', skin:'#fff0ef', coat:'#445aaa', dark:'#394889', shape:'pear',   body:[.35,.49,.31], head:[.41,.41,.33], h:1.31, hip:.24, tail:.25},
  dog:     {fur:'#c7844c', skin:'#fff0e1', coat:'#c7844c', dark:'#a76139', shape:'broad',  body:[.34,.42,.27], head:[.49,.43,.34], h:1.57, hip:.54, tail:.57},
  lion:    {fur:'#f4bd58', skin:'#ffe9b0', coat:'#f4bd58', dark:'#a95334', shape:'broad',  body:[.42,.47,.31], head:[.48,.41,.34], h:1.68, hip:.59, tail:.67},
  pig:     {fur:'#f59cb3', skin:'#f8adbf', coat:'#4f8ac8', dark:'#e57da0', shape:'pear',   body:[.51,.47,.37], head:[.53,.43,.36], h:1.48, hip:.39, tail:0}
};

export function createAnimalFactory({batchedScene}={}) {
  const shapes={
    ...Object.fromEntries(Object.entries(contours).map(([id,rings])=>[id,contourGeometry(rings,16)])),
    ball:new T.SphereGeometry(1,16,10),
    openMouth:smileGeometry(),
    band:new T.TorusGeometry(1,.112,6,20),
    badge:new T.OctahedronGeometry(1),
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
    const id=Object.hasOwn(styling,requested)?requested:'fox';
    const p=styling[id];
    const {fur,skin,coat,dark,h,hip}=p;
    const bodySize=p.body;
    const root=new T.Group();
    parent.add(root);
    const shadow=mesh(parent,'shadow','#100b22',0,.018,0,.58,.34,1);
    shadow.rotation.x=-Math.PI/2;
    const ring=self?mesh(parent,'ring','#5afaff',0,.035,0,.63,.49,1):null;
    if(ring)ring.rotation.x=-Math.PI/2;
    const bodyY=hip+p.body[1]*.67;
    const body=mesh(root,p.shape,coat,0,bodyY,0,...bodySize);
    const form=(parent,color,x,y,z,sx,sy,sz,shape='ball')=>mesh(parent,shape,color,x,y,z,sx,sy,sz);
    const oval=(parent,color,x,y,z,sx,sy,sz)=>form(parent,color,x,y,z,sx,sy,sz,'oval');
    const strip=(parent,color,a,b,r,depth=r)=>{
      const start=new T.Vector3(...a),end=new T.Vector3(...b), middle=start.clone().lerp(end,.5);
      const piece=form(parent,color,...middle.toArray(),r,start.distanceTo(end)*.55,depth,'limb');
      piece.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),end.sub(start).normalize());
      return piece;
    };
    const lap=(color,x,y,z,width,depth)=>{
      const band=mesh(root,'band',color,x,y,z,width,depth,.24);
      band.rotation.x=Math.PI/2;
      return band;
    };
    const head=new T.Group();
    root.add(head);
    head.position.set(0,h,-.045);
    const [hx,hy,hz]=p.head;
    const face=new T.Group();
    head.add(face);
    const detail=(color,x,y,z,sx,sy,sz,shape='oval')=>form(face,color,x,y,z,sx,sy,sz,shape);
    const top=(color,x,y,z,sx,sy,sz,shape='ball')=>form(head,color,x,y,z,sx,sy,sz,shape);
    if(id==='lion'){
      top('#b65f37',0,-.02,.105,.62,.56,.31,'head');
      for(let i=0;i<10;i++){
        const angle=i*Math.PI/5;
        top(i%2?'#bd673d':'#c77b49',Math.cos(angle)*.49,Math.sin(angle)*.45,.08,.173,.237,.22,'limb')
          .rotation.z=angle-Math.PI/2;
      }
    }
    top(fur,0,0,0,hx,hy,hz,'head');
    if(id==='penguin')detail(skin,0,-.067,-.245,.355,.302,.137,'head');
    if(id==='frog')detail(skin,0,-.107,-.24,.447,.221,.15,'head');
    if(id==='dog')detail(skin,0,.15,-.288,.102,.252,.058,'limb');
    for(const side of [-1,1]){
      const x=side*hx*.68;
      if(id==='fox'||id==='cat'){
        const rotation=-side*.35;
        top(dark,x,hy*.78,.016,.27,id==='fox'?.345:.25,.155,'ear').rotation.z=rotation;
        top('#efa9b3',x,hy*.82,-.064,.182,.21,.088,'ear').rotation.z=rotation;
      }else if(id==='rabbit'){
        top(fur,side*.219,.552,.025,.143,.43,.113,'limb').rotation.z=-side*.22;
        top('#ef9db8',side*.225,.574,-.063,.082,.335,.045,'limb').rotation.z=-side*.22;
      }else if(id==='dog'||id==='pig'){
        const floppy=id==='dog';
        top(floppy?dark:fur,side*(floppy?.432:.394),floppy?.154:.315,.027,floppy?.166:.159,floppy?.333:.169,.125,'limb')
          .rotation.z=side*(floppy?.69:.78);
      }else if(id==='frog'){
        top(fur,side*.285,.227,-.073,.215,.218,.19,'head');
      }else if(id!=='penguin'){
        top(id==='panda'?dark:fur,x,hy*.76,.045,.171,.166,.132);
        if(id!=='panda')top(skin,x,hy*.78,-.063,.096,.096,.044,'oval');
      }
      const eyeX=side*(id==='frog'?.29:hx*.39);
      const eyeY=id==='frog'?.237:.062;
      const eyeZ=id==='frog'?-.254:-hz*.94;
      if(id==='panda')detail(dark,eyeX,.053,eyeZ+.023,.163,.143,.074,'head').rotation.z=-side*.39;
      if(id==='fox'||id==='dog'||id==='cat'||id==='lion'){
        detail(skin,side*.152,-.102,-hz*.69,.244,.14,.143,'head').rotation.z=side*.13;
      }
      detail('#fff7ed',eyeX,eyeY,eyeZ,.109,.12,.057,'ball');
      detail('#2b1b2b',eyeX,eyeY+.004,eyeZ-.048,.076,.088,.027,'ball');
      detail('#fffafa',eyeX-side*.025,eyeY+.038,eyeZ-.072,.023,.027,.012);
      if(['rabbit','pig','cat','panda'].includes(id))detail('#ed91a7',side*hx*.66,-.106,-hz*.86,.084,.049,.022);
      if(id==='cat')for(let i=0;i<2;i++){
        detail(dark,side*.386,.043-i*.095,-.207,.103,.024,.033,'limb').rotation.z=side*(1.31+i*.22);
      }
    }
    if(id==='pig'){
      detail('#ed7d9e',0,-.042,-hz-.017,.192,.119,.106,'head');
      for(const side of [-1,1])detail('#a94469',side*.071,-.046,-hz-.114,.028,.041,.016);
    }else if(id==='penguin'){
      detail('#f3ad3a',0,-.075,-.387,.123,.057,.089,'head');
    }else if(id!=='frog'){
      detail(id==='rabbit'?'#c56d91':'#41303a',0,-.034,-hz-.074,.068,.043,.041);
    }
    const mouthY=id==='frog'?-.092:id==='pig'?-.178:-.124;
    const mouthZ=id==='frog'?-.408:id==='pig'?-.408:-hz-.067;
    if(id!=='penguin'){
      const width=id==='frog'?.231:id==='pig'?.15:.109;
      const height=id==='frog'?.138:id==='pig'?.097:.099;
      detail('#743149',0,mouthY,mouthZ,width,height,1,'openMouth');
      detail('#f08ba1',0,mouthY-height*.67,mouthZ-.008,width*.50,height*.24,.012);
    }
    if(id==='frog'||id==='penguin'){
      top('#5a3c40',0,.299,.035,hx*.98,.087,hz*.96,'limb');
      for(const side of [-1,1]){
        const goggle=new T.Group();
        goggle.position.set(side*.182,id==='frog'?.407:.362,-.154);
        goggle.rotation.x=.86;
        head.add(goggle);
        form(goggle,'#edaf3c',0,0,0,.14,.101,.10,'band');
        oval(goggle,'#668bb8',0,0,.011,.116,.075,.028);
      }
      top('#edae3c',0,.373,-.179,.074,.029,.027,'oval');
    }else if(id==='rabbit'){
      for(const side of [-1,1])
        top('#e965a1',side*.10,.415,-.235,.136,.077,.045,'limb').rotation.z=side*1.17;
      top('#ec81b2',0,.413,-.262,.058,.056,.044,'oval');
    }else if(id==='bear'){
      top('#f4c33b',0,.351,.025,.369,.172,.29,'head');
      top('#ffda67',0,.315,-.237,.298,.035,.224,'oval');
      top('#fff4c2',0,.398,-.26,.053,.052,.018,'badge');
    }else if(id==='lion'){
      top('#e9a12f',0,.475,-.09,.24,.077,.175,'head');
      for(const side of [-1,0,1])
        top('#f6c44c',side*.139,side?.565:.62,-.10,.057,side?.111:.14,.058,'ear').rotation.z=-side*.21;
      top('#f4cf68',0,.587,-.167,.044,.047,.022,'badge');
    }

    const neckY=h-hy*.84;
    if(id==='fox'||id==='dog'||id==='penguin'){
      const scarf=id==='penguin'?'#6bb7e9':'#df474d';
      lap(scarf,0,neckY,0,bodySize[0]*.83,bodySize[2]*.96);
      const scarfTail=id==='penguin'?-1:1;
      strip(root,scarf,[scarfTail*.08,neckY,-.21],[scarfTail*.14,neckY-.32,-.255],.093,.036);
      strip(root,scarf,[-scarfTail*.10,neckY,.14],[-scarfTail*.28,neckY-.22,.32],.078,.035);
      if(id!=='penguin')form(root,'#ffc957',.10,neckY-.14,-.263,.058,.061,.023,'badge');
    }else if(id==='cat'){
      lap('#db4956',0,neckY,0,.29,.233);
      oval(root,'#f0b944',0,neckY-.086,-.279,.08,.083,.07);
      oval(root,'#a66831',0,neckY-.115,-.339,.035,.017,.015);
    }else if(id==='panda'){
      strip(root,'#79a94a',[.278,bodyY+.38,-.192],[-.33,bodyY-.24,-.393],.056,.033);
      strip(root,'#79a94a',[.265,bodyY+.36,.145],[-.35,bodyY-.25,.24],.052,.035);
      form(root,'#91bc57',-.341,bodyY-.17,-.208,.20,.225,.116,'pear').rotation.z=-.24;
      oval(root,'#d3c376',-.346,bodyY-.105,-.309,.155,.107,.04);
    }else if(id==='pig'){
      lap('#6da6dc',0,bodyY-.16,0,.406,.339);
      form(root,fur,0,bodyY+.24,0,.414,.309,.321,'broad');
      for(const side of [-1,1]){
        strip(root,'#4f8acc',[side*.22,bodyY+.52,-.105],[side*.315,bodyY-.04,-.32],.053,.037);
        strip(root,'#4f8acc',[side*.22,bodyY+.53,.11],[side*.30,bodyY-.05,.29],.051,.036);
        oval(root,'#ffc660',side*.282,bodyY+.06,-.324,.055,.053,.027);
      }
      oval(root,'#6ca3da',0,bodyY-.10,-.362,.157,.126,.033);
    }else if(id==='bear'||id==='frog'){
      form(root,'#ffe16c',0,neckY-.115,.159,bodySize[0]*.77,.176,.187,'pear');
      for(const side of [-1,1])
        strip(root,'#fff3c3',[side*.093,neckY-.046,-.212],[side*.112,neckY-.243,-.285],.022,.017);
      oval(root,'#e6a93b',0,bodyY-.171,-bodySize[2]*.91,.183,.096,.036);
    }else if(id==='lion'){
      const cape=form(root,'#df4554',0,bodyY-.068,.298,.393,.418,.082,'pear');
      cape.rotation.x=.32;
      lap('#e24c58',0,neckY-.036,0,.323,.244);
      form(root,'#ffd564',0,neckY-.139,-.293,.073,.075,.027,'badge');
    }else if(id==='rabbit'){
      lap('#f4a1c2',0,bodyY-.244,0,.335,.248);
      form(root,'#e977a8',0,bodyY-.22,0,.332,.137,.236,'pear');
      for(const side of [-1,1])
        oval(root,'#dc5c93',side*.071,neckY-.066,-.23,.079,.041,.022).rotation.z=side*.3;
    }

    if(id==='penguin')
      form(root,skin,0,bodyY-.046,-.259,.252,.365,.124,'pear');
    else if(id==='fox'||id==='dog')
      form(root,skin,0,bodyY-.073,-bodySize[2]*.87,bodySize[0]*.63,bodySize[1]*.73,.106,'pear');

    const tail=new T.Group();
    root.add(tail);
    tail.position.set(0,hip+.018,.20);
    if(p.tail){
      const fox=id==='fox';
      const curve=form(tail,fur,0,p.tail*.24,p.tail*.33,fox?.235:.108,p.tail*.47,fox?.267:.125,'tail');
      curve.rotation.x=.96;
      if(fox)form(tail,skin,0,.403,.565,.173,.232,.174,'tail').rotation.x=.96;
      if(id==='lion')form(tail,dark,0,.33,.45,.096,.112,.107,'limb');
      if(id==='dog')form(tail,skin,0,.282,.405,.087,.116,.10,'limb');
      if(id==='cat')form(tail,dark,0,.287,.45,.082,.092,.10,'limb');
    }else if(id==='pig'){
      mesh(tail,'smile','#e975a2',0,.163,.194,.071,.095,.067).rotation.set(0,Math.PI,.55);
    }
    const legs=[],arms=[];
    for(const side of [-1,1]){
      const leg=new T.Group();
      const legX=p.body[0]*.48, legY=hip+.004;
      leg.position.set(legX*side,legY,0);
      root.add(leg);
      const foot=id==='frog'?'#96d450':id==='penguin'?'#f1ac3e':id==='fox'?dark:id==='panda'?dark:id==='dog'||id==='cat'||id==='lion'?skin:fur;
      form(leg,id==='panda'?dark:fur,0,-legY*.33,0,p.body[0]*.36,legY*.58,.128,'limb');
      form(leg,foot,0,-legY+.112,-.076,id==='frog'?.185:id==='pig'?.163:.139,.109,id==='frog'?.232:.184,'pear');
      legs.push(leg);
      const arm=new T.Group();
      arm.position.set((bodySize[0]-.040)*side,bodyY+bodySize[1]*.45,0);
      root.add(arm);
      const sleeve=id==='bear'||id==='rabbit'||id==='frog'?coat:id==='panda'?dark:fur;
      form(arm,sleeve,0,-.147,0,id==='bear'||id==='lion'?.153:.116,id==='penguin'?.203:.25,.129,'limb');
      if(id==='bear'||id==='rabbit'||id==='frog')
        form(arm,fur,0,-.325,-.031,id==='bear'?.144:.097,.122,.104,'pear');
      arm.rotation.z=side*(id==='penguin'?.39:.18);
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
    const id=Object.hasOwn(styling,requested)?requested:'fox';
    const profile=styling[id];
    const root=new T.Group();
    parent.add(root);
    const {coat,fur,dark,body,head,h,hip}=profile;
    mesh(root,'lowBall',coat,0,hip+body[1]*.67,0,...body);
    mesh(root,'lowBall',fur,0,h,-.045,...head);
    if(id==='lion')mesh(root,'lowBall','#ad622e',0,1.47,.04,.51,.46,.17);
    if(id!=='penguin'){
      const pointed=['fox','cat','pig'].includes(id);
      for(const side of [-1,1]){
        const rabbit=id==='rabbit';
        const frog=id==='frog';
        const floppy=id==='dog';
        mesh(root,pointed?'ear':'lowBall',id==='panda'?dark:floppy?'#a06b53':fur,side*(floppy?.43:.29),
          rabbit?h+.55:frog?h+.22:floppy?h+.19:h+.33,0,.14,rabbit?.34:floppy?.26:pointed?.29:.16,.12);
      }
    }
    if(['fox','dog','penguin','cat','lion'].includes(id))
      mesh(root,'lowBall',id==='penguin'?'#6bb7e9':'#df474d',0,h-head[1]*.9,.09,body[0]*.85,.062,body[2]);
    if(id==='fox')mesh(root,'lowBall',fur,0,hip+.23,.42,.17,.29,.30).rotation.x=.70;
    if(id==='lion')mesh(root,'lowBall','#df4554',0,hip+.29,.29,.30,.32,.085);
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
