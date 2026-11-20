import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AtmospherePass } from './atmosphere-pass';
import { ResolutionOutput } from './resolution-output';
import { AdaptiveResolution, GpuTimer, type ResolutionMode } from './adaptive-resolution';

/** Use the actual opaque/alpha-tested beauty depth, including custom avatar masks. */
class BeautyDepthAO extends GTAOPass {
  resolutionScale=.6;
  override setSize(width:number,height:number){super.setSize(Math.max(1,Math.round(width*this.resolutionScale)),Math.max(1,Math.round(height*this.resolutionScale)));}
}

export function createRenderPipeline(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,sun:THREE.DirectionalLight){
  const depth=new THREE.DepthTexture(innerWidth,innerHeight,THREE.UnsignedIntType);
  const beauty=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType,samples:4,depthTexture:depth});
  const post=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType,depthBuffer:false});
  const ao=new BeautyDepthAO(scene,camera,innerWidth,innerHeight);
  ao.setGBuffer(depth);
  ao.output=GTAOPass.OUTPUT.Off; // The atmosphere composite applies the denoised AO map.
  ao.blendIntensity=.48;ao.updateGtaoMaterial({radius:.48,thickness:1.0,distanceFallOff:.8,scale:1,samples:16,distanceExponent:1.7});
  ao.updatePdMaterial({lumaPhi:8,depthPhi:2,normalPhi:3,radius:5,rings:2,samples:8});
  const atmosphere=new AtmospherePass(camera,sun,ao.gtaoMap,ao.blendIntensity);
  const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.24,.55,1.15);
  const output=new ResolutionOutput();
  output.renderToScreen=true;
  const resolution=new AdaptiveResolution(),gpu=new GpuTimer(renderer.getContext() as WebGL2RenderingContext);
  const autoFallback=gpu.supported?1:matchMedia('(pointer:coarse)').matches?.85:1;
  resolution.setMode('auto',autoFallback);
  let quality='high',night=0,width=innerWidth,height=innerHeight,dpr=renderer.getPixelRatio();
  function applyResolution(){
    const w=Math.max(1,Math.round(width*dpr*resolution.scale)),h=Math.max(1,Math.round(height*dpr*resolution.scale));
    output.uniforms.reconstruct.value=resolution.scale<.999?1:0;
    beauty.setSize(w,h);
    post.setSize(w,h);
    ao.setSize(w,h);
    atmosphere.setSize(w,h);
    bloom.setSize(w,h);
  }
  function renderPost(dt:number){
    const previousTarget=renderer.getRenderTarget();
    renderer.setRenderTarget(beauty);
    renderer.render(scene,camera);
    if(quality==='balanced'){
      output.render(renderer,post,beauty);
    }else{
      ao.render(renderer,post,beauty,dt,false);
      atmosphere.render(renderer,post,beauty);
      // UnrealBloomPass blends its result back into its input.
      bloom.render(renderer,beauty,post,dt,false);
      output.render(renderer,beauty,post);
    }
    renderer.setRenderTarget(previousTarget);
  }
  applyResolution();
  return {
    ao,atmosphere,bloom,
    setNight(value:number){night=value;bloom.strength=THREE.MathUtils.lerp(.24,.30,value);bloom.threshold=THREE.MathUtils.lerp(1.15,.95,value);atmosphere.setStrength(THREE.MathUtils.lerp(.46,.17,value));},
    setQuality(value:string){quality=value;ao.enabled=atmosphere.enabled=bloom.enabled=value!=='balanced';ao.resolutionScale=value==='cinematic'?.8:.6;ao.updateGtaoMaterial({samples:value==='cinematic'?24:16});atmosphere.setQuality(value);resolution.reset();},
    setResolution(mode:ResolutionMode){resolution.setMode(mode,autoFallback);applyResolution();},
    setGpuTimerEnabled(value:boolean){gpu.setEnabled(value);},
    resize(w:number,h:number,pixelRatio:number){width=w;height=h;dpr=pixelRatio;resolution.reset();applyResolution();},
    render(dt=0,allowAdaptive=false){
      gpu.begin();
      if(quality==='balanced'&&resolution.scale===1)renderer.render(scene,camera);else renderPost(dt);
      gpu.end();
      if(resolution.observe(gpu,dt,allowAdaptive))applyResolution();
    },
    diagnostics(){return {pipeline:quality==='balanced'?'outdoor PBR + shadow map':'beauty-depth GTAO + shadow-marched mist + bloom',rayTracing:false,dlss:false,ao:ao.enabled,aoResolutionScale:ao.resolutionScale,volumetric:atmosphere.enabled,shadowSize:sun.shadow.mapSize.x,night,bloomStrength:bloom.strength,ibl:'local day / moonlight PMREM',postEffects:quality==='balanced'?0:3,resolution:{mode:resolution.mode,scale:resolution.scale,sceneWidth:beauty.width,sceneHeight:beauty.height,displayWidth:Math.round(width*dpr),displayHeight:Math.round(height*dpr),reconstruction:resolution.scale<.999?'Catmull-Rom + limited sharpening':'native',gpuTimer:gpu.supported,gpuMs:gpu.milliseconds,gpuSamples:gpu.samples,targetGpuMs:resolution.budgetMs}};}
  };
}
