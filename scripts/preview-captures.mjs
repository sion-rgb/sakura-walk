import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out='artifacts/preview';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium'});const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://127.0.0.1:5188/?qa=1');await page.waitForFunction(()=>!!window.__SAKURA__,{timeout:60000});await page.waitForTimeout(1500);
for(const name of ['welcome','active-play','companion-close','vista']){await page.evaluate(async n=>{await window.__THREE_GAME_TEST_HOOKS__.setState(n);window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true);},name);await page.waitForTimeout(500);await page.screenshot({path:`${out}/${name}.png`});}
const info=await page.evaluate(()=>window.__SAKURA__.state());await writeFile(`${out}/diagnostics.json`,JSON.stringify({errors,info},null,2));console.log(JSON.stringify({errors,info}));await browser.close();
