import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Replay real DOM controls at a fixed clock. The visual suites exercise full rendering separately.
const url = process.env.QA_URL || 'http://127.0.0.1:5193/';
const out = process.env.QA_OUT || 'artifacts/experience-audit/after';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium' });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const native = window.requestAnimationFrame.bind(window);
    const queue = [];
    let manual = false, now = 0;
    window.requestAnimationFrame = callback => manual ? queue.push(callback) : native(callback);
    window.takeClock = () => new Promise(resolve => native(time => {
      manual = true; now = time;
      native(resolve);
    }));
    window.tick = () => {
      now += 1000 / 60;
      for (const callback of queue.splice(0)) callback(now);
    };
    const events = window.__THREE_DEVTOOLS__ = new EventTarget();
    events.addEventListener('observe', event => {
      const renderer=event.detail;
      if (!renderer.isWebGLRenderer) return;
      window.testRenderer=renderer;
      const render=renderer.render;
      renderer.render=function(scene,camera) {
        if(camera.isPerspectiveCamera&&camera.fov>=38&&camera.fov<=85)window.walkCamera=camera;
        return render.apply(this,arguments);
      };
    });
  });
  await page.goto(new URL('?qa=1', url).href);
  await page.waitForFunction(() => !!window.__SAKURA__, null, { timeout: 90000 });
  const result = await page.evaluate(async () => {
    await window.takeClock();
    const state = () => window.__SAKURA__.state();
    const key = (type, code) => document.querySelector('#world').dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
    const tap = code => { key('keydown', code); key('keyup', code); };
    const walk = ticks => { for (let i = 0; i < ticks; ++i) window.tick(); };
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const canvas = document.querySelector('#world');
    // draw calls aren't part of the timing-independent movement assertions.
    window.testRenderer.render = () => {};
    await window.__THREE_GAME_TEST_HOOKS__.setState('day-active-play');
    walk(100);
    const mutations = new MutationObserver(() => {});
    mutations.observe(document.querySelector('#place'), {childList:true, subtree:true, characterData:true});
    walk(120);
    const stationaryLocationWrites = mutations.takeRecords().length;
    mutations.disconnect();
    tap('Space'); walk(85);
    const beforeView = state(); tap('KeyV'); walk(60);
    const afterView = state();
    tap('KeyC'); walk(20);
    const switched = state();
    key('keydown','KeyW'); walk(30); key('keyup','KeyW'); walk(95);
    const stopped = state();
    key('keydown','KeyD');walk(440);
    const wallStart=state();walk(30);const wallEnd=state();key('keyup','KeyD');
    tap('KeyE');walk(48);const reply=state();
    const walkerResponded=document.querySelector('.speaker').textContent==='WALKER'&&reply.playerModel.waveBlend>.7&&reply.companionModel.waveBlend<.02;
    const directionCosines=[],heldTravel=[];
    for(const held of ['KeyS','KeyD']){
      await window.__THREE_GAME_TEST_HOOKS__.setState('day-active-play');
      key('keydown',held);walk(35);let a=state().player;walk(8);let b=state().player;
      const dx=b.x-a.x,dz=b.z-a.z;
      for(let i=0;i<2;i++){
        tap('KeyV');a=state().player;walk(18);b=state().player;
        const ex=b.x-a.x,ez=b.z-a.z;
        directionCosines.push((dx*ex+dz*ez)/(Math.hypot(dx,dz)*Math.hypot(ex,ez)));
        heldTravel.push(Math.hypot(ex,ez));
      }
      key('keyup',held);
    }

    await window.__THREE_GAME_TEST_HOOKS__.setState('day-active-play');
    tap('KeyP');
    // Compose a photograph from a noticeably different azimuth and zoom.
    function orbit(dx,dy) {
      const down = new PointerEvent('pointerdown',{pointerId:1,clientX:280,clientY:230,bubbles:true});
      // Capture requires an actual pointer in the browser. Only the synthetic replay needs this shim.
      const capture = canvas.setPointerCapture;
      canvas.setPointerCapture = () => {};
      canvas.dispatchEvent(down);
      canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:280+dx,clientY:230+dy,bubbles:true}));
      canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,bubbles:true}));
      canvas.setPointerCapture = capture;
    }
    tap('KeyP'); orbit(215, 65); walk(90);
    const beforePhoto = state();
    tap('KeyP'); orbit(-120,-28);
    canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:240,cancelable:true})); walk(60);
    const photo = state(); tap('KeyP'); walk(60);
    const afterPhoto = state();

    await window.__THREE_GAME_TEST_HOOKS__.setState('day-active-play');
    key('keydown','KeyW'); walk(95); key('keyup','KeyW');
    key('keydown','KeyS');
    let closest = Infinity, furthest = 0, maxFollowerStep = 0;
    let previous = state().companion;
    const measure = ticks => {
      for (let i=0;i<ticks;i++) {
        window.tick();
        const c = state().companion;
        closest = Math.min(closest,c.separation); furthest = Math.max(furthest,c.separation);
        maxFollowerStep = Math.max(maxFollowerStep, distance(previous,c)); previous=c;
      }
    };
    measure(85); key('keyup','KeyS'); key('keydown','KeyA'); measure(225);
    key('keyup','KeyA'); key('keydown','KeyW'); measure(110); key('keyup','KeyW'); measure(100);
    const arrived = state();
    tap('KeyQ'); tap('KeyE'); walk(20);
    const greeted = state(), firstLine=document.querySelector('#caption p').textContent;
    tap('KeyE'); walk(12);
    const greetingHeld=greeted.companion.greeting>0&&document.querySelector('#caption p').textContent===firstLine;
    await window.__THREE_GAME_TEST_HOOKS__.setState('day-companion-close');
    tap('KeyV');key('keydown','KeyA');walk(220);key('keyup','KeyA');walk(65);
    tap('KeyV');tap('KeyP');
    canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:-2500,cancelable:true}));
    const rig=window.walkCamera,point=rig.position.clone();
    let croppedViews=0;
    for(let i=0;i<16;i++){
      orbit(-78.54,0);walk(24);rig.updateMatrixWorld();
      const s=state();
      const cropped=[[s.player,s.playerModel.height],[s.companion,s.companionModel.height]].some(([body,height])=>
        [0,height].some(y=>{point.set(body.x,y,body.z).project(rig);return Math.abs(point.x)>1||Math.abs(point.y)>1;}));
      if(cropped)croppedViews++;
    }
    return { stationaryLocationWrites, viewKeptWalk:afterView.autoWalk, viewSwitchTravel:afterView.traveled-beforeView.traveled,
      switchedWhileWalking:switched.controlledRole==='female'&&switched.autoWalk, manualStopped: !stopped.autoWalk&&stopped.companion.speed<.03,
      blockedDistance:distance(wallStart.companion,wallEnd.companion),blockedSpeed:wallEnd.companion.speed,walkerResponded,directionCosines,heldTravel,
      photoSceneMoved:distance(beforePhoto.player,photo.player),
      photoYawError: Math.abs(Math.atan2(Math.sin(afterPhoto.camera.yaw-beforePhoto.camera.yaw),Math.cos(afterPhoto.camera.yaw-beforePhoto.camera.yaw))),
      photoZoomError:Math.abs(afterPhoto.camera.distance-beforePhoto.camera.distance),
      closest,furthest,maxFollowerStep,finalSeparation:arrived.companion.separation,stoppedPartnerSpeed:arrived.companion.speed,
      mutualLook:greeted.lookTogether && Math.abs(greeted.companionLook)>.1 && Math.abs(greeted.playerLook)>.1,
      greetingHeld,croppedViews };
  });
  await writeFile(out+'/interaction.json',JSON.stringify({result,errors},null,2));
  console.log(JSON.stringify({result,errors}));
  if (!process.env.QA_BASELINE) {
    assert.deepEqual(errors,[]);
    assert(result.viewKeptWalk && result.viewSwitchTravel>.95 && result.switchedWhileWalking && result.manualStopped);
    assert(result.blockedDistance<.001 && result.blockedSpeed<.01);
    assert(result.walkerResponded && result.directionCosines.every(c=>c>.95) && result.heldTravel.every(m=>m>.25));
    assert(result.photoSceneMoved<.001 && result.photoYawError<.02 && result.photoZoomError<.025);
    assert(result.closest>.78 && result.furthest<2.15 && result.maxFollowerStep<.04 && result.stoppedPartnerSpeed<.03);
    assert(result.mutualLook && result.greetingHeld && result.stationaryLocationWrites===0);
    assert.equal(result.croppedViews,0,'Both walkers should stay in frame beside the stone lantern');
  }
} finally { await browser.close(); }
