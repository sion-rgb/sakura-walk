import * as THREE from 'three';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

/** Spatial reconstruction only. The original output pass still owns tone/color conversion. */
export class ResolutionOutput extends OutputPass {
  constructor(){
    super();
    this.uniforms.inputSize={value:new THREE.Vector2(1,1)};
    this.uniforms.reconstruct={value:0};
    this.material.fragmentShader=this.material.fragmentShader.replace('void main() {',`
      uniform vec2 inputSize;uniform float reconstruct;
      vec4 cubicWeights(float x){float x2=x*x,x3=x2*x;return vec4(-.5*x+x2-.5*x3,1.-2.5*x2+1.5*x3,.5*x+2.*x2-1.5*x3,-.5*x2+.5*x3);}
      vec3 sampleCubic(vec2 uv){
        vec2 position=uv*inputSize-.5,base=floor(position),f=position-base;
        vec4 x=cubicWeights(f.x),y=cubicWeights(f.y);
        vec3 sx=vec3(x.x,x.y+x.z,x.w),sy=vec3(y.x,y.y+y.z,y.w);
        vec3 px=vec3(base.x-.5,base.x+.5+x.z/sx.y,base.x+2.5)/inputSize.x;
        vec3 py=vec3(base.y-.5,base.y+.5+y.z/sy.y,base.y+2.5)/inputSize.y;
        vec3 result=vec3(0.);
        for(int j=0;j<3;j++)for(int i=0;i<3;i++)result+=texture2D(tDiffuse,vec2(px[i],py[j])).rgb*sx[i]*sy[j];
        return max(result,vec3(0.));
      }
      void main() {`).replace('gl_FragColor = texture2D( tDiffuse, vUv );',`
      gl_FragColor=texture2D(tDiffuse,vUv);
      if(reconstruct>.5){
        vec3 center=sampleCubic(vUv);vec2 texel=1./inputSize;
        vec3 a=texture2D(tDiffuse,vUv+vec2(texel.x,0.)).rgb,b=texture2D(tDiffuse,vUv-vec2(texel.x,0.)).rgb;
        vec3 c=texture2D(tDiffuse,vUv+vec2(0.,texel.y)).rgb,d=texture2D(tDiffuse,vUv-vec2(0.,texel.y)).rgb;
        vec3 lo=min(center,min(min(a,b),min(c,d))),hi=max(center,max(max(a,b),max(c,d)));
        gl_FragColor.rgb=clamp(center+.22*(center-(a+b+c+d)*.25),lo,hi);
      }
      `);
  }
  override render(renderer:THREE.WebGLRenderer,writeBuffer:THREE.WebGLRenderTarget,readBuffer:THREE.WebGLRenderTarget,delta=0,mask=false){
    this.uniforms.inputSize.value.set(readBuffer.width,readBuffer.height);
    super.render(renderer,writeBuffer,readBuffer,delta,mask);
  }
}
