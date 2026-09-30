import * as THREE from 'three';
import { ease, footCurve, soleHull, soleRoll, STRIDE, type SolePoint } from './sakura-gait';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName, MToonMaterial } from '@pixiv/three-vrm';

/** Skinned anime avatars. The story identifies both characters as fictional adults. */
export interface Character {
  root: THREE.Group;
  update(dt: number, time: number, speed: number, lookYaw?: number, wave?: boolean): void;
  resetMotion(): void;
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
        m.giEqualizationFactor=companion?.8:.88;m.outlineWidthFactor*=companion?.65:.35;
        // Keep authored textures and hues, adapting only the toon light response
        // to the stronger outdoor key so pale faces and fabric retain depth.
        if(/Face_00_SKIN|FaceMouth/.test(m.name)){m.shadingShiftFactor=.18;m.shadingToonyFactor=.75;}
        if(/CLOTH/.test(m.name)){m.shadeColorFactor.multiplyScalar(.78);m.shadingToonyFactor=Math.min(m.shadingToonyFactor,.8);}
        if(m.isOutline)o.castShadow=false;
        m.needsUpdate=true;
      }
    }
  });
}
export async function createCharacter(role:'companion'|'player'):Promise<Character> {
  const companion=role==='companion',loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
  const gltf=await loader.loadAsync(`${import.meta.env.BASE_URL}models/${companion?'bbs-companion':'sssi-walker'}.vrm`),vrm=gltf.userData.vrm as VRM;
  if(!vrm?.humanoid)throw new Error(`The ${role} model has no valid humanoid skeleton.`);
  VRMUtils.removeUnnecessaryVertices(vrm.scene);VRMUtils.combineSkeletons(vrm.scene);VRMUtils.combineMorphs(vrm);
  VRMUtils.rotateVRM0(vrm);batchHair(vrm);tuneMaterials(vrm,companion);
  const root=new THREE.Group();root.name=companion?'Haruka-adult-companion':'adult-walker';root.add(vrm.scene);
  const modelBounds=new THREE.Box3().setFromObject(vrm.scene),targetHeight=companion?1.64:1.77,scale=targetHeight/(modelBounds.max.y-modelBounds.min.y);
  vrm.scene.scale.setScalar(scale);vrm.scene.position.y=-modelBounds.min.y*scale;root.add(contactShadow());
  const bone=(name:VRMHumanBoneName)=>vrm.humanoid.getNormalizedBoneNode(name)!;
  // VRM0 faces -Z before rotateVRM0; VRM1 faces +Z. Solve the gait in
  // the original -Z convention and map X/Z rotations into the model's basis.
  const rigAxis=vrm.meta?.metaVersion==='1'?-1:1;
  const hips=bone('hips'),head=bone('head'),neck=bone('neck'),spine=bone('spine'),chest=bone('chest'),hipsRest=hips.position.clone();
  const legs=(['left','right'] as const).map(side=>({hip:bone(`${side}UpperLeg`),knee:bone(`${side}LowerLeg`),foot:bone(`${side}Foot`)}));
  const arms=(['left','right'] as const).map(side=>({shoulder:bone(`${side}UpperArm`),elbow:bone(`${side}LowerArm`),hand:bone(`${side}Hand`)}));
  for(const side of ['left','right'] as const){const sign=(side==='left'?1:-1)*rigAxis;for(const finger of ['Index','Middle','Ring','Little'] as const){for(const segment of ['Proximal','Intermediate','Distal'] as const){const b=bone(`${side}${finger}${segment}`);if(b)b.rotation.z=sign*(segment==='Proximal'?.11:.18);}}}
  const legData=legs.map(leg=>({upper:leg.knee.position.length(),lower:leg.foot.position.length(),footRest:leg.knee.position.y+leg.foot.position.y,footZ:(leg.knee.position.z+leg.foot.position.z)*rigAxis,upperRestAngle:Math.atan2(-leg.knee.position.z*rigAxis,-leg.knee.position.y),lowerRestAngle:Math.atan2(-leg.foot.position.z*rigAxis,-leg.foot.position.y)}));
  let phaseCycles=.28,blend=0,strideScale=1,look=0,waveBlend=0,stopTime=1,wasMoving=false,calibrated=false;
  let previousYaw=0,gaitYaw=0,turnRate=0;
  const feet=legs.map(()=>({rest:new THREE.Vector3(),world:new THREE.Vector3(),anchor:new THREE.Vector3(),swingOffset:new THREE.Vector3(),settleStart:new THREE.Vector3(),settleGoal:new THREE.Vector3(),pivotStart:new THREE.Vector3(),hull:[] as SolePoint[],flatSole:0,wasContact:true,plantYaw:0,pitch:0,stopPitch:0,settleDelay:0,pivotAge:1,contact:true}));
  const goal=new THREE.Vector3(),localGoal=new THREE.Vector3(),hipPoint=new THREE.Vector3(),bodyInverse=new THREE.Quaternion(),footOrientation=new THREE.Quaternion(),sagittal=new THREE.Quaternion(),footEuler=new THREE.Euler();
  function rootPoint(local:THREE.Vector3,out:THREE.Vector3){return out.copy(local).applyMatrix4(root.matrixWorld);}
  function resetMotion(){
    root.updateMatrixWorld(true);phaseCycles=.28;blend=0;strideScale=1;stopTime=1;wasMoving=false;previousYaw=gaitYaw=root.rotation.y;turnRate=0;
    feet.forEach(f=>{rootPoint(f.rest,f.world);f.anchor.copy(f.world);f.wasContact=true;f.plantYaw=root.rotation.y;f.pitch=f.stopPitch=0;f.swingOffset.set(0,0,0);f.pivotAge=1;f.contact=true;});
  }
  const gazeTarget=new THREE.Object3D();root.add(gazeTarget);if(vrm.lookAt){vrm.lookAt.target=gazeTarget;vrm.lookAt.autoUpdate=true;}
  const diagnostics={meshes:0,triangles:0,materials:new Set<THREE.Material>()};
  root.traverse(o=>{if(o instanceof THREE.Mesh){diagnostics.meshes++;diagnostics.triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const m of Array.isArray(o.material)?o.material:[o.material])diagnostics.materials.add(m);}});
  root.userData.character={adultAge:companion?20:22,height:targetHeight,source:companion?'BBs by sion (user-supplied VRM)':'sssi by sssi (user-supplied VRM)',asset:companion?'models/bbs-companion.vrm':'models/sssi-walker.vrm',format:`VRM${vrm.meta?.metaVersion}-skinned`,sourceLicense:'VRM Public License 1.0 + embedded permissions (see licenses/User-models.md)',meshes:diagnostics.meshes,triangles:diagnostics.triangles,materials:diagnostics.materials.size,animations:'grounded three-dimensional gait, continuous swing, heel/toe roll, weight shift, settling steps, blink, smile, gaze, wave, VRM springs'};
  const character:Character={
    root, resetMotion,
    getEyeHeight(){return targetHeight*(companion?.917:.923);},
    getGazeTarget(target=new THREE.Vector3()){vrm.humanoid.getRawBoneNode('head')!.getWorldPosition(target);target.y+=.064*scale;return target;},
    update(dt,time,speed,lookYaw=0,wave=false){
      dt=THREE.MathUtils.clamp(dt,0,.05);speed=Math.abs(speed);root.updateMatrixWorld(true);
      const moving=speed>.035;
      const yawChange=Math.atan2(Math.sin(root.rotation.y-previousYaw),Math.cos(root.rotation.y-previousYaw));
      turnRate=THREE.MathUtils.damp(turnRate,dt>0?THREE.MathUtils.clamp(yawChange/dt,-3,3):0,6,dt);previousYaw=root.rotation.y;
      gaitYaw+=Math.atan2(Math.sin(root.rotation.y-gaitYaw),Math.cos(root.rotation.y-gaitYaw))*(1-Math.exp(-7*dt));
      if(moving&&!wasMoving){
        // Resume the lifted foot from toe-off, rather than jumping into the
        // tail of a frozen swing after a brief stop.
        const first=feet.findIndex(f=>!f.contact);
        phaseCycles=Math.floor(phaseCycles)+(first===1?.06:.56);
        feet.forEach(f=>{f.anchor.copy(f.world);f.wasContact=true;f.plantYaw=root.rotation.y;f.pivotAge=1;});
      }
      blend=THREE.MathUtils.damp(blend,moving?1:0,moving?6:5,dt);
      const cadence=.62+.33*THREE.MathUtils.clamp(speed/1.12,0,1.4);
      strideScale=THREE.MathUtils.damp(strideScale,THREE.MathUtils.clamp(speed/(STRIDE*cadence),.18,1.4),10,dt);
      if(moving)phaseCycles+=speed*dt/(STRIDE*strideScale);
      const phase=phaseCycles*TAU;
      if(wasMoving&&!moving){
        stopTime=0;
        feet.forEach(f=>{f.settleStart.copy(f.world);f.settleStart.y-=f.flatSole-soleRoll(f.hull,f.pitch);rootPoint(f.rest,f.settleGoal);f.stopPitch=f.pitch;});
        let first=feet.findIndex(f=>!f.contact);if(first<0)first=feet[0].settleStart.distanceToSquared(feet[0].settleGoal)>feet[1].settleStart.distanceToSquared(feet[1].settleGoal)?0:1;
        feet.forEach((f,i)=>f.settleDelay=i===first?0:.27);
      }
      if(!moving)stopTime+=dt;
      const cycles=feet.map((_,i)=>(phaseCycles+i*.5)%1);
      for(let i=0;i<feet.length;i++){
        const f=feet[i],curve=footCurve(cycles[i],strideScale,blend);
        if(!calibrated){f.pitch=0;continue;}
        if(moving){
          goal.copy(f.rest);goal.z+=curve.forward;goal.applyAxisAngle(THREE.Object3D.DEFAULT_UP,gaitYaw-root.rotation.y);rootPoint(goal,goal);
          if(curve.contact){
            // A fresh heel strike finishes any adjustment from the preceding
            // stance. Retaining that old pivot would rewind the foot on a turn.
            if(!f.wasContact){f.anchor.copy(goal);f.plantYaw=root.rotation.y;f.pivotAge=1;}
            localGoal.copy(f.anchor);root.worldToLocal(localGoal);
            const twist=Math.abs(Math.atan2(Math.sin(root.rotation.y-f.plantYaw),Math.cos(root.rotation.y-f.plantYaw)));
            if(f.pivotAge>=.24&&(twist>.60||Math.abs(localGoal.x-f.rest.x)>.28||Math.abs(localGoal.z-f.rest.z)>.48)){
              f.pivotStart.copy(f.anchor);f.anchor.copy(goal);f.pivotAge=0;f.plantYaw=root.rotation.y;
            }
            f.world.copy(f.anchor);f.pivotAge+=dt;
            if(f.pivotAge<.24){const q=f.pivotAge/.24;f.world.lerpVectors(f.pivotStart,f.anchor,ease(q));f.world.y=f.rest.y+.032*Math.sin(q*Math.PI)**2;f.contact=false;}
            else f.contact=true;
          }else{
            const q=(cycles[i]-.56)/.44;
            if(f.wasContact)f.swingOffset.copy(f.world).sub(goal);
            f.world.copy(goal).addScaledVector(f.swingOffset,1-ease(q));f.world.y=f.rest.y+curve.lift;f.contact=false;
          }
          f.pitch=curve.pitch*blend;f.wasContact=curve.contact;
        }else if(stopTime<.62){
          const q=THREE.MathUtils.clamp((stopTime-f.settleDelay)/.30,0,1);
          f.world.lerpVectors(f.settleStart,f.settleGoal,ease(q));
          const distance=Math.hypot(f.settleStart.x-f.settleGoal.x,f.settleStart.z-f.settleGoal.z);
          f.world.y=f.rest.y+THREE.MathUtils.lerp(Math.max(0,f.settleStart.y-f.rest.y),0,ease(q))+(distance>.045?.035:0)*Math.sin(Math.PI*q)**2;
          f.pitch=f.stopPitch*(1-ease(q));f.contact=q===0||q===1;
          if(q===0)f.world.copy(f.settleStart);
        }else{
          rootPoint(f.rest,f.world);f.pitch=0;f.contact=true;f.wasContact=true;f.anchor.copy(f.world);f.plantYaw=root.rotation.y;
        }
        // Lifting the ankle by the actual shoe support envelope prevents tilted
        // heel/toe poses from sinking through the path.
        f.world.y+=f.flatSole-soleRoll(f.hull,f.pitch);
      }
      wasMoving=moving;
      hips.position.copy(hipsRest);hips.position.x+=Math.sin(phase+.15)*.016*blend/scale;
      hips.position.y+=(-.008-.002*Math.cos(phase*2))*blend/scale+Math.sin(time*1.45)*.001*(1-blend)/scale;
      hips.rotation.set(0,Math.sin(phase)*.04*blend,Math.sin(phase)*.008*blend);
      // Retain a little knee flexion, lowering the pelvis only when a grounded
      // foot would otherwise exceed its two-bone reach.
      if(calibrated)for(let i=0;i<feet.length;i++)if(feet[i].contact){
        localGoal.copy(feet[i].world);root.worldToLocal(localGoal);localGoal.sub(vrm.scene.position).divideScalar(scale);
        hipPoint.copy(legs[i].hip.position).applyQuaternion(hips.quaternion).add(hips.position);
        const data=legData[i],reach=data.upper+data.lower-.003,dx=localGoal.x-hipPoint.x,dz=localGoal.z-hipPoint.z;
        hips.position.y=Math.min(hips.position.y,localGoal.y-(hipPoint.y-hips.position.y)+Math.sqrt(Math.max(.01,reach*reach-dx*dx-dz*dz)));
      }
      spine.rotation.set(rigAxis*.023*blend,-Math.sin(phase)*.025*blend,-turnRate*.020*blend);
      chest.rotation.set(rigAxis*Math.sin(time*1.45)*.006,-Math.sin(phase)*.027*blend-turnRate*.015*blend,Math.sin(phase)*-.006*blend);
      bodyInverse.copy(hips.quaternion).invert();
      for(let i=0;i<2;i++){
        const leg=legs[i],data=legData[i],f=feet[i];
        let x=0,y=data.footRest,z=data.footZ;
        if(calibrated){
          localGoal.copy(f.world);root.worldToLocal(localGoal);localGoal.sub(vrm.scene.position).divideScalar(scale).sub(hips.position).applyQuaternion(bodyInverse).sub(leg.hip.position);
          x=localGoal.x;y=-Math.hypot(localGoal.x,localGoal.y);z=rigAxis*localGoal.z;
        }
        const d=Math.min(data.upper+data.lower-.0001,Math.hypot(y,z));
        const knee=Math.PI-Math.acos(THREE.MathUtils.clamp((data.upper**2+data.lower**2-d*d)/(2*data.upper*data.lower),-1,1));
        const hip=Math.atan2(-z,-y)+Math.acos(THREE.MathUtils.clamp((data.upper**2+d*d-data.lower**2)/(2*data.upper*d),-1,1));
        const hipAngle=hip-data.upperRestAngle,kneeAngle=-knee+data.upperRestAngle-data.lowerRestAngle;
        const lateral=calibrated?Math.atan2(x,Math.sqrt(Math.max(.0001,y*y-x*x))):0;
        leg.hip.rotation.set(rigAxis*hipAngle,0,lateral,'ZXY');leg.knee.rotation.set(rigAxis*kneeAngle,0,0);
        footEuler.set(-f.pitch,0,0);footOrientation.setFromEuler(footEuler);
        if(calibrated&&f.contact)footOrientation.premultiply(sagittal.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,THREE.MathUtils.clamp(Math.atan2(Math.sin(f.plantYaw-root.rotation.y),Math.cos(f.plantYaw-root.rotation.y)),-.55,.55)));
        leg.foot.quaternion.copy(hips.quaternion).multiply(leg.hip.quaternion).multiply(leg.knee.quaternion).invert().multiply(footOrientation);
        const sign=i===0?1:-1,armPhase=phase+i*Math.PI,swing=-Math.cos(armPhase-.12)*.26*blend;
        arms[i].shoulder.rotation.set(rigAxis*swing,Math.sin(armPhase)*.018*blend,rigAxis*sign*((companion?1.31:1.40)+(companion?.055:.020)*blend-Math.sin(time*.8)*.013));
        arms[i].elbow.rotation.set(-rigAxis*.045,-sign*(.11+.13*blend+.045*Math.sin(armPhase-.4)*blend),0);
        arms[i].hand.rotation.set(Math.sin(armPhase-.35)*.022*blend,0,rigAxis*sign*(.025+Math.sin(armPhase)*.018*blend));
      }
      look=THREE.MathUtils.damp(look,THREE.MathUtils.clamp(lookYaw,-1,1),5,dt);
      neck.rotation.y=look*.26;head.rotation.set(rigAxis*Math.sin(time*.83)*.012,look*.74,companion?rigAxis*Math.sin(time*.61)*.015:0);
      gazeTarget.position.set(Math.sin(look*1.45)*2,character.getEyeHeight(),Math.cos(look*1.45)*2);
      const blinkPhase=(time+(companion?0:1.9))%4.9,blink=blinkPhase>4.69?Math.sin((blinkPhase-4.69)/.21*Math.PI):0;
      vrm.expressionManager?.setValue('blink',Math.max(0,blink));vrm.expressionManager?.setValue('happy',companion?.06:.055);vrm.expressionManager?.setValue('relaxed',companion?.025:.04);
      waveBlend=THREE.MathUtils.damp(waveBlend,wave?1:0,7,dt);
      if(companion&&waveBlend>.001){arms[0].shoulder.rotation.z-=rigAxis*.70*waveBlend;arms[0].shoulder.rotation.x-=rigAxis*.14*waveBlend;arms[0].elbow.rotation.y+=.10*waveBlend;arms[0].elbow.rotation.z-=rigAxis*2.10*waveBlend;arms[0].hand.rotation.z+=rigAxis*Math.sin(time*8)*.16*waveBlend;vrm.expressionManager?.setValue('happy',.06+waveBlend*.16);}
      vrm.update(dt);root.updateMatrixWorld(true);
      root.userData.character.gaitBlend=blend;root.userData.character.waveBlend=waveBlend;
      root.userData.character.gait={phase:phaseCycles,strideScale,settling:!moving&&stopTime<.62,feet:feet.map((f,i)=>({cycle:cycles[i],contact:f.contact,pitch:f.pitch,goal:{x:f.world.x,y:f.world.y,z:f.world.z}}))};
      root.userData.character.feet=legs.map((_,i)=>{vrm.humanoid.getRawBoneNode(i===0?'leftFoot':'rightFoot')!.getWorldPosition(v);return {x:v.x,y:v.y,z:v.z};});
    }
  };
  character.update(0,0,0);
  // Imported accessor bounds include hidden body geometry beneath the shoes.
  // Ground the rendered skinned soles themselves, after the relaxed pose is applied.
  let sole=Infinity;
  vrm.scene.traverse(o=>{if(!(o instanceof THREE.SkinnedMesh))return;const mats=Array.isArray(o.material)?o.material:[o.material];if(!mats.some(m=>/Shoes/.test(m.name)))return;o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v);v.applyMatrix4(o.matrixWorld);sole=Math.min(sole,v.y);}});
  if(Number.isFinite(sole))vrm.scene.position.y+=.003-sole;
  character.update(0,0,0);
  // Sample each authored shoe once. A convex sole envelope is sufficient for
  // heel/toe height compensation; the runtime never re-skins all shoe vertices.
  const restAnkles=legs.map((_,i)=>vrm.humanoid.getRawBoneNode(i===0?'leftFoot':'rightFoot')!.getWorldPosition(new THREE.Vector3()));
  const solePoints:SolePoint[][]=[[],[]];
  vrm.scene.traverse(o=>{if(!(o instanceof THREE.SkinnedMesh))return;const mats=Array.isArray(o.material)?o.material:[o.material];if(!mats.some(m=>/Shoes/.test(m.name)))return;o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v);v.applyMatrix4(o.matrixWorld);const side=Math.abs(v.x-restAnkles[0].x)<Math.abs(v.x-restAnkles[1].x)?0:1;solePoints[side].push({y:v.y-restAnkles[side].y,z:v.z-restAnkles[side].z});}});
  feet.forEach((f,i)=>{f.rest.copy(restAnkles[i]);root.worldToLocal(f.rest);f.hull=soleHull(solePoints[i]);f.flatSole=soleRoll(f.hull,0);});
  calibrated=true;resetMotion();character.update(0,0,0);return character;
}
