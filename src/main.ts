import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCharacter, type Character } from './character';
import { createEnvironment } from './environment';
import { Soundscape } from './audio';
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
 const canvas=$<HTMLCanvasElement>('world');
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
 renderer.setClearColor(0xf2e2d9);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.info.autoReset=false;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#eddcda');scene.fog=new THREE.FogExp2('#ead2d0',.009);
 const camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.08,230);
 const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();const env=pmrem.fromScene(room,.08);scene.environment=env.texture;scene.environmentIntensity=.25;room.dispose();pmrem.dispose();
 const hemi=new THREE.HemisphereLight('#ffede0','#728782',1.35);scene.add(hemi);
 const sun=new THREE.DirectionalLight('#ffdfb2',2.25);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-14,right:14,top:15,bottom:-13,near:1,far:42});sun.shadow.bias=-.00028;sun.shadow.normalBias=.035;sun.shadow.radius=3;scene.add(sun,sun.target);
 const fill=new THREE.DirectionalLight('#e8e4ff',.45);fill.position.set(7,5,-9);scene.add(fill);
 const sky=new THREE.Mesh(new THREE.SphereGeometry(200,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#a8c8ce')},bottom:{value:new THREE.Color('#fff1da')}},vertexShader:'varying vec3 vP; void main(){vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vP; uniform vec3 top; uniform vec3 bottom; void main(){float h=clamp(normalize(vP).y,0.,1.);vec3 c=mix(bottom,top,pow(h,.6));gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}));sky.renderOrder=-10;scene.add(sky);
 const world=createEnvironment(scene);
 const [player,companion]=await Promise.all([createCharacter('player'),createCharacter('companion')]);scene.add(player.root,companion.root);
 const composer=new EffectComposer(renderer);composer.renderTarget1.samples=4;composer.renderTarget2.samples=4;composer.addPass(new RenderPass(scene,camera));
 const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.16,.48,1.1);composer.addPass(bloom);composer.addPass(new OutputPass());
 let quality='high',started=false,paused=false,photo=false,frozen=false,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let elapsed=0,frame=0,accumulator=0,autoWalk=false,greeting=0,nextRemark=15,captionLeft=0,toastLeft=0;
 let playerYaw=0,companionYaw=0,yaw=Math.PI+.17,yawTarget=yaw,elevation=.17,elevationTarget=.17,distance=5.6,distanceTarget=5.6;
 let formationSide=1;let traveled=0,playerSteps=0,companionSteps=0,stepP=0,stepC=0,seedValue=42;
 type CameraMode='third'|'first';
 let cameraMode:CameraMode='third',lookTogether=false,firstYaw=0,firstPitch=-.04,firstFov=68;
 let photoPreviousMode:CameraMode='third',previousLook=false,companionLook=0;
 const velocity=new THREE.Vector3(),compVelocity=new THREE.Vector3(),move=new THREE.Vector3(),desired=new THREE.Vector3(),right=new THREE.Vector3(),target=new THREE.Vector3(),focus=new THREE.Vector3(),cameraPoint=new THREE.Vector3();
 const keys=new Set<string>(),touch=new THREE.Vector2();const audio=new Soundscape();let lastFrame=performance.now(),frameMs=16.7;
 const coarse=matchMedia('(pointer: coarse)').matches;let pointerId:number|null=null,lastX=0,lastY=0,stickId:number|null=null;
 const settings=$<HTMLDialogElement>('settings');
 const sayings=["I'm glad we took the long way.","Listen… even the breeze is taking its time.","We don't have to be anywhere else just yet.","The petals look like little pieces of the sky.","Shall we walk a little further together?"];
 let sayingIndex=0;
 function say(text:string,duration=6){$('caption').querySelector('p')!.textContent=text;$('caption').classList.add('visible');captionLeft=duration;}
 function toast(text:string){$('toast').textContent=text;$('toast').classList.add('visible');toastLeft=3;}
 function syncSound(){$('sound').innerHTML=icon(audio.muted?icons.mute:icons.sound);$('sound').setAttribute('aria-label',audio.muted?'Enable sound':'Mute sound');}
 function setAuto(value:boolean){autoWalk=value;$('stroll').setAttribute('aria-pressed',String(value));$('touch-stroll').setAttribute('aria-pressed',String(value));}
 function resetInput(){keys.clear();touch.set(0,0);$('stick').style.transform='';pointerId=null;stickId=null;setAuto(false);}
 function syncView(){document.body.classList.toggle('first-person',cameraMode==='first');$('view').textContent=cameraMode==='first'?'1P':'3P';$('view').setAttribute('aria-label',cameraMode==='first'?'Switch to third-person view (V)':'Switch to first-person view (V)');$<HTMLSelectElement>('camera-view').value=cameraMode;for(const id of ['look','touch-look'])$(id).setAttribute('aria-pressed',String(lookTogether));player.root.visible=cameraMode!=='first';}
 function setCameraMode(mode:CameraMode,notify=true){if(photo)return;cameraMode=mode;lookTogether=false;firstYaw=playerYaw;firstPitch=-.04;if(mode==='third'){yaw=yawTarget=playerYaw+Math.PI;elevation=elevationTarget=.19;}resetInput();syncView();resize();cameraUpdate(1,true);if(notify)toast(mode==='first'?'First person · Q to look at Haruka · V to switch':'Third person · Drag to orbit · V to switch');}
 function setLook(value:boolean){if(cameraMode!=='first'||photo||paused)return;lookTogether=value;syncView();if(value)toast('Walking together · drag to look freely');}
 function reset(){player.root.position.set(-.72,0,0);companion.root.position.set(.72,0,.1);playerYaw=companionYaw=0;player.root.rotation.y=companion.root.rotation.y=0;velocity.set(0,0,0);compVelocity.set(0,0,0);yawTarget=yaw=Math.PI+.17;elevationTarget=elevation=.17;distanceTarget=distance=innerWidth<650?7.6:5.6;focus.set(0,1.12,0);formationSide=1;traveled=0;playerSteps=companionSteps=stepP=stepC=0;greeting=0;firstYaw=0;firstPitch=-.04;lookTogether=false;syncView();resetInput();cameraUpdate(1,true);}
 function start(withSound=true){if(started)return;started=true;document.body.classList.add('started');$('welcome').hidden=true;$('controls').hidden=false;$('top-actions').hidden=false;$('touch-controls').hidden=!coarse;if(withSound)void audio.unlock().catch(()=>toast('Sound is unavailable in this browser.'));say("There you are. Shall we?",6);canvas.focus();}
 function setPause(value:boolean){paused=value;resetInput();void audio.pause(value||photo);if(value&&!settings.open)settings.showModal();if(!value&&settings.open)settings.close();}
 function photoMode(value:boolean){if(!started||paused)return;if(value){photoPreviousMode=cameraMode;previousLook=lookTogether;if(cameraMode==='first')setCameraMode('third',false);}photo=value;resetInput();document.body.classList.toggle('photo-mode',value);$('photo-tools').hidden=!value;void audio.pause(value);if(value)toast('Drag to compose · Scroll to frame');else{setCameraMode(photoPreviousMode,false);lookTogether=previousLook;syncView();}}
 function greet(){if(!started||paused||photo||greeting>0)return;greeting=3.5;audio.chime();say(sayings[sayingIndex++%sayings.length],6);}
 function collide(p:THREE.Vector3,r=.27){p.x=clamp(p.x,world.bounds.minX+r,world.bounds.maxX-r);p.z=clamp(p.z,world.bounds.minZ+r,world.bounds.maxZ-r);for(const c of world.colliders){const dx=p.x-c.x,dz=p.z-c.z,d2=dx*dx+dz*dz,rr=r+c.radius;if(d2<rr*rr&&d2>.000001){const k=rr/Math.sqrt(d2);p.x=c.x+dx*k;p.z=c.z+dz*k;}}}
 function step(dt:number){
  elapsed+=dt;frame++;
  if(!started){player.update(dt,elapsed,0,0,false);companion.update(dt,elapsed,0,-.14,Math.sin(elapsed*.2)>.99);world.update(dt,elapsed,focus);return;}
  let ix=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x;
  let iy=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-touch.y;
  if(autoWalk&&Math.abs(ix)+Math.abs(iy)<.05){move.set(Math.sin(playerYaw),0,Math.cos(playerYaw));}
  else if(cameraMode==='first'){move.set(Math.sin(firstYaw)*iy-Math.cos(firstYaw)*ix,0,Math.cos(firstYaw)*iy+Math.sin(firstYaw)*ix);}
  else{move.set(-Math.sin(yaw)*iy+Math.cos(yaw)*ix,0,-Math.cos(yaw)*iy-Math.sin(yaw)*ix);}
  if(move.length()>1)move.normalize();
  velocity.lerp(move.multiplyScalar(1.12),1-Math.exp(-dt*7.5));if(velocity.length()<.005)velocity.set(0,0,0);
  const oldX=player.root.position.x,oldZ=player.root.position.z;player.root.position.addScaledVector(velocity,dt);collide(player.root.position);
  const realSpeed=Math.hypot(player.root.position.x-oldX,player.root.position.z-oldZ)/dt;
  if(realSpeed>.03){playerYaw+=angleDelta(playerYaw,Math.atan2(velocity.x,velocity.z))*(1-Math.exp(-dt*8));traveled+=realSpeed*dt;}
  if(autoWalk&&realSpeed<.04&&velocity.length()>.4){setAuto(false);say("Let's linger here… or wander back together.");}
  player.root.rotation.y=playerYaw;
  right.set(Math.cos(playerYaw),0,-Math.sin(playerYaw));const formationX=player.root.position.x+right.x*1.16*formationSide;if(formationX<world.bounds.minX+.3||formationX>world.bounds.maxX-.3)formationSide*=-1;desired.copy(player.root.position).addScaledVector(right,1.16*formationSide);desired.x+=Math.sin(playerYaw)*.22;desired.z+=Math.cos(playerYaw)*.22;collide(desired,.3);
  target.subVectors(desired,companion.root.position);const error=target.length();
  // Share the player's velocity immediately, with a small formation correction.
  // This removes the steady trailing error of a pure chase controller.
  target.multiplyScalar(error<.045?0:3.4);if(realSpeed>.015)target.addScaledVector(velocity,realSpeed/Math.max(.01,velocity.length()));target.clampLength(0,1.9);
  compVelocity.lerp(target,1-Math.exp(-dt*12));if(error<.055&&realSpeed<.03&&compVelocity.length()<.10)compVelocity.set(0,0,0);
  const cx=companion.root.position.x,cz=companion.root.position.z;companion.root.position.addScaledVector(compVelocity,dt);collide(companion.root.position,.28);
  const sep=target.subVectors(companion.root.position,player.root.position);const sepLen=sep.length();if(sepLen<.64&&sepLen>.001)companion.root.position.addScaledVector(sep.normalize(),.64-sepLen);collide(companion.root.position,.28);
  const cSpeed=Math.hypot(companion.root.position.x-cx,companion.root.position.z-cz)/dt;
  const facingPlayer=Math.atan2(player.root.position.x-companion.root.position.x,player.root.position.z-companion.root.position.z);
  const desiredYaw=cSpeed>.10?Math.atan2(compVelocity.x,compVelocity.z):playerYaw+(lookTogether||greeting>0?angleDelta(playerYaw,facingPlayer)*.45:0);
  companionYaw+=angleDelta(companionYaw,desiredYaw)*(1-Math.exp(-dt*6));companion.root.rotation.y=companionYaw;
  const toPlayer=Math.atan2(player.root.position.x-companion.root.position.x,player.root.position.z-companion.root.position.z);
  const attention=lookTogether||greeting>0||realSpeed<.05||Math.sin(elapsed*.37)>.72;
  const look=attention?clamp(angleDelta(companionYaw,toPlayer),-1.05,1.05):0;companionLook=look;
  player.update(dt,elapsed,realSpeed,realSpeed<.03?.14:0,false);companion.update(dt,elapsed,cSpeed,look,greeting>0);
  playerSteps+=realSpeed*dt/.55;companionSteps+=cSpeed*dt/.52;
  if(Math.floor(playerSteps)>stepP){stepP=Math.floor(playerSteps);audio.step();}if(Math.floor(companionSteps)>stepC){stepC=Math.floor(companionSteps);audio.step(true);}
  if(greeting>0)greeting=Math.max(0,greeting-dt);
  nextRemark-=dt;if(nextRemark<=0){nextRemark=24+((sayingIndex*7)%17);say(sayings[sayingIndex++%sayings.length],5.5);}
  captionLeft-=dt;if(captionLeft<=0)$('caption').classList.remove('visible');toastLeft-=dt;if(toastLeft<=0)$('toast').classList.remove('visible');
  const landmark=[...world.landmarks].reverse().find(l=>player.root.position.z>=l.z);$('place').textContent=landmark?.name??'The blossom avenue';
  world.update(reduced?dt*.4:dt,reduced?elapsed*.4:elapsed,player.root.position);audio.update(dt,elapsed);
 }
 function cameraUpdate(dt:number,instant=false){
  const factor=instant?1:1-Math.exp(-dt*(reduced?12:5));
  if(cameraMode==='first'&&started&&!photo){
   const eyeHeight=player.getEyeHeight?.()??1.65;
   target.copy(player.root.position);target.y=eyeHeight;
   camera.position.lerp(target,instant?1:1-Math.exp(-dt*24));
   if(lookTogether){if(companion.getGazeTarget)companion.getGazeTarget(cameraPoint);else cameraPoint.copy(companion.root.position).add(new THREE.Vector3(0,1.5,0));}
   else cameraPoint.copy(camera.position).add(new THREE.Vector3(Math.sin(firstYaw)*Math.cos(firstPitch),Math.sin(firstPitch),Math.cos(firstYaw)*Math.cos(firstPitch)));
   const lookMatrix=new THREE.Matrix4().lookAt(camera.position,cameraPoint,camera.up),lookQuaternion=new THREE.Quaternion().setFromRotationMatrix(lookMatrix);
   camera.quaternion.slerp(lookQuaternion,instant?1:1-Math.exp(-dt*10));focus.copy(player.root.position);focus.y=1.15;
   sun.position.set(focus.x-7,11,focus.z+5);sun.target.position.set(focus.x,0,focus.z);sun.target.updateMatrixWorld();sky.position.set(focus.x,0,focus.z);return;
  }
  target.copy(player.root.position).add(companion.root.position).multiplyScalar(.5);target.y=1.15;
  focus.lerp(target,factor);
  if(!started){yawTarget=Math.PI-.20;distanceTarget=6.0;target.x+=.75;focus.lerp(target,factor);}
  yaw+=angleDelta(yaw,yawTarget)*(instant?1:1-Math.exp(-dt*12));elevation=damp(elevation,elevationTarget,12,instant?1:dt);distance=damp(distance,distanceTarget,9,instant?1:dt);
  const horizontal=Math.cos(elevation)*distance;
  cameraPoint.set(focus.x+Math.sin(yaw)*horizontal,focus.y+Math.sin(elevation)*distance,focus.z+Math.cos(yaw)*horizontal);
  cameraPoint.y=Math.max(1.8,cameraPoint.y);cameraPoint.x=clamp(cameraPoint.x,-4.05,4.05);cameraPoint.z=clamp(cameraPoint.z,-14,172);
  for(const c of world.colliders){const dx=cameraPoint.x-c.x,dz=cameraPoint.z-c.z;const rr=c.radius+.28;if(dx*dx+dz*dz<rr*rr){const len=Math.max(.001,Math.hypot(dx,dz));cameraPoint.x=c.x+dx/len*rr;cameraPoint.z=c.z+dz/len*rr;}}
  camera.position.copy(cameraPoint);camera.lookAt(focus);
  sun.position.set(focus.x-7,11,focus.z+5);sun.target.position.set(focus.x,0,focus.z);sun.target.updateMatrixWorld();sky.position.set(focus.x,0,focus.z);
 }
 function resize(){const w=innerWidth,h=innerHeight;camera.aspect=w/h;camera.fov=cameraMode==='first'?firstFov:w/h<.8?52:43;camera.updateProjectionMatrix();const dpr=Math.min(devicePixelRatio,quality==='high'?1.5:1);renderer.setPixelRatio(dpr);renderer.setSize(w,h);composer.setPixelRatio(dpr);composer.setSize(w,h);}
 function savePhoto(){renderer.info.reset();composer.render();const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height;const ctx=output.getContext('2d')!;ctx.drawImage(canvas,0,0);ctx.fillStyle='rgba(255,248,237,.9)';ctx.font=`${Math.max(14,output.width*.011)}px Georgia`;ctx.textAlign='right';ctx.fillText('Sakura Walk  /  a little further, together',output.width-35,output.height-30);output.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='sakura-walk-moment.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('A little piece of spring, saved.');},'image/png');}
 $('begin').addEventListener('click',()=>start());$('greet').addEventListener('click',greet);$('touch-greet').addEventListener('click',greet);$('stroll').addEventListener('click',()=>setAuto(!autoWalk));$('touch-stroll').addEventListener('click',()=>setAuto(!autoWalk));
 $('sound').addEventListener('click',()=>{audio.setMuted(!audio.muted);syncSound();});$('pause').addEventListener('click',()=>setPause(true));$('photo').addEventListener('click',()=>photoMode(true));$('exit-photo').addEventListener('click',()=>photoMode(false));$('save-photo').addEventListener('click',savePhoto);
 $('resume').addEventListener('click',e=>{e.preventDefault();setPause(false);canvas.focus();});settings.addEventListener('cancel',e=>{e.preventDefault();setPause(false);});$('reset').addEventListener('click',()=>{reset();setPause(false);say("Here we are, at the beginning again.");});
 $('view').addEventListener('click',()=>setCameraMode(cameraMode==='first'?'third':'first'));$('camera-view').addEventListener('change',e=>setCameraMode((e.target as HTMLSelectElement).value as CameraMode));$('look').addEventListener('click',()=>setLook(!lookTogether));$('touch-look').addEventListener('click',()=>setLook(!lookTogether));
 $('volume').addEventListener('input',e=>audio.setVolume(Number((e.target as HTMLInputElement).value)/100));$('music').addEventListener('change',e=>audio.music=(e.target as HTMLInputElement).checked);
 $<HTMLInputElement>('reduced').checked=reduced;$('reduced').addEventListener('change',e=>reduced=(e.target as HTMLInputElement).checked);
 $('sunlight').addEventListener('input',e=>{const v=Number((e.target as HTMLInputElement).value)/100;sun.color.set('#fff0d2').lerp(new THREE.Color('#ffbc87'),v);sun.intensity=2.7-v*.45;scene.fog!.color.set('#eddddd').lerp(new THREE.Color('#efd2c7'),v);});
 $('quality').addEventListener('change',e=>{quality=(e.target as HTMLSelectElement).value;bloom.enabled=quality==='high';sun.shadow.mapSize.setScalar(quality==='high'?2048:1024);sun.shadow.map?.dispose();sun.shadow.map=null;resize();});
 document.querySelector('.brand')!.addEventListener('click',e=>{e.preventDefault();if(started)setPause(true);});
 const movementCodes=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
 window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes((e.target as HTMLElement)?.tagName))return;if(e.code==='Escape'){e.preventDefault();if(photo)photoMode(false);else if(started)setPause(!paused);return;}if(paused||!started)return;if(movementCodes.includes(e.code)){e.preventDefault();if(!photo){keys.add(e.code);setAuto(false);}}if(e.repeat)return;if(e.code==='KeyV'){e.preventDefault();setCameraMode(cameraMode==='first'?'third':'first');}if(e.code==='KeyQ'){e.preventDefault();setLook(!lookTogether);}if(e.code==='KeyP'){e.preventDefault();photoMode(!photo);}if(photo)return;if(e.code==='Space'){e.preventDefault();setAuto(!autoWalk);}if(e.code==='KeyE')greet();if(e.code==='KeyM'){audio.setMuted(!audio.muted);syncSound();}});
 window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{resetInput();if(started&&!paused&&!photo)setPause(true);});document.addEventListener('visibilitychange',()=>{if(document.hidden&&started&&!photo)setPause(true);});
 canvas.addEventListener('pointerdown',e=>{if(!started||paused)return;pointerId=e.pointerId;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(e.pointerId!==pointerId)return;if(cameraMode==='first'){if(lookTogether){const direction=camera.getWorldDirection(new THREE.Vector3());firstYaw=Math.atan2(direction.x,direction.z);firstPitch=Math.asin(direction.y);lookTogether=false;syncView();}firstYaw-=(e.clientX-lastX)*.004;firstPitch=clamp(firstPitch-(e.clientY-lastY)*.003,-.50,.55);}else{yawTarget-=(e.clientX-lastX)*.005;elevationTarget=clamp(elevationTarget+(e.clientY-lastY)*.003,.15,.85);}lastX=e.clientX;lastY=e.clientY;});
 const endPointer=()=>{pointerId=null;};canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);canvas.addEventListener('lostpointercapture',endPointer);canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('wheel',e=>{e.preventDefault();if(started&&!paused){if(cameraMode==='first'){firstFov=clamp(firstFov+e.deltaY*.02,55,80);resize();}else distanceTarget=clamp(distanceTarget+e.deltaY*.005,3.1,9);}},{passive:false});
 const joystick=$('joystick');const moveStick=(e:PointerEvent)=>{const r=joystick.getBoundingClientRect();touch.set((e.clientX-r.left-r.width/2)/35,(e.clientY-r.top-r.height/2)/35);if(touch.length()>1)touch.normalize();$('stick').style.transform=`translate(${touch.x*30}px,${touch.y*30}px)`;};
 joystick.addEventListener('pointerdown',e=>{stickId=e.pointerId;joystick.setPointerCapture(e.pointerId);setAuto(false);moveStick(e);});joystick.addEventListener('pointermove',e=>{if(e.pointerId===stickId)moveStick(e);});for(const event of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(event,()=>{stickId=null;touch.set(0,0);$('stick').style.transform='';});
 window.addEventListener('resize',resize);reset();resize();$('begin-label').textContent='Walk with Haruka';$<HTMLButtonElement>('begin').disabled=false;
 const debug=new URLSearchParams(location.search).has('qa');
 const diagnostics=()=>({frame,elapsed,started,paused,photo,autoWalk,traveled,cameraMode,lookTogether,companionLook,playerVisible:player.root.visible,player:{x:player.root.position.x,y:0,z:player.root.position.z,yaw:playerYaw,speed:velocity.length()},companion:{x:companion.root.position.x,y:0,z:companion.root.position.z,yaw:companionYaw,speed:compVelocity.length(),separation:player.root.position.distanceTo(companion.root.position),greeting},camera:{x:camera.position.x,y:camera.position.y,z:camera.position.z,elevation,distance,yaw,firstYaw,firstPitch,fov:camera.fov},audio:audio.diagnostics,fps:1000/frameMs,quality,playerModel:player.root.userData.character,companionModel:companion.root.userData.character,seed:seedValue,physics:{engine:'kinematic circle collision',timestep:1/60,colliders:world.colliders.length},renderer:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures}});
 if(debug){const win=window as unknown as Record<string,unknown>;win.__THREE_GAME_DIAGNOSTICS__={get renderer(){return diagnostics().renderer;},get state(){return diagnostics();}};win.__SAKURA__={state:diagnostics};win.__THREE_GAME_TEST_HOOKS__={seed:(n:number)=>{seedValue=n;elapsed=0;nextRemark=15;sayingIndex=0;},setReducedMotion:(v:boolean)=>reduced=v,hideDebugUi:()=>{},setPausedForScreenshot:(v:boolean)=>{frozen=v;accumulator=0;},setState:async(name:string)=>{
   if(!['active-play','companion-close','vista','pause','welcome','first-person','first-person-together'].includes(name))throw new Error(`Unsupported capture state: ${name}`);frozen=false;photo=false;document.body.classList.remove('photo-mode');$('photo-tools').hidden=true;setPause(false);setCameraMode('third',false);reset();
   if(name==='welcome'){started=false;document.body.classList.remove('started');$('welcome').hidden=false;$('controls').hidden=true;$('top-actions').hidden=true;$('touch-controls').hidden=true;}else{start(false);}
   if(name==='active-play'){elapsed=7;player.root.position.z=14;companion.root.position.z=14.1;for(let pose=0;pose<42;pose++){player.update(1/60,elapsed+pose/60,1.1,0);companion.update(1/60,elapsed+pose/60,1.1,-.25);}}
   if(name==='companion-close'){elapsed=10;player.root.position.z=8;companion.root.position.z=8.1;yaw=yawTarget=.42;distance=distanceTarget=innerWidth<650?6.2:3.9;elevation=elevationTarget=.17;for(let pose=0;pose<100;pose++){companion.update(1/60,elapsed+pose/60,0,-.2,false);player.update(1/60,elapsed+pose/60,0,.1);}}
   if(name==='vista'){player.root.position.z=140;companion.root.position.z=140.1;elapsed=15;player.update(1,elapsed,0);companion.update(1,elapsed,0,-.3);}
   if(name==='first-person'||name==='first-person-together'){player.root.position.set(-.62,0,14);companion.root.position.set(.54,0,14.22);elapsed=9;setCameraMode('first',false);lookTogether=name==='first-person-together';companion.root.rotation.y=-.45;for(let i=0;i<100;i++){player.update(1/60,9+i/60,0);companion.update(1/60,9+i/60,0,-.9,true);}syncView();}
   $('caption').classList.remove('visible');captionLeft=0;focus.copy(player.root.position).add(companion.root.position).multiplyScalar(.5);focus.y=1.15;world.update(0,elapsed,focus);cameraUpdate(1,true);if(name==='pause')setPause(true);return {state:name};}};}
 function animate(now:number){requestAnimationFrame(animate);const raw=Math.min((now-lastFrame)/1000,.1);lastFrame=now;frameMs=damp(frameMs,Math.min(raw*1000,100),2,raw);if(!paused&&!photo&&!frozen){accumulator+=raw;while(accumulator>=1/60){step(1/60);accumulator-=1/60;}}else accumulator=0;if(!frozen)cameraUpdate(raw);renderer.info.reset();if(quality==='high')composer.render();else renderer.render(scene,camera);}
 requestAnimationFrame(animate);
}
boot().catch(error=>{console.error(error);$('error').hidden=false;$('error').textContent=`The walk couldn't start. Please use a modern browser with WebGL enabled. ${error instanceof Error?error.message:String(error)}`;});
