import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const dayDirection = new THREE.Vector3(-11, 15, 9).normalize();
const moonDirection = new THREE.Vector3(10, 17, 12).normalize();

/** One sky, with stars and a silver moon fading in during the night transition. */
function springSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sunDirection: { value: dayDirection }, moonDirection: { value: moonDirection }, warmth: { value: .3 }, night: { value: 0 } },
    vertexShader: `varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      varying vec3 direction;uniform vec3 sunDirection,moonDirection;uniform float warmth,night;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        vec3 d=normalize(direction);float height=max(d.y,0.);
        vec3 horizon=mix(vec3(.37,.55,.70),vec3(.54,.49,.46),warmth*.32);
        vec3 day=mix(horizon,vec3(.11,.29,.53),pow(height,.55));
        float sun=clamp(dot(d,sunDirection),0.,1.);
        day+=vec3(1.,.78,.48)*(pow(sun,48.)*.10+pow(sun,420.)*.25+smoothstep(.99975,.99988,sun)*6.);
        float cloud=sin(d.x*13.+sin(d.z*9.))*sin(d.z*17.-d.y*10.);
        float mask=smoothstep(.20,.82,cloud)*smoothstep(.03,.17,d.y)*(1.-smoothstep(.36,.64,d.y));
        day=mix(day,vec3(.69,.74,.78),mask*.19);
        day=mix(vec3(.07,.12,.06),day,smoothstep(-.22,.01,d.y));
        vec3 evening=mix(vec3(.016,.033,.068),vec3(.0025,.008,.027),pow(height,.42));
        float moon=clamp(dot(d,moonDirection),0.,1.);
        float disk=smoothstep(.99975,.99982,moon),crater=.92+.08*sin(d.x*1800.)*sin(d.y*1700.);
        evening+=vec3(.70,.83,1.)*(pow(moon,110.)*.018+pow(moon,440.)*.024+disk*crater*1.65);
        vec2 uv=vec2(atan(d.z,d.x)/6.2831853+.5,asin(d.y)/3.14159265+.5)*vec2(700.,350.);
        vec2 cell=floor(uv),offset=vec2(hash(cell+17.),hash(cell+61.))*.6+.2;
        float star=exp(-dot(fract(uv)-offset,fract(uv)-offset)*240.)*step(.993,hash(cell));
        evening+=mix(vec3(.48,.61,.88),vec3(.98,.88,.69),hash(cell+8.))*star*.9*smoothstep(.01,.25,d.y);
        evening=mix(evening,vec3(.022,.036,.061),mask*.22);
        gl_FragColor=vec4(mix(day,evening,night),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(205, 32, 20), material);
  sky.name = 'Spring sky · daylight, moon and stars'; sky.renderOrder = -10;
  return sky;
}

export function createLighting(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const sky = springSky(); scene.add(sky);
  const hemisphere = new THREE.HemisphereLight('#c7def6', '#526b37', .32);
  const sun = new THREE.DirectionalLight('#fff0d8', 3.1); sun.name = 'Sun / silver moon key'; sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 20, bottom: -16, near: 1, far: 65 });
  sun.shadow.bias = -.00012; sun.shadow.normalBias = .012; sun.shadow.radius = 2;
  const fill = new THREE.DirectionalLight('#b7d5ef', .20); fill.position.set(9, 8, -11);
  scene.add(hemisphere, sun, sun.target, fill); scene.fog = new THREE.FogExp2('#99b1bd', .0033);
  const pmrem = new THREE.PMREMGenerator(renderer), radiance = new THREE.Scene(); radiance.add(sky.clone());
  const fallback = pmrem.fromScene(radiance, .05, .1, 220); scene.environment = fallback.texture;
  let dayEnvironment: THREE.WebGLRenderTarget | null = null, nightEnvironment: THREE.WebGLRenderTarget | null = null;
  let mixed: THREE.WebGLRenderTarget | null = null, lastMix = -1;
  const blendMaterial = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { tDay: { value: null }, tNight: { value: null }, amount: { value: 0 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform sampler2D tDay,tNight;uniform float amount;
      void main(){gl_FragColor=vec4(mix(texture2D(tDay,vUv).rgb,texture2D(tNight,vUv).rgb*.55,amount),1.);}`
  });
  const quad = new FullScreenQuad(blendMaterial);
  function blendEnvironment(amount: number) {
    if (!mixed || Math.abs(amount - lastMix) < .002) return;
    const previous = renderer.getRenderTarget(); blendMaterial.uniforms.amount.value = amount;
    renderer.setRenderTarget(mixed); quad.render(renderer); renderer.setRenderTarget(previous); lastMix = amount;
  }
  pmrem.compileEquirectangularShader(); const loader = new HDRLoader();
  const ready = Promise.all(['spring-day.hdr', 'moonlight.hdr'].map(name => loader.loadAsync(`${import.meta.env.BASE_URL}environments/${name}`))).then(([day, night]) => {
    dayEnvironment = pmrem.fromEquirectangular(day); nightEnvironment = pmrem.fromEquirectangular(night);
    if (dayEnvironment.width !== nightEnvironment.width || dayEnvironment.height !== nightEnvironment.height) throw new Error('Day and night IBL sizes must match.');
    mixed = new THREE.WebGLRenderTarget(dayEnvironment.width, dayEnvironment.height, { type: THREE.HalfFloatType, depthBuffer: false });
    mixed.texture.mapping = THREE.CubeUVReflectionMapping; mixed.texture.minFilter = mixed.texture.magFilter = THREE.LinearFilter; mixed.texture.generateMipmaps = false;
    blendMaterial.uniforms.tDay.value = dayEnvironment.texture; blendMaterial.uniforms.tNight.value = nightEnvironment.texture;
    scene.environment = mixed.texture; day.dispose(); night.dispose(); fallback.dispose(); pmrem.dispose(); blendEnvironment(0);
  });
  let warmth = .3, night = 0;
  const daySun = new THREE.Color(), dayFog = new THREE.Color(), offset = new THREE.Vector3();
  const nightSun = new THREE.Color('#a0bbf0'), nightFog = new THREE.Color('#182944');
  const dayHemi = new THREE.Color('#c7def6'), nightHemi = new THREE.Color('#657daf');
  const dayGround = new THREE.Color('#526b37'), nightGround = new THREE.Color('#172b30');
  const dayFill = new THREE.Color('#b7d5ef'), nightFill = new THREE.Color('#7a9fd2');
  function apply() {
    daySun.set('#fff4df').lerp(new THREE.Color('#ffd3a3'), warmth * .45);
    dayFog.set('#9eb9c8').lerp(new THREE.Color('#c6b8ae'), warmth * .30);
    sun.color.copy(daySun).lerp(nightSun, night); sun.intensity = THREE.MathUtils.lerp(2.60 - warmth * .25, 1.0, night);
    hemisphere.color.copy(dayHemi).lerp(nightHemi, night); hemisphere.groundColor.copy(dayGround).lerp(nightGround, night);
    hemisphere.intensity = THREE.MathUtils.lerp(.32, .22, night);
    fill.color.copy(dayFill).lerp(nightFill, night); fill.intensity = THREE.MathUtils.lerp(.20, .12, night);
    const fog = scene.fog as THREE.FogExp2; fog.color.copy(dayFog).lerp(nightFog, night); fog.density = THREE.MathUtils.lerp(.0033, .009, night);
    scene.environmentIntensity = THREE.MathUtils.lerp(.72, .48, night); renderer.toneMappingExposure = THREE.MathUtils.lerp(.94, 1.08, night);
    sky.material.uniforms.warmth.value = warmth; sky.material.uniforms.night.value = night; blendEnvironment(night);
  }
  apply();
  return {
    sun, sky, hemisphere, ready,
    update(focus: THREE.Vector3) {
      const texel = 36 / sun.shadow.mapSize.x;
      sun.target.position.set(Math.round(focus.x / texel) * texel, .8, Math.round(focus.z / texel) * texel);
      offset.copy(dayDirection).lerp(moonDirection, night).normalize().multiplyScalar(24);
      sun.position.copy(sun.target.position).add(offset); sun.target.updateMatrixWorld(); sky.position.set(focus.x, 0, focus.z);
    },
    setNight(value: number) { night = THREE.MathUtils.clamp(value, 0, 1); apply(); },
    setWarmth(value: number) { warmth = THREE.MathUtils.clamp(value, 0, 1); apply(); },
    setQuality(quality: string) {
      const size = quality === 'cinematic' ? 4096 : quality === 'high' ? 2048 : 1024;
      if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.setScalar(size); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    },
    diagnostics() { return { night, ibl: 'local CC0 day / moonlight HDR, blended PMREM', exposure: renderer.toneMappingExposure, keyIntensity: sun.intensity, fogDensity: (scene.fog as THREE.FogExp2).density }; }
  };
}
