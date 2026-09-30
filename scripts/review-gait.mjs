import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.QA_OUT||'artifacts/gait-scene',url=process.env.QA_URL||'http://127.0.0.1:5192/';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium'});
const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:`${out}/video`,size:{width:1440,height:900}}});
const page=await context.newPage(),errors=[],samples=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(`${url}?qa=1`);await page.waitForFunction(()=>!!window.__SAKURA__,null,{timeout:120000});
await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setState('companion-close'));
await page.waitForTimeout(500);await page.keyboard.press('Space');
async function record(name,count=6){
  for(let i=0;i<count;i++){
    await page.waitForTimeout(150);
    const state=await page.evaluate(()=>window.__SAKURA__.state());
    samples.push({name,index:i,state});
    await page.screenshot({path:`${out}/${name}-${i}.png`});
  }
}
await record('day-walk');await page.keyboard.press('Space');await record('day-stop');
await page.keyboard.down('KeyS');await record('reverse');await page.keyboard.up('KeyS');await page.waitForTimeout(900);
await page.keyboard.press('KeyN');await page.waitForTimeout(5500);
await page.keyboard.press('KeyV');await page.keyboard.press('KeyQ');await page.keyboard.press('Space');await record('night-first-walk');
await page.keyboard.press('Space');await record('night-first-stop');
const video=page.video();await context.close();await video.saveAs(`${out}/motion.webm`);await browser.close();
await writeFile(`${out}/review.json`,JSON.stringify({url,samples,errors},null,2));
assert.deepEqual(errors,[]);
assert(samples.some(s=>s.name==='day-walk'&&s.state.player.speed>.8&&s.state.companion.speed>.8));
assert(samples.findLast(s=>s.name==='day-stop').state.player.speed<.035);
assert(samples.findLast(s=>s.name==='night-first-walk').state.cameraMode==='first');
console.log(JSON.stringify({captures:samples.length,video:`${out}/motion.webm`,errors}));
