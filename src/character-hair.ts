import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VRM } from '@pixiv/three-vrm';

type Point = [number, number, number];
type Lock = { mesh: THREE.Mesh; rest: Float32Array; phase: number; strength: number };

/** Warm, fine painted strands; the shine is restrained so hair never reads as plastic. */
function hairTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const base = ctx.createLinearGradient(0, 0, 512, 0);
  base.addColorStop(0, '#291c1b'); base.addColorStop(.22, '#3b2925');
  base.addColorStop(.53, '#48332d'); base.addColorStop(.76, '#392824'); base.addColorStop(1, '#261b1c');
  ctx.fillStyle = base; ctx.fillRect(0, 0, 512, 1024);
  let seed = 28517;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 330; i++) {
    const x = random() * 512, drift = (random() - .5) * 15;
    ctx.strokeStyle = i % 4 ? `rgba(153,116,94,${.035 + random() * .075})` : `rgba(14,10,15,${.09 + random() * .10})`;
    ctx.lineWidth = .35 + random() * 1.3;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + drift, 300, x - drift, 700, x + drift * .4, 1024); ctx.stroke();
  }
  const glow = ctx.createLinearGradient(0, 0, 0, 1024);
  glow.addColorStop(0, 'rgba(188,147,115,0)'); glow.addColorStop(.22, 'rgba(188,147,115,.065)');
  glow.addColorStop(.33, 'rgba(188,147,115,.11)'); glow.addColorStop(.45, 'rgba(188,147,115,.02)');
  glow.addColorStop(1, 'rgba(24,16,19,.16)'); ctx.fillStyle = glow; ctx.fillRect(0, 0, 512, 1024);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8; return map;
}

