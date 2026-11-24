import * as T from './vendor/three.module.min.js';
import {createAnimalFactory} from './animal-models.mjs';
import {raceModelScale,useDistantModel} from './presentation.mjs';

export function createScene(canvas,{cityMode="optimized",diagnostics=null}={}) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  renderer.setClearColor('#130d29');
  renderer.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene();
  scene.fog = new T.FogExp2('#17102f', .024);
  scene.add(new T.HemisphereLight('#c7ceff', '#ae5188', 2.0));
  const key = new T.DirectionalLight('#ffb0e9', 2.2);
  key.position.set(5, 9, 4);
  scene.add(key);
  const rim = new T.DirectionalLight('#818dff', 1.65);
  rim.position.set(-5, 3, -6);
  scene.add(rim);
  const camera = new T.PerspectiveCamera(53, 1, .1, 110);
  const box = new T.BoxGeometry(1, 1, 1);
  const sphere = new T.SphereGeometry(1, 10, 7);
  const cone = new T.ConeGeometry(1, 1, 4);
  const oct = new T.OctahedronGeometry(1);
  const material = (color, glow = false) => glow ?
    new T.MeshBasicMaterial({color}) : new T.MeshStandardMaterial({color, roughness:.78, flatShading:true});
  const paint = {
    road:material('#1b1430'), violet:material('#ac6bff',true), cyan:material('#65cfff',true),
    pink:material('#fd5d9d',true), dim:material('#5c438d',true), shadow:material('#100b22',true),
    wall:material('#32204f'), tower:material('#252658'), dark:material('#201931'),
    orange:material('#ef7939'), rust:material('#c94d32'), cream:material('#ffe1af'),
    hoodie:material('#7644c8'), hoodLight:material('#a678ea'), shoes:material('#f2cdeb'),
    red:material('#ff5466',true), gold:material('#ffcf53',true), amber:material('#ec9735'),
    white:material('#fff2ce',true)
  };
  function mesh(parent, shape, coat, x, y, z, sx, sy, sz) {
    const object = new T.Mesh(shape, coat);
    object.position.set(x,y,z);
    object.scale.set(sx,sy,sz);
    parent.add(object);
    return object;
  }
  const block = (parent, coat, x,y,z,sx,sy,sz) => mesh(parent,box,coat,x,y,z,sx,sy,sz);

  const animalFactory = createAnimalFactory({batchedScene:scene});
  const models = new Map();
  const point = new T.Vector3();
  function animal(key, character, self, distant=false) {
    const id=key+':'+(character??'fox')+':'+distant;
    if (!models.has(id)) {
      const isolated = new T.Group();
      models.set(id,distant?animalFactory.createDistant(isolated,character):animalFactory.create(isolated,character,{self}));
    }
    return models.get(id);
  }

  block(scene,paint.road,0,-.11,-36,8.1,.18,92);
  block(scene,paint.wall,-12,-.18,-38,15,.16,96);
  block(scene,paint.wall,12,-.18,-38,15,.16,96);
  const tileCount = 9, tileLength = 12;
  const pose = new T.Object3D();
  function instance(batch, index, x,y,z,sx,sy,sz) {
    pose.position.set(x,y,z);
    pose.scale.set(sx,sy,sz);
    pose.updateMatrix();
    batch.setMatrixAt(index,pose.matrix);
  }
  const cityGroup=new T.Group();
  scene.add(cityGroup);
  function batch(coat,count) {
    const result = new T.InstancedMesh(box,coat,count);
    result.frustumCulled=false;
    cityGroup.add(result);
    return result;
  }
  const buildings=batch(paint.tower,tileCount*4);
  const legacy=cityMode==='legacy';
  const palette=[[0,8,paint.violet],[8,5,paint.cyan],[13,4,paint.pink],[17,3,paint.dim]];
  const lights=legacy?null:batch(new T.MeshBasicMaterial(),tileCount*20);
  const legacyMap=[];
  const lightBatches=legacy?palette.map(([start,count,material])=>{
    const group=batch(material,tileCount*count);
    for(let i=0;i<count;i++)legacyMap[start+i]={group,count,index:i};
    return group;
  }):[lights];
  if(lights)for(let i=0;i<tileCount;i++){
    for(const [start,length,material] of palette){
      for(let index=start;index<start+length;index++)lights.setColorAt(i*20+index,material.color);
    }
  }
  function light(tile,slot,...pose){
    if(legacy){
      const {group,count,index}=legacyMap[slot];
      instance(group,tile*count+index,...pose);
    }else instance(lights,tile*20+slot,...pose);
  }
  let cityBase;
  function city(distance) {
    const base=Math.floor(distance/tileLength);
    cityGroup.position.z=legacy?0:distance-base*tileLength;
    if(!legacy&&base===cityBase)return;
    cityBase=base;
    for(let i=0;i<tileCount;i++){
      const tile=base+i-1;
      const z=legacy?distance-tile*tileLength:(1-i)*tileLength;
      for(let s=0;s<2;s++){
        const side=s===0?-1:1;
        const h=4+((tile*17+s*7)%11+11)%11*.66;
        const index=i*4+s*2;
        instance(buildings,index,side*6.7,h/2,z,3.1,h,5.15);
        instance(buildings,index+1,side*10.2,h*.61,z-5,3.6,h*1.22,5.6);
        for(let j=0;j<4;j++)light(i,s*4+j,side*5.13,1.7+j*(h-2)/4,z,.04,.09,3.8);
        light(i,8+s,side*4.16,.02,z,.09,.035,11.8);
        light(i,10+s,side*5.1,h*.91,z,.06,.20,1.8);
        light(i,13+s,side*4.47,.03,z-2,.17,.05,3.7);
        light(i,15+s,side*9,h*1.18,z-4,.16,.16,2.6);
      }
      light(i,12,0,.009,z,.08,.025,2.8);
      for(let j=0;j<3;j++)light(i,17+j,0,.005,z-j*3.4,7.8,.021,.045);
    }
    buildings.instanceMatrix.needsUpdate=true;
    for(const group of lightBatches)group.instanceMatrix.needsUpdate=true;
  }

  const starShape = new T.Shape();
  for (let i=0;i<10;i++) {
    const angle=Math.PI/2+i*Math.PI/5, radius=i%2?.19:.38;
    const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;
    if(i) starShape.lineTo(x,y); else starShape.moveTo(x,y);
  }
  starShape.closePath();
  const starGeometry=new T.ExtrudeGeometry(starShape,{depth:.10,bevelEnabled:true,bevelSize:.035,bevelThickness:.035,bevelSegments:1});
  function buildObstacle(kind) {
    const group=new T.Group();
    scene.add(group);
    if(kind==='star'){
      mesh(group,starGeometry,paint.gold,0,0,0,1,1,1);
    } else if(kind==='bomb'){
      mesh(group,sphere,paint.dark,0,.46,0,.52,.46,.52);
      mesh(group,sphere,paint.rust,0,.46,0,.527,.09,.527);
      block(group,paint.amber,0,.90,0,.17,.22,.17).rotation.z=.43;
      mesh(group,oct,paint.red,.07,1.03,0,.21,.23,.21);
    } else {
      for(const sign of [-1,1]){
        block(group,paint.violet,sign*1.22,.35,0,.12,.70,.19);
        block(group,paint.wall,sign*1.22,.04,0,.32,.08,.42);
      }
      block(group,paint.amber,0,.65,0,2.55,.18,.16);
      for(let i=-2;i<=2;i++)block(group,paint.white,i*.46,.65,.09,.13,.15,.04).rotation.z=.25;
    }
    group.visible=false;
    return group;
  }
  const pools=Object.fromEntries([['bomb',5],['hurdle',5],['star',24]].map(([kind,length])=>
    [kind,Array.from({length},()=>buildObstacle(kind))]));
  const sparks = Array.from({length:12},()=>mesh(scene,oct,paint.gold,0,0,0,.12,.12,.12));
  function objects(run, time) {
    const count={bomb:0,hurdle:0,star:0};
    for(const group of Object.values(pools))for(const item of group)item.visible=false;
    for(const object of run.objects){
      const z=run.distance-object.at;
      if(z < -73 || z > 5 || (object.used && object.kind!=='hurdle'))continue;
      const hit = object.used ? (run.time-object.impactTime)/.42 : 0;
      if(hit>=1)continue;
      const item=pools[object.kind][count[object.kind]++];
      if(!item)continue;
      item.visible=true;
      item.position.set(object.x,(object.y||0)+(object.kind==='star'?Math.sin(time*4+object.at)*.08:0),z);
      item.rotation.set(hit ? -hit*1.18 : 0,object.kind==='star'?time*2.2:0,hit*.25);
    }
    const age=run.hit ? run.time-run.hit.time : 10;
    sparks.forEach((spark,i)=>{
      spark.visible=age>=0 && age<.42;
      if(spark.visible){
        const angle=i*Math.PI*2/sparks.length;
        spark.position.set(run.x+Math.cos(angle)*age*5,.55+Math.sin(angle)*age*3+age,Math.sin(angle)*age*3);
        spark.rotation.set(age*12+i,age*7,age*16);
      }
    });
  }

  const gl=diagnostics?renderer.getContext():null;
  const timer=gl?.getExtension('EXT_disjoint_timer_query_webgl2');
  let gpuQuery=null, gpuFrame=0;
  function draw() {
    if(!diagnostics?.active){
      renderer.render(scene,camera);
      return;
    }
    if(timer&&gpuQuery&&gl.getQueryParameter(gpuQuery,gl.QUERY_RESULT_AVAILABLE)){
      if(!gl.getParameter(timer.GPU_DISJOINT_EXT))
        diagnostics.gpu(gl.getQueryParameter(gpuQuery,gl.QUERY_RESULT)/1000000);
      gl.deleteQuery(gpuQuery);
      gpuQuery=null;
    }
    const sample=timer&&!gpuQuery&&++gpuFrame%10===0;
    if(sample){
      gpuQuery=gl.createQuery();
      if(gpuQuery)gl.beginQuery(timer.TIME_ELAPSED_EXT,gpuQuery);
    }
    const started=performance.now();
    renderer.render(scene,camera);
    const elapsed=performance.now()-started;
    if(sample&&gpuQuery)gl.endQuery(timer.TIME_ELAPSED_EXT);
    diagnostics.render(renderer.info.render,elapsed);
  }

  let width=1, height=1, pixelRatio=1, frameInterval=16.7;
  let priorFrame, slowFrames=0;
  function resize(w,h) {
    width=w;
    height=h;
    // Bound shading cost on high-density phone displays.
    pixelRatio=Math.min(window.devicePixelRatio||1,1.5,Math.sqrt(640000/(w*h)));
    renderer.setDrawingBufferSize(w,h,pixelRatio);
    camera.aspect=width/height;
    camera.fov=camera.aspect>1.45 ? 47 : 53;
    camera.updateProjectionMatrix();
  }
  function render(run,time,preview,others=[],rosterSize=1,projectNames=true) {
    if (!preview) {
      const now=performance.now();
      const interval=now-(priorFrame??now);
      priorFrame=now;
      if(interval>0&&interval<120) frameInterval+=(interval-frameInterval)*.08;
      const minimum=Math.min(.68,pixelRatio);
      if(frameInterval>27 && pixelRatio>minimum && ++slowFrames>=18){
        pixelRatio=Math.max(minimum,pixelRatio*.83);
        renderer.setDrawingBufferSize(width,height,pixelRatio);
        slowFrames=0;
      }
      if(frameInterval<=27) slowFrames=0;
    } else {
      priorFrame=undefined;
    }
    const scale=preview?1:raceModelScale(rosterSize);
    city(run.distance);
    objects(run,time);
    for (const model of models.values()) model.hide();
    animal('self',run.character,true).update(run,time,preview,0,scale);
    const visible=[];
    for (const runner of others) {
      const z=run.distance-runner.distance;
      if (z < -40 || z > 6) continue;
      const distant=useDistantModel(z);
      animal(runner.slot,runner.character,false,distant).update(runner,time,false,z,scale);
      visible.push({runner,z,self:false,distant});
    }
    const wide=camera.aspect>1.45;
    if(preview){
      camera.position.set(wide?3.35:2.65,wide?2.3:2.25,5.65);
      camera.lookAt(wide?1.3:0,wide?1.02:.35,0);
    } else {
      const shake=run.hit?Math.max(0,.24-(run.time-run.hit.time))*.23*Math.sin(time*78):0;
      if (run.id && !wide) {
        // Keep the full starting row in view on narrow phone screens.
        const halfWidth=rosterSize>=8?4.25:3.95;
        const depth=halfWidth/(Math.tan(camera.fov*Math.PI/360)*camera.aspect);
        camera.position.set(run.x*.10+shake,rosterSize>=8?4.9:4.35,Math.max(8,depth));
        camera.lookAt(run.x*.08,1.05,-5.5);
      } else {
        camera.position.set(run.x*.53+shake,wide?3.5:3.55,wide?(rosterSize>=8?8.1:6.85):7.75);
        camera.lookAt(run.x*.31,1.05,-8.3);
      }
    }
    animalFactory.flush();
    draw();
    if (!projectNames||preview||!run.id) return [];
    return [{runner:run,z:0,self:true},...visible].flatMap(({runner,z,self,distant})=>{
      if(distant)return [];
      point.set(runner.x,runner.y+2.40*scale,z).project(camera);
      if(point.z < -1||point.z > 1||Math.abs(point.x)>1||Math.abs(point.y)>1)return [];
      return [{id:runner.id,name:runner.name,z,x:(point.x+1)/2,y:(1-point.y)/2,self}];
    });
  }
  function resetDiagnostics() {
    if(gpuQuery)gl.deleteQuery(gpuQuery);
    gpuQuery=null;
    gpuFrame=0;
  }
  function dispose() {
    resetDiagnostics();
    const geometries=new Set(), materials=new Set();
    scene.traverse(item=>{if(item.isMesh){geometries.add(item.geometry);materials.add(item.material);if(item.isInstancedMesh)item.dispose();}});
    geometries.forEach(item=>item.dispose());
    materials.forEach(item=>item.dispose());
    renderer.dispose();
  }
  return {resize, render, dispose, resetDiagnostics};
}
