import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.QA_OUT||'artifacts/resolution-profile',url=process.env.QA_URL||'http://127.0.0.1:5192/';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium'});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(new URL('?qa=1',url).href);await page.waitForFunction(()=>!!window.__SAKURA__,null,{timeout:120000});
const gpuRenderer=await page.evaluate(()=>{const gl=document.querySelector('#world').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
for(const quality of ['high','cinematic'])for(const mode of (process.env.QA_MODES||'native').split(',')){
  await page.evaluate(async({quality,mode})=>{
    const hooks=window.__THREE_GAME_TEST_HOOKS__;await hooks.setState('day-active-play');
    hooks.setGpuTimerEnabled?.(true);
    const change=(id,value)=>{const s=document.getElementById(id);if(s){s.value=value;s.dispatchEvent(new Event('change'));}};
    change('quality',quality);change('resolution',mode);hooks.setPausedForScreenshot(true);
  },{quality,mode});
  await page.waitForTimeout(1500);
  const timing=await page.evaluate(async()=>{
    const gl=document.querySelector('#world').getContext('webgl2'),gpu=[],frames=[];
    let previous=null,lastGpu=-1;
    for(let i=0;i<200;i++){
      await new Promise(resolve=>requestAnimationFrame(now=>{if(previous!==null)frames.push(now-previous);previous=now;resolve();}));
      const measured=window.__SAKURA__.state().graphics.resolution;
      if(measured?.gpuSamples!==lastGpu&&measured?.gpuMs!=null){gpu.push(measured.gpuMs);lastGpu=measured.gpuSamples;}
    }
    const summary=(values,skip)=>{values=values.slice(skip).sort((a,b)=>a-b);return values.length?{samples:values.length,medianMs:values[Math.floor(values.length*.5)],p95Ms:values[Math.floor(values.length*.95)],meanMs:values.reduce((a,b)=>a+b,0)/values.length}:null;};
    return {gpu:summary(gpu,2),frames:summary(frames,10),glError:gl.getError(),gpuSupported:!!window.__SAKURA__.state().graphics.resolution?.gpuTimer,method:'GPU queries enclosing renderer work; continuous rAF frame intervals'};
  });
  const state=await page.evaluate(()=>window.__SAKURA__.state());
  results.push({quality,mode,timing,renderer:state.renderer,graphics:state.graphics});
  await page.screenshot({path:`${out}/${quality}-${mode}.png`});
}
await browser.close();await writeFile(`${out}/profile.json`,JSON.stringify({url,gpuRenderer,viewport:[1920,1080],deviceScaleFactor:2,results,errors},null,2));
console.log(JSON.stringify({results,errors},null,2));if(errors.length||results.some(r=>r.timing.glError))process.exitCode=1;
