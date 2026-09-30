import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import ts from 'typescript';
// Exercise the source curves without requiring native TypeScript support in Node.
const source=await readFile(new URL('../src/sakura-gait.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const { footCurve, STANCE, soleHull, soleRoll }=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const out = process.env.QA_OUT || 'artifacts/gait-motion';
await mkdir(out, { recursive: true });
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, pass: true }); }
  catch (error) { checks.push({ name, pass: false, error: error.message }); }
}
check('Swing joins stance with continuous position and velocity', () => {
  const h = 1e-6;
  for (const scale of [.25, .6, 1]) {
    const at = footCurve(STANCE, scale), before = footCurve(STANCE-h, scale), after = footCurve(STANCE+h, scale);
    assert(Math.abs((at.forward-before.forward)/h-(after.forward-at.forward)/h)<.001);
    const start = footCurve(0, scale), end = footCurve(1-h, scale), next = footCurve(h, scale);
    assert(Math.abs((start.forward-end.forward)/h-(next.forward-start.forward)/h)<.001);
    assert(after.lift/h<.0001 && end.lift/h<.0001);
  }
});
check('Cached shoe hull matches full vertex support envelope', () => {
  const points = Array.from({length:100},(_,i)=>({z:Math.sin(i*1.3)*.13,y:Math.cos(i*.7)*.03}));
  const hull = soleHull(points);
  for(const pitch of [-.22,0,.16]) assert(Math.abs(soleRoll(points,pitch)-soleRoll(hull,pitch))<1e-9);
  assert(hull.length<points.length);
});

const browser = await chromium.launch({channel:'chromium'});
const page = await browser.newPage({viewport:{width:900,height:1000}}), errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://127.0.0.1:5190/?qa=1');
await page.waitForFunction(()=>!!window.__SAKURA__,null,{timeout:120000});
const results = await page.evaluate(async()=>{
  const THREE=await import('/node_modules/.vite/deps/three.js');
  const {createCharacter}=await import('/src/character.ts');
  window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);
  const actors=await Promise.all(['companion','player'].map(createCharacter));
  const output=[];
  for(let role=0;role<actors.length;role++) {
    const actor=actors[role], shoes=[];
    actor.root.traverse(o=>{
      if(o.isSkinnedMesh&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>/Shoes/.test(m.name))) shoes.push(o);
    });
    for(const scenario of ['steady','slow','start-stop','turn','reverse','restart']) {
      actor.root.position.set(0,0,0); actor.root.rotation.y=0; actor.resetMotion();
      const samples=[]; let distance=0;
      for(let frame=0;frame<360;frame++) {
        let speed=scenario==='slow'?.35:1.12;
        if(scenario==='start-stop') speed=frame<45?1.12*frame/45:frame<150?1.12:frame<175?1.12*(175-frame)/25:0;
        if(scenario==='restart')speed=(frame>=103&&frame<119)||frame>=220?0:1.12;
        if(scenario==='turn'&&frame>=80&&frame<170)actor.root.rotation.y+=(Math.PI/2)/90;
        if(scenario==='reverse'&&frame>=103)actor.root.rotation.y=THREE.MathUtils.damp(actor.root.rotation.y,Math.PI,8,1/60);
        const motionYaw=scenario==='reverse'?(frame>=103?Math.PI:0):actor.root.rotation.y;
        actor.root.position.x+=Math.sin(motionYaw)*speed/60;
        actor.root.position.z+=Math.cos(motionYaw)*speed/60; distance+=speed/60;
        actor.update(1/60,frame/60,speed);
        const metadata=actor.root.userData.character, soles=[Infinity,Infinity];
        if(frame%6===0)for(const shoe of shoes) {
          shoe.skeleton.update(); const p=new THREE.Vector3(), local=new THREE.Vector3();
          for(let j=0;j<shoe.geometry.attributes.position.count;j++) {
            shoe.getVertexPosition(j,p);p.applyMatrix4(shoe.matrixWorld);local.copy(p);actor.root.worldToLocal(local);
            soles[local.x>0?0:1]=Math.min(soles[local.x>0?0:1],p.y);
          }
        }
        samples.push({frame,speed,root:actor.root.position.toArray(),feet:structuredClone(metadata.feet),gait:structuredClone(metadata.gait),soles:frame%6===0?soles:null});
      }
      let maxContactDrift=0,maxFrameTravel=0;
      for(let i=1;i<samples.length;i++)for(let foot=0;foot<2;foot++) {
        const a=samples[i-1],b=samples[i],fa=a.feet[foot],fb=b.feet[foot];
        const displacement=Math.hypot(fb.x-fa.x,fb.z-fa.z);
        maxFrameTravel=Math.max(maxFrameTravel,displacement);
        // Midstance excludes deliberate heel/toe rolling and turning adjustment steps.
        if(i>60 && b.gait.feet[foot].contact&&a.gait.feet[foot].contact&&b.gait.feet[foot].cycle>.12&&b.gait.feet[foot].cycle<.43&&a.gait.feet[foot].cycle<.43)
          maxContactDrift=Math.max(maxContactDrift,displacement);
      }
      const support=samples.filter(s=>s.soles&&(s.gait.feet[0].contact||s.gait.feet[1].contact)).map(s=>Math.min(...s.soles));
      output.push({role:role===0?'companion':'player',scenario,distance,maxContactDrift,maxFrameTravel,supportRange:[Math.min(...support),Math.max(...support)],samples});
    }
  }
  return output;
});
await browser.close();
for(const result of results) {
  const label=`${result.role}/${result.scenario}`;
  check(`${label}: grounded soles`,()=>assert(result.supportRange[0]>-.008&&result.supportRange[1]<.016,JSON.stringify(result.supportRange)));
  check(`${label}: planted-foot drift below 3 mm/frame`,()=>assert(result.maxContactDrift<.003,result.maxContactDrift));
  check(`${label}: no ankle teleport above 9 cm/frame`,()=>assert(result.maxFrameTravel<.09,result.maxFrameTravel));
  if(result.scenario==='start-stop')check(`${label}: settles to standing`,()=>{
    assert(!result.samples.at(-1).gait.settling);
    assert(result.samples.at(-1).gait.feet.every(f=>f.contact&&Math.abs(f.pitch)<.0001));
  });
}
check('Browser console has no errors',()=>assert.deepEqual(errors,[]));
await writeFile(`${out}/gait.json`,JSON.stringify({checks,errors,results},null,2));
console.log(JSON.stringify({passed:checks.filter(c=>c.pass).length,total:checks.length,failed:checks.filter(c=>!c.pass),metrics:results.map(({samples,...r})=>r)},null,2));
if(checks.some(c=>!c.pass))process.exitCode=1;