/** A convex, tapered lock with a soft edge, not a cylinder or a conical spike. */
function ribbon(points: Point[], width: number, outward: Point, seed: number, fine = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  const count = fine ? 18 : 28, across = fine ? 4 : 8;
  const positions: number[] = [], uv: number[] = [], index: number[] = [];
  const normal = new THREE.Vector3(...outward).normalize();
  const side = new THREE.Vector3(), cross = new THREE.Vector3();
  for (let j = 0; j <= count; j++) {
    const t = j / count, center = curve.getPoint(t), tangent = curve.getTangent(t);
    side.crossVectors(tangent, normal).normalize(); cross.crossVectors(side, tangent).normalize();
    const rootBlend = Math.min(1, .24 + t * 6.5), tipBlend = Math.pow(Math.max(.015, 1 - t), .49);
    const spread = width * rootBlend * tipBlend * (1 + Math.sin(t * 5.3 + seed) * .09);
    for (let k = 0; k <= across; k++) {
      const u = k / across, q = u * 2 - 1;
      const round = (1 - q * q) * width * .105;
      const p = center.clone().addScaledVector(side, q * spread / 2).addScaledVector(cross, round);
      positions.push(p.x, p.y, p.z); uv.push(u, t);
      if (j && k) { const n = j * (across + 1) + k; index.push(n, n - across - 2, n - 1, n, n - across - 1, n - across - 2); }
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(index); geo.computeVertexNormals(); return geo;
}

function scalp(): THREE.BufferGeometry {
  const p: number[] = [], uv: number[] = [], ix: number[] = [], rows = 22, cols = 80;
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    const a = c / cols * Math.PI * 2;
    const frontal = Math.pow(Math.max(0, -Math.cos(a)), 5);
    const theta = r / rows * (1.95 - frontal * .79);
    p.push(.108 * Math.sin(theta) * Math.sin(a), .079 + .131 * Math.cos(theta), .013 + .119 * Math.sin(theta) * Math.cos(a));
    uv.push(c / cols * 6, r / rows);
    if (r && c) { const n = r * (cols + 1) + c; ix.push(n, n - cols - 2, n - 1, n, n - cols - 1, n - cols - 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals(); return g;
}

function sakuraClip(): THREE.Group {
  const group = new THREE.Group(); group.name = 'Reference-sakura-temple-clip';
  const pink = new THREE.MeshStandardMaterial({color:0xf3a9ba,roughness:.79,side:THREE.DoubleSide});
  const pale = new THREE.MeshStandardMaterial({color:0xffd0d8,roughness:.8,side:THREE.DoubleSide});
  const gold = new THREE.MeshStandardMaterial({color:0xe8ba79,roughness:.53});
  const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.bezierCurveTo(-.008, .006, -.012, .018, -.003, .020);
  shape.lineTo(0,.017); shape.lineTo(.003,.020); shape.bezierCurveTo(.013,.018,.008,.006,0,0);
  const petal = new THREE.ShapeGeometry(shape,10);
  for(let i=0;i<5;i++){const mesh=new THREE.Mesh(petal,i%2?pink:pale);mesh.rotation.z=i/5*Math.PI*2;mesh.rotation.x=.13;group.add(mesh);}
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2,s=new THREE.Mesh(new THREE.SphereGeometry(.0015,7,5),gold);s.position.set(Math.sin(a)*.0038,Math.cos(a)*.0038,.002);group.add(s);}
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshStandardMaterial({color:0x74765a,roughness:.9}));
  leaf.position.set(-.013,-.014,-.002);leaf.scale.set(.007,.015,.0016);leaf.rotation.z=-.55;group.add(leaf);
  group.position.set(-.094,.099,-.065); group.rotation.set(0, -2.45, -.18); return group;
}

/** Call on the unscaled VRoid A, after rotateVRM0. Imported face and rig remain intact. */
export function createReferenceHair(vrm: VRM) {
  let hiddenMeshes = 0;
  const fringe: THREE.SkinnedMesh[] = [];
  // Preserve the imported artist's alpha-cut wisps around the forehead. The back
  // bob is discarded; this front-only geometry blends into the new long locks.

  vrm.scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    if (mats.some(m => /HAIR/i.test(m.name))) {
      object.visible = false; hiddenMeshes++;
      if(object instanceof THREE.SkinnedMesh){
        const geometry=object.geometry.clone(),pos=geometry.attributes.position,src=geometry.index,indices:number[]=[];
        // Shorten complete bob-length cards into tapered temple wisps. Preserve
        // their painted tips and crown coverage instead of slicing them flat.
        const parents=Uint32Array.from({length:pos.count},(_,i)=>i);
        const find=(i:number):number=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
        for(let n=0;n<(src?.count??pos.count);n+=3){const a=find(src?src.getX(n):n),b=find(src?src.getX(n+1):n+1),c=find(src?src.getX(n+2):n+2);parents[b]=a;parents[c]=a;}
        const lowest=new Float32Array(pos.count).fill(Infinity);
        for(let n=0;n<pos.count;n++){const root=find(n);lowest[root]=Math.min(lowest[root],pos.getY(n));}
        for(let n=0;n<pos.count;n++){const y=pos.getY(n);if(lowest[find(n)]<1.38 && y<1.46)pos.setY(n,1.46-(1.46-y)*.43);}
        for(let n=0;n<(src?.count??pos.count);n+=3){const a=src?src.getX(n):n,b=src?src.getX(n+1):n+1,c=src?src.getX(n+2):n+2;
          if((pos.getZ(a)+pos.getZ(b)+pos.getZ(c))/3<-.030)indices.push(a,b,c);
        }
        if(indices.length){geometry.setIndex(indices);geometry.clearGroups();
          const source=mats.find(m=>!(m as unknown as {isOutline:boolean}).isOutline) as THREE.MeshStandardMaterial;
          const material=new THREE.MeshStandardMaterial({map:source.map,side:THREE.DoubleSide,alphaTest:.3,roughness:.9});
          material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
            float hairValue=dot(diffuseColor.rgb,vec3(.299,.587,.114));
            diffuseColor.rgb=vec3(.057,.030,.022)*mix(.85,1.65,smoothstep(.015,.55,hairValue));`);};material.customProgramCacheKey=()=> 'reference-painted-fringe-v1';
          const mesh=new THREE.SkinnedMesh(geometry,material);mesh.copy(object,false);mesh.geometry=geometry;mesh.material=material;mesh.visible=true;mesh.bind(object.skeleton,object.bindMatrix);mesh.name='Reference-feathered-fringe';mesh.userData.referenceParent=object.parent;fringe.push(mesh);
        } else geometry.dispose();
      }
    }
  });
  for(const mesh of fringe){const original=mesh.userData.referenceParent as THREE.Object3D;delete mesh.userData.referenceParent;original.add(mesh);}
  const head = vrm.humanoid.getRawBoneNode('head');
  if (!head) throw new Error('Reference hairstyle requires a humanoid head bone.');
  const group = new THREE.Group(); group.name = 'Reference-long-dark-brown-hair'; head.add(group);
  const map = hairTexture(); map.wrapS=THREE.RepeatWrapping;
  const material = new THREE.MeshStandardMaterial({map,roughness:.84,metalness:0,side:THREE.DoubleSide,emissive:0x23181b,emissiveIntensity:.10});
  material.name = 'Reference-warm-brown-painted-hair';
  const locks: Lock[] = [];
  const fixed: THREE.BufferGeometry[] = [scalp()];
  // Crown ribbons flow from the part into the long, layered back silhouette.
  for(let i=0;i<25;i++) {
    const a=-1.70+i/24*3.4, sn=Math.sin(a),cs=Math.cos(a),layer=i%3;
    const spread=.126+layer*.009, bottom=-.365-(1-Math.abs(sn))*.083+(i%4)*.012;
    const points:Point[]=[[-.01+sn*.018,.209,.015],[sn*.081,.176,.019+cs*.080],[sn*.109,.085,.020+cs*.111],[sn*(spread-.009),-.105,.070+cs*.084],[sn*spread+Math.sin(i*.9)*.012,-.255,.078+cs*.095],[sn*(spread-.012)+Math.sin(i*1.7)*.014,bottom,.093+cs*.061]];
    const geometry=ribbon(points,.043+layer*.006,[sn*.6,.05,Math.max(.35,cs)],i);
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`Long-back-lock-${i+1}`;group.add(mesh);
    locks.push({mesh,rest:new Float32Array(geometry.attributes.position.array),phase:i*.71,strength:1});
  }
  // Overlapping temple tresses, gently turning inward at chest height.
  for(const side of [-1,1]) for(let i=0;i<6;i++) {
    const x=side*(.098+i*.004),z=-.019+i*.013;
    const points:Point[]=[[side*.006,.207,.007],[side*.084,.167,-.047],[x,.057,z-.028],[side*(.123+i*.004),-.10,z-.018],[side*(.153+i*.005),-.21,z-.028],[side*(.135+i*.006),-.29,z-.048],[side*(.155+i*.006),-.375+(i%3)*.024,z-.039]];
    const geometry=ribbon(points,.035+i*.002,[side*.45,0,-.75],i+side);
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`Face-framing-${side<0?'right':'left'}-${i}`;group.add(mesh);
    locks.push({mesh,rest:new Float32Array(geometry.attributes.position.array),phase:i*.9+side,strength:.55});
  }
  const fixedMesh = new THREE.Mesh(mergeGeometries(fixed)!,material);fixedMesh.name='Parted-crown-and-separated-fringe';group.add(fixedMesh);
  fixed.forEach(g=>g.dispose());group.add(sakuraClip());
  group.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
  const mergedLocks=mergeGeometries(locks.map(lock=>lock.mesh.geometry),false)!;
  const flowing=new THREE.Mesh(mergedLocks,material);flowing.name='Batched-long-layered-locks';flowing.castShadow=flowing.receiveShadow=true;flowing.frustumCulled=false;group.add(flowing);
  let offset=0;const segments=locks.map(lock=>{const count=lock.mesh.geometry.attributes.position.count;const segment={offset,count,phase:lock.phase,strength:lock.strength};offset+=count;lock.mesh.removeFromParent();lock.mesh.geometry.dispose();return segment;});
  const positions=mergedLocks.attributes.position as THREE.BufferAttribute,rest=new Float32Array(positions.array);
  let sway = 0, previousYaw=0, turn=0;
  const diagnostics={hiddenMeshes,locks:locks.length,triangles:0,materials:5};
  group.traverse(o=>{if(o instanceof THREE.Mesh)diagnostics.triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
  group.userData.hair={reference:'Long layered dark brown hair, pink sakura temple clip',...diagnostics};
  return {group,diagnostics,update(dt:number,time:number,speed:number,lookYaw=0){
    const step=Math.min(.05,Math.max(0,dt));sway=THREE.MathUtils.damp(sway,Math.min(1,Math.abs(speed)/1.12),5,step);
    const velocity=step>0?(lookYaw-previousYaw)/step:0;previousYaw=lookYaw;
    turn=THREE.MathUtils.damp(turn,THREE.MathUtils.clamp(velocity,-1.5,1.5),4,step);
    for(const segment of segments){
      for(let i=segment.offset;i<segment.offset+segment.count;i++){const offset=i*3,x=rest[offset],y=rest[offset+1],z=rest[offset+2],weight=Math.pow(THREE.MathUtils.clamp((.065-y)/.45,0,1),1.6)*segment.strength;
        const breeze=Math.sin(time*1.35+segment.phase)*.004+Math.sin(time*3.5+segment.phase*.4)*.005*sway;
        // Lower locks lag behind a head turn, keeping hair outside the shoulders.
        const shoulderAnchor=THREE.MathUtils.smoothstep(-y,-.01,.12);
        const angle=-lookYaw*shoulderAnchor,co=Math.cos(angle),si=Math.sin(angle);
        positions.setXYZ(i,x*co+z*si+(breeze-turn*.007)*weight,y+Math.sin(time*2.2+segment.phase)*.0012*weight,z*co-x*si+(Math.sin(time*1.1+segment.phase)*.003+sway*.006)*weight);
      }
    }positions.needsUpdate=true;

  }};
}
