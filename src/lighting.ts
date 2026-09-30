import * as THREE from 'three';

/** An outdoor radiance field, shared by the sky and the roughness-filtered IBL. */
function springSky(): THREE.Mesh {
  const material=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,
    uniforms:{sunDirection:{value:new THREE.Vector3(-11,15,9).normalize()},warmth:{value:.35}},
    vertexShader:`varying vec3 direction; void main(){direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`
      varying vec3 direction; uniform vec3 sunDirection; uniform float warmth;
      void main(){
        vec3 d=normalize(direction); float height=max(d.y,0.);
        vec3 zenith=vec3(.205,.386,.565), horizon=mix(vec3(.83,.88,.87),vec3(.98,.72,.50),warmth*.45);
        vec3 color=mix(horizon,zenith,pow(height,.40));
        float mu=clamp(dot(d,sunDirection),0.,1.);
        color+=vec3(1.,.73,.38)*(pow(mu,22.)*.22+pow(mu,360.)*.8+smoothstep(.99955,.99985,mu)*9.);
        float clouds=sin(d.x*17.+sin(d.z*11.))*sin(d.z*21.-d.y*12.);
        color=mix(color,vec3(.88,.89,.89),smoothstep(.25,.80,clouds)*smoothstep(.04,.2,d.y)*(1.-smoothstep(.38,.7,d.y))*.13);
        color=mix(vec3(.115,.14,.09),color,smoothstep(-.22,.02,d.y));
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(190,40,24),material);sky.name='Spring atmospheric sky';sky.renderOrder=-10;return sky;
}

export function createLighting(renderer:THREE.WebGLRenderer,scene:THREE.Scene){
  const sky=springSky();scene.add(sky);
  const radiance=new THREE.Scene(),bakeSky=sky.clone();radiance.add(bakeSky);
  const pmrem=new THREE.PMREMGenerator(renderer);
  const environment=pmrem.fromScene(radiance,.05,.1,220);scene.environment=environment.texture;scene.environmentIntensity=.60;
  pmrem.dispose();
  scene.background=new THREE.Color('#b6c7d0');scene.fog=new THREE.FogExp2('#c4cace',.0053);
  const hemisphere=new THREE.HemisphereLight('#c6dcf5','#656948',.54);hemisphere.name='Cool spring skylight';scene.add(hemisphere);
  const sun=new THREE.DirectionalLight('#ffe0ad',3.8);sun.name='Warm filtered spring sun';sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-18,right:18,top:20,bottom:-16,near:1,far:65});
  sun.shadow.bias=-.00014;sun.shadow.normalBias=.016;sun.shadow.radius=2;scene.add(sun,sun.target);
  const fill=new THREE.DirectionalLight('#b9d4ff',.30);fill.name='Blue sky edge fill';fill.position.set(9,8,-11);scene.add(fill);
  const offset=new THREE.Vector3(-11,15,9);
  return {
    sun,sky,hemisphere,environment,
    update(focus:THREE.Vector3){
      // Stabilize the shadow texel grid while the camera follows the walkers.
      const texel=36/sun.shadow.mapSize.x;
      sun.target.position.set(Math.round(focus.x/texel)*texel,.8,Math.round(focus.z/texel)*texel);
      sun.position.copy(sun.target.position).add(offset);sun.target.updateMatrixWorld();sky.position.set(focus.x,0,focus.z);
    },
    setWarmth(value:number){
      const v=THREE.MathUtils.clamp(value,0,1);
      sun.color.set('#fff0d7').lerp(new THREE.Color('#ffc48e'),v);sun.intensity=4.05-v*.5;
      scene.fog!.color.set('#c1cdd2').lerp(new THREE.Color('#dac5bb'),v);
      (sky.material as THREE.ShaderMaterial).uniforms.warmth.value=v;
    },
    setQuality(quality:string){
      const size=quality==='cinematic'?4096:quality==='high'?2048:1024;
      if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.setScalar(size);sun.shadow.map?.dispose();sun.shadow.map=null;}
    }
  };
}
