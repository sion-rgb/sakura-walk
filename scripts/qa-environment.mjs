import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.QA_URL||'http://127.0.0.1:5190/',out=process.env.QA_OUT||'artifacts/environment-qa';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium'}),errors=[],checks=[],views=[],requests=[],timings=[];
async function check(name,fn){try{await fn();checks.push({name,pass:true});}catch(e){checks.push({name,pass:false,error:e.message});}}
function observe(page){page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});page.on('request',r=>requests.push(r.url()));}
const page=await browser.newPage({viewport:{width:1440,height:900}});observe(page);
await page.goto(new URL('?qa=1',base).href);await page.waitForFunction(()=>!!window.__SAKURA__,null,{timeout:120000});
const snap=()=>page.evaluate(()=>window.__SAKURA__.state());
const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
await check('Ten local CC0 surface / HDR assets load',()=>{assert.equal(new Set(requests.filter(u=>/\/(textures\/(grass|path)-(albedo|normal|roughness|ao)\.jpg|environments\/(spring-day|moonlight)\.hdr)/.test(u))).size,10);});
for(const mode of ['day','night'])for(const view of ['active-play','companion-close','vista','first-person-together']){
  await page.evaluate(async state=>{await window.__THREE_GAME_TEST_HOOKS__.setState(state);window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);},`${mode}-${view}`);
  await page.waitForTimeout(500);const state=await snap();views.push({mode,view,state});await page.screenshot({path:`${out}/${mode}-${view}.png`});
  await check(`${mode} ${view}: runtime, lighting and GL`,async()=>{assert.equal(state.timeOfDay,mode==='night'?'moonlight':'daylight');assert.equal(state.nightBlend,mode==='night'?1:0);assert.equal(state.environment.nightAmount,state.nightBlend);assert.equal(await page.evaluate(()=>document.querySelector('canvas').getContext('webgl2').getError()),0);assert.equal(state.physics.colliders,88);});
}
await page.evaluate(async()=>{await window.__THREE_GAME_TEST_HOOKS__.setState('active-play');});
const before=await snap(),count=requests.length;await page.locator('#day-night').click();await page.waitForTimeout(400);const early=await snap();
await check('Day / night transitions interpolate without reset',()=>{assert(early.nightBlend>0&&early.nightBlend<.8);assert.equal(early.timeOfDay,'moonlight');assert(Math.abs(early.player.z-before.player.z)<.01);assert.equal(early.playerModel.asset,before.playerModel.asset);});
await page.waitForTimeout(8000);const night=await snap();
await check('Moonlight settles and keeps assets / scene',()=>{assert(night.nightBlend>.999);assert(night.lighting.keyIntensity<before.lighting.keyIntensity);assert(night.lighting.fogDensity>before.lighting.fogDensity);assert.equal(requests.length,count);assert.equal(night.renderer.geometries,before.renderer.geometries);assert.equal(night.environment.localLanternLights,2);assert.equal(night.environment.fireflies,300);});
await page.keyboard.down('KeyW');await page.waitForTimeout(3000);await page.keyboard.up('KeyW');const walking=await snap();await page.waitForTimeout(1500);const idle=await snap();
await check('Night walking and stop maintain companionship',()=>{assert(walking.player.z>night.player.z+2);assert(Math.abs(walking.player.speed-walking.companion.speed)<.15);assert(idle.companion.speed<.16);assert(idle.companion.separation>1&&idle.companion.separation<1.6);});
await page.keyboard.down('KeyS');await page.waitForTimeout(2400);await page.keyboard.up('KeyS');await page.waitForTimeout(1200);const turned=await snap();
await check('Night reversal repositions smoothly',()=>{assert(turned.player.z<walking.player.z-1.5);assert(turned.companion.separation>.64&&turned.companion.separation<1.8);});
await page.keyboard.press('Escape');await page.locator('#light-mode').selectOption('day');await page.waitForTimeout(8500);
await check('Paused settings transition lighting without locomotion',async()=>{const s=await snap();assert(s.paused);assert(s.nightBlend<.001);assert(Math.abs(s.player.z-turned.player.z)<.01);});
await page.locator('#resume').click();
for(const quality of ['high','cinematic','balanced']){
  await page.evaluate(async value=>{await window.__THREE_GAME_TEST_HOOKS__.setState('night-active-play');const e=document.querySelector('#quality');e.value=value;e.dispatchEvent(new Event('change'));window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);},quality);
  await page.waitForTimeout(1000);
  const timing=await page.evaluate(async()=>{const v=[];let last=performance.now();for(let i=0;i<100;i++)await new Promise(ok=>requestAnimationFrame(t=>{v.push(t-last);last=t;ok();}));v.shift();v.sort((a,b)=>a-b);return {medianMs:v[49],p95Ms:v[94]};});const state=await snap();timings.push({quality,timing,renderer:state.renderer});
  await check(`Night ${quality}: bounded lights and draw calls`,()=>{assert.equal(state.environment.quality,quality);assert(state.renderer.calls<260);assert.equal(state.graphics.ao,quality!=='balanced');assert(timing.p95Ms<40);});
}
await page.close();
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});const mobile=await context.newPage();observe(mobile);
await mobile.goto(new URL('?qa=1',base).href);await mobile.waitForFunction(()=>!!window.__SAKURA__,null,{timeout:120000});
for(const size of [{width:390,height:844},{width:844,height:390}]){
 await mobile.setViewportSize(size);
 for(const mode of ['day','night']){
  await mobile.evaluate(async name=>{await window.__THREE_GAME_TEST_HOOKS__.setState(name);window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);},`${mode}-active-play`);await mobile.waitForTimeout(400);
  await mobile.screenshot({path:`${out}/mobile-${size.width}-${mode}.png`});
  await check(`Mobile ${size.width} ${mode}: controls and layout`,async()=>{const ui=await mobile.evaluate(()=>{const a=document.querySelector('#day-night').getBoundingClientRect(),b=document.querySelector('.brand').getBoundingClientRect(),c=document.querySelector('#chapter').getBoundingClientRect();return {fits:a.left>=0&&a.right<=innerWidth&&a.bottom<=innerHeight,noOverlap:!(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)&&!(a.left<c.right&&a.right>c.left&&a.top<c.bottom&&a.bottom>c.top),scroll:document.documentElement.scrollWidth};});assert(ui.fits&&ui.noOverlap);assert(ui.scroll<=size.width);assert(await mobile.locator('#joystick').isVisible());});
 }
}
await mobile.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false));await mobile.locator('#day-night').tap();await mobile.waitForTimeout(500);
await check('Touch moonlight switch works',async()=>assert.equal((await mobile.evaluate(()=>window.__SAKURA__.state())).timeOfDay,'daylight'));
await check('No console / HTTP errors',()=>assert.deepEqual(errors,[]));
const report={base,gpu,checks,errors,timings,views,checkedAt:new Date().toISOString()};await writeFile(`${out}/environment.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({checks,errors,timings}));await browser.close();if(checks.some(c=>!c.pass))process.exitCode=1;
