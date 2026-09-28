import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const url=process.env.QA_URL||'http://127.0.0.1:5190/';
const out=process.env.QA_OUT||'artifacts/review-v2';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium'}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(url+'?qa=1');await page.waitForFunction(()=>!!window.__SAKURA__,null,{timeout:60000});
for(const state of (process.env.QA_STATES||'active-play,companion-close,first-person-together,vista').split(',')){
  await page.evaluate(async state=>{await window.__THREE_GAME_TEST_HOOKS__.setState(state);window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);},state);
  await page.waitForTimeout(800);await page.screenshot({path:`${out}/${state}.png`});
  const s=await page.evaluate(()=>window.__SAKURA__.state());console.log(JSON.stringify({state,models:[s.playerModel,s.companionModel],camera:s.camera,mode:s.cameraMode,renderer:s.renderer,errors}));
}
await writeFile(`${out}/errors.json`,JSON.stringify(errors));await browser.close();if(errors.length)process.exitCode=1;
