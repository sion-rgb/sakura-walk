import * as THREE from 'three';

/** Locally authored surface maps. Data maps stay linear, separately from albedo. */
function finish(canvas: HTMLCanvasElement, color = false) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

const loadedMaps = new Map<string, THREE.Texture>();
const pendingMaps: Promise<THREE.Texture>[] = [];
function localMap(name: string, repeatX: number, repeatY: number, color = false) {
  const existing = loadedMaps.get(name); if (existing) return existing;
  let resolve!: (texture: THREE.Texture) => void, reject!: (error: unknown) => void;
  pendingMaps.push(new Promise((ok, fail) => { resolve = ok; reject = fail; }));
  const texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/${name}.jpg`, resolve, undefined, reject);
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(repeatX, repeatY); texture.anisotropy = 8;
  loadedMaps.set(name, texture); return texture;
}
function surface(prefix: string, x: number, y: number) {
  return { map: localMap(`${prefix}-albedo`, x, y, true), normalMap: localMap(`${prefix}-normal`, x, y), roughnessMap: localMap(`${prefix}-roughness`, x, y), aoMap: localMap(`${prefix}-ao`, x, y) };
}
export function createGranitePaving() { return surface('path', 7.25 / 1.8, 220 / 1.8); }
export function createGrassSurface() { return surface('grass', 320 / 1.8, 340 / 1.8); }
export async function waitForEnvironmentTextures() { await Promise.all(pendingMaps); }

/** Sparse damp patches at night, with rough stone retained between them. */
export function configurePavingMaterial(material: THREE.MeshStandardMaterial) {
  material.normalScale.set(.65, .65); material.aoMapIntensity = .72;
  const night = { value: 0 };
  material.userData.setNight = (amount: number) => { night.value = amount; };
  material.customProgramCacheKey = () => 'sakura-paving-damp-v1';
  material.onBeforeCompile = shader => {
    shader.uniforms.pavingNight = night;
    shader.vertexShader = 'varying vec3 pavingWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\npavingWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader = 'varying vec3 pavingWorld;uniform float pavingNight;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      float dampPatch=smoothstep(.35,.83,sin(pavingWorld.x*1.1+sin(pavingWorld.z*.61))*sin(pavingWorld.z*.47+pavingWorld.x*.29));
      roughnessFactor=max(.43,roughnessFactor*(1.-pavingNight*dampPatch*.44));`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float edgeMoss=smoothstep(2.9,3.6,abs(pavingWorld.x))*(.5+.5*sin(pavingWorld.z*2.7));
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.62,.77,.48),edgeMoss*.27);
      diffuseColor.rgb*=1.-pavingNight*.035;`);
  };
}

/** Reuse authored albedo contours as linear relief, with independent reflectance. */
export function createSurfaceRelief(map: THREE.CanvasTexture, roughness = .83, reliefContrast = 1) {
  const source = map.image as HTMLCanvasElement, size = source.width;
  const sourcePixels = source.getContext('2d')!.getImageData(0, 0, size, source.height);
  const result = [0, 1].map(() => { const c = document.createElement('canvas'); c.width = size; c.height = source.height; return c; });
  result.forEach((canvas, mode) => {
    const context = canvas.getContext('2d')!, image = context.createImageData(size, source.height);
    for (let i = 0; i < image.data.length; i += 4) {
      const luminance = (sourcePixels.data[i] * .2126 + sourcePixels.data[i + 1] * .7152 + sourcePixels.data[i + 2] * .0722) / 255;
      const value = mode === 0 ? THREE.MathUtils.clamp(.5 + (luminance - .5) * reliefContrast, .05, .95) : THREE.MathUtils.clamp(roughness + (luminance - .5) * .24, .1, 1);
      image.data.set([value * 255, value * 255, value * 255, 255], i);
    }
    context.putImageData(image, 0, 0);
  });
  const [bumpMap, roughnessMap] = result.map(c => finish(c));
  bumpMap.repeat.copy(map.repeat); roughnessMap.repeat.copy(map.repeat);
  return { bumpMap, roughnessMap };
}

/** Two crossing ripple families give the environment reflection a readable surface. */
export function createWaterNormal() {
  const size = 256, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!, image = context.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    const nx = Math.cos(u * 4 + Math.sin(v * 3) * .8) * .20 + Math.cos(u * 7 - v * 5) * .06;
    const ny = Math.cos(v * 7 + Math.sin(u * 2)) * .23 - Math.cos(u * 7 - v * 5) * .09;
    const normal = new THREE.Vector3(nx, ny, 1).normalize();
    image.data.set([(normal.x * .5 + .5) * 255, (normal.y * .5 + .5) * 255, (normal.z * .5 + .5) * 255, 255], (y * size + x) * 4);
  }
  context.putImageData(image, 0, 0);
  const texture = finish(canvas); texture.repeat.set(1.4, 22); return texture;
}
