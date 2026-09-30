import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createGranitePaving, createSurfaceRelief, createWaterNormal } from './environment-materials';

/** An authored, instanced spring garden. All textures are generated locally. */
export interface SakuraEnvironment {
  diagnostics: Record<string, unknown>;
  update(dt: number, time: number, focus: THREE.Vector3): void;
  colliders: Array<{ x: number; z: number; radius: number }>;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  landmarks: Array<{ name: string; z: number }>;
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let v = Math.imul(state ^ (state >>> 15), 1 | state);
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(size: number, paint: (c: CanvasRenderingContext2D, size: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  paint(c, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function stoneTexture() {
  const rng = random(782);
  return canvasTexture(1024, (c, s) => {
    c.fillStyle = '#a69d8f'; c.fillRect(0, 0, s, s);
    const rows = 10, columns = 10, w = s / columns, h = s / rows;
    for (let row = 0; row < rows; row++) {
      for (let col = -1; col < columns + 1;) {
        const span = rng() > .74 ? 2 : 1;
        const x = col * w + (row % 2) * w * .5, y = row * h, width = w * span;
        const tone = 64 + rng() * 9;
        const gradient = c.createLinearGradient(x, y, x + width, y + h);
        gradient.addColorStop(0, `hsl(${31 + rng() * 8} 13% ${tone + 4}%)`);
        gradient.addColorStop(1, `hsl(${28 + rng() * 8} 12% ${tone}%)`);
        c.fillStyle = gradient;
        c.beginPath(); c.moveTo(x + 4, y + 3); c.lineTo(x + width - 5, y + 2);
        c.lineTo(x + width - 2, y + h - 5); c.lineTo(x + 3, y + h - 3); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(255,249,230,.30)'; c.lineWidth = 1.7;
        c.beginPath(); c.moveTo(x + 7, y + 4); c.lineTo(x + width - 7, y + 3); c.stroke();
        c.strokeStyle = 'rgba(82,85,65,.22)'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(x + 4, y + h - 2); c.lineTo(x + width - 4, y + h - 4); c.stroke();
        if (rng() > .65) {
          c.strokeStyle = 'rgba(107,121,71,.27)'; c.lineWidth = 1.7;
          c.beginPath(); c.moveTo(x + 2, y + h * .2); c.lineTo(x + 3, y + h * (.4 + rng() * .5)); c.stroke();
        }
        col += span;
      }
    }
    for (let i = 0; i < 55000; i++) {
      c.fillStyle = rng() > .5 ? 'rgba(255,250,231,.10)' : 'rgba(86,83,71,.09)';
      c.fillRect(rng() * s, rng() * s, 1 + rng() * 3, 1 + rng() * 3);
    }
    for (let i = 0; i < 36; i++) {
      const x = rng() * s, y = rng() * s;
      c.strokeStyle = 'rgba(111,104,92,.13)'; c.lineWidth = .6;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + rng() * 13, y + 8); c.lineTo(x + rng() * 20, y + 15); c.stroke();
    }
  });
}

function barkTexture() {
  const rng = random(812);
  const tex = canvasTexture(512, (c, s) => {
    // Tube UV.u follows the bough length. Rotate the painting so the grain follows
    // that axis, while cherry lenticels remain transverse to the wood fibers.
    c.translate(0, s); c.rotate(-Math.PI / 2);
    c.fillStyle = '#6b514a'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 200; i++) {
      const x = rng() * s;
      c.strokeStyle = `rgba(${rng() > .5 ? '45,32,32' : '160,121,107'},${.05 + rng() * .20})`;
      c.lineWidth = .5 + rng() * 3;
      c.beginPath(); c.moveTo(x, 0);
      for (let y = 0; y <= s; y += 24) c.lineTo(x + Math.sin(y * .025 + i) * 7, y);
      c.stroke();
    }
    // Cherry bark's horizontal lenticels remain legible on foreground trunks.
    for (let i = 0; i < 320; i++) {
      const x = rng() * s, y = rng() * s;
      c.fillStyle = 'rgba(223,177,153,.25)'; c.fillRect(x, y, 4 + rng() * 20, 1 + rng());
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function blossomTexture(seed: number) {
  const rng = random(seed);
  return canvasTexture(512, (c, size) => {
    c.scale(2, 2); const s = size / 2;
    const flowers: Array<{ x: number; y: number; r: number; tone: number }> = [];
    for (let i = 0; i < 105; i++) {
      const angle = rng() * Math.PI * 2, radius = Math.sqrt(rng());
      const lobe = 1 + Math.sin(angle * 5 + seed) * .17;
      flowers.push({ x: s * .5 + Math.cos(angle) * radius * 91 * lobe, y: s * .5 + Math.sin(angle) * radius * 81 * lobe, r: 6 + rng() * 9, tone: rng() });
    }
    flowers.sort((a, b) => a.y - b.y);
    for (const f of flowers) {
      const rotation = rng() * 6.28;
      for (let j = 0; j < 5; j++) {
        const a = rotation + j * Math.PI * .4;
        c.save(); c.translate(f.x, f.y); c.rotate(a);
        const grad = c.createLinearGradient(0, 0, 0, -f.r);
        grad.addColorStop(0, f.tone < .2 ? '#d786aa' : '#edacc4');
        grad.addColorStop(.52, f.tone < .3 ? '#e8a3bf' : '#f7c5d7');
        grad.addColorStop(1, f.tone > .7 ? '#fff5ed' : '#ffe4ed');
        c.fillStyle = grad;
        c.beginPath(); c.moveTo(0, 1);
        c.bezierCurveTo(-f.r * .67, -f.r * .28, -f.r * .50, -f.r * 1.03, -f.r * .12, -f.r);
        c.lineTo(0, -f.r * .80); c.lineTo(f.r * .14, -f.r);
        c.bezierCurveTo(f.r * .55, -f.r * .94, f.r * .62, -f.r * .24, 0, 1); c.fill();
        c.restore();
      }
      c.fillStyle = '#c56d91'; c.beginPath(); c.arc(f.x, f.y, 1.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f7debc';
      for (let j = 0; j < 4; j++) { const a = rotation + j * 1.5; c.beginPath(); c.arc(f.x + Math.cos(a) * 2.4, f.y + Math.sin(a) * 2.4, .6, 0, 6.28); c.fill(); }
    }
  });
}

type Transform = { position: THREE.Vector3; scale: THREE.Vector3; rotation: THREE.Euler; color?: THREE.Color };

export function createEnvironment(scene: THREE.Scene): SakuraEnvironment {
  const root = new THREE.Group(); root.name = 'Sakura avenue · authored garden'; scene.add(root);
  const rng = random(20260927);
  const colliders: Array<{ x: number; z: number; radius: number }> = [];
  const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion();
  const animatedMaterials: THREE.Material[] = [];
  const baked = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const color = (hex: THREE.ColorRepresentation) => new THREE.Color(hex);
  const material = (hex: THREE.ColorRepresentation, roughness = .86) => new THREE.MeshStandardMaterial({ color: hex, roughness, metalness: 0 });
  const stone = material('#a8aaa1'), edgeStone = material('#c3c0b4');
  const darkStone = material('#777c76'), fenceMat = material('#685348');
  const wood = material('#947557', .69), darkWood = material('#534337', .81);
  const copper = material('#78604b', .45), vermilion = material('#a84b43');
  const roofMat = material('#535657'), moss = material('#8a9671');
  const barkMap = barkTexture();
  const bark = new THREE.MeshStandardMaterial({ color: '#c5b1a6', map: barkMap, ...createSurfaceRelief(barkMap, .84, 1.6), bumpScale: .09, roughness: .93 });
  const lanternLight = new THREE.MeshStandardMaterial({ color: '#fff3cd', emissive: '#ffd794', emissiveIntensity: .48, roughness: .76 });
  const agedStone = canvasTexture(512, (c, s) => {
    const r = random(813); c.fillStyle = '#bfc0b0'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 110; i++) {
      const x = r() * s, y = r() * s, radius = 8 + r() * 38;
      const g = c.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, i % 3 ? 'rgba(71,81,55,.15)' : 'rgba(255,245,219,.20)'); g.addColorStop(1, 'rgba(135,147,100,0)');
      c.fillStyle = g; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (let i = 0; i < 19000; i++) {
      c.fillStyle = i % 3 ? 'rgba(248,239,220,.11)' : 'rgba(59,65,51,.14)';
      const size = .4 + r() * 1.5; c.fillRect(r() * s, r() * s, size, size);
    }
  });
  agedStone.wrapS = agedStone.wrapT = THREE.RepeatWrapping;
  const stoneRelief = createSurfaceRelief(agedStone, .78, 2.1);
  for (const mat of [stone, edgeStone, darkStone, moss]) { mat.map = agedStone; mat.bumpMap = stoneRelief.bumpMap; mat.roughnessMap = stoneRelief.roughnessMap; mat.bumpScale = .045; mat.roughness = .91; }
  const cedarMap = canvasTexture(256, (c, s) => {
    const r = random(909); c.fillStyle = '#c8ad8e'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 150; i++) {
      const y = r() * s; c.strokeStyle = i % 3 ? 'rgba(79,51,35,.13)' : 'rgba(246,221,183,.12)'; c.lineWidth = .5 + r() * 1.5;
      c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= s; x += 12) c.lineTo(x, y + Math.sin(x * .026 + i) * 1.7); c.stroke();
    }
  });
  cedarMap.wrapS = cedarMap.wrapT = THREE.RepeatWrapping;
  const cedarRelief = createSurfaceRelief(cedarMap, .73, 2.0);
  for (const mat of [wood, darkWood, fenceMat]) { mat.map = cedarMap; mat.bumpMap = cedarRelief.bumpMap; mat.roughnessMap = cedarRelief.roughnessMap; mat.bumpScale = .027; }
  copper.metalness = .65; copper.roughness = .42;
  vermilion.roughness = .57;

  function addBaked(geometry: THREE.BufferGeometry, mat: THREE.Material, position = v(0, 0, 0), scale = v(1, 1, 1), rotation = new THREE.Euler()) {
    quat.setFromEuler(rotation); matrix.compose(position, quat, scale); geometry.applyMatrix4(matrix);
    if (!baked.has(mat)) baked.set(mat, []); baked.get(mat)!.push(geometry);
  }
  function box(mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) {
    addBaked(new THREE.BoxGeometry(1, 1, 1), mat, v(x, y, z), v(sx, sy, sz), new THREE.Euler(0, ry, 0));
  }
  function cylinder(mat: THREE.Material, x: number, y: number, z: number, rTop: number, rBottom: number, h: number, segments = 8) {
    addBaked(new THREE.CylinderGeometry(rTop, rBottom, h, segments), mat, v(x, y, z));
  }
  function branch(points: THREE.Vector3[], radii: number[], segments = 9, sides = 7) {
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, segments, 1, sides, false);
    const positions = geo.attributes.position as THREE.BufferAttribute;
    // TubeGeometry's unit rings are scaled along an irregular taper, preserving smooth curvature.
    for (let ring = 0; ring <= segments; ring++) {
      const t = ring / segments, middle = curve.getPointAt(t);
      const radiusIndex = t * (radii.length - 1), lo = Math.min(radii.length - 2, Math.floor(radiusIndex));
      const r = THREE.MathUtils.lerp(radii[lo], radii[lo + 1], radiusIndex - lo);
      for (let j = 0; j <= sides; j++) {
        const index = ring * (sides + 1) + j;
        positions.setXYZ(index, middle.x + (positions.getX(index) - middle.x) * r, middle.y + (positions.getY(index) - middle.y) * r, middle.z + (positions.getZ(index) - middle.z) * r);
      }
    }
    geo.computeVertexNormals(); addBaked(geo, bark);
  }
  function instance(name: string, geometry: THREE.BufferGeometry, mat: THREE.Material, transforms: Transform[], shadows = false) {
    const mesh = new THREE.InstancedMesh(geometry, mat, transforms.length); mesh.name = name;
    transforms.forEach((t, i) => {
      quat.setFromEuler(t.rotation); matrix.compose(t.position, quat, t.scale); mesh.setMatrixAt(i, matrix);
      if (t.color) mesh.setColorAt(i, t.color);
    });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = shadows; mesh.receiveShadow = true; mesh.computeBoundingSphere(); root.add(mesh); return mesh;
  }
  function wind(mat: THREE.MeshLambertMaterial, amount: number, key: string) {
    mat.onBeforeCompile = shader => {
      shader.uniforms.uGardenTime = { value: 0 };
      mat.userData.shader = shader;
      shader.vertexShader = `uniform float uGardenTime;\n` + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float windPhase = instanceMatrix[3].x * 0.47 + instanceMatrix[3].z * 0.38;
        #else
          float windPhase = 0.0;
        #endif
        float bend = max(position.y, 0.0);
        transformed.x += sin(uGardenTime * 0.78 + windPhase) * ${amount.toFixed(4)} * bend;
        transformed.z += cos(uGardenTime * 0.63 + windPhase * 1.3) * ${(amount * .6).toFixed(4)} * bend;`);
    };
    mat.customProgramCacheKey = () => key; animatedMaterials.push(mat);
  }

  // A continuous level ground, with fine stone courses and an irregular garden verge.
  const groundMap = canvasTexture(512, (c, s) => {
    const r = random(72); c.fillStyle = '#8ca177'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 8000; i++) {
      c.fillStyle = `hsla(${69 + r() * 22},${16 + r() * 15}%,${43 + r() * 23}%,.15)`;
      c.beginPath(); c.ellipse(r() * s, r() * s, 1 + r() * 8, 1 + r() * 4, r() * 6.28, 0, 6.28); c.fill();
    }
  });
  groundMap.wrapS = groundMap.wrapT = THREE.RepeatWrapping; groundMap.repeat.set(30, 40);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 340), new THREE.MeshStandardMaterial({ map: groundMap, color: '#b8c499', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.075, 75); ground.receiveShadow = true; root.add(ground);
  const pavingSurface = createGranitePaving(), paving = pavingSurface.map;
  const pavingMaterial = new THREE.MeshStandardMaterial({ ...pavingSurface, bumpScale: .050, roughness: .96, color: '#eee9df', envMapIntensity: .55 });
  const path = new THREE.Mesh(new THREE.PlaneGeometry(7.25, 220), pavingMaterial);
  path.rotation.x = -Math.PI / 2; path.position.set(0, -.009, 56); path.receiveShadow = true; path.name = 'Hand-laid warm granite avenue'; root.add(path);
  const kerbs: Transform[] = [];
  for (let i = 0; i < 204; i++) for (const side of [-1, 1]) {
    kerbs.push({ position: v(side * 3.69, .035, -47 + i * 1.06), scale: v(.18, .16, 1.02), rotation: new THREE.Euler(), color: color('#d0c3b5').multiplyScalar(.93 + rng() * .13) });
  }
  instance('Dressed stone path edges', new THREE.BoxGeometry(1, 1, 1), edgeStone, kerbs);
  const borderCourses: Transform[] = [];
  for (const side of [-1, 1]) for (let z = -46; z < 167; z += .72) {
    borderCourses.push({ position: v(side * 3.42, -.001, z), scale: v(.23, .021, .685), rotation: new THREE.Euler(0, (rng() - .5) * .022, 0), color: color('#a6a28e').multiplyScalar(.92 + rng() * .15) });
  }
  instance('Quiet grey-green stone border course', new THREE.BoxGeometry(1, 1, 1), edgeStone, borderCourses);

  // A low, hand-built cedar rail behind the garden. Each rail has real posts, crosspieces and finials.
  for (const side of [-1, 1]) {
    for (let z = -43; z < 163; z += 3.3) {
      box(fenceMat, side * 8.25, .61, z, .13, 1.30, .15);
      cylinder(copper, side * 8.25, 1.295, z, .095, .10, .04, 6);
      for (const y of [.40, .94]) box(wood, side * 8.25, y, z + 1.60, .10, .105, 3.22);
    }
  }

  // Dappled individual blossoms are painted to a cutout atlas; crossed irregularly,
  // these clumps have airy silhouettes at every orbit angle, rather than solid sphere crowns.
  const blossomTransforms: Transform[][] = [[], [], []];
  const shadeTransforms: Transform[] = [];
  const canopyShadowTransforms: Transform[] = [];
  const crownMaterials = [103, 304, 715].map((seed, i) => {
    const mat = new THREE.MeshLambertMaterial({ map: blossomTexture(seed), color: ['#ffdfed', '#f7c4d9', '#fff0e3'][i], alphaTest: .42, side: THREE.DoubleSide, emissive: '#9d6678', emissiveIntensity: .035 });
    wind(mat, .065, `sakura-blossom-wind-${i}`); return mat;
  });
  const crownCard = new THREE.PlaneGeometry(1, 1, 1, 1);
  const cardPositions = crownCard.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < cardPositions.count; i++) cardPositions.setZ(i, Math.cos(cardPositions.getX(i) * 3) * Math.cos(cardPositions.getY(i) * 3) * .12);
  // Soft volume normals keep crossing blossom sprays from shading as flat cards.
  const crownNormals = crownCard.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < cardPositions.count; i++) {
    const normal = v(cardPositions.getX(i) * .85, cardPositions.getY(i) * .65, .72).normalize();
    crownNormals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  function blossomClump(p: THREE.Vector3, size: number, variant: number) {
    for (let cross = 0; cross < 3; cross++) {
      blossomTransforms[variant].push({ position: p.clone(), scale: v(size * (1 + rng() * .24), size * (.75 + rng() * .25), size), rotation: new THREE.Euler(rng() * 1.5 - .75, cross * Math.PI / 3 + rng() * .4, rng() * 1.3 - .65), color: color('#ffffff').multiplyScalar(.86 + rng() * .17) });
    }
  }
  function tree(x: number, z: number, scale: number, seed: number) {
    const r = random(seed), inward = x > 0 ? -1 : 1;
    const base = v(x, 0, z), lean = inward * (.42 + r() * .75), twist = (r() - .5) * .6;
    const crown = v(x + lean, 4.20 * scale, z + (r() - .5) * .8);
    canopyShadowTransforms.push({ position: v(x + lean + inward * 1.05, 4.7 * scale, z), scale: v(5.7 * scale, 5.0 * scale, 1), rotation: new THREE.Euler(-Math.PI / 2, 0, seed * .39) });
    shadeTransforms.push({ position: v(x + inward * 1.6, -.002, z + 1.1), scale: v(7.8 * scale, 8.6 * scale, 1), rotation: new THREE.Euler(-Math.PI / 2, 0, r() * 6.28) });
    branch([base, v(x - inward * .13, .72 * scale, z + twist), v(x + lean * .24, 1.8 * scale, z + twist * .5), v(x + lean * .7, 3.16 * scale, z - twist), crown], [.40 * scale, .25 * scale, .21 * scale, .09 * scale], 13, 9);
    colliders.push({ x, z, radius: .48 });
    // Exposed roots are sunk into the verge, with a slightly asymmetric buttress.
    for (let j = 0; j < 5; j++) {
      const a = j * 1.26 + r() * .4;
      branch([v(x, .44, z), v(x + Math.cos(a) * .38, .12, z + Math.sin(a) * .38), v(x + Math.cos(a) * (.9 + r() * .4), -.03, z + Math.sin(a) * (.9 + r() * .4))], [.17, .015], 3, 5);
    }
    // Two sinuous scaffold boughs break the radial umbrella silhouette. Their
    // blossom-laden tips reach inward to make a loose vaulted tunnel.
    for (let arm = 0; arm < 2; arm++) {
      const reach = inward * (3.5 + r() * 1.0) * scale, drift = (arm ? 1 : -1) * (1.2 + r());
      const a = v(x + lean * .30, (1.83 + arm * .45) * scale, z + twist * .5);
      const b = v(x + reach * .35, (3.0 + arm * .22) * scale, z + drift * .25);
      const c = v(x + reach * .73, (3.82 + arm * .28) * scale, z + drift * .8);
      const d = v(x + reach, (4.44 + r() * .45) * scale, z + drift);
      branch([a, b, c, d], [.18 * scale, .14 * scale, .07 * scale, .012], 8, 6);
      for (let j = 0; j < 10; j++) {
        const p = c.clone().lerp(d, r()); p.add(v((r() - .5) * 1.6, .28 + r() * .7, (r() - .5) * 1.8));
        blossomClump(p, .83 + r() * .6, (seed + arm) % 3);
      }
    }
    const n = 7;
    for (let j = 0; j < n; j++) {
      const a = j / n * Math.PI * 2 + r() * .34;
      const reach = (3.05 + r() * 1.1) * scale;
      const origin = v(x + lean * (.45 + r() * .28), (2.56 + r() * 1.0) * scale, z - twist * .5);
      const end = v(crown.x + Math.cos(a) * reach, (3.95 + r() * 1.75) * scale, crown.z + Math.sin(a) * reach);
      const middle = origin.clone().lerp(end, .47); middle.y += .2 + r() * .55; middle.z += Math.cos(a) * .34;
      const bend = origin.clone().lerp(middle, .42); bend.x += Math.sin(a) * .18; bend.y -= .12;
      branch([origin, bend, middle, end], [.105 * scale, .086 * scale, .04 * scale, .008 * scale], 7, 5);
      for (let k = 0; k < 3; k++) {
        const start = middle.clone().lerp(end, .18 + k * .28);
        const twigAngle = a + (k - 1) * .66;
        const twigEnd = v(start.x + Math.cos(twigAngle) * (1.1 + r() * .6) * scale, start.y + (.25 + r() * .70) * scale, start.z + Math.sin(twigAngle) * (1.1 + r() * .6) * scale);
        const bend = start.clone().lerp(twigEnd, .45); bend.y += .18;
        branch([start, bend, twigEnd], [.032 * scale, .003], 3, 4);
        for (let b = 0; b < 6; b++) {
          const point = start.clone().lerp(twigEnd, .28 + r() * .80);
          point.x += (r() - .5) * 1.65 * scale; point.y += (r() - .42) * 1.30 * scale; point.z += (r() - .5) * 1.65 * scale;
          blossomClump(point, (.88 + r() * .57) * scale, (seed + j + k) % 3);
        }
      }
      for (let b = 0; b < 7; b++) {
        const point = crown.clone().lerp(end, r() * .85);
        point.x += (r() - .5) * 1.6; point.y += (r() - .15) * 1.8; point.z += (r() - .5) * 1.6;
        blossomClump(point, .92 + r() * .45, (seed + j) % 3);
      }
    }
  }
  for (let i = -3; i < 24; i++) for (const side of [-1, 1]) {
    const z = -13 + i * 7.55 + (side === 1 ? 2.1 : 0) + (rng() - .5) * .6;
    const x = side * (5.55 + rng() * .55);
    tree(x, z, .87 + rng() * .23, 500 + i * 7 + (side + 1) * 19);
  }
  // Secondary blossom groves dissolve behind the fence and open garden side vistas.
  for (let i = 0; i < 11; i++) {
    const side = i % 2 ? 1 : -1;
    tree(side * (13.5 + rng() * 5), 4 + i * 15.3, .83 + rng() * .12, 2100 + i);
  }
  blossomTransforms.forEach((transforms, i) => instance(`Sakura flowering branches ${i + 1}`, crownCard, crownMaterials[i], transforms, false));
  const canopyShadowMat = new THREE.MeshBasicMaterial({ map: crownMaterials[0].map, alphaTest: .52, side: THREE.DoubleSide, colorWrite: false, depthWrite: false, transparent: true, opacity: 0 });
  const canopyShadow = instance('Sakura canopy shadow filters', new THREE.PlaneGeometry(1, 1), canopyShadowMat, canopyShadowTransforms, true);
  canopyShadow.receiveShadow = false;
  canopyShadow.customDepthMaterial = new THREE.MeshDepthMaterial({ map: crownMaterials[0].map, alphaTest: .52, side: THREE.DoubleSide, depthPacking: THREE.RGBADepthPacking });
  canopyShadow.userData.noAtmosphereDepth = true;
  const shadeTexture = canvasTexture(256, (c, s) => {
    const r = random(342); c.filter = 'blur(4px)';
    for (let i = 0; i < 165; i++) {
      const a = r() * 6.28, radius = Math.sqrt(r()) * 100;
      c.fillStyle = `rgba(97,78,91,${.08 + r() * .13})`;
      c.beginPath(); c.ellipse(s / 2 + Math.cos(a) * radius, s / 2 + Math.sin(a) * radius, 5 + r() * 13, 5 + r() * 9, r() * 6.28, 0, 6.28); c.fill();
    }
    c.filter = 'none';
  });
  const bakedShade = instance('Soft dappled canopy shade', new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadeTexture, transparent: true, depthWrite: false, opacity: .12, polygonOffset: true, polygonOffsetFactor: -1 }), shadeTransforms);
  bakedShade.userData.noAtmosphereDepth = true;

  // Layered leafy understory closes the side and backward horizons. Different
  // heights and olive / sage tones provide depth behind the flowering avenue.
  const leafTexture = canvasTexture(256, (c, s) => {
    const r = random(2393);
    for (let i = 0; i < 145; i++) {
      const a = r() * 6.28, radius = Math.sqrt(r()) * (84 + Math.sin(a * 5) * 12);
      const x = s / 2 + Math.cos(a) * radius, y = s / 2 + Math.sin(a) * radius;
      c.save(); c.translate(x, y); c.rotate(r() * 6.28);
      const l = 7 + r() * 12, w = l * (.40 + r() * .18);
      const gradient = c.createLinearGradient(-w, 0, w, -l);
      gradient.addColorStop(0, '#657958'); gradient.addColorStop(.48, '#839569'); gradient.addColorStop(1, '#a6b284');
      c.fillStyle = gradient;
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-w, -l * .65, 0, -l); c.quadraticCurveTo(w, -l * .55, 0, 0); c.fill(); c.restore();
    }
  });
  const leafMat = new THREE.MeshLambertMaterial({ map: leafTexture, alphaTest: .34, side: THREE.DoubleSide, color: '#c3d0a9' });
  wind(leafMat, .042, 'sakura-garden-understory-wind');
  const leafy: Transform[] = [];
  for (const side of [-1, 1]) for (let row = 0; row < 4; row++) {
    const rowX = [10.5, 15.2, 22, 31][row];
    for (let z = -51; z < 210; z += 4.6 + row * .25) {
      const x = side * (rowX + (rng() - .5) * 2.4), depth = row / 3;
      // The near row has sight-line gaps and rolling height; only the far rows
      // close the horizon. This avoids a straight, cloned hedge behind the rail.
      if (row === 0 && Math.sin(z * .13 + side) > .4) continue;
      for (let cluster = 0; cluster < (row === 0 ? 4 : 6); cluster++) {
        const clumpSize = 1.7 + depth * 1.8 + rng() * 1.0;
        const height = .59 + cluster % 3 * (.38 + depth * 1.20) + depth * .3 + Math.sin(z * .19) * .25;
        const position = v(x + (rng() - .5) * 2.8, height, z + (rng() - .5) * 3.0);
        const tint = color('#d0d0a7').lerp(color('#b0c0b1'), depth).multiplyScalar(.86 + rng() * .20);
        for (let cross = 0; cross < 3; cross++) leafy.push({ position: position.clone(), scale: v(clumpSize, clumpSize * .87, clumpSize), rotation: new THREE.Euler(rng() * .7 - .35, cross * Math.PI / 3 + rng() * .5, rng() * .5 - .25), color: tint });
      }
    }
  }
  // Rounded, uneven shrub masses give the background actual depth. Only the near
  // shrubs carry leaf cutouts, so the distant horizon has no repeating square cards.
  const shrubGeo = new THREE.IcosahedronGeometry(.5, 2);
  const shrubPositions = shrubGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < shrubPositions.count; i++) {
    const x = shrubPositions.getX(i), y = shrubPositions.getY(i), z = shrubPositions.getZ(i);
    const lobe = 1 + Math.sin(x * 13 + z * 5) * .10 + Math.sin(y * 11 - z * 7) * .09;
    shrubPositions.setXYZ(i, x * lobe, y * lobe, z * lobe);
  }
  shrubGeo.computeVertexNormals();
  const shrubNormals = shrubGeo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < shrubNormals.count; i++) {
    const n = v(shrubPositions.getX(i), shrubPositions.getY(i) * 1.12, shrubPositions.getZ(i)).normalize();
    shrubNormals.setXYZ(i, n.x, n.y, n.z);
  }
  const shrubTexture = canvasTexture(512, (c, s) => {
    const r = random(51294); c.fillStyle = '#708567'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 5800; i++) {
      const x = r() * s, y = r() * s, length = 3 + r() * 7;
      c.save(); c.translate(x, y); c.rotate(r() * 6.28);
      c.fillStyle = `hsl(${85 + r() * 18} ${18 + r() * 12}% ${29 + r() * 25}%)`;
      c.beginPath(); c.ellipse(0, 0, length, length * .42, 0, 0, 6.28); c.fill();
      if (i % 4 === 0) { c.strokeStyle = 'rgba(197,210,153,.23)'; c.lineWidth = .65; c.beginPath(); c.moveTo(-length + 1, 0); c.lineTo(length - 1, 0); c.stroke(); }
      c.restore();
    }
  });
  shrubTexture.wrapS = shrubTexture.wrapT = THREE.RepeatWrapping; shrubTexture.repeat.set(3, 2);
  const shrubMat = new THREE.MeshLambertMaterial({ color: '#8d9d7f', map: shrubTexture });
  wind(shrubMat, .015, 'rounded-understory-volume-wind');
  const shrubVolumes = leafy.filter((_, index) => index % 6 === 0).map(t => {
    const scale = t.scale.clone();
    scale.y = Math.max(scale.y, t.position.y * 1.85);
    // Every supporting crown extends into the soil, including the taller back
    // rows. This prevents disconnected foliage balls above the horizon.
    const position = t.position.clone(); position.y = scale.y * .36;
    return {...t, position, scale, rotation:new THREE.Euler(0,t.rotation?.y ?? 0,0)};
  });
  instance('Rounded woodland understory masses', shrubGeo, shrubMat, shrubVolumes);
  // Small sprays break up the contour of each supporting volume. Their normals
  // point out from the canopy, so the light reads as leaves around a living crown.
  const edgeLeaves: Transform[] = [], shellRandom = random(78311);
  const up = v(0, 0, 1), q = new THREE.Quaternion();
  for (const cluster of shrubVolumes) {
    for (let i = 0; i < 44; i++) {
      const ny = 1 - 2 * (i + .5) / 44, a = i * 2.399963 + shellRandom() * .3;
      const radius = Math.sqrt(1 - ny * ny), n = v(Math.cos(a) * radius, ny, Math.sin(a) * radius);
      const p = n.clone().multiply(cluster.scale).multiplyScalar(.48 + shellRandom() * .07).add(cluster.position);
      const size = .78 + shellRandom() * .45 + Math.min(cluster.scale.x, 4) * .17;
      q.setFromUnitVectors(up, n);
      edgeLeaves.push({position:p, scale:v(size,size,size), rotation:new THREE.Euler().setFromQuaternion(q), color:cluster.color});
    }
  }
  instance('Individual woodland leaf sprays', crownCard, leafMat, edgeLeaves);

  // A planted border has soil, low leaves, flowers and taller fern silhouettes.
  // Its irregular outline follows the verge without intruding on the walking lane.
  const mulchMap = canvasTexture(256, (c, s) => {
    const r = random(388); c.fillStyle = '#676447'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 1700; i++) {
      c.fillStyle = i % 4 ? `rgba(152,143,101,${.1 + r() * .2})` : 'rgba(57,61,39,.24)';
      c.beginPath(); c.ellipse(r() * s, r() * s, 1 + r() * 4, .8 + r() * 1.4, r() * 6.28, 0, 6.28); c.fill();
    }
  });
  mulchMap.wrapS = mulchMap.wrapT = THREE.RepeatWrapping; mulchMap.repeat.set(.8, .8);
  const mulchMat = new THREE.MeshStandardMaterial({ map: mulchMap, ...createSurfaceRelief(mulchMap, .95, 1.8), bumpScale: .035, color: '#b1b48d', roughness: 1 });
  for (const side of [-1, 1]) {
    const bed = new THREE.Shape();
    for (let z = -42; z <= 166; z += 2) {
      const x = side * (4.02 + Math.sin(z * .29 + side) * .12);
      if (z === -42) bed.moveTo(x, -z); else bed.lineTo(x, -z);
    }
    for (let z = 166; z >= -42; z -= 2) bed.lineTo(side * (6.95 + Math.sin(z * .16) * .65), -z);
    bed.closePath();
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(bed), mulchMat);
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = -.059; mesh.receiveShadow = true; mesh.name = 'Curving moss and leaf-litter planting bed'; root.add(mesh);
  }
  function perennialTexture(seed: number, flowering: boolean) {
    const r = random(seed);
    return canvasTexture(512, c => {
      for (let stem = 0; stem < 58; stem++) {
        const x = 256 + (r() - .5) * 365, top = 65 + r() * 240, baseX = 256 + (r() - .5) * 165;
        c.strokeStyle = '#6f8250'; c.lineWidth = 2 + r() * 2;
        c.beginPath(); c.moveTo(baseX, 498); c.quadraticCurveTo(x + 20, top + 100, x, top); c.stroke();
        for (let leaf = 0; leaf < 4; leaf++) {
          const t = .25 + leaf * .19, py = top + (492 - top) * t, px = x + (baseX - x) * t;
          const length = 20 + r() * 28, direction = leaf % 2 ? 1 : -1;
          c.save(); c.translate(px, py); c.rotate(direction * (.65 + r() * .3));
          const g = c.createLinearGradient(-12, 0, 12, -length); g.addColorStop(0, '#536f4c'); g.addColorStop(.55, '#869b63'); g.addColorStop(1, '#b0bd7e');
          c.fillStyle = g; c.beginPath(); c.moveTo(0, 3); c.bezierCurveTo(-19, -length * .4, -12, -length * .95, 0, -length); c.bezierCurveTo(13, -length * .8, 15, -length * .3, 0, 3); c.fill();
          c.strokeStyle = 'rgba(210,223,153,.30)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -length + 4); c.stroke(); c.restore();
        }
        if (flowering && stem % 2 === 0) {
          const radius = 8 + r() * 8;
          for (let petal = 0; petal < 5; petal++) {
            const a = petal * 1.256 + stem;
            c.fillStyle = seed % 2 ? ['#fff2dc', '#fff7e8', '#e6dfc1'][petal % 3] : ['#efcad5', '#dba8bf', '#f4d8df'][petal % 3];
            c.beginPath(); c.ellipse(x + Math.cos(a) * radius * .57, top + Math.sin(a) * radius * .57, radius * .65, radius * .45, a, 0, 6.28); c.fill();
          }
          c.fillStyle = '#c9a260'; c.beginPath(); c.arc(x, top, radius * .2, 0, 6.28); c.fill();
        }
      }
    });
  }
  const perennialMaterials = [721, 826, 928].map((seed, i) => {
    const mat = new THREE.MeshLambertMaterial({ map: perennialTexture(seed, i < 2), alphaTest: .43, side: THREE.DoubleSide, color: '#faf6dc' });
    wind(mat, .052, `perennial-wind-${i}`); return mat;
  });
  const plantGeo = new THREE.PlaneGeometry(1, 1); plantGeo.translate(0, .5, 0);
  const plantRows: Transform[][] = [[], [], []];
  const furnitureSites = [[-5.1, 18, 1.35], [5.1, 47, 1.35], [-5.1, 84, 1.35], [5.1, 118, 1.35], [-5.1, 151, 1.35]];
  for (let z = 4; z < 159; z += 18.5) furnitureSites.push([-4.23, z, .55], [4.23, z + 3, .55]);
  for (const side of [-1, 1]) for (let z = -39; z < 165; z += .85) {
    const band = Math.sin(z * .26 + side * 1.1), variant = band > .22 ? 0 : band < -.42 ? 1 : 2;
    const count = 2 + Math.floor(rng() * 2);
    for (let j = 0; j < count; j++) {
      const px = side * (4.20 + j * .59 + rng() * .22), pz = z + (rng() - .5) * .6;
      // Keep the lantern plinth and bench aprons visible among the planting.
      if (colliders.some(c => Math.hypot(c.x - px, c.z - pz) < c.radius + .34)) continue;
      if (furnitureSites.some(([x, z, radius]) => Math.hypot(x - px, z - pz) < radius)) continue;
      const height = (.32 + rng() * .22) * (j === 0 ? .80 : 1.0), width = .75 + rng() * .45;
      for (let cross = 0; cross < 2; cross++) plantRows[variant].push({ position: v(px, -.055, pz), scale: v(width, height, width), rotation: new THREE.Euler(0, cross * Math.PI * .5 + rng() * .45, 0), color: color('#ffffff').multiplyScalar(.90 + rng() * .13) });
    }
  }
  plantRows.forEach((transforms, i) => instance(['Ivory anemone planting drifts', 'Dusty rose woodland flowers', 'Quiet silver-green groundcover'][i], plantGeo, perennialMaterials[i], transforms));

  const fernParts: THREE.BufferGeometry[] = [];
  for (let frond = 0; frond < 5; frond++) {
    const angle = frond * 2.399, height = .43 + (frond % 2) * .11;
    for (let pair = 0; pair < 7; pair++) {
      const t = .16 + pair * .115, spread = Math.sin(t * Math.PI) * .13;
      for (const side of [-1, 1]) {
        const start = v(Math.sin(angle) * t * .31, Math.sin(t * 1.7) * height, Math.cos(angle) * t * .31);
        const tip = v(start.x + Math.sin(angle + side * .86) * spread, start.y + .055, start.z + Math.cos(angle + side * .86) * spread);
        const center = start.clone().lerp(tip, .5), offset = v(Math.cos(angle) * .025, .009, -Math.sin(angle) * .025);
        const points = [start, center.clone().add(offset), tip, start, tip, center.clone().sub(offset)];
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(p => [p.x, p.y, p.z]), 3)); geo.computeVertexNormals(); fernParts.push(geo);
      }
    }
  }
  const fernGeo = mergeGeometries(fernParts)!; fernParts.forEach(g => g.dispose());
  const fernMat = new THREE.MeshLambertMaterial({ color: '#79966b', side: THREE.DoubleSide }); wind(fernMat, .11, 'woodland-fern-wind');
  const fernTransforms: Transform[] = [];
  for (let i = 0; i < 155; i++) {
    const side = i % 2 ? 1 : -1, z = -18 + rng() * 177, s = .75 + rng() * .6;
    fernTransforms.push({ position: v(side * (4.52 + rng() * 2.2), -.055, z), scale: v(s, s, s), rotation: new THREE.Euler(0, rng() * 6.28, 0), color: color(i % 3 ? '#bdcca0' : '#d4d5a6') });
  }
  instance('Individual arching fern fronds', fernGeo, fernMat, fernTransforms);

  // A shallow side rill adds a cool reflective material and a quiet garden
  // destination. It stays beyond the walkable bounds, so no water collision is needed.
  const waterMap = canvasTexture(256, (c, s) => {
    const r = random(704); c.fillStyle = '#71998d'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const y = r() * s;
      c.strokeStyle = i % 3 ? 'rgba(219,237,210,.15)' : 'rgba(39,80,75,.12)'; c.lineWidth = .5 + r() * 1.0;
      c.beginPath(); c.moveTo(0, y);
      for (let x = 0; x <= s; x += 8) c.lineTo(x, y + Math.sin(x * .065 + i) * (1 + r() * 2)); c.stroke();
    }
  });
  waterMap.wrapS = waterMap.wrapT = THREE.RepeatWrapping; waterMap.repeat.set(1.4, 18);
  const waterGeo = new THREE.BufferGeometry(), waterVertices: number[] = [], waterUvs: number[] = [], waterIndices: number[] = [];
  const waterEdges: Array<{ x: number; z: number }> = [];
  for (let row = 0; row <= 110; row++) {
    const z = 1 + row * .56, center = 7.08 + Math.sin(z * .12) * .42, width = .69 + Math.sin(z * .20) * .09;
    for (const side of [-1, 1]) {
      waterVertices.push(center + side * width * .5, -.031, z); waterUvs.push((side + 1) / 2, row / 110);
      if (row % 2 === 0) waterEdges.push({ x: center + side * (width * .5 + .085), z });
    }
    if (row < 110) { const i = row * 2; waterIndices.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
  }
  waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(waterVertices, 3)); waterGeo.setAttribute('uv', new THREE.Float32BufferAttribute(waterUvs, 2)); waterGeo.setIndex(waterIndices); waterGeo.computeVertexNormals();
  const waterNormal = createWaterNormal();
  const waterMat = new THREE.MeshPhysicalMaterial({ map: waterMap, normalMap: waterNormal, normalScale: new THREE.Vector2(.75, .75), color: '#91b9ae', metalness: 0, roughness: .14, ior: 1.333, clearcoat: 1, clearcoatRoughness: .10, clearcoatNormalMap: waterNormal, clearcoatNormalScale: new THREE.Vector2(.4, .4), envMapIntensity: 1.4 });
  const water = new THREE.Mesh(waterGeo, waterMat); water.name = 'The spring rill · soft travelling ripples'; water.receiveShadow = true; root.add(water);

  // Hand-shaped grasses: nine bending blades per tuft, one instanced draw.
  const grassVertices: number[] = [], grassNormals: number[] = [], grassColors: number[] = [];
  for (let j = 0; j < 7; j++) {
    const a = j * 2.399, h = .14 + rng() * .19, w = .016 + rng() * .014;
    const dx = Math.cos(a), dz = Math.sin(a), offset = .035;
    const pts = [v(-dz * w + dx * offset, 0, dx * w + dz * offset), v(dz * w + dx * offset, 0, -dx * w + dz * offset), v(dx * .05, h * .62, dz * .05), v(dx * .12, h, dz * .12)];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const point = pts[index]; grassVertices.push(point.x, point.y, point.z); grassNormals.push(0, 1, 0);
      const c = color(index === 3 ? '#b2c28e' : index === 2 ? '#90a771' : '#648451'); grassColors.push(c.r, c.g, c.b);
    }
  }
  const grassGeo = new THREE.BufferGeometry(); grassGeo.setAttribute('position', new THREE.Float32BufferAttribute(grassVertices, 3)); grassGeo.setAttribute('normal', new THREE.Float32BufferAttribute(grassNormals, 3)); grassGeo.setAttribute('color', new THREE.Float32BufferAttribute(grassColors, 3));
  const grassMat = new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide, vertexColors: true }); wind(grassMat, .17, 'sakura-grass-wind');
  const grassTransforms: Transform[] = [];
  for (let i = 0; i < 3000; i++) {
    const side = rng() > .5 ? 1 : -1, x = side * (3.94 + Math.pow(rng(), 2.1) * 15), z = -42 + rng() * 210;
    const scale = .6 + rng() * .55;
    grassTransforms.push({ position: v(x, -.04, z), scale: v(scale, scale, scale), rotation: new THREE.Euler(0, rng() * 6.28, 0) });
  }
  instance('Breeze in the wild grass', grassGeo, grassMat, grassTransforms);

  // Natural clusters of tiny white / lilac flowers sit along the garden rather than in the walk lane.
  const flowerShape = new THREE.Shape();
  for (let j = 0; j <= 15; j++) { const a = j / 15 * Math.PI * 2, r = .5 + Math.cos(a * 5) * .14; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (j === 0) flowerShape.moveTo(x, y); else flowerShape.lineTo(x, y); }
  const flowerGeo = new THREE.ShapeGeometry(flowerShape, 3); flowerGeo.rotateX(-Math.PI / 2);
  const flowers: Transform[] = [];
  for (let i = 0; i < 950; i++) {
    const side = rng() > .5 ? 1 : -1, x = side * (4.0 + rng() * 3.5), z = -17 + rng() * 182;
    const height = .075 + rng() * .12, s = .045 + rng() * .07;
    flowers.push({ position: v(x, height, z), scale: v(s, s, s), rotation: new THREE.Euler(rng() * .5, rng() * 6.28, rng() * .35), color: color(i % 3 ? '#fff6d9' : '#c4a4cd') });
  }
  instance('Spring anemones at the verge', flowerGeo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), flowers);

  // Stone lanterns are built from weathered plinths, tapered shafts, lit paper chambers and four eaves.
  function lantern(x: number, z: number) {
    box(darkStone, x, .07, z, .62, .14, .62);
    box(stone, x, .17, z, .49, .09, .49);
    cylinder(stone, x, .57, z, .12, .19, .72, 6);
    cylinder(moss, x, .92, z, .26, .16, .14, 6);
    box(stone, x, 1.025, z, .52, .12, .52);
    box(lanternLight, x, 1.26, z, .31, .36, .31);
    for (const a of [-1, 1]) for (const b of [-1, 1]) box(darkStone, x + a * .20, 1.265, z + b * .20, .075, .40, .075);
    box(stone, x, 1.49, z, .53, .12, .53);
    // Four sloping eaves make a pagoda cap, with a thin, slightly upswept lower lip.
    addBaked(new THREE.CylinderGeometry(.15, .48, .26, 4, 1), darkStone, v(x, 1.68, z), v(1, 1, 1), new THREE.Euler(0, Math.PI / 4, 0));
    box(stone, x, 1.56, z, .73, .055, .73);
    cylinder(stone, x, 1.86, z, .075, .12, .13, 8);
    cylinder(darkStone, x, 1.96, z, .01, .075, .13, 8);
    colliders.push({ x, z, radius: .40 });
  }
  for (let z = 4; z < 159; z += 18.5) { lantern(-4.23, z); lantern(4.23, z + 3); }

  function bench(x: number, z: number, side: number) {
    const angle = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    const center = v(x, 0, z);
    const local = (px: number, py: number, pz: number) => v(px, py, pz).applyAxisAngle(v(0, 1, 0), angle).add(center);
    const piece = (mat: THREE.Material, px: number, py: number, pz: number, sx: number, sy: number, sz: number) => { const p = local(px, py, pz); box(mat, p.x, p.y, p.z, sx, sy, sz, angle); };
    piece(stone, 0, -.012, .06, 2.7, .08, 1.65);
    for (const a of [-1, 1]) {
      piece(darkWood, a * .87, .28, -.02, .12, .55, .60);
      piece(darkWood, a * .87, .73, .25, .10, .84, .10);
      piece(wood, a * 1.01, .73, -.03, .085, .075, .62);
    }
    for (let j = 0; j < 4; j++) piece(wood, 0, .55, -.25 + j * .15, 2.15, .055, .12);
    for (let j = 0; j < 3; j++) piece(wood, 0, .77 + j * .15, .28, 2.15, .11, .055);
    colliders.push({ x, z, radius: 1.15 });
  }
  [[-5.1, 18, -1], [5.1, 47, 1], [-5.1, 84, -1], [5.1, 118, 1], [-5.1, 151, -1]].forEach(([x, z, side]) => bench(x, z, side));

  // Petals carpet the granite edges in loose, wind-sorted drifts, with a few across the lane.
  const petalShape = new THREE.Shape(); petalShape.moveTo(0, -.52); petalShape.bezierCurveTo(-.50, -.12, -.54, .50, -.12, .46); petalShape.lineTo(0, .29); petalShape.lineTo(.12, .46); petalShape.bezierCurveTo(.54, .50, .50, -.12, 0, -.52);
  const petalGeo = new THREE.ShapeGeometry(petalShape, 3);
  const groundPetals: Transform[] = [];
  for (let i = 0; i < 11500; i++) {
    const side = rng() > .5 ? 1 : -1;
    const x = i % 4 ? side * (2.72 + rng() * 2.15) : (rng() - .5) * 7;
    const z = -42 + rng() * 207, s = .030 + rng() * .047;
    groundPetals.push({ position: v(x, Math.abs(x) > 3.82 ? -.043 : .007 + rng() * .002, z), scale: v(s, s * (.7 + rng() * .5), s), rotation: new THREE.Euler(-Math.PI / 2, 0, rng() * 6.28), color: color(i % 4 === 0 ? '#f1bed0' : i % 3 === 0 ? '#e8a1bb' : '#f9dce1') });
  }
  instance('Fallen sakura petals · wind-sorted drifts', petalGeo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), groundPetals);

  // The avenue has a destination, but no objective: a quiet torii and a little shrine beyond.
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(6.4, 64), pavingMaterial);
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, -.004, 159); plaza.receiveShadow = true; root.add(plaza);
  function curvedBeam(width: number, height: number, depth: number, x: number, y: number, z: number, mat: THREE.Material) {
    const shape = new THREE.Shape(); shape.moveTo(-width / 2, 0);
    shape.quadraticCurveTo(0, -height * .65, width / 2, 0); shape.lineTo(width / 2 + .06, height);
    shape.quadraticCurveTo(0, height * .28, -width / 2 - .06, height); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .025, bevelThickness: .025, curveSegments: 12 });
    addBaked(geometry, mat, v(x, y, z - depth / 2));
  }
  function torii(z: number, scale: number) {
    for (const side of [-1, 1]) {
      const x = side * 2.4 * scale;
      cylinder(darkStone, x, .17 * scale, z, .29 * scale, .33 * scale, .34 * scale, 10);
      cylinder(vermilion, x, 2.30 * scale, z, .20 * scale, .245 * scale, 4.45 * scale, 12);
      cylinder(darkWood, x, .58 * scale, z, .249 * scale, .252 * scale, .43 * scale, 12);
    }
    curvedBeam(6.6 * scale, .32 * scale, .46 * scale, 0, 4.50 * scale, z, darkWood);
    curvedBeam(6.26 * scale, .19 * scale, .39 * scale, 0, 4.34 * scale, z, vermilion);
    box(vermilion, 0, 3.63 * scale, z, 6.10 * scale, .20 * scale, .25 * scale);
    box(vermilion, 0, 3.98 * scale, z, .20 * scale, .66 * scale, .21 * scale);
    box(darkWood, 0, 4.03 * scale, z - .17 * scale, .49 * scale, .60 * scale, .07 * scale);
    box(copper, 0, 4.03 * scale, z - .216 * scale, .37 * scale, .49 * scale, .02 * scale);
  }
  torii(166, 1); torii(181, .84); torii(-41, .88);
  // Discrete garden stones and moss at the shrine approach.
  for (let i = 0; i < 12; i++) box(edgeStone, 0, -.002, 166 + i * 1.55, 2.30, .05, 1.30);
  box(stone, 0, .17, 188, 5.2, .34, 4.1);
  box(wood, 0, 1.42, 188, 4.1, 2.55, 3.0);
  box(darkWood, 0, 1.45, 186.45, 1.7, 2.2, .15);
  for (let i = 0; i < 8; i++) box(wood, -.73 + i * .21, 1.5, 186.345, .055, 2.12, .08);
  for (const side of [-1, 1]) {
    box(darkWood, side * 1.8, 1.45, 186.40, .16, 2.65, .18);
    addBaked(new THREE.BoxGeometry(3.3, .20, 4.0), roofMat, v(side * 1.32, 3.37, 188), v(1, 1, 1), new THREE.Euler(0, 0, side * -.34));
    box(darkWood, side * 2.85, 2.83, 188, .13, .20, 4.25);
  }
  curvedBeam(6.2, .18, 4.15, 0, 2.85, 188, roofMat);
  box(copper, 0, 3.99, 188, .18, .12, 4.12);

  // Rolling sage hills and scattered dark evergreens establish distant scenery.
  const hillGeo = new THREE.PlaneGeometry(310, 330, 48, 44); hillGeo.rotateX(-Math.PI / 2);
  const hp = hillGeo.attributes.position as THREE.BufferAttribute;
  const hillColors: number[] = [];
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), z = hp.getZ(i);
    const edge = THREE.MathUtils.smoothstep(Math.abs(x), 18, 75);
    const backRidge = THREE.MathUtils.smoothstep(z + 94, 194, 245);
    const h = edge * (4 + Math.sin(x * .058 + z * .015) * 4 + Math.sin(z * .054 + x * .038) * 3.3)
      + backRidge * (17 + Math.sin(x * .038 + 1) * 6 + Math.sin(x * .081) * 3);
    hp.setY(i, h - .18);
    const c = color('#829983').lerp(color('#a1b2a0'), THREE.MathUtils.clamp(h / 24, 0, 1)).lerp(color('#657f7d'), backRidge * .65); hillColors.push(c.r, c.g, c.b);
  }
  hillGeo.computeVertexNormals(); hillGeo.setAttribute('color', new THREE.Float32BufferAttribute(hillColors, 3));
  const hills = new THREE.Mesh(hillGeo, new THREE.MeshLambertMaterial({ vertexColors: true })); hills.position.z = 94; hills.receiveShadow = true; root.add(hills);
  const rockTransforms: Transform[] = [];
  const rockGeo = new THREE.DodecahedronGeometry(1, 0); const rp = rockGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i); const d = .9 + .13 * Math.sin(x * 7 + z * 9); rp.setXYZ(i, x * d, y * d, z * d); } rockGeo.computeVertexNormals();
  for (let i = 0; i < 72; i++) {
    const side = i % 2 ? 1 : -1, x = side * (6.9 + rng() * 13), z = -12 + rng() * 185, s = .25 + rng() * .52;
    rockTransforms.push({ position: v(x, .13, z), scale: v(s, s * .55, s * .75), rotation: new THREE.Euler(rng() * .2, rng() * 6.28, rng() * .18), color: color(i % 3 ? '#a4aa8c' : '#9b9488') });
  }
  // Moss-topped stones frame small planted pockets instead of a ruler-straight bed.
  for (const side of [-1, 1]) for (let z = -24; z < 164; z += 1.1 + rng() * .4) {
    if (Math.sin(z * .31 + side) < -.25) continue;
    const s = .12 + rng() * .11;
    rockTransforms.push({ position: v(side * (3.97 + Math.sin(z * .29 + side) * .11), -.008, z), scale: v(s * 1.5, s * .42, s * 1.6), rotation: new THREE.Euler(rng() * .1, rng() * 6.28, rng() * .1), color: color('#a0ab82').multiplyScalar(.87 + rng() * .23) });
  }
  for (const p of waterEdges) {
    const s = .17 + rng() * .06;
    rockTransforms.push({ position: v(p.x, -.011, p.z), scale: v(s, s * .42, s * 1.8), rotation: new THREE.Euler(0, rng() * .4, rng() * .1), color: color('#8d9d88').multiplyScalar(.9 + rng() * .2) });
  }
  instance('Moss and garden stones', rockGeo, stone, rockTransforms, false);

  // Pool all structural geometry by material, for low CPU / draw-call overhead.
  for (const [mat, geometries] of baked) {
    // The components all carry position, normal and UV attributes.
    // Extruded curved eaves are non-indexed; boxes/cylinders use indices.
    const mixedIndices = geometries.some(g => Boolean(g.index) !== Boolean(geometries[0].index));
    const normalized = mixedIndices ? geometries.map(g => g.index ? g.toNonIndexed() : g) : geometries;
    const merged = mergeGeometries(normalized, false)!;
    const mesh = new THREE.Mesh(merged, mat); mesh.name = mat === bark ? 'Continuous curved sakura trunks and twigs' : 'Garden craft · merged structure';
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    geometries.forEach(g => g.dispose());
    if (mixedIndices) normalized.forEach((g, i) => { if (g !== geometries[i]) g.dispose(); });
  }

  // Instanced geometry keeps 2,600 gently tumbling petals on the GPU. They occupy
  // fixed world space; walking through them never drags a particle cloud along.
  const flyingCount = 2600, flyingGeo = new THREE.InstancedBufferGeometry();
  flyingGeo.index = petalGeo.index;
  flyingGeo.setAttribute('position', petalGeo.getAttribute('position'));
  const seeds = new Float32Array(flyingCount * 4), tints = new Float32Array(flyingCount * 3);
  for (let i = 0; i < flyingCount; i++) {
    seeds.set([(rng() - .5) * 25, rng() * 10, -24 + rng() * 214, rng() * 6.28], i * 4);
    const c = color(i % 4 === 0 ? '#ffffff' : i % 3 === 0 ? '#f7c1d5' : '#ffe1e9'); tints.set([c.r, c.g, c.b], i * 3);
  }
  flyingGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4)); flyingGeo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3)); flyingGeo.instanceCount = flyingCount;
  const flyingMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: `
      uniform float uTime;
      attribute vec4 aSeed; attribute vec3 aTint;
      varying vec3 vTint; varying float vAlpha;
      #include <fog_pars_vertex>
      void main() {
        float t = uTime;
        float phase = aSeed.w;
        float size = 0.055 + (sin(phase * 19.0) * 0.5 + 0.5) * 0.055;
        vec3 p = position * size;
        float a = t * (0.6 + phase * 0.07) + phase;
        float b = t * 0.8 + phase * 2.0;
        p.xy = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xy;
        p.yz = mat2(cos(b), -sin(b), sin(b), cos(b)) * p.yz;
        float fall = mod(aSeed.y - t * (0.25 + 0.035 * phase), 10.0);
        vec3 center = vec3(aSeed.x + sin(t * 0.29 + phase) * 1.30 + sin(t * 0.73 + phase) * 0.26,
          fall, aSeed.z + sin(t * 0.21 + phase) * 1.80 + cos(t * 0.48 + phase) * 0.40);
        vec4 mvPosition = modelViewMatrix * vec4(p + center, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vTint = aTint * (0.92 + abs(sin(b)) * 0.12);
        vAlpha = smoothstep(0.0, 0.32, fall) * (1.0 - smoothstep(8.8, 10.0, fall));
        #include <fog_vertex>
      }`,
    fragmentShader: `
      varying vec3 vTint; varying float vAlpha;
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(vTint, vAlpha * 0.94);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  const flyingPetals = new THREE.Mesh(flyingGeo, flyingMat); flyingPetals.name = 'Wind-borne sakura petals'; flyingPetals.frustumCulled = false; root.add(flyingPetals);

  let environmentTriangles = 0, environmentMeshes = 0;
  const environmentMaterials = new Set<THREE.Material>(), environmentTextures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    environmentMeshes++;
    const geometry = object.geometry;
    const instances = object instanceof THREE.InstancedMesh ? object.count : geometry instanceof THREE.InstancedBufferGeometry ? geometry.instanceCount : 1;
    environmentTriangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3 * instances;
    for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
      environmentMaterials.add(mat);
      for (const value of Object.values(mat)) if (value instanceof THREE.Texture) environmentTextures.add(value);
    }
  });
  root.userData.diagnostics = {
    source: 'Locally authored procedural garden; no external service or downloaded assets',
    trees: 65, blossomCards: blossomTransforms.reduce((sum, list) => sum + list.length, 0),
    groundPetals: groundPetals.length, flyingPetals: flyingCount, grassTufts: grassTransforms.length,
    materials: environmentMaterials.size, meshes: environmentMeshes, textures: environmentTextures.size, triangles: Math.round(environmentTriangles),
    perennialPlants: plantRows.reduce((n, list) => n + list.length / 2, 0), fernClusters: fernTransforms.length, gardenStones: rockTransforms.length,
    canopyShadowFilters: canopyShadowTransforms.length, roundedShrubs: shrubVolumes.length,
    note: 'Bevelled granite relief and mineral roughness, weathered bark/cedar, rounded woodland masses, alpha-cut real canopy shadows, planted beds and physical reflective rill. Repeated surfaces are instanced; structures are merged.'
  };
  return {
    diagnostics: root.userData.diagnostics,
    update(_dt: number, time: number, _focus: THREE.Vector3) {
      flyingMat.uniforms.uTime.value = time;
      waterMap.offset.y = time * .008;
      waterNormal.offset.set(time * .004, time * .012);
      for (const mat of animatedMaterials) if (mat.userData.shader) mat.userData.shader.uniforms.uGardenTime.value = time;
    },
    colliders,
    bounds: { minX: -3.27, maxX: 3.27, minZ: -12, maxZ: 160 },
    landmarks: [ { name: '花のトンネル · Blossom tunnel', z: 0 }, { name: '木漏れ日 · Sunlit promenade', z: 44 }, { name: '風のささやき · A soft spring breeze', z: 91 }, { name: '小さな祈り · A quiet place', z: 145 } ]
  };
}
