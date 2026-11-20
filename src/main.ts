import * as THREE from 'three';
import { createLighting } from './lighting';
import { cameraClearance, clearLowProps, dissolveView } from './walk-camera';
import { createRenderPipeline } from './render-pipeline';
import type { ResolutionMode } from './adaptive-resolution';
import { createCharacter, type Character } from './character';
import { createEnvironment } from './environment';
import { waitForEnvironmentTextures } from './environment-materials';
import { Soundscape } from './audio';
import { loadPreferences, savePreference, type WalkPreferences } from './preferences';
import './style.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-600.css';

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const clamp=THREE.MathUtils.clamp;
const damp=(a:number,b:number,k:number,dt:number)=>THREE.MathUtils.damp(a,b,k,dt);
const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const icons={sound:'<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14"/>',mute:'<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6m0-6-5 6"/>',photo:'<rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 6 1-3h6l1 3"/><circle cx="12" cy="13" r="4"/>',pause:'<path d="M9 5v14M15 5v14"/>'};
function icon(s:string){return `<svg viewBox="0 0 24 24" aria-hidden="true">${s}</svg>`;}
$('sound').innerHTML=icon(icons.sound);$('photo').innerHTML=icon(icons.photo);$('pause').innerHTML=icon(icons.pause);

async function boot(){
 const prefs=loadPreferences();
 const brand=document.querySelector<HTMLButtonElement>('.brand')!;
 const canvas=$<HTMLCanvasElement>('world');
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
 renderer.setClearColor(0xf2e2d9);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.info.autoReset=false;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#eddcda');scene.fog=new THREE.FogExp2('#ead2d0',.009);
 const camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.08,230);
 // Let both model downloads overlap the synchronous construction of the garden.
 const walkerReady = createCharacter('player');
 const harukaReady = createCharacter('companion');
 const lighting=createLighting(renderer,scene),sun=lighting.sun;
 const warmthInput=$<HTMLInputElement>('sunlight');
 if(prefs.warmth!==undefined)warmthInput.value=String(prefs.warmth);
 lighting.setWarmth(Number(warmthInput.value)/100);
 const world=createEnvironment(scene);
 const [player,companion]=await Promise.all([walkerReady,harukaReady,lighting.ready,waitForEnvironmentTextures()]);scene.add(player.root,companion.root);
 const graphics=createRenderPipeline(renderer,scene,camera,sun);
 let nightTarget=0,nightBlend=0;
 let quality='high',started=false,paused=false,photo=false,frozen=false,reduced=prefs.reduced??matchMedia('(prefers-reduced-motion: reduce)').matches;
 let elapsed=0,frame=0,accumulator=0,autoWalk=false,greeting=0,nextRemark=15,captionLeft=0;
 let toastTimer=0;
 let playerYaw=0,companionYaw=0,yaw=Math.PI+.17,yawTarget=yaw,elevation=.17,elevationTarget=.17,distance=5.6,distanceTarget=5.6;
 let formationSide=1,travelYaw=0;let traveled=0,playerSteps=0,companionSteps=0,stepP=0,stepC=0,seedValue=42;
 type ControlledRole='male'|'female';
 let controlledRole:ControlledRole='male',greetingResponder:ControlledRole='female',playerLook=0;
 const controlled=()=>controlledRole==='male'?player:companion;
 const partner=()=>controlledRole==='male'?companion:player;
 const controlledYaw=()=>controlledRole==='male'?playerYaw:companionYaw;
 type CameraMode='third'|'first';
 let cameraMode:CameraMode='third',lookTogether=false,firstYaw=0,firstPitch=-.04,firstFov=68;
 let companionLook=0,armFraction=1,clearPitch=elevation;
 type PhotoReturn={mode:CameraMode;look:boolean;auto:boolean;fromButton:boolean;orbit:number;tilt:number;zoom:number;eyeYaw:number;eyePitch:number};
 let photoReturn:PhotoReturn|null=null;
 const velocity=new THREE.Vector3(),compVelocity=new THREE.Vector3(),move=new THREE.Vector3(),desired=new THREE.Vector3(),right=new THREE.Vector3(),target=new THREE.Vector3(),focus=new THREE.Vector3(),cameraPoint=new THREE.Vector3();
 const lookMatrix=new THREE.Matrix4(),lookRotation=new THREE.Quaternion(),viewDirection=new THREE.Vector3();
 const maleEye=new THREE.Vector3(),femaleEye=new THREE.Vector3();
 const place=$('place'),landmarks=world.landmarks.slice().reverse();
 const keys=new Set<string>(),touch=new THREE.Vector2();const audio=new Soundscape();let lastFrame=performance.now(),frameMs=16.7;
 const coarse=matchMedia('(pointer: coarse)').matches;
 const orbitPointers=new Map<number,THREE.Vector2>();let stickId:number|null=null;
 const settings=$<HTMLDialogElement>('settings');
 const sayings=["I'm glad we took the long way.","Listen… even the breeze is taking its time.","We don't have to be anywhere else just yet.","The petals look like little pieces of the sky.","Shall we walk a little further together?"];
 let sayingIndex=0;
 const walkerReplies=["I like walking at your pace.","Let’s stay under the blossoms a little longer.","I’m glad you’re here."];
 function say(text:string,duration=6,speaker='Haruka'){
  const caption=$('caption');caption.querySelector('.speaker')!.textContent=speaker.toUpperCase();
  caption.querySelector('p')!.textContent=text;caption.classList.add('visible');captionLeft=duration;
 }
 function toast(text:string){
  clearTimeout(toastTimer);
  $('toast').textContent=text;
  $('toast').classList.add('visible');
  toastTimer=window.setTimeout(()=>$('toast').classList.remove('visible'),3000);
 }
 function setGreetingBusy(value:boolean){
  for(const id of ['greet','touch-greet']){
   const button=$(id);
   button.setAttribute('aria-disabled',String(value));
   button.querySelector('span')!.textContent=value?'♥':'♡';
  }
  $('greet-label').textContent=value?'Sharing a moment…':'Share a moment';
 }

 function applyNight(){lighting.setNight(nightBlend);world.setNight(nightBlend);graphics.setNight(nightBlend);}
 function setNight(value:boolean,instant=false){if(!instant)savePreference('night',value);nightTarget=value?1:0;if(instant){nightBlend=nightTarget;applyNight();}$('day-night').innerHTML=icon(value?'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>':'<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>');$('day-night').setAttribute('aria-pressed',String(value));$('day-night').setAttribute('aria-label',value?'Switch to spring daylight (N)':'Switch to moonlight (N)');$<HTMLSelectElement>('light-mode').value=value?'night':'day';document.body.classList.toggle('moonlight',value);}
 setNight(prefs.night??false,true);
 $('day-night').addEventListener('click',()=>setNight(nightTarget<.5));$('light-mode').addEventListener('change',e=>setNight((e.target as HTMLSelectElement).value==='night'));
 quality=prefs.quality??(coarse?'balanced':'high');
 $<HTMLSelectElement>('quality').value=quality;
 if(quality!=='high'){graphics.setQuality(quality);lighting.setQuality(quality);}
 world.setQuality(quality);
 function syncSound(){$('sound').innerHTML=icon(audio.muted?icons.mute:icons.sound);$('sound').setAttribute('aria-label',audio.muted?'Enable sound':'Mute sound');}
 function toggleSound(){
  audio.setMuted(!audio.muted);
  savePreference('muted',audio.muted);
  syncSound();
 }
 function setAuto(value:boolean){autoWalk=value;$('stroll').setAttribute('aria-pressed',String(value));$('touch-stroll').setAttribute('aria-pressed',String(value));}
 function resetInput(){keys.clear();touch.set(0,0);$('stick').style.transform='';orbitPointers.clear();stickId=null;setAuto(false);}
 function syncView(){
  const first=cameraMode==='first',female=controlledRole==='female';
  document.body.classList.toggle('first-person',first);
  canvas.setAttribute('aria-label',`${first?'First':'Third'}-person view, walking as ${female?'Haruka':'Walker'}`);
  $('view').textContent=first?'1P':'3P';$('view').setAttribute('aria-label',first?'Switch to third-person view (V)':'Switch to first-person view (V)');
  $<HTMLSelectElement>('camera-view').value=cameraMode;
  for(const id of ['look','touch-look'])$(id).setAttribute('aria-pressed',String(lookTogether));
  player.root.visible=!(first&&!female);companion.root.visible=!(first&&female);
  $('character').textContent=female?'♀':'♂';$('character').setAttribute('aria-label',`Control ${female?'Walker':'Haruka'} (C)`);
  $('character').setAttribute('aria-pressed',String(female));$<HTMLSelectElement>('controlled-character').value=controlledRole;
 }
 function setControlledRole(role:ControlledRole,notify=true){
  if(photo||role===controlledRole)return;
  if(notify){
   savePreference('role',role);
   if(cameraMode==='first'&&started&&!paused&&!reduced)dissolveView(canvas);
  }
  controlledRole=role;
  // Reverse the same formation from the new walker's point of view.
  formationSide*=-1;
  syncView();
  if(cameraMode==='first')cameraUpdate(0,true);
  if(notify)toast(`Walking as ${role==='female'?'Haruka':'Walker'}`);
 }
 function setCameraMode(mode:CameraMode,notify=true){
  if(photo||mode===cameraMode)return;
  if(notify){
   savePreference('view',mode);
   if(started&&!paused&&!reduced)dissolveView(canvas);
  }
  const manual=notify&&(keys.size>0||touch.lengthSq()>.0025);
  // Preserve the input basis as well as the held key. A held strafe or
  // backward step would reverse if the new view used the actor's travel yaw.
  if(mode==='first'){firstYaw=manual?yaw+Math.PI:travelYaw;firstPitch=-.04;}
  else if(manual){yaw=yawTarget=firstYaw+Math.PI;}
  cameraMode=mode;syncView();resize();cameraUpdate(0,true);
  if(notify)toast(mode==='first'?'First person · Drag to look around':'Third person · Drag to orbit');
 }
 function setLook(value:boolean){
  if(photo||paused)return;
  lookTogether=value;syncView();
  if(value)toast(coarse?'A shared glance · Tap Look to release':'A shared glance · Q to release');
 }
 function reset(){player.root.position.set(-.72,0,0);companion.root.position.set(.72,0,.1);playerYaw=companionYaw=travelYaw=0;player.root.rotation.y=companion.root.rotation.y=0;velocity.set(0,0,0);compVelocity.set(0,0,0);player.resetMotion();companion.resetMotion();yawTarget=yaw=Math.PI+.17;elevationTarget=elevation=.17;distanceTarget=distance=innerWidth<650?7.6:5.6;focus.set(0,1.12,0);formationSide=controlledRole==='male'?1:-1;traveled=0;playerSteps=companionSteps=stepP=stepC=0;greeting=0;setGreetingBusy(false);firstYaw=0;firstPitch=-.04;lookTogether=false;syncView();resetInput();cameraUpdate(1,true);}
 function start(interactive=true){
  if(started)return;
  started=true;
  brand.disabled=false;
  canvas.tabIndex=0;
  document.body.classList.add('started');
  $('welcome').hidden=true;
  $('controls').hidden=false;
  $('top-actions').hidden=false;
  $('touch-controls').hidden=!coarse;
  if(interactive){
   if(prefs.view)setCameraMode(prefs.view,false);
   void audio.unlock().catch(()=>toast('Sound is unavailable in this browser.'));
  }
  say("There you are. Shall we?",6);
  canvas.focus();
 }
 function setPause(value:boolean){paused=value;resetInput();void audio.pause(value||photo);if(value&&!settings.open){settings.showModal();settings.scrollTop=0;$('pause-title').focus({preventScroll:true});}if(!value&&settings.open)settings.close();}
 function photoMode(value:boolean){
  if(!started||paused||value===photo)return;
  if(value){
   photoReturn={mode:cameraMode,look:lookTogether,auto:autoWalk,fromButton:document.activeElement===$('photo'),
    orbit:yawTarget,tilt:elevationTarget,zoom:distanceTarget,eyeYaw:firstYaw,eyePitch:firstPitch};
   if(cameraMode==='first')setCameraMode('third',false);
  }
  photo=value;resetInput();document.body.classList.toggle('photo-mode',value);$('photo-tools').hidden=!value;void audio.pause(value);
  if(value){
   $('save-photo').focus({preventScroll:true});
   toast(coarse?'Drag to compose · Pinch to frame':'Drag to compose · Scroll to frame');
  }else if(photoReturn){
   const saved=photoReturn;photoReturn=null;setCameraMode(saved.mode,false);
   lookTogether=saved.look;firstYaw=saved.eyeYaw;firstPitch=saved.eyePitch;
   yaw=yawTarget=saved.orbit;elevation=elevationTarget=saved.tilt;distance=distanceTarget=saved.zoom;
   setAuto(saved.auto);syncView();cameraUpdate(0,true);
   (saved.fromButton?$('photo'):canvas).focus({preventScroll:true});
  }
 }
 function greet(){
  if(!started||paused||photo||greeting>0)return;
  greeting=3.5;greetingResponder=controlledRole==='male'?'female':'male';setGreetingBusy(true);audio.chime();
  const lines=greetingResponder==='female'?sayings:walkerReplies;
  say(lines[sayingIndex++%lines.length],6,greetingResponder==='female'?'Haruka':'Walker');
  nextRemark=Math.max(nextRemark,12);
 }
 function collide(p:THREE.Vector3,r=.27){p.x=clamp(p.x,world.bounds.minX+r,world.bounds.maxX-r);p.z=clamp(p.z,world.bounds.minZ+r,world.bounds.maxZ-r);for(const c of world.colliders){const dx=p.x-c.x,dz=p.z-c.z,d2=dx*dx+dz*dz,rr=r+c.radius;if(d2<rr*rr&&d2>.000001){const k=rr/Math.sqrt(d2);p.x=c.x+dx*k;p.z=c.z+dz*k;}}}
 function step(dt:number){
  elapsed+=dt;frame++;
  if(!started){player.update(dt,elapsed,0,0,false);companion.update(dt,elapsed,0,-.14,Math.sin(elapsed*.2)>.99);world.update(dt,elapsed,focus);return;}
  let ix=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x;
  let iy=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-touch.y;
  const actor=controlled(),other=partner(),actorVelocity=controlledRole==='male'?velocity:compVelocity,otherVelocity=controlledRole==='male'?compVelocity:velocity;
  let actorYaw=controlledYaw(),otherYaw=controlledRole==='male'?companionYaw:playerYaw;
  if(autoWalk&&Math.abs(ix)+Math.abs(iy)<.05){move.set(Math.sin(travelYaw),0,Math.cos(travelYaw));}
  else if(cameraMode==='first'){move.set(Math.sin(firstYaw)*iy-Math.cos(firstYaw)*ix,0,Math.cos(firstYaw)*iy+Math.sin(firstYaw)*ix);}
  else{move.set(-Math.sin(yaw)*iy+Math.cos(yaw)*ix,0,-Math.cos(yaw)*iy-Math.sin(yaw)*ix);}
  if(move.length()>1)move.normalize();
  actorVelocity.lerp(move.multiplyScalar(1.12),1-Math.exp(-dt*7.5));if(actorVelocity.length()<.005)actorVelocity.set(0,0,0);
  const oldX=actor.root.position.x,oldZ=actor.root.position.z;actor.root.position.addScaledVector(actorVelocity,dt);collide(actor.root.position);
  actorVelocity.set((actor.root.position.x-oldX)/dt,0,(actor.root.position.z-oldZ)/dt);
  const realSpeed=actorVelocity.length();
  if(realSpeed>.03){
   const heading=Math.atan2(actorVelocity.x,actorVelocity.z),turn=1-Math.exp(-dt*6);
   actorYaw+=angleDelta(actorYaw,heading)*turn;
   if(!autoWalk&&move.lengthSq()>0)travelYaw+=angleDelta(travelYaw,heading)*turn;
   traveled+=realSpeed*dt;
  }
  if(autoWalk&&realSpeed<.04&&move.lengthSq()>.25){setAuto(false);say("Let's linger here… or wander back together.");}
  actor.root.rotation.y=actorYaw;
  right.set(Math.cos(travelYaw),0,-Math.sin(travelYaw));
  const relative=target.subVectors(other.root.position,actor.root.position);
  const formationX=actor.root.position.x+right.x*1.16*formationSide;
  // On a reversal, keep the shoulder already occupied when the opposite slot is clear.
  const oppositeX=actor.root.position.x-right.x*1.16*formationSide;
  if(formationX<world.bounds.minX+.3||formationX>world.bounds.maxX-.3||
    (relative.dot(right)*formationSide<-.62&&oppositeX>world.bounds.minX+.42&&oppositeX<world.bounds.maxX-.42))formationSide*=-1;
  const forwardOffset=controlledRole==='male'?.16:-.16;
  desired.copy(actor.root.position).addScaledVector(right,1.16*formationSide);desired.x+=Math.sin(travelYaw)*forwardOffset;desired.z+=Math.cos(travelYaw)*forwardOffset;collide(desired,.3);
  // Steer around the leader's shoulder instead of cutting straight through the pair.
  const currentAngle=Math.atan2(relative.x,relative.z);
  const slotAngle=Math.atan2(desired.x-actor.root.position.x,desired.z-actor.root.position.z);
  const arc=angleDelta(currentAngle,slotAngle);
  if(Math.abs(arc)>.6){
   const lead=currentAngle+clamp(arc,-.6,.6);
   desired.set(actor.root.position.x+Math.sin(lead)*1.16,0,actor.root.position.z+Math.cos(lead)*1.16);
   collide(desired,.3);
  }
  target.subVectors(desired,other.root.position);const error=target.length();
  target.multiplyScalar(error<.045?0:2.8).add(actorVelocity).clampLength(0,1.65);
  otherVelocity.lerp(target,1-Math.exp(-dt*9));if(error<.065&&realSpeed<.03&&otherVelocity.length()<.10)otherVelocity.set(0,0,0);
  const ox=other.root.position.x,oz=other.root.position.z;other.root.position.addScaledVector(otherVelocity,dt);collide(other.root.position,.28);
  const sep=target.subVectors(other.root.position,actor.root.position),sepLen=sep.length();if(sepLen<.64&&sepLen>.001)other.root.position.addScaledVector(sep.normalize(),.64-sepLen);collide(other.root.position,.28);
  otherVelocity.set((other.root.position.x-ox)/dt,0,(other.root.position.z-oz)/dt);
  const otherSpeed=otherVelocity.length();
  const facingActor=Math.atan2(actor.root.position.x-other.root.position.x,actor.root.position.z-other.root.position.z);
  const walkingYaw=Math.atan2(otherVelocity.x,otherVelocity.z);
  const steady=THREE.MathUtils.smoothstep(realSpeed,.20,.85)*(1-THREE.MathUtils.smoothstep(error,.12,.68));
  const restYaw=travelYaw+(lookTogether||greeting>0?angleDelta(travelYaw,facingActor)*.48:0);
  const desiredYaw=otherSpeed>.10?walkingYaw+angleDelta(walkingYaw,travelYaw)*steady*.8:restYaw;
  otherYaw+=angleDelta(otherYaw,desiredYaw)*(1-Math.exp(-dt*5));other.root.rotation.y=otherYaw;
  if(controlledRole==='male'){playerYaw=actorYaw;companionYaw=otherYaw;}else{companionYaw=actorYaw;playerYaw=otherYaw;}
  const engaged=lookTogether||greeting>0;
  const femaleAttention=engaged||Math.sin(elapsed*.37)>(realSpeed<.05?.28:.72);
  const maleAttention=engaged||Math.sin(elapsed*.37-.36)>.92;
  companionLook=femaleAttention?clamp(angleDelta(companionYaw,Math.atan2(player.root.position.x-companion.root.position.x,player.root.position.z-companion.root.position.z)),-1.05,1.05):0;
  playerLook=maleAttention?clamp(angleDelta(playerYaw,Math.atan2(companion.root.position.x-player.root.position.x,companion.root.position.z-player.root.position.z)),-1.05,1.05):0;
  const maleSpeed=controlledRole==='male'?realSpeed:otherSpeed,femaleSpeed=controlledRole==='female'?realSpeed:otherSpeed;
  let eyePitch=0;
  if(femaleAttention||maleAttention){
   player.getGazeTarget(maleEye);companion.getGazeTarget(femaleEye);
   eyePitch=Math.atan2(femaleEye.y-maleEye.y,Math.max(.35,Math.hypot(femaleEye.x-maleEye.x,femaleEye.z-maleEye.z)));
  }
  const wave=greeting>0&&greeting<3.24;
  player.update(dt,elapsed,maleSpeed,playerLook,wave&&greetingResponder==='male',maleAttention?eyePitch:0,Number(engaged));
  companion.update(dt,elapsed,femaleSpeed,companionLook,wave&&greetingResponder==='female',femaleAttention?-eyePitch:0,Number(engaged));
  playerSteps+=maleSpeed*dt/.55;companionSteps+=femaleSpeed*dt/.52;
  if(Math.floor(playerSteps)>stepP){stepP=Math.floor(playerSteps);audio.step();}if(Math.floor(companionSteps)>stepC){stepC=Math.floor(companionSteps);audio.step(true);}
  if(greeting>0){greeting=Math.max(0,greeting-dt);if(!greeting)setGreetingBusy(false);}
  nextRemark-=dt;if(nextRemark<=0&&captionLeft<=0){nextRemark=24+((sayingIndex*7)%17);say(sayings[sayingIndex++%sayings.length],5.5);}
  if(captionLeft>0){captionLeft-=dt;if(captionLeft<=0)$('caption').classList.remove('visible');}
  const name=landmarks.find(l=>actor.root.position.z>=l.z)?.name??'The blossom avenue';
  if(place.textContent!==name)place.textContent=name;
  world.update(reduced?dt*.4:dt,reduced?elapsed*.4:elapsed,controlled().root.position);audio.update(dt,elapsed);
 }
 function cameraUpdate(dt:number,instant=false){
  const factor=instant?1:1-Math.exp(-dt*(reduced?12:5));
  if(cameraMode==='first'&&started&&!photo){
   const eyeHeight=controlled().getEyeHeight();
   target.copy(controlled().root.position);target.y=eyeHeight;
   camera.position.lerp(target,instant?1:1-Math.exp(-dt*24));
   if(lookTogether){partner().getGazeTarget(cameraPoint);}
   else cameraPoint.copy(camera.position).add(viewDirection.set(Math.sin(firstYaw)*Math.cos(firstPitch),Math.sin(firstPitch),Math.cos(firstYaw)*Math.cos(firstPitch)));
   lookMatrix.lookAt(camera.position,cameraPoint,camera.up);lookRotation.setFromRotationMatrix(lookMatrix);
   camera.quaternion.slerp(lookRotation,instant?1:1-Math.exp(-dt*10));focus.copy(controlled().root.position);focus.y=1.15;
   lighting.update(focus);return;
  }
  target.copy(player.root.position).add(companion.root.position).multiplyScalar(.5);target.y=1.15;
  if(started&&!reduced){target.addScaledVector(velocity,.105).addScaledVector(compVelocity,.105);}
  focus.lerp(target,factor);
  if(!started){yawTarget=Math.PI-.20;distanceTarget=6.0;target.x+=.75;focus.lerp(target,factor);}
  yaw+=angleDelta(yaw,yawTarget)*(instant?1:1-Math.exp(-dt*12));
  elevation=instant?elevationTarget:damp(elevation,elevationTarget,12,dt);
  const dx=player.root.position.x-companion.root.position.x,dz=player.root.position.z-companion.root.position.z;
  const lateral=Math.abs(dx*Math.cos(yaw)-dz*Math.sin(yaw))*.5+.38;
  const depth=Math.abs(dx*Math.sin(yaw)+dz*Math.cos(yaw))*.5;
  const tanHalfFov=Math.tan(THREE.MathUtils.degToRad(camera.fov*.5));
  const fit=depth+Math.max(1.15/tanHalfFov,lateral/(tanHalfFov*camera.aspect))/.87;
  const framedDistance=Math.max(distanceTarget,fit);
  distance=instant?framedDistance:damp(distance,framedDistance,9,dt);
  const safePitch=clearLowProps(focus,yaw,elevation,distance,world.colliders);
  clearPitch=instant||safePitch>clearPitch?safePitch:damp(clearPitch,safePitch,6,dt);
  const horizontal=Math.cos(clearPitch)*distance;
  cameraPoint.set(focus.x+Math.sin(yaw)*horizontal,focus.y+Math.sin(clearPitch)*distance,focus.z+Math.cos(yaw)*horizontal);
  cameraPoint.y=Math.max(1.8,cameraPoint.y);cameraPoint.x=clamp(cameraPoint.x,-6.6,6.6);cameraPoint.z=clamp(cameraPoint.z,-18,172);
  const clear=cameraClearance(focus,cameraPoint,world.colliders);
  armFraction=instant||clear<armFraction?clear:damp(armFraction,clear,5,dt);
  camera.position.lerpVectors(focus,cameraPoint,armFraction);
  camera.position.y=Math.max(camera.position.y,1.8);camera.lookAt(focus);
  lighting.update(focus);
 }
 function resize(){const w=innerWidth,h=innerHeight;camera.aspect=w/h;camera.fov=cameraMode==='first'?firstFov:w/h<.8?52:43;camera.updateProjectionMatrix();const dpr=Math.min(devicePixelRatio,quality==='cinematic'?2:quality==='high'?1.5:1);renderer.setPixelRatio(dpr);renderer.setSize(w,h);graphics.resize(w,h,dpr);}
 function savePhoto(){renderer.info.reset();graphics.render();const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height;const ctx=output.getContext('2d')!;ctx.drawImage(canvas,0,0);ctx.fillStyle='rgba(255,248,237,.9)';ctx.font=`${Math.max(14,output.width*.011)}px Georgia`;ctx.textAlign='right';ctx.fillText('Sakura Walk  /  a little further, together',output.width-35,output.height-30);output.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='sakura-walk-moment.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('A little piece of spring, saved.');},'image/png');}
 $('begin').addEventListener('click',()=>start());$('greet').addEventListener('click',greet);$('touch-greet').addEventListener('click',greet);$('stroll').addEventListener('click',()=>setAuto(!autoWalk));$('touch-stroll').addEventListener('click',()=>setAuto(!autoWalk));
 $('sound').addEventListener('click',toggleSound);$('pause').addEventListener('click',()=>setPause(true));$('photo').addEventListener('click',()=>photoMode(true));$('exit-photo').addEventListener('click',()=>photoMode(false));$('save-photo').addEventListener('click',savePhoto);
 $('resume').addEventListener('click',e=>{e.preventDefault();setPause(false);});settings.addEventListener('cancel',e=>{e.preventDefault();setPause(false);});$('reset').addEventListener('click',()=>{reset();setPause(false);say("Here we are, at the beginning again.");});
 $('view').addEventListener('click',()=>setCameraMode(cameraMode==='first'?'third':'first'));$('camera-view').addEventListener('change',e=>setCameraMode((e.target as HTMLSelectElement).value as CameraMode));$('look').addEventListener('click',()=>setLook(!lookTogether));$('touch-look').addEventListener('click',()=>setLook(!lookTogether));
 $('character').addEventListener('click',()=>setControlledRole(controlledRole==='male'?'female':'male'));$('controlled-character').addEventListener('change',e=>setControlledRole((e.target as HTMLSelectElement).value as ControlledRole));
 const volumeInput=$<HTMLInputElement>('volume'),musicInput=$<HTMLInputElement>('music');
 const reducedInput=$<HTMLInputElement>('reduced'),resolutionInput=$<HTMLSelectElement>('resolution');
 if(prefs.volume!==undefined)volumeInput.value=String(prefs.volume);
 if(prefs.music!==undefined)musicInput.checked=prefs.music;
 reducedInput.checked=reduced;
 audio.setVolume(Number(volumeInput.value)/100);
 audio.music=musicInput.checked;
 audio.setMuted(prefs.muted??false);
 syncSound();
 if(prefs.resolution){resolutionInput.value=prefs.resolution;graphics.setResolution(prefs.resolution);}
 volumeInput.addEventListener('input',()=>audio.setVolume(Number(volumeInput.value)/100));
 volumeInput.addEventListener('change',()=>savePreference('volume',Number(volumeInput.value)));
 musicInput.addEventListener('change',()=>{audio.music=musicInput.checked;savePreference('music',audio.music);});
 reducedInput.addEventListener('change',()=>{reduced=reducedInput.checked;savePreference('reduced',reduced);});
 warmthInput.addEventListener('input',()=>lighting.setWarmth(Number(warmthInput.value)/100));
 warmthInput.addEventListener('change',()=>savePreference('warmth',Number(warmthInput.value)));
 $('quality').addEventListener('change',e=>{
  const selection=(e.target as HTMLSelectElement).value as WalkPreferences['quality'];
  quality=selection;graphics.setQuality(quality);lighting.setQuality(quality);world.setQuality(quality);resize();savePreference('quality',selection);
 });
 resolutionInput.addEventListener('change',()=>{
  const mode=resolutionInput.value as ResolutionMode;
  graphics.setResolution(mode);savePreference('resolution',mode);
 });
 document.querySelector('.brand')!.addEventListener('click',e=>{e.preventDefault();if(started)setPause(true);});
 const movementCodes=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
 window.addEventListener('keydown',e=>{
  const target=e.target instanceof Element?e.target:null;
  if(e.defaultPrevented||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||target?.closest('input,select,textarea,[contenteditable=true]'))return;
  if((e.code==='Space'||e.code==='Enter')&&target?.closest('button,a[href]'))return;
  if(e.code==='Escape'){e.preventDefault();if(photo)photoMode(false);else if(started)setPause(!paused);return;}if(paused||!started)return;if(movementCodes.includes(e.code)){e.preventDefault();if(!photo){keys.add(e.code);setAuto(false);}}if(e.repeat)return;if(e.code==='KeyV'){e.preventDefault();setCameraMode(cameraMode==='first'?'third':'first');}if(e.code==='KeyC'){e.preventDefault();setControlledRole(controlledRole==='male'?'female':'male');}if(e.code==='KeyQ'){e.preventDefault();setLook(!lookTogether);}if(e.code==='KeyN'){e.preventDefault();setNight(nightTarget<.5);}if(e.code==='KeyP'){e.preventDefault();photoMode(!photo);}if(photo)return;if(e.code==='Space'){e.preventDefault();setAuto(!autoWalk);}if(e.code==='KeyE')greet();if(e.code==='KeyM')toggleSound();});
 function background(){resetInput();if(photoReturn)photoReturn.auto=false;if(started&&!paused&&!photo)setPause(true);}
 window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',background);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)background();});
 canvas.addEventListener('pointerdown',e=>{
  if(!started||paused||orbitPointers.size>=2)return;
  orbitPointers.set(e.pointerId,new THREE.Vector2(e.clientX,e.clientY));canvas.setPointerCapture(e.pointerId);
 });
 canvas.addEventListener('pointermove',e=>{
  const point=orbitPointers.get(e.pointerId);if(!point)return;
  const dx=e.clientX-point.x,dy=e.clientY-point.y;
  if(orbitPointers.size===2){
   const [a,b]=orbitPointers.values(),before=a.distanceTo(b);
   point.set(e.clientX,e.clientY);const after=a.distanceTo(b);
   if(before>8&&after>8){
    if(cameraMode==='first'){firstFov=clamp(firstFov*before/after,55,80);camera.fov=firstFov;camera.updateProjectionMatrix();}
    else distanceTarget=clamp(distanceTarget*before/after,3.1,9);
   }
   return;
  }
  point.set(e.clientX,e.clientY);if(!dx&&!dy)return;
  if(cameraMode==='first'){
   if(lookTogether){camera.getWorldDirection(viewDirection);firstYaw=Math.atan2(viewDirection.x,viewDirection.z);firstPitch=Math.asin(viewDirection.y);lookTogether=false;syncView();}
   firstYaw-=dx*.004;firstPitch=clamp(firstPitch-dy*.003,-.50,.55);
  }else{yawTarget-=dx*.005;elevationTarget=clamp(elevationTarget+dy*.003,.15,.85);}
 });
 for(const event of ['pointerup','pointercancel','lostpointercapture'] as const)canvas.addEventListener(event,e=>orbitPointers.delete(e.pointerId));
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('wheel',e=>{e.preventDefault();if(started&&!paused){if(cameraMode==='first'){firstFov=clamp(firstFov+e.deltaY*.02,55,80);resize();}else distanceTarget=clamp(distanceTarget+e.deltaY*.005,3.1,9);}},{passive:false});
 const joystick=$('joystick');const moveStick=(e:PointerEvent)=>{const r=joystick.getBoundingClientRect();touch.set((e.clientX-r.left-r.width/2)/35,(e.clientY-r.top-r.height/2)/35);if(touch.length()>1)touch.normalize();$('stick').style.transform=`translate(${touch.x*30}px,${touch.y*30}px)`;};
 joystick.addEventListener('pointerdown',e=>{if(stickId!==null)return;stickId=e.pointerId;joystick.setPointerCapture(e.pointerId);setAuto(false);moveStick(e);});joystick.addEventListener('pointermove',e=>{if(e.pointerId===stickId)moveStick(e);});
 for(const event of ['pointerup','pointercancel','lostpointercapture'] as const)joystick.addEventListener(event,e=>{if(e.pointerId===stickId){stickId=null;touch.set(0,0);$('stick').style.transform='';}});
 window.addEventListener('resize',resize);reset();resize();
 if(prefs.role)setControlledRole(prefs.role,false);
 $('begin-label').textContent='Walk with Haruka';$<HTMLButtonElement>('begin').disabled=false;
 const debug=new URLSearchParams(location.search).has('qa');
 const diagnostics=()=>({frame,elapsed,started,paused,photo,autoWalk,traveled,cameraMode,controlledRole,lookTogether,companionLook,playerLook,companionVisible:companion.root.visible,playerVisible:player.root.visible,player:{x:player.root.position.x,y:0,z:player.root.position.z,yaw:playerYaw,speed:velocity.length()},companion:{x:companion.root.position.x,y:0,z:companion.root.position.z,yaw:companionYaw,speed:compVelocity.length(),separation:player.root.position.distanceTo(companion.root.position),greeting},camera:{x:camera.position.x,y:camera.position.y,z:camera.position.z,elevation,distance,yaw,firstYaw,firstPitch,fov:camera.fov},audio:audio.diagnostics,fps:1000/frameMs,quality,timeOfDay:nightTarget?'moonlight':'daylight',nightBlend,lighting:lighting.diagnostics(),graphics:graphics.diagnostics(),environment:world.diagnostics,playerModel:player.root.userData.character,companionModel:companion.root.userData.character,seed:seedValue,physics:{engine:'kinematic circle collision',timestep:1/60,colliders:world.colliders.length},renderer:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures}});
 if(debug){const win=window as unknown as Record<string,unknown>;win.__THREE_GAME_DIAGNOSTICS__={get renderer(){return diagnostics().renderer;},get state(){return diagnostics();}};win.__SAKURA__={state:diagnostics};win.__THREE_GAME_TEST_HOOKS__={seed:(n:number)=>{seedValue=n;elapsed=0;nextRemark=15;sayingIndex=0;},setReducedMotion:(v:boolean)=>reduced=v,hideDebugUi:()=>{},setPausedForScreenshot:(v:boolean)=>{frozen=v;accumulator=0;},setGpuTimerEnabled:(v:boolean)=>graphics.setGpuTimerEnabled(v),setState:async(requested:string)=>{const isNight=requested.startsWith('night-');const name=requested.replace(/^(day|night)-/,'');setNight(isNight,true);
   if(!['active-play','companion-close','vista','pause','welcome','first-person','first-person-together'].includes(name))throw new Error(`Unsupported capture state: ${name}`);frozen=false;photo=false;document.body.classList.remove('photo-mode');$('photo-tools').hidden=true;setPause(false);setControlledRole('male',false);setCameraMode('third',false);reset();
   if(name==='welcome'){started=false;brand.disabled=true;canvas.tabIndex=-1;document.body.classList.remove('started');$('welcome').hidden=false;$('controls').hidden=true;$('top-actions').hidden=true;$('touch-controls').hidden=true;}else{start(false);}
   if(name==='active-play'){
    elapsed=7;
    const speeds=Array.from({length:180},(_,i)=>1.1*THREE.MathUtils.smoothstep(i,0,32));
    const runUp=speeds.reduce((sum,speed)=>sum+speed/60,0);
    player.root.position.z=14-runUp;companion.root.position.z=14.1-runUp;
    player.resetMotion();companion.resetMotion();
    speeds.forEach((speed,i)=>{
     const t=elapsed-(speeds.length-1-i)/60;
     player.root.position.z+=speed/60;companion.root.position.z+=speed/60;
     player.update(1/60,t,speed);companion.update(1/60,t,speed,-.25);
    });
   }
   if(name==='companion-close'){elapsed=10;player.root.position.z=8;companion.root.position.z=8.1;yaw=yawTarget=.42;distance=distanceTarget=innerWidth<650?6.2:3.9;elevation=elevationTarget=.17;for(let pose=0;pose<100;pose++){companion.update(1/60,elapsed+pose/60,0,-.2,false);player.update(1/60,elapsed+pose/60,0,.1);}}
   if(name==='vista'){
    player.root.position.z=140;companion.root.position.z=140.1;elapsed=15;
    player.resetMotion();companion.resetMotion();
    for(let i=0;i<90;i++){player.update(1/60,elapsed-(89-i)/60,0);companion.update(1/60,elapsed-(89-i)/60,0,-.3);}
   }
   if(name==='first-person'||name==='first-person-together'){player.root.position.set(-.62,0,14);companion.root.position.set(.54,0,14.22);elapsed=9;setCameraMode('first',false);lookTogether=name==='first-person-together';companion.root.rotation.y=-.45;for(let i=0;i<100;i++){player.update(1/60,9+i/60,0);companion.update(1/60,9+i/60,0,-.9,true);}syncView();}
   $('caption').classList.remove('visible');captionLeft=0;focus.copy(player.root.position).add(companion.root.position).multiplyScalar(.5);focus.y=1.15;for(let settle=0;settle<45;settle++)world.update(1/60,elapsed,focus);cameraUpdate(1,true);if(name==='pause')setPause(true);return {state:requested};}};}
 function animate(now:number){requestAnimationFrame(animate);const raw=Math.min((now-lastFrame)/1000,.1);lastFrame=now;if(!frozen&&Math.abs(nightBlend-nightTarget)>.0001){nightBlend=damp(nightBlend,nightTarget,1.25,raw);if(Math.abs(nightBlend-nightTarget)<.0001)nightBlend=nightTarget;applyNight();}frameMs=damp(frameMs,Math.min(raw*1000,100),2,raw);if(!paused&&!photo&&!frozen){accumulator+=raw;while(accumulator>=1/60){step(1/60);accumulator-=1/60;}}else accumulator=0;if(!frozen)cameraUpdate(raw);renderer.info.reset();graphics.render(raw,!paused&&!photo&&!frozen&&!document.hidden&&Math.abs(nightBlend-nightTarget)<.02);}
 requestAnimationFrame(animate);
}
$('retry').addEventListener('click',()=>location.reload());
boot().catch(error=>{
 console.error(error);
 $('welcome').hidden=true;
 $('chapter').hidden=true;
 $('error').hidden=false;
 $('retry').focus({preventScroll:true});
});
