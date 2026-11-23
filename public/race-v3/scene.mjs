import * as T from './vendor/three.module.min.js';

export function createScene(canvas) {
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

  // Animal rigs expose the same update contract for future characters.
  function createFox() {
    const root = new T.Group();
    scene.add(root);
    const shadow = mesh(scene,sphere,paint.shadow,0,.018,0,.58,.012,.34);
    const body = mesh(root,sphere,paint.hoodie,0,.89,0,.39,.51,.28);
    const head = new T.Group();
    head.position.set(0,1.38,-.13);
    root.add(head);
    mesh(head,sphere,paint.hoodLight,0,0,.15,.43,.39,.33);
    mesh(head,sphere,paint.orange,0,.12,-.16,.42,.34,.31);
    const snout = mesh(head,cone,paint.cream,0,-.03,-.39,.25,.43,.24);
    snout.rotation.x = -Math.PI/2;
    mesh(head,sphere,paint.dark,0,-.015,-.60,.085,.062,.06);
    for (const side of [-1,1]) {
      const ear = mesh(head,cone,paint.rust,side*.29,.47,-.16,.19,.45,.14);
      ear.rotation.z = -side*.22;
      const inner = mesh(head,cone,paint.cream,side*.29,.48,-.25,.096,.30,.07);
      inner.rotation.z = ear.rotation.z;
      mesh(head,sphere,paint.cream,side*.255,.018,-.36,.15,.11,.097);
      mesh(head,sphere,paint.dark,side*.16,.12,-.435,.045,.065,.028);
      block(root,paint.cream,side*.083,1.04,-.281,.024,.21,.022).rotation.z=side*.14;
    }
    mesh(head,sphere,paint.hoodie,0,.34,-.16,.33,.13,.28);
    block(head,paint.violet,0,.31,-.39,.39,.038,.28);
    block(root,paint.hoodLight,0,.83,-.268,.27,.085,.045);
    const tail = new T.Group();
    tail.position.set(0,.81,.20);
    root.add(tail);
    const tailBase = mesh(tail,sphere,paint.orange,0,.18,.33,.15,.16,.42);
    tailBase.rotation.x=-.50;
    const tailTip = mesh(tail,sphere,paint.cream,0,.35,.62,.13,.13,.18);
    tailTip.rotation.x=-.50;
    const legs=[], arms=[];
    for (const side of [-1,1]) {
      const leg = new T.Group();
      leg.position.set(.19*side,.57,0);
      root.add(leg);
      block(leg,paint.dark,0,-.22,0,.18,.42,.19);
      block(leg,paint.shoes,0,-.48,-.08,.24,.16,.36);
      block(leg,paint.violet,0,-.54,-.08,.23,.04,.35);
      legs.push(leg);
      const arm = new T.Group();
      arm.position.set(.36*side,1.14,0);
      root.add(arm);
      block(arm,paint.hoodie,0,-.19,0,.18,.38,.18);
      mesh(arm,sphere,paint.orange,0,-.38,0,.087,.10,.093);
      arm.rotation.z=side*.13;
      arms.push(arm);
    }
    return {
      update(run, time, preview) {
        const phase = run.distance * 1.18;
        const airborne = run.y > 0;
        const impact = run.hit ? Math.max(0,1-(run.time-run.hit.time)/.42) : 0;
        const landing = Math.max(0,1-(run.time-run.landedAt)/.18);
        root.position.set(run.x,run.y + (preview ? .035*Math.sin(time*2):airborne?0:Math.abs(Math.sin(phase))*.045),0);
        root.rotation.set(0,preview ? Math.PI+.48+Math.sin(time)*.09 : -run.vx*.025, -run.vx*.023 + impact*Math.sin(impact*11)*.32);
        body.scale.y=.51*(1-landing*.13);
        head.rotation.x=preview ? .05*Math.sin(time*2) : airborne ? -.14 : impact*.29;
        tail.rotation.y=Math.sin(preview?time*2:phase*.55)*.26;
        legs.forEach((leg,i)=>{leg.rotation.x=preview ? 0 : airborne ? (i===0? -.65:.43) : Math.sin(phase+i*Math.PI)*.77;});
        arms.forEach((arm,i)=>{arm.rotation.x=preview ? .04*Math.sin(time*2+i):airborne?-.45:Math.sin(phase+(i+1)*Math.PI)*.53;});
        if (run.time < run.protectedUntil && !preview) {
          root.visible=impact>0 || Math.floor(run.time*11)%2===0;
        } else root.visible=true;
        shadow.position.x=run.x;
        shadow.scale.x=.58-run.y*.13;
      }
    };
  }
  const fox = createFox();

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
  function batch(coat,count) {
    const result = new T.InstancedMesh(box,coat,count);
    result.frustumCulled=false;
    scene.add(result);
    return result;
  }
  const buildings= batch(paint.tower,tileCount*4);
  const windows= batch(paint.violet,tileCount*8);
  const blue= batch(paint.cyan,tileCount*5);
  const pink= batch(paint.pink,tileCount*4);
  const lines= batch(paint.dim,tileCount*3);
  function city(distance) {
    const base=Math.floor(distance/tileLength);
    for(let i=0;i<tileCount;i++){
      const tile=base+i-1;
      const z=distance-tile*tileLength;
      for(let s=0;s<2;s++){
        const side=s===0?-1:1;
        const h=4+((tile*17+s*7)%11+11)%11*.66;
        const index=i*4+s*2;
        instance(buildings,index,side*6.7,h/2,z,3.1,h,5.15);
        instance(buildings,index+1,side*10.2,h*.61,z-5,3.6,h*1.22,5.6);
        for(let j=0;j<4;j++) instance(windows,i*8+s*4+j,side*5.13,1.7+j*(h-2)/4,z,.04,.09,3.8);
        instance(blue,i*5+s,side*4.16,.02,z,.09,.035,11.8);
        instance(blue,i*5+s+2,side*5.1,h*.91,z,.06,.20,1.8);
        instance(pink,i*4+s,side*4.47,.03,z-2,.17,.05,3.7);
        instance(pink,i*4+s+2,side*9,h*1.18,z-4,.16,.16,2.6);
      }
      instance(blue,i*5+4,0,.009,z,.08,.025,2.8);
      for(let j=0;j<3;j++) instance(lines,i*3+j,0,.005,z-j*3.4,7.8,.021,.045);
    }
    for(const group of [buildings,windows,blue,pink,lines])group.instanceMatrix.needsUpdate=true;
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

  function resize(width,height) {
    renderer.setPixelRatio(Math.min(1.5,window.devicePixelRatio||1));
    renderer.setSize(width,height,false);
    camera.aspect=width/height;
    camera.fov=camera.aspect>1.45 ? 47 : 53;
    camera.updateProjectionMatrix();
  }
  function render(run,time,preview) {
    city(run.distance);
    objects(run,time);
    fox.update(run,time,preview);
    const wide=camera.aspect>1.45;
    if(preview){
      camera.position.set(wide?3.35:2.65,wide?2.3:2.25,5.65);
      camera.lookAt(wide?1.3:0,wide?1.02:.35,0);
    } else {
      const shake=run.hit?Math.max(0,.24-(run.time-run.hit.time))*.23*Math.sin(time*78):0;
      camera.position.set(run.x*.53+shake,wide?3.5:3.55,wide?6.85:7.75);
      camera.lookAt(run.x*.31,1.05,-8.3);
    }
    renderer.render(scene,camera);
  }
  function dispose() {
    const geometries=new Set(), materials=new Set();
    scene.traverse(item=>{if(item.isMesh){geometries.add(item.geometry);materials.add(item.material);if(item.isInstancedMesh)item.dispose();}});
    geometries.forEach(item=>item.dispose());
    materials.forEach(item=>item.dispose());
    renderer.dispose();
  }
  return {resize, render, dispose};
}
