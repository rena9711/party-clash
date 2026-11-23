import * as T from './vendor/three.module.min.js';
import {createAnimalFactory} from './animal-models.mjs';

export function characterPreviews(ids) {
  const renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  renderer.setSize(224,200);
  renderer.setClearColor(0x1c1736,0);
  const scene=new T.Scene();
  scene.add(new T.HemisphereLight('#e0e5ff','#a1489d',2.4));
  const key=new T.DirectionalLight('#ffdbe7',2);
  key.position.set(3,4,4);
  scene.add(key);
  const camera=new T.PerspectiveCamera(35,224/200,.1,20);
  camera.position.set(2.35,1.9,3.8);
  camera.lookAt(0,1.13,0);
  const factory=createAnimalFactory();
  const images=new Map();
  try{
    for(const id of ids){
      const model=factory.create(scene,id);
      model.update({x:0,y:0,vx:0,distance:0,time:0,landedAt:-1,protectedUntil:0},0,true);
      renderer.render(scene,camera);
      images.set(id,renderer.domElement.toDataURL('image/png'));
      model.hide();
    }
  }finally{
    factory.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return images;
}
