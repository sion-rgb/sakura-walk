import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const vertexShader=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;

/** Shadow-map ray marching through mist; this is volumetric scattering, not path tracing. */
export class AtmospherePass extends Pass {
  private target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
  private compositeTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
  private copy=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{tDiffuse:{value:null}},vertexShader,fragmentShader:`varying vec2 vUv;uniform sampler2D tDiffuse;void main(){gl_FragColor=texture2D(tDiffuse,vUv);}`});
  private quad=new FullScreenQuad();
  private march:THREE.ShaderMaterial;
  private composite:THREE.ShaderMaterial;
  private scale=.5;
  private size=new THREE.Vector2(1,1);
  constructor(private camera:THREE.PerspectiveCamera,private sun:THREE.DirectionalLight,private getDepth:()=>THREE.DepthTexture){
    super();
    this.march=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{
      tDepth:{value:null},tShadow:{value:null},projectionInverse:{value:new THREE.Matrix4()},cameraWorld:{value:new THREE.Matrix4()},
      shadowMatrix:{value:new THREE.Matrix4()},sunDirection:{value:new THREE.Vector3()},sunColor:{value:new THREE.Color()},
      resolution:{value:new THREE.Vector2()},cameraPositionWorld:{value:new THREE.Vector3()},nearFar:{value:new THREE.Vector2(camera.near,camera.far)},steps:{value:22},strength:{value:.46}
    },vertexShader,fragmentShader:`
      #include <packing>
      varying vec2 vUv; uniform sampler2D tDepth,tShadow;
      uniform mat4 projectionInverse,cameraWorld,shadowMatrix;
      uniform vec3 cameraPositionWorld,sunDirection,sunColor; uniform vec2 resolution,nearFar; uniform float steps,strength;
      vec3 worldPosition(vec2 uv,float depth){vec4 p=projectionInverse*vec4(uv*2.-1.,depth*2.-1.,1.);return (cameraWorld*vec4(p.xyz/p.w,1.)).xyz;}
      float hash(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
      float visibility(vec3 p){vec4 s=shadowMatrix*vec4(p,1.);vec3 uv=s.xyz/s.w;
        if(any(lessThan(uv,vec3(.002)))||any(greaterThan(uv,vec3(.998))))return 0.;
        float depth=unpackRGBAToDepth(texture2D(tShadow,uv.xy));
        float edge=smoothstep(0.,.06,min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y)));
        return step(uv.z-.00022,depth)*edge;
      }
      void main(){
        float depth=texture2D(tDepth,vUv).r;vec3 end=worldPosition(vUv,min(depth,.99999));
        vec3 ray=normalize(end-cameraPositionWorld);float distance=min(length(end-cameraPositionWorld),45.);
        float stride=distance/steps,scatter=0.,jitter=hash(floor(vUv*resolution));
        for(int i=0;i<36;i++){if(float(i)>=steps)break;float t=(float(i)+jitter+.3)*stride;
          vec3 p=cameraPositionWorld+ray*t;
          float density=exp(-max(p.y-.5,0.)*.18)*smoothstep(-.1,.3,p.y);
          scatter+=visibility(p)*density*exp(-t*.012)*stride;
        }
        float phase=.32+.68*pow(max(dot(ray,sunDirection),0.),5.);
        gl_FragColor=vec4(sunColor*scatter*.020*phase*strength,-perspectiveDepthToViewZ(depth,nearFar.x,nearFar.y));
      }`});
    this.composite=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{tDiffuse:{value:null},tVolume:{value:this.target.texture},tDepth:{value:null},texel:{value:new THREE.Vector2()},nearFar:{value:new THREE.Vector2(camera.near,camera.far)}},vertexShader,fragmentShader:`
      #include <packing>
      varying vec2 vUv;uniform sampler2D tDiffuse,tVolume,tDepth;uniform vec2 texel,nearFar;
      void main(){
        float depth=texture2D(tDepth,vUv).r;float centerZ=perspectiveDepthToViewZ(depth,nearFar.x,nearFar.y);
        vec3 volume=vec3(0.);float total=0.;
        for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
          vec2 uv=vUv+vec2(float(x),float(y))*texel;vec4 sampleValue=texture2D(tVolume,uv);
          float sampleDepth=-sampleValue.a;
          float weight=exp(-abs(centerZ-sampleDepth)*1.8)/(1.+float(x*x+y*y));volume+=sampleValue.rgb*weight;total+=weight;
        }
        vec3 color=texture2D(tDiffuse,vUv).rgb+volume/max(total,.0001);
        float vignette=1.-.10*smoothstep(.20,.78,length((vUv-.5)*vec2(1.,.85)));
        gl_FragColor=vec4(color*vignette,1.);
      }`});
  }
  setQuality(quality:string){this.scale=quality==='cinematic'?.67:.5;this.march.uniforms.steps.value=quality==='cinematic'?32:22;this.setSize(this.size.x,this.size.y);}
  setStrength(value:number){this.march.uniforms.strength.value=value;}
  override setSize(width:number,height:number){this.size.set(width,height);this.compositeTarget.setSize(width,height);const w=Math.max(1,Math.round(width*this.scale)),h=Math.max(1,Math.round(height*this.scale));this.target.setSize(w,h);this.march.uniforms.resolution.value.set(w,h);this.composite.uniforms.texel.value.set(1/w,1/h);}
  override render(renderer:THREE.WebGLRenderer,writeBuffer:THREE.WebGLRenderTarget,readBuffer:THREE.WebGLRenderTarget){
    const depth=this.getDepth(),u=this.march.uniforms;u.tDepth.value=depth;u.tShadow.value=this.sun.shadow.map?.texture;
    u.projectionInverse.value.copy(this.camera.projectionMatrixInverse);u.cameraWorld.value.copy(this.camera.matrixWorld);
    u.cameraPositionWorld.value.copy(this.camera.position);u.shadowMatrix.value.copy(this.sun.shadow.matrix);
    u.nearFar.value.set(this.camera.near,this.camera.far);
    u.sunDirection.value.subVectors(this.sun.position,this.sun.target.position).normalize();u.sunColor.value.copy(this.sun.color);
    renderer.setRenderTarget(this.target);this.quad.material=this.march;this.quad.render(renderer);
    this.composite.uniforms.tDiffuse.value=readBuffer.texture;this.composite.uniforms.tDepth.value=depth;
    this.composite.uniforms.nearFar.value.set(this.camera.near,this.camera.far);
    // The composer's next target can own the beauty depth attachment. Composite
    // separately, then copy color only, avoiding a depth-texture feedback loop.
    renderer.setRenderTarget(this.compositeTarget);this.quad.material=this.composite;this.quad.render(renderer);
    this.copy.uniforms.tDiffuse.value=this.compositeTarget.texture;
    renderer.setRenderTarget(this.renderToScreen?null:writeBuffer);this.quad.material=this.copy;this.quad.render(renderer);
  }
  override dispose(){this.target.dispose();this.compositeTarget.dispose();this.copy.dispose();this.march.dispose();this.composite.dispose();this.quad.dispose();}
}
