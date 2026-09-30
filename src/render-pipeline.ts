import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AtmospherePass } from './atmosphere-pass';
import { ResolutionOutput } from './resolution-output';
import { AdaptiveResolution, GpuTimer, type ResolutionMode } from './adaptive-resolution';

/** Use the actual opaque/alpha-tested beauty depth, including custom avatar masks. */
class BeautyDepthAO extends GTAOPass {
  resolutionScale=.6;
  override setSize(width:number,height:number){super.setSize(Math.max(1,Math.round(width*this.resolutionScale)),Math.max(1,Math.round(height*this.resolutionScale)));}
  override render(renderer:THREE.WebGLRenderer,writeBuffer:THREE.WebGLRenderTarget,readBuffer:THREE.WebGLRenderTarget,delta=0,mask=false){
    this.setGBuffer(readBuffer.depthTexture!);
    super.render(renderer,writeBuffer,readBuffer,delta,mask);
  }
}

export function createRenderPipeline(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,sun:THREE.DirectionalLight){
  const target=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType,samples:4,depthTexture:new THREE.DepthTexture(innerWidth,innerHeight,THREE.UnsignedIntType)});
  const composer=new EffectComposer(renderer,target);composer.addPass(new RenderPass(scene,camera));
  const ao=new BeautyDepthAO(scene,camera,innerWidth,innerHeight);ao.setGBuffer(composer.renderTarget2.depthTexture!);
  ao.blendIntensity=.48;ao.updateGtaoMaterial({radius:.48,thickness:1.0,distanceFallOff:.8,scale:1,samples:16,distanceExponent:1.7});
  ao.updatePdMaterial({lumaPhi:8,depthPhi:2,normalPhi:3,radius:5,rings:2,samples:8});composer.addPass(ao);
  const atmosphere=new AtmospherePass(camera,sun,()=>ao.depthTexture);composer.addPass(atmosphere);
  const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.24,.55,1.15);composer.addPass(bloom);
  const output=new ResolutionOutput();composer.addPass(output);
  const resolution=new AdaptiveResolution(),gpu=new GpuTimer(renderer.getContext() as WebGL2RenderingContext);
  const autoFallback=gpu.supported?1:matchMedia('(pointer:coarse)').matches?.85:1;
  resolution.setMode('auto',autoFallback);composer.setPixelRatio(1);
  let quality='high',night=0,width=innerWidth,height=innerHeight,dpr=renderer.getPixelRatio();
  function applyResolution(){output.uniforms.reconstruct.value=resolution.scale<.999?1:0;composer.setSize(Math.max(1,Math.round(width*dpr*resolution.scale)),Math.max(1,Math.round(height*dpr*resolution.scale)));}
  return {
    composer,ao,atmosphere,bloom,
    setNight(value:number){night=value;bloom.strength=THREE.MathUtils.lerp(.24,.30,value);bloom.threshold=THREE.MathUtils.lerp(1.15,.95,value);atmosphere.setStrength(THREE.MathUtils.lerp(.46,.17,value));},
    setQuality(value:string){quality=value;ao.enabled=atmosphere.enabled=bloom.enabled=value!=='balanced';ao.resolutionScale=value==='cinematic'?.8:.6;ao.updateGtaoMaterial({samples:value==='cinematic'?24:16});atmosphere.setQuality(value);resolution.reset();},
    setResolution(mode:ResolutionMode){resolution.setMode(mode,autoFallback);applyResolution();},
    setGpuTimerEnabled(value:boolean){gpu.setEnabled(value);},
    resize(w:number,h:number,pixelRatio:number){width=w;height=h;dpr=pixelRatio;resolution.reset();applyResolution();},
    render(dt=0,allowAdaptive=false){
      gpu.begin();
      if(quality==='balanced'&&resolution.scale===1)renderer.render(scene,camera);else composer.render();
      gpu.end();
      if(resolution.observe(gpu,dt,allowAdaptive))applyResolution();
    },
    diagnostics(){return {pipeline:quality==='balanced'?'outdoor PBR + shadow map':'beauty-depth GTAO + shadow-marched mist + bloom',rayTracing:false,dlss:false,ao:ao.enabled,aoResolutionScale:ao.resolutionScale,volumetric:atmosphere.enabled,shadowSize:sun.shadow.mapSize.x,night,bloomStrength:bloom.strength,ibl:'local day / moonlight PMREM',postEffects:quality==='balanced'?0:3,resolution:{mode:resolution.mode,scale:resolution.scale,sceneWidth:composer.renderTarget1.width,sceneHeight:composer.renderTarget1.height,displayWidth:Math.round(width*dpr),displayHeight:Math.round(height*dpr),reconstruction:resolution.scale<.999?'Catmull-Rom + limited sharpening':'native',gpuTimer:gpu.supported,gpuMs:gpu.milliseconds,gpuSamples:gpu.samples,targetGpuMs:resolution.budgetMs}};}
  };
}
