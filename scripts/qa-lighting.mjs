import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.QA_URL || 'http://127.0.0.1:5190/';
const out = process.env.QA_OUT || 'artifacts/lighting-quality';
await mkdir(out, {recursive:true});
const browser = await chromium.launch({channel:'chromium'});
const page = await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[], warnings=[], checks=[], modes=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());else if(m.type()==='warning' && /WebGL|shader|framebuffer/i.test(m.text()))warnings.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
async function check(name, fn){try{await fn();checks.push({name,pass:true});}catch(e){checks.push({name,pass:false,error:e.message});}}
await page.goto(new URL('?qa=1',base).href);
await page.waitForFunction(()=>!!window.__SAKURA__,null,{timeout:120000});
const gpu=await page.evaluate(()=>{const gl=document.querySelector('#world').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
for(const quality of ['high','cinematic','balanced','high']){
  await page.evaluate(async value=>{
    const hooks=window.__THREE_GAME_TEST_HOOKS__;
    await hooks.setState('active-play');
    const select=document.querySelector('#quality');select.value=value;select.dispatchEvent(new Event('change'));
    hooks.setPausedForScreenshot(true);
  },quality);
  await page.waitForTimeout(1200);
  const timing=await page.evaluate(async()=>{
    const samples=[];let last=performance.now();
    for(let i=0;i<100;i++)await new Promise(resolve=>requestAnimationFrame(now=>{samples.push(now-last);last=now;resolve();}));
    samples.shift();samples.sort((a,b)=>a-b);
    return {medianMs:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)],meanMs:samples.reduce((a,b)=>a+b,0)/samples.length};
  });
  const state=await page.evaluate(()=>window.__SAKURA__.state());
  modes.push({quality,timing,renderer:state.renderer,graphics:state.graphics});
  await check(`${quality} effects and shadow resolution`,()=>{
    assert.equal(state.quality,quality);assert.equal(state.graphics.rayTracing,false);
    assert.equal(state.graphics.ao,quality!=='balanced');
    assert.equal(state.graphics.volumetric,quality!=='balanced');
    assert.equal(state.graphics.shadowSize,quality==='cinematic'?4096:quality==='high'?2048:1024);
    assert(state.renderer.triangles>500000);assert(state.renderer.calls<260);
  });
  await page.screenshot({path:`${out}/${quality}.png`});
}
await page.evaluate(async()=>{await window.__THREE_GAME_TEST_HOOKS__.setState('first-person-together');window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);const input=document.querySelector('#sunlight');input.value='100';input.dispatchEvent(new Event('input'));});
await page.waitForTimeout(500);await page.screenshot({path:`${out}/golden-hour.png`});
await check('Warmth control and first-person render remain live',async()=>{const s=await page.evaluate(()=>window.__SAKURA__.state());assert.equal(s.cameraMode,'first');assert(!s.playerVisible);});
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(800);
await page.screenshot({path:`${out}/portrait-resize.png`});
await page.setViewportSize({width:844,height:390});await page.waitForTimeout(800);
await page.screenshot({path:`${out}/landscape-resize.png`});
await check('No GL error after mode switches and resize',async()=>{const error=await page.evaluate(()=>document.querySelector('#world').getContext('webgl2').getError());assert.equal(error,0);});
// ANGLE can report double-precision constant rounding in generated Three.js
// shaders. Retain these diagnostics in the report; fail other warning types.
const actionableWarnings=warnings.filter(w=>!w.includes('warning X4122:'));
await check('No shader errors, framebuffer errors or actionable warnings',()=>{assert.deepEqual(errors,[]);assert.deepEqual(actionableWarnings,[]);});
await writeFile(`${out}/quality.json`,JSON.stringify({url:base,gpu,modes,checks,errors,warnings},null,2));
console.log(JSON.stringify({gpu,modes,checks,errors,warnings}));
await browser.close();if(checks.some(c=>!c.pass))process.exitCode=1;
