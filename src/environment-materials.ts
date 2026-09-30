import * as THREE from 'three';

/** Locally authored surface maps. Data maps stay linear, separately from albedo. */
function finish(canvas: HTMLCanvasElement, color = false) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function noise(x: number, y: number, salt = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number, salt = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(noise(ix, iy, salt), noise(ix + 1, iy, salt), sx), THREE.MathUtils.lerp(noise(ix, iy + 1, salt), noise(ix + 1, iy + 1, salt), sx), sy);
}

/** Bevelled ashlar: darker recessed mortar, mineral flecks, a few hairline chips. */
export function createGranitePaving() {
  const size = 1024;
  const canvases = Array.from({ length: 3 }, () => {
    const c = document.createElement('canvas'); c.width = c.height = size; return c;
  });
  const contexts = canvases.map(c => c.getContext('2d')!);
  const images = contexts.map(c => c.createImageData(size, size));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const row = Math.floor(y / 128), shifted = (x + (row % 2) * 64) % size, col = Math.floor(shifted / 128);
    const dx = shifted % 128, dy = y % 128, edge = Math.min(dx, dy, 128 - dx, 128 - dy);
    const stoneSeed = noise(col, row, 39), mineral = smoothNoise(x / 14, y / 14, 52), grain = noise(x, y, 11);
    const chip = Math.max(0, .66 - smoothNoise(x / 6, y / 6, 5)) * 5;
    const bevel = THREE.MathUtils.smoothstep(edge, .65 + chip * .22, 3.1 + chip * .40);
    const pore = grain < .024 ? -.11 : grain > .971 ? .06 : (grain - .5) * .033;
    const tint = .47 + stoneSeed * .14 + (mineral - .5) * .060 + pore;
    const mortar = .34 + mineral * .07;
    const value = THREE.MathUtils.lerp(mortar, tint, bevel);
    const h = .32 + bevel * .31 + (mineral - .5) * .08 + pore * .30;
    const roughness = THREE.MathUtils.lerp(.98, .70 + mineral * .19 + grain * .06, bevel);
    const offset = (y * size + x) * 4;
    // Cool mineral shadows and warm worn faces stay below clipping under golden light.
    images[0].data.set([value * 255 * 1.04, value * 255 * 1.00, value * 255 * .92, 255], offset);
    images[1].data.set([h * 255, h * 255, h * 255, 255], offset);
    images[2].data.set([roughness * 255, roughness * 255, roughness * 255, 255], offset);
  }
  contexts.forEach((context, i) => context.putImageData(images[i], 0, 0));
  const [map, bumpMap, roughnessMap] = canvases.map((canvas, i) => finish(canvas, i === 0));
  for (const tex of [map, bumpMap, roughnessMap]) tex.repeat.set(1, 29.5);
  return { map, bumpMap, roughnessMap };
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
