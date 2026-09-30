import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import ts from 'typescript';
const out=process.env.QA_OUT||'artifacts/resolution-qa',url=process.env.QA_URL||'http://127.0.0.1:5192/';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium'}),context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:2});
const page=await context.newPage(),errors=[],checks=[],samples=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const state=()=>page.evaluate(()=>window.__SAKURA__.state());
const check=(name,fn)=>{try{fn();checks.push({name,pass:true});}catch(error){checks.push({name,pass:false,error:error.message});}};
const controlSource=await readFile(new URL('../src/adaptive-resolution.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(controlSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {AdaptiveResolution}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
check('Invalid GPU timing cannot lower resolution from stale pressure',()=>{
  const controller=new AdaptiveResolution(),timer={supported:true,enabled:true,milliseconds:40,samples:0};
  for(let i=0;i<15;i++){timer.samples++;controller.observe(timer,.01,true);}
  timer.milliseconds=null;for(let i=0;i<40;i++)controller.observe(timer,.1,true);
  assert.equal(controller.scale,1);
});
async function change(id,value){await page.evaluate(({id,value})=>{const s=document.getElementById(id);s.value=value;s.dispatchEvent(new Event('change'));},{id,value});}
await page.goto(new URL('?qa=1',url).href);await page.waitForFunction(()=>!!window.__SAKURA__,null,{timeout:120000});
await page.evaluate(async()=>{await window.__THREE_GAME_TEST_HOOKS__.setState('day-active-play');window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);});
let display=null;
for(const mode of ['native','quality','performance','native']){
  await change('resolution',mode);await page.waitForTimeout(450);
  const s=await state(),r=s.graphics.resolution;display??=[r.displayWidth,r.displayHeight];
  check(`${mode}: display resolution and effects preserved`,()=>{
    assert.deepEqual([r.displayWidth,r.displayHeight],display);assert.equal(s.graphics.dlss,false);
    assert(s.graphics.ao&&s.graphics.volumetric);assert.equal(r.mode,mode);
    assert.equal(r.scale,mode==='quality'?.85:mode==='performance'?.67:1);
    assert.equal(r.sceneWidth,Math.round(r.displayWidth*r.scale));assert.equal(r.sceneHeight,Math.round(r.displayHeight*r.scale));
  });
  samples.push({mode,state:s});await page.screenshot({path:`${out}/day-${mode}.png`});
}
await change('quality','balanced');await change('resolution','performance');await page.waitForTimeout(400);
const balanced=await state();check('Balanced supports reconstructed output without expensive effects',()=>{assert(!balanced.graphics.ao&&!balanced.graphics.volumetric);assert.equal(balanced.graphics.resolution.scale,.67);});
await page.screenshot({path:`${out}/balanced-performance.png`});
await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false));
const beforeWalk=await state();await page.keyboard.press('Space');await page.waitForTimeout(1800);const walking=await state();await page.keyboard.press('Space');
check('Real companion walk works with reconstructed output',()=>{assert(walking.player.z>beforeWalk.player.z+1.4);assert(Math.abs(walking.player.speed-walking.companion.speed)<.18);});
await page.keyboard.press('KeyP');await page.waitForTimeout(250);
const downloadPromise=page.waitForEvent('download');await page.locator('#save-photo').click();const download=await downloadPromise;await download.saveAs(`${out}/performance-photograph.png`);
const photograph=PNG.sync.read(await readFile(`${out}/performance-photograph.png`));
check('Performance photo saves a full display-resolution nonblank PNG',()=>{assert.equal(photograph.width,balanced.graphics.resolution.displayWidth);assert.equal(photograph.height,balanced.graphics.resolution.displayHeight);const colors=new Set();for(let i=0;i<photograph.data.length;i+=1024)colors.add(photograph.data.readUInt32BE(i));assert(colors.size>100);});
await page.keyboard.press('KeyP');
await change('quality','cinematic');await change('resolution','auto');
await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false));
const trajectory=[];for(let i=0;i<12;i++){await page.waitForTimeout(2000);trajectory.push({seconds:(i+1)*2,state:await state()});}
const adaptive=trajectory.at(-1).state;
check('Auto responds to real measured GPU pressure',()=>{
  assert(adaptive.graphics.resolution.gpuTimer);assert(adaptive.graphics.resolution.gpuSamples>10);
  assert(trajectory.some(s=>s.state.graphics.resolution.scale<.99));
  assert(adaptive.graphics.resolution.scale>=.55&&adaptive.graphics.resolution.scale<=1);
});
await page.screenshot({path:`${out}/adaptive-cinematic.png`});
await page.keyboard.press('Escape');await page.waitForTimeout(200);const pausedScale=(await state()).graphics.resolution.scale;
await page.waitForTimeout(800);
const afterPause=await state();check('Pause holds automatic resolution',()=>{assert(afterPause.paused);assert.equal(afterPause.graphics.resolution.scale,pausedScale);});
await page.locator('#resume').click();await page.keyboard.press('KeyV');await page.keyboard.press('KeyQ');await page.keyboard.press('KeyN');await page.waitForTimeout(5500);
const night=await state();check('Night, first person and companion gaze survive adaptation',()=>{assert.equal(night.cameraMode,'first');assert(night.lookTogether);assert(night.nightBlend>.98);assert(!night.playerVisible);});
await page.screenshot({path:`${out}/night-first-person.png`});
await change('resolution','native');await page.keyboard.press('Escape');await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(500);
const fit=await page.locator('#settings').evaluate(e=>({rect:e.getBoundingClientRect().toJSON(),scrollable:getComputedStyle(e).overflowY,screen:[innerWidth,innerHeight]}));
check('New resolution setting fits 720p settings',()=>{assert(fit.rect.y>=0&&fit.rect.bottom<=fit.screen[1]+1);});
await page.screenshot({path:`${out}/settings-720.png`});
await context.close();
const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
await mobile.addInitScript(()=>{const original=WebGL2RenderingContext.prototype.getExtension;WebGL2RenderingContext.prototype.getExtension=function(name){return name==='EXT_disjoint_timer_query_webgl2'?null:original.call(this,name);};});
const phone=await mobile.newPage();phone.on('pageerror',e=>errors.push(`fallback: ${e.message}`));
phone.on('console',m=>{if(m.type()==='error')errors.push(`fallback: ${m.text()}`);});
await phone.goto(new URL('?qa=1',url).href);await phone.waitForFunction(()=>!!window.__SAKURA__,null,{timeout:120000});await phone.locator('#begin').click();await phone.waitForTimeout(500);
const fallback=await phone.evaluate(()=>window.__SAKURA__.state());
check('Missing GPU timer falls back to conservative mobile preset',()=>{assert(!fallback.graphics.resolution.gpuTimer);assert.equal(fallback.graphics.resolution.scale,.85);assert.equal(fallback.quality,'balanced');});
await phone.screenshot({path:`${out}/mobile-fallback.png`});
await phone.keyboard.press('Escape');await phone.locator('#resolution').selectOption('native');await phone.locator('#resume').click();await phone.waitForTimeout(300);
const mobileNative=await phone.evaluate(()=>window.__SAKURA__.state());check('Native can override mobile fallback',()=>assert.equal(mobileNative.graphics.resolution.scale,1));
await mobile.close();await browser.close();check('No shader/runtime errors',()=>assert.deepEqual(errors,[]));
await writeFile(`${out}/report.json`,JSON.stringify({checks,errors,samples,trajectory,balanced,night,fit,fallback,mobileNative},null,2));
console.log(JSON.stringify({passed:checks.filter(c=>c.pass).length,total:checks.length,failed:checks.filter(c=>!c.pass),adaptive:adaptive.graphics.resolution,errors}));if(checks.some(c=>!c.pass))process.exitCode=1;
