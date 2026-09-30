import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.QA_OUT || 'artifacts/proportion-review';await mkdir(out,{recursive:true});
const role=process.env.QA_ROLE || 'companion';assert(['companion','player'].includes(role));
const browser=await chromium.launch({channel:'chromium'});
const page=await browser.newPage({viewport:{width:900,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://127.0.0.1:5190/?qa=1');
await page.waitForFunction(()=>!!window.__SAKURA__,null,{timeout:120000});
await page.evaluate(async(role)=>{
  const THREE=await import('/node_modules/.vite/deps/three.js');
  const {createCharacter}=await import('/src/character.ts');
  window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#d5d9dc');
  scene.add(new THREE.HemisphereLight('#e2edff','#9e8c79',2));
  const light=new THREE.DirectionalLight('#fff0df',2.5);light.position.set(-3,5,4);scene.add(light);
  const fill=new THREE.DirectionalLight('#c7d6ff',.5);fill.position.set(3,3,-4);scene.add(fill);
  const actor=await createCharacter(role);scene.add(actor.root);
  actor.update(0,0,0);actor.root.updateMatrixWorld(true);
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(900,1000);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
  renderer.domElement.id='proportion-canvas';renderer.domElement.style.cssText='position:fixed;inset:0;z-index:999';document.body.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(34,900/1000,.05,30);let time=0;
  window.reviewActor={view:async(name)=>{
    const speed=name.includes('walk')?1.18:0, wave=name==='wave';
    time=0;for(let i=0;i<90;i++){actor.root.position.z+=speed/60;actor.update(1/60,time,speed);time+=1/60;}
    if(wave)for(let i=0;i<60;i++){actor.update(1/60,time,0,.35,true);time+=1/60;}
    camera.position.set(name.includes('side')?3.3:0,1.02,name==='back'?-3.3:name.includes('side')?0:3.3);camera.position.z+=actor.root.position.z;camera.lookAt(0,.86,actor.root.position.z);
    renderer.render(scene,camera);
    const joints=[];actor.root.traverse(b=>{if(b.isBone&&/J_Bip_[LR]_(UpperArm|LowerArm|Hand|UpperLeg|LowerLeg|Foot)$/.test(b.name))joints.push({name:b.name,position:b.getWorldPosition(new THREE.Vector3()).toArray()});});
    return {...actor.root.userData.character,joints};
  },gait:()=>{
    const samples=[];
    for(let i=0;i<120;i++){
      actor.root.position.z+=1.18/60;actor.update(1/60,time,1.18);time+=1/60;
      if(i<60||i%5)continue;
      const soles={left:Infinity,right:Infinity};
      actor.root.traverse(o=>{if(!o.isSkinnedMesh)return;const mats=Array.isArray(o.material)?o.material:[o.material];if(!mats.some(m=>/Shoes/.test(m.name)))return;o.skeleton.update();const p=new THREE.Vector3();for(let j=0;j<o.geometry.attributes.position.count;j++){o.getVertexPosition(j,p);p.applyMatrix4(o.matrixWorld);const side=p.x>0?'left':'right';soles[side]=Math.min(soles[side],p.y);}});
      samples.push({time,soles,feet:structuredClone(actor.root.userData.character.feet)});
    }
    return samples;
  }};
},role);
const records=[];
for(const view of ['front','side','back','front-walk','side-walk','wave']){
  const actor=await page.evaluate(v=>window.reviewActor.view(v),view);
  await page.screenshot({path:`${out}/${view}.png`});records.push({view,actor});
}
const gait=await page.evaluate(()=>window.reviewActor.gait());
await writeFile(`${out}/review.json`,JSON.stringify({records,gait,errors},null,2));await browser.close();
const idle=records[0].actor;
assert.equal(idle.format,'VRM1-skinned');
for(const side of ['L','R']){
  const hand=idle.joints.find(j=>j.name===`J_Bip_${side}_Hand`),shoulder=idle.joints.find(j=>j.name===`J_Bip_${side}_UpperArm`);
  assert(hand.position[1]<shoulder.position[1]-.25,'VRM1 idle arms must hang below shoulders');
}
assert(gait.every(s=>Math.min(s.soles.left,s.soles.right)>-.025&&Math.min(s.soles.left,s.soles.right)<.035),'Supporting soles must stay within ground tolerance');
console.log(JSON.stringify({views:records.map(r=>r.view),gaitSamples:gait.length,supportSoleRange:[Math.min(...gait.map(s=>Math.min(s.soles.left,s.soles.right))),Math.max(...gait.map(s=>Math.min(s.soles.left,s.soles.right)))],errors}));if(errors.length)process.exitCode=1;
