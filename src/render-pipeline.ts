import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AtmospherePass } from './atmosphere-pass';

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
  const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.24,.55,1.15);composer.addPass(bloom);composer.addPass(new OutputPass());
  let quality='high',night=0;
  return {
    composer,ao,atmosphere,bloom,
    setNight(value:number){night=value;bloom.strength=THREE.MathUtils.lerp(.24,.30,value);bloom.threshold=THREE.MathUtils.lerp(1.15,.95,value);atmosphere.setStrength(THREE.MathUtils.lerp(.46,.17,value));},
    setQuality(value:string){quality=value;ao.enabled=atmosphere.enabled=bloom.enabled=value!=='balanced';ao.resolutionScale=value==='cinematic'?.8:.6;ao.updateGtaoMaterial({samples:value==='cinematic'?24:16});atmosphere.setQuality(value);},
    resize(width:number,height:number,dpr:number){composer.setPixelRatio(dpr);composer.setSize(width,height);},
    render(){if(quality==='balanced')renderer.render(scene,camera);else composer.render();},
    diagnostics(){return {pipeline:quality==='balanced'?'outdoor PBR + shadow map':'beauty-depth GTAO + shadow-marched mist + bloom',rayTracing:false,ao:ao.enabled,aoResolutionScale:ao.resolutionScale,volumetric:atmosphere.enabled,shadowSize:sun.shadow.mapSize.x,night,bloomStrength:bloom.strength,ibl:'local day / moonlight PMREM',postEffects:quality==='balanced'?0:3};}
  };
}
