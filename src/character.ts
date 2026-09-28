import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName, MToonMaterial } from '@pixiv/three-vrm';

/** Skinned anime avatars. The story identifies both characters as fictional adults. */
export interface Character {
  root: THREE.Group;
  update(dt: number, time: number, speed: number, lookYaw?: number, wave?: boolean): void;
  getEyeHeight(): number;
  getGazeTarget(target?: THREE.Vector3): THREE.Vector3;
}
const TAU = Math.PI * 2;
const v = new THREE.Vector3();

/** Merge only identical-material hair surfaces; facial morph bindings stay intact. */
function batchHair(vrm: VRM): void {
  const groups = new Map<string, THREE.SkinnedMesh[]>();
  vrm.scene.traverse(o => {
    if (!(o instanceof THREE.SkinnedMesh) || Object.keys(o.geometry.morphAttributes).length) return;
    const material=Array.isArray(o.material)?o.material[0]:o.material;
    if(!/HAIR/i.test(material.name))return;
    // Each VRM0 strand gets its own identical outline material; batch the two passes.
    const key = `${material.uuid}:${o.skeleton.uuid}:${o.parent?.uuid}`;
    const list = groups.get(key) ?? []; list.push(o); groups.set(key, list);
  });
  groups.forEach(meshes => {
    if (meshes.length < 2) return;
    const first = meshes[0];
    if (!meshes.every(m => m.matrix.equals(first.matrix) && m.bindMatrix.equals(first.bindMatrix))) return;
    const geometry = mergeGeometries(meshes.map(m => m.geometry), false);
    if (!geometry) return;
    if(Array.isArray(first.material)){geometry.clearGroups();const count=geometry.index?.count??geometry.attributes.position.count;geometry.addGroup(0,count,0);geometry.addGroup(0,count,1);}
    const merged = new THREE.SkinnedMesh(geometry, first.material);
    merged.copy(first, false); merged.geometry = geometry;merged.name='Batched-authored-hair';
    merged.bind(first.skeleton, first.bindMatrix); merged.frustumCulled = false;
    first.parent!.add(merged); meshes.forEach(m => m.removeFromParent());
  });
}
function pleatedSkirt(): THREE.Mesh {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const rings = [[.073,.148,.085],[.020,.160,.100],[-.12,.218,.158],[-.295,.260,.211]],sides = 96;
  rings.forEach(([y,rx,rz], row) => {
    for (let i=0;i<=sides;i++) {
      const a=i/sides*TAU, fold=1 + Math.cos(a*16)*.042*(row/3);
      positions.push(Math.sin(a)*rx*fold,y,Math.cos(a)*rz*fold);uvs.push(i/sides*4,row/3);
      if(row&&i){const k=row*(sides+1)+i;indices.push(k,k-sides-2,k-1,k,k-sides-1,k-sides-2);}
    }
  });
  const g = new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const c=canvas.getContext('2d')!;c.fillStyle='#36323c';c.fillRect(0,0,256,256);
  for(let i=0;i<256;i+=64){c.fillStyle='#48404a';c.fillRect(i,0,22,256);c.fillRect(0,i,256,22);c.fillStyle='rgba(205,176,163,.3)';c.fillRect(i+32,0,2,256);c.fillRect(0,i+32,256,2);c.fillStyle='rgba(25,23,32,.36)';c.fillRect(i+45,0,7,256);c.fillRect(0,i+45,256,7);}
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=8;
  const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({map,roughness:.94,side:THREE.DoubleSide}));
  mesh.name='Tailored-plaid-pleats';mesh.castShadow=mesh.receiveShadow=true;return mesh;
}
function blossomClip():THREE.Group {
  const group=new THREE.Group();group.name='Sakura-hair-clip';
  const mat=new THREE.MeshStandardMaterial({color:0xffb8cb,roughness:.65}),petal=new THREE.SphereGeometry(1,12,8);
  for(let i=0;i<5;i++){const a=i/5*TAU,m=new THREE.Mesh(petal,mat);m.position.set(Math.sin(a)*.014,Math.cos(a)*.014,0);m.scale.set(.010,.015,.0035);m.rotation.z=-a;group.add(m);}
  const center=new THREE.Mesh(new THREE.SphereGeometry(.004,10,8),new THREE.MeshStandardMaterial({color:0xffdb9a,roughness:.6}));center.position.z=-.005;group.add(center);return group;
}
function contactShadow():THREE.Mesh {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const c=canvas.getContext('2d')!,g=c.createRadialGradient(32,32,0,32,32,30);
  g.addColorStop(0,'rgba(45,30,48,.22)');g.addColorStop(.5,'rgba(45,30,48,.10)');g.addColorStop(1,'rgba(45,30,48,0)');c.fillStyle=g;c.fillRect(0,0,64,64);
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.66,.5),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.y=.003;return mesh;
}
function tuneMaterials(vrm:VRM,companion:boolean):void {
  const seen=new Set<THREE.Material>();
  vrm.scene.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;
    o.frustumCulled=false;o.castShadow=true;o.receiveShadow=true;
    for(const m of Array.isArray(o.material)?o.material:[o.material]){
      if(seen.has(m))continue;seen.add(m);
      if(m instanceof MToonMaterial){
        m.giEqualizationFactor=.88;m.outlineWidthFactor*=.35;
        if(m.isOutline)o.castShadow=false;
        if(/SKIN|FaceMouth/.test(m.name)){m.color.multiply(new THREE.Color(0xf1dad1));m.shadeColorFactor.multiply(new THREE.Color(0xf1d5cc));}
        if(/HAIR/.test(m.name)){m.color.multiply(new THREE.Color(companion?0xd2b6ac:0xe7dcd9));m.shadeColorFactor.multiplyScalar(.9);}
        if(/Tops/.test(m.name)&&companion){
          const compile=m.onBeforeCompile.bind(m);
          m.onBeforeCompile=(shader,renderer)=>{
            compile(shader,renderer);
            shader.fragmentShader=shader.fragmentShader.replace('diffuseColor *= sampledDiffuseColor;',`float blueRibbon = smoothstep(0.035, 0.12, sampledDiffuseColor.b - sampledDiffuseColor.r) * smoothstep(0.015, 0.065, sampledDiffuseColor.b - sampledDiffuseColor.g);
              sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, dot(sampledDiffuseColor.rgb,vec3(.299,.587,.114))*vec3(1.52,.51,.68),blueRibbon);
              diffuseColor *= sampledDiffuseColor;`);
          };m.customProgramCacheKey=()=> 'sakura-knit-ribbon-v2';
        }m.needsUpdate=true;
      }
    }
  });
}
export async function createCharacter(role:'companion'|'player'):Promise<Character> {
  const companion=role==='companion',loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
  const gltf=await loader.loadAsync(`${import.meta.env.BASE_URL}models/${companion?'haruka':'walker'}.vrm`),vrm=gltf.userData.vrm as VRM;
  if(!vrm?.humanoid)throw new Error(`The ${role} model has no valid humanoid skeleton.`);
  VRMUtils.removeUnnecessaryVertices(vrm.scene);VRMUtils.combineSkeletons(vrm.scene);VRMUtils.combineMorphs(vrm);
  VRMUtils.rotateVRM0(vrm);batchHair(vrm);tuneMaterials(vrm,companion);
  const root=new THREE.Group();root.name=companion?'Haruka-adult-companion':'adult-walker';root.add(vrm.scene);
  const modelBounds=new THREE.Box3().setFromObject(vrm.scene),targetHeight=companion?1.64:1.77,scale=targetHeight/(modelBounds.max.y-modelBounds.min.y);
  vrm.scene.scale.setScalar(scale);vrm.scene.position.y=-modelBounds.min.y*scale;root.add(contactShadow());
  const bone=(name:VRMHumanBoneName)=>vrm.humanoid.getNormalizedBoneNode(name)!;
  const hips=bone('hips'),head=bone('head'),neck=bone('neck'),spine=bone('spine'),chest=bone('chest'),hipsRest=hips.position.clone();
  const legs=(['left','right'] as const).map(side=>({hip:bone(`${side}UpperLeg`),knee:bone(`${side}LowerLeg`),foot:bone(`${side}Foot`)}));
  const arms=(['left','right'] as const).map(side=>({shoulder:bone(`${side}UpperArm`),elbow:bone(`${side}LowerArm`),hand:bone(`${side}Hand`)}));
  const skirt=companion?pleatedSkirt():null;if(skirt)hips.add(skirt);
  if(companion){const clip=blossomClip();clip.position.set(-.099,.080,-.063);clip.rotation.y=-.5;head.add(clip);}
  for(const side of ['left','right'] as const){const sign=side==='left'?1:-1;for(const finger of ['Index','Middle','Ring','Little'] as const){for(const segment of ['Proximal','Intermediate','Distal'] as const){const b=bone(`${side}${finger}${segment}`);if(b)b.rotation.z=sign*(segment==='Proximal'?.11:.18);}}}
  const legData=legs.map(leg=>({upper:leg.knee.position.length(),lower:leg.foot.position.length(),footRest:leg.knee.position.y+leg.foot.position.y,footZ:leg.knee.position.z+leg.foot.position.z}));
  let travel=0,blend=0,look=0,waveBlend=0;
  const gazeTarget=new THREE.Object3D();root.add(gazeTarget);if(vrm.lookAt){vrm.lookAt.target=gazeTarget;vrm.lookAt.autoUpdate=true;}
  const diagnostics={meshes:0,triangles:0,materials:new Set<THREE.Material>()};
  root.traverse(o=>{if(o instanceof THREE.Mesh){diagnostics.meshes++;diagnostics.triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const m of Array.isArray(o.material)?o.material:[o.material])diagnostics.materials.add(m);}});
  root.userData.character={adultAge:companion?20:22,height:targetHeight,source:companion?'VRoid AvatarSample_A + authored costume detail':'VRoid AvatarSample_C',format:'VRM0-skinned',sourceLicense:'VRoid Hub sample model terms (see licenses)',meshes:diagnostics.meshes,triangles:diagnostics.triangles,materials:diagnostics.materials.size,animations:'distance-driven two-bone gait, blink, smile, gaze, wave, VRM hair springs'};
  const character:Character={
    root,
    getEyeHeight(){return targetHeight*(companion?.917:.923);},
    getGazeTarget(target=new THREE.Vector3()){vrm.humanoid.getRawBoneNode('head')!.getWorldPosition(target);target.y+=.064*scale;return target;},
    update(dt,time,speed,lookYaw=0,wave=false){
      dt=THREE.MathUtils.clamp(dt,0,.05);const moving=THREE.MathUtils.clamp(Math.abs(speed)/.7,0,1);
      blend=THREE.MathUtils.damp(blend,moving,9,dt);travel+=Math.abs(speed)*dt;const phase=travel/1.18*TAU;
      // Keep the supporting leg within reach at heel strike. A constant hip height
      // would force the foot to float whenever the requested stride exceeds its reach.
      let supportDrop=-.003*blend;
      for(let i=0;i<2;i++){const cycle=(phase/TAU+i*.5)%1;if(cycle>=.56)continue;const data=legData[i],forward=(.3304-cycle/.56*.6608)*blend/scale,z=-forward+data.footZ,reach=data.upper+data.lower-.003;supportDrop=Math.min(supportDrop,data.footRest+Math.sqrt(Math.max(.1,reach*reach-z*z)));}
      hips.position.copy(hipsRest);hips.position.y+=supportDrop+Math.sin(time*1.45)*.0008*(1-blend);
      hips.rotation.set(0,Math.sin(phase)*.025*blend,Math.sin(phase)*.012*blend);spine.rotation.set(.015*blend,Math.sin(phase)*-.018*blend,0);chest.rotation.set(Math.sin(time*1.45)*.006,Math.sin(phase)*-.016*blend,0);
      for(let i=0;i<2;i++){
        const cycle=(phase/TAU+i*.5)%1,q=cycle<.56?cycle/.56:(cycle-.56)/.44;
        const footForward=(cycle<.56?.3304-q*.6608:-.3304+q*.6608)*blend,footLift=(cycle<.56?0:Math.sin(q*Math.PI)*.064)*blend;
        const leg=legs[i],data=legData[i],y=data.footRest+(hipsRest.y-hips.position.y)+footLift/scale,z=-footForward/scale+data.footZ;
        const d=Math.min(data.upper+data.lower-.0001,Math.hypot(y,z));
        const knee=Math.PI-Math.acos(THREE.MathUtils.clamp((data.upper**2+data.lower**2-d*d)/(2*data.upper*data.lower),-1,1));
        const hip=Math.atan2(-z,-y)+Math.acos(THREE.MathUtils.clamp((data.upper**2+d*d-data.lower**2)/(2*data.upper*d),-1,1));
        leg.hip.rotation.set(hip,0,0);leg.knee.rotation.set(-knee,0,0);leg.foot.rotation.set(-hip+knee,0,0);
        const sign=i===0?1:-1,swing=Math.sin(phase+i*Math.PI)*.24*blend;
        arms[i].shoulder.rotation.set(swing,0,sign*((companion?1.31:1.40)-Math.sin(time*.8)*.013));arms[i].elbow.rotation.set(-.04,-sign*(.11+Math.max(0,swing)*.25),0);arms[i].hand.rotation.set(0,0,sign*.025);
      }
      look=THREE.MathUtils.damp(look,THREE.MathUtils.clamp(lookYaw,-1,1),5,dt);
      neck.rotation.y=look*.26;head.rotation.set(Math.sin(time*.83)*.012,look*.74,companion?Math.sin(time*.61)*.015:0);
      gazeTarget.position.set(Math.sin(look*1.45)*2,character.getEyeHeight(),Math.cos(look*1.45)*2);
      const blinkPhase=(time+(companion?0:1.9))%4.9,blink=blinkPhase>4.69?Math.sin((blinkPhase-4.69)/.21*Math.PI):0;
      vrm.expressionManager?.setValue('blink',Math.max(0,blink));vrm.expressionManager?.setValue('happy',companion?.20:.055);vrm.expressionManager?.setValue('relaxed',companion?.13:.04);
      waveBlend=THREE.MathUtils.damp(waveBlend,wave?1:0,7,dt);
      if(companion&&waveBlend>.001){arms[0].shoulder.rotation.z-=.70*waveBlend;arms[0].shoulder.rotation.x-=.14*waveBlend;arms[0].elbow.rotation.y+=.10*waveBlend;arms[0].elbow.rotation.z-=2.10*waveBlend;arms[0].hand.rotation.z+=Math.sin(time*8)*.16*waveBlend;vrm.expressionManager?.setValue('happy',.20+waveBlend*.25);}
      if(skirt){skirt.rotation.x=Math.sin(phase)*.035*blend;skirt.rotation.z=Math.sin(time*1.5)*.008;}
      vrm.update(dt);root.updateMatrixWorld(true);
      root.userData.character.gaitBlend=blend;root.userData.character.waveBlend=waveBlend;
      root.userData.character.feet=legs.map((_,i)=>{vrm.humanoid.getRawBoneNode(i===0?'leftFoot':'rightFoot')!.getWorldPosition(v);return {x:v.x,y:v.y,z:v.z};});
    }
  };
  character.update(0,0,0);
  // Imported accessor bounds include hidden body geometry beneath the shoes.
  // Ground the rendered skinned soles themselves, after the relaxed pose is applied.
  let sole=Infinity;
  vrm.scene.traverse(o=>{if(!(o instanceof THREE.SkinnedMesh))return;const mats=Array.isArray(o.material)?o.material:[o.material];if(!mats.some(m=>/Shoes/.test(m.name)))return;o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v);v.applyMatrix4(o.matrixWorld);sole=Math.min(sole,v.y);}});
  if(Number.isFinite(sole))vrm.scene.position.y+=.003-sole;
  character.update(0,0,0);return character;
}
