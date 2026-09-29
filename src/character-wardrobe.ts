import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU=Math.PI*2;
export interface ReferenceWardrobe { update(time:number,speed:number,phase:number):void; }

/** Reference costume, fitted to the original VRoid skin rather than a replacement body. */
export function createReferenceWardrobe(vrm:VRM):ReferenceWardrobe {
  let source:THREE.SkinnedMesh|undefined;
  const bodyMeshes:THREE.SkinnedMesh[]=[];
  vrm.scene.traverse(o=>{if(o instanceof THREE.SkinnedMesh){const mats=Array.isArray(o.material)?o.material:[o.material];if(mats.some(m=>/Tops/.test(m.name)))source=o;if(mats.some(m=>/Body.*SKIN/.test(m.name)))bodyMeshes.push(o);if(mats.some(m=>/Bottoms/.test(m.name)))o.visible=false;}});
  if(!source)throw new Error('Reference wardrobe needs the original skinned garment.');
  const top=source,bodyParent=top.parent!,skeleton=top.skeleton;
  const charcoal=new THREE.MeshStandardMaterial({color:0x454149,roughness:.94});
  const lapelMat=new THREE.MeshStandardMaterial({color:0x554c53,roughness:.92,side:THREE.DoubleSide});
  const cream=new THREE.MeshStandardMaterial({color:0xf0e5d7,roughness:.9,side:THREE.DoubleSide});
  const ivory=new THREE.MeshStandardMaterial({color:0xfff2e5,roughness:.87,side:THREE.DoubleSide});
  const burgundy=new THREE.MeshStandardMaterial({color:0x803643,roughness:.8,side:THREE.DoubleSide});
  const burgundyLight=new THREE.MeshStandardMaterial({color:0xa05660,roughness:.85});
  const brass=new THREE.MeshStandardMaterial({color:0xa88958,metalness:.65,roughness:.4});
  const seam=new THREE.MeshStandardMaterial({color:0x62575b,roughness:1});
  const leather=new THREE.MeshStandardMaterial({color:0x3b2926,roughness:.52});
  const boneIndex=(name:string)=>skeleton.bones.findIndex(b=>b.name===name);
  const spineBones=[['J_Bip_C_Hips',.896],['J_Bip_C_Spine',.954],['J_Bip_C_Chest',1.068],['J_Bip_C_UpperChest',1.18]] as const;
  const skin=(geometry:THREE.BufferGeometry,material:THREE.Material,name:string):THREE.SkinnedMesh=>{
    const pos=geometry.attributes.position,idx:number[]=[],weight:number[]=[];
    for(let i=0;i<pos.count;i++){
      const y=pos.getY(i);let hi=spineBones.findIndex(([,by])=>by>=y);if(hi<0)hi=spineBones.length-1;const lo=Math.max(0,hi-1),span=spineBones[hi][1]-spineBones[lo][1];
      const t=span?THREE.MathUtils.clamp((y-spineBones[lo][1])/span,0,1):0;idx.push(boneIndex(spineBones[lo][0]),boneIndex(spineBones[hi][0]),0,0);weight.push(1-t,t,0,0);
    }
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(idx,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weight,4));
    const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name=name;mesh.bind(skeleton,top.bindMatrix);mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;bodyParent.add(mesh);return mesh;
  };
  const panel=(points:number[][],material:THREE.Material,name:string):THREE.SkinnedMesh=>{
    const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
    let g:THREE.BufferGeometry=new THREE.ShapeGeometry(shape);const p=g.attributes.position;
    for(let i=0;i<p.count;i++){let distance=Infinity,z=0;for(const [x,y,pz] of points){const d=(x-p.getX(i))**2+(y-p.getY(i))**2;if(d<distance){distance=d;z=pz;}}p.setZ(i,z);}
    if(name==='Notched-blazer-lapel'){
      const vertices:number[]=[],index=g.index!,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
      const subdivide=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,depth:number)=>{if(depth===0){for(const v of [a,b,c])vertices.push(v.x,v.y,frontZ(v.x,v.y,-.005));return;}const ab=a.clone().add(b).multiplyScalar(.5),bc=b.clone().add(c).multiplyScalar(.5),ca=c.clone().add(a).multiplyScalar(.5);subdivide(a,ab,ca,depth-1);subdivide(ab,b,bc,depth-1);subdivide(ca,bc,c,depth-1);subdivide(ab,bc,ca,depth-1);};
      for(let i=0;i<index.count;i+=3)subdivide(a.fromBufferAttribute(p,index.getX(i)).clone(),b.fromBufferAttribute(p,index.getX(i+1)).clone(),c.fromBufferAttribute(p,index.getX(i+2)).clone(),3);
      const curved=new THREE.BufferGeometry();curved.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.dispose();g=mergeVertices(curved);curved.dispose();
    }
    g.computeVertexNormals();return skin(g,material,name);
  };
  const detail=(geometry:THREE.BufferGeometry,material:THREE.Material,name:string,x:number,y:number,z:number)=>{geometry.translate(x,y,z);return skin(geometry,material,name);};
  const tube=(points:number[][],radius:number,mat:THREE.Material,name:string)=>skin(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p as [number,number,number]))),24,radius,5,false),mat,name);

  // Keep the imported articulated sleeves. A separately tailored torso has
  // continuous surfaces and a shaped opening, avoiding a cardigan silhouette.
  const sleeve=charcoal.clone();sleeve.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSleeveBind;').replace('#include <begin_vertex>','#include <begin_vertex>\nvSleeveBind=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vSleeveBind;').replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(abs(vSleeveBind.x)<.145 || vSleeveBind.y<1.09)discard;');
  };sleeve.customProgramCacheKey=()=> 'reference-sleeves-v4';top.material=sleeve;top.geometry=top.geometry.clone();top.geometry.clearGroups();top.name='Reference-articulated-blazer-sleeves';
  const oldIndex=top.geometry.index!,boneIndices=top.geometry.attributes.skinIndex,boneWeights=top.geometry.attributes.skinWeight,trimmed:number[]=[];
  const hoodWeight=(vertex:number)=>{let total=0;for(let k=0;k<4;k++)if(/Hood/.test(skeleton.bones[boneIndices.array[vertex*4+k]]?.name??''))total+=boneWeights.array[vertex*4+k];return total;};
  for(let i=0;i<oldIndex.count;i+=3){const a=oldIndex.getX(i),b=oldIndex.getX(i+1),c=oldIndex.getX(i+2);if((hoodWeight(a)+hoodWeight(b)+hoodWeight(c))/3<.08)trimmed.push(a,b,c);}top.geometry.setIndex(trimmed);
  const sections=[ [.868,.186,.127,.006],[.93,.169,.111,.002],[1.005,.130,.092,-.002],[1.08,.136,.101,-.006],[1.15,.147,.107,-.008],[1.20,.159,.095,-.002],[1.24,.170,.078,.005],[1.267,.143,.061,.007] ];
  const section=(y:number)=>{let hi=sections.findIndex(p=>p[0]>=y);if(hi<0)hi=sections.length-1;const lo=Math.max(0,hi-1),a=sections[lo],b=sections[hi],t=a[0]===b[0]?0:THREE.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1);return [THREE.MathUtils.lerp(a[1],b[1],t),THREE.MathUtils.lerp(a[2],b[2],t),THREE.MathUtils.lerp(a[3],b[3],t)];};
  const frontZ=(x:number,y:number,offset=0)=>{const [rx,rz,cz]=section(y);return cz-rz*Math.sqrt(Math.max(.02,1-(x/rx)**2))+offset;};
  const positionsBody:number[]=[],uvBody:number[]=[],indicesBody:number[]=[],columns=64,rows=24;
  for(let r=0;r<=rows;r++){
    const y=THREE.MathUtils.lerp(.868,1.267,r/rows),[rx,rz,cz]=section(y),gap=Math.max(0,(y-1.025)*.30),alpha=Math.asin(Math.min(.9,gap/rx));
    for(let col=0;col<=columns;col++){
      const theta=THREE.MathUtils.lerp(alpha,TAU-alpha,col/columns),x=Math.sin(theta)*rx,z=cz-Math.cos(theta)*rz;
      positionsBody.push(x,y,z);uvBody.push(col/columns,r/rows);
      if(r&&col){const n=r*(columns+1)+col;indicesBody.push(n,n-columns-2,n-1,n,n-columns-1,n-columns-2);}
    }
  }
  const torso=new THREE.BufferGeometry();torso.setAttribute('position',new THREE.Float32BufferAttribute(positionsBody,3));torso.setAttribute('uv',new THREE.Float32BufferAttribute(uvBody,2));torso.setIndex(indicesBody);torso.computeVertexNormals();skin(torso,charcoal,'Reference-tailored-blazer-body');
  // Cream blouse follows the inner chest contour behind the open V.
  const shirtPos:number[]=[],shirtIndex:number[]=[];
  for(let row=0;row<=16;row++){
    const y=THREE.MathUtils.lerp(1.005,1.293,row/16),width=y>1.267?THREE.MathUtils.lerp(.078,.037,(y-1.267)/.026):.10;
    for(let col=0;col<=16;col++){const x=(col/16*2-1)*width,z=y>1.267?THREE.MathUtils.lerp(frontZ(x,1.267,.005),-.050+(x/.04)**2*.013,(y-1.267)/.026):frontZ(x,y,.005);shirtPos.push(x,y,z);if(row&&col){const n=row*17+col;shirtIndex.push(n,n-18,n-1,n,n-17,n-18);}}
  }
  const shirt=new THREE.BufferGeometry();shirt.setAttribute('position',new THREE.Float32BufferAttribute(shirtPos,3));shirt.setIndex(shirtIndex);shirt.computeVertexNormals();skin(shirt,cream,'Reference-inner-blouse');
  // Close the shirt around the neck and shoulder line under the blazer collar.
  const yokePos:number[]=[],yokeIndex:number[]=[];
  for(let row=0;row<=6;row++){const t=row/6;for(let col=0;col<=48;col++){const a=col/48*TAU; yokePos.push(Math.sin(a)*THREE.MathUtils.lerp(.039,.145,t),THREE.MathUtils.lerp(1.303,1.260,t),.002-Math.cos(a)*THREE.MathUtils.lerp(.037,.057,t));if(row&&col){const n=row*49+col;yokeIndex.push(n,n-50,n-1,n,n-49,n-50);}}}
  const yoke=new THREE.BufferGeometry();yoke.setAttribute('position',new THREE.Float32BufferAttribute(yokePos,3));yoke.setIndex(yokeIndex);yoke.computeVertexNormals();skin(yoke,cream,'Blouse-shoulder-yoke');
  for(const s of [-1,1]){
    panel([[s*.012,1.292,-.055],[s*.039,1.291,-.052],[s*.066,1.263,frontZ(s*.066,1.263,-.001)],[s*.046,1.232,frontZ(s*.046,1.232,-.003)],[s*.012,1.267,frontZ(s*.012,1.267,-.003)]],ivory,'Turned-ivory-collar');
    panel([[s*.066,1.266,frontZ(s*.066,1.266,-.003)],[s*.142,1.242,frontZ(s*.142,1.242,-.003)],[s*.105,1.212,frontZ(s*.105,1.212,-.005)],[s*.123,1.198,frontZ(s*.123,1.198,-.005)],[s*.010,1.018,frontZ(s*.010,1.018,-.003)],[s*.041,1.160,frontZ(s*.041,1.160,-.008)]],lapelMat,'Notched-blazer-lapel');
    tube([[s*.067,1.261,frontZ(s*.067,1.261,-.005)],[s*.133,1.24,frontZ(s*.133,1.24,-.006)],[s*.100,1.212,frontZ(s*.100,1.212,-.007)]],.0008,seam,'Lapel-pick-stitch');
    tube([[s*.071,.962,frontZ(s*.071,.962,-.003)],[s*.121,.966,frontZ(s*.121,.966,-.003)]],.002,charcoal,'Blazer-welt-pocket');
  }
  for(const y of [.980,.914])detail(new THREE.SphereGeometry(.0044,12,8),brass,'Blazer-brass-button',-.014,y,frontZ(-.014,y,-.002));
  for(let i=0;i<4;i++){const y=1.194-i*.049;detail(new THREE.SphereGeometry(.0023,8,6),ivory,'Blouse-pearl-button',0,y,frontZ(0,y,.001));}
  // Folded, modest ribbon sits just in front of the blouse.
  for(const sign of [-1,1]){
    const wing=new THREE.Shape();wing.moveTo(sign*.004,1.257);wing.bezierCurveTo(sign*.027,1.281,sign*.057,1.286,sign*.065,1.272);wing.bezierCurveTo(sign*.073,1.251,sign*.064,1.232,sign*.051,1.241);wing.bezierCurveTo(sign*.027,1.246,sign*.018,1.249,sign*.004,1.247);wing.closePath();
    const g=new THREE.ShapeGeometry(wing,16),p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setZ(i,frontZ(x,y,-.009)-Math.sin(Math.abs(x)/.075*Math.PI)*.004);}g.computeVertexNormals();skin(g,burgundy,'Folded-burgundy-bow');
    panel([[sign*.008,1.250,frontZ(sign*.008,1.25,-.010)],[sign*.024,1.25,frontZ(sign*.024,1.25,-.012)],[sign*.046,1.18,frontZ(sign*.046,1.18,-.008)],[sign*.024,1.19,frontZ(sign*.024,1.19,-.012)],[sign*.016,1.18,frontZ(sign*.016,1.18,-.009)]],burgundy,'Burgundy-ribbon-tail');
    tube([[sign*.012,1.255,frontZ(sign*.012,1.255,-.012)],[sign*.036,1.264,frontZ(sign*.036,1.264,-.014)],[sign*.058,1.272,frontZ(sign*.058,1.272,-.014)]],.0008,burgundyLight,'Bow-fold-highlight');
  }
  detail(new THREE.BoxGeometry(.018,.023,.012),burgundy,'Ribbon-knot',0,1.253,frontZ(0,1.253,-.012));
  // The sample painted tights and lace are removed from the real skinned body.
  // Bind-space height follows the knee/leg skinning and keeps a crisp sock cuff.
  const bodyMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.85});
  bodyMat.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWardrobeBind;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWardrobeBind = position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWardrobeBind;').replace('#include <color_fragment>',`#include <color_fragment>
      if(vWardrobeBind.y>.81 && vWardrobeBind.y<1.285 && abs(vWardrobeBind.x)<.174 && (vWardrobeBind.y<1.25 || abs(vWardrobeBind.x)>.044))discard;
      vec3 skinTone=vec3(.75,.53,.45);
      vec3 sockTone=vec3(.049,.041,.049);
      float sock = 1.0-smoothstep(.453,.457,vWardrobeBind.y);
      vec3 garmentTone=mix(skinTone,sockTone,sock);
      float blouse = 0.0;
      garmentTone=mix(garmentTone,vec3(.87,.80,.70),blouse);
      float cuff=(1.0-smoothstep(.438,.44,vWardrobeBind.y))*smoothstep(.430,.432,vWardrobeBind.y);
      garmentTone+=vec3(.012)*cuff;
      diffuseColor.rgb*=garmentTone;`);
  };bodyMat.customProgramCacheKey=()=> 'reference-knee-socks-and-skin-v1';
  for(const mesh of bodyMeshes){mesh.material=bodyMat;mesh.geometry=mesh.geometry.clone();mesh.geometry.clearGroups();}

  // A warm gray/brown woven plaid, cut into shallow knife pleats.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#665956';ctx.fillRect(0,0,512,512);
  for(let i=0;i<512;i+=128){ctx.fillStyle='rgba(37,33,40,.7)';ctx.fillRect(i,0,43,512);ctx.fillRect(0,i,512,43);ctx.fillStyle='rgba(183,164,147,.4)';ctx.fillRect(i+60,0,15,512);ctx.fillRect(0,i+60,512,15);ctx.fillStyle='rgba(215,196,174,.6)';ctx.fillRect(i+99,0,2,512);ctx.fillRect(0,i+99,512,2);ctx.fillStyle='rgba(25,24,30,.5)';ctx.fillRect(i+91,0,4,512);ctx.fillRect(0,i+91,512,4);}
  for(let i=0;i<512;i+=3){ctx.fillStyle=i%2?'rgba(230,206,181,.055)':'rgba(20,20,25,.06)';ctx.fillRect(i,0,1,512);ctx.fillRect(0,i,512,1);}
  const plaid=new THREE.CanvasTexture(canvas);plaid.colorSpace=THREE.SRGBColorSpace;plaid.wrapS=plaid.wrapT=THREE.RepeatWrapping;plaid.anisotropy=8;
  const skirtMat=new THREE.MeshStandardMaterial({map:plaid,roughness:.97,side:THREE.DoubleSide});
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[],sides=128,rings=[[.055,.148,.092],[-.025,.167,.108],[-.125,.195,.151],[-.258,.235,.195]];
  rings.forEach(([y,rx,rz],r)=>{for(let i=0;i<=sides;i++){const a=i/sides*TAU,fold=1+.045*Math.cos(a*16)*(r/3),hem=r===3?Math.cos(a*3)*.003:0;positions.push(Math.sin(a)*rx*fold,y+hem,Math.cos(a)*rz*fold);uvs.push(i/sides*3.8,r/3);if(r&&i){const k=r*(sides+1)+i;indices.push(k,k-sides-2,k-1,k,k-sides-1,k-sides-2);}}});
  const skirtGeo=new THREE.BufferGeometry();skirtGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));skirtGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));skirtGeo.setIndex(indices);skirtGeo.computeVertexNormals();
  const skirt=new THREE.Mesh(skirtGeo,skirtMat);skirt.name='Reference-warm-plaid-pleated-skirt';skirt.castShadow=skirt.receiveShadow=true;vrm.humanoid.getNormalizedBoneNode('hips')!.add(skirt);

  // Compact structured satchel and charm hang outside the left hip, clear of fingers.
  const hips=vrm.humanoid.getNormalizedBoneNode('hips')!,bag=new THREE.Group();bag.name='Reference-leather-satchel';bag.position.set(-.257,-.019,.045);hips.add(bag);
  const bagShape=new THREE.Shape();bagShape.moveTo(-.082,-.080);bagShape.quadraticCurveTo(-.092,-.085,-.094,-.064);bagShape.lineTo(-.091,.07);bagShape.quadraticCurveTo(-.091,.092,-.073,.092);bagShape.lineTo(.073,.092);bagShape.quadraticCurveTo(.094,.09,.094,.071);bagShape.lineTo(.092,-.066);bagShape.quadraticCurveTo(.094,-.083,.077,-.083);bagShape.closePath();
  const bagMesh=new THREE.Mesh(new THREE.ExtrudeGeometry(bagShape,{depth:.069,steps:1,bevelEnabled:true,bevelSegments:2,bevelSize:.005,bevelThickness:.004}),leather);bagMesh.rotation.y=Math.PI/2;bagMesh.position.x=-.033;bagMesh.castShadow=true;bag.add(bagMesh);
  for(const x of [-.037,.038]){const handle=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x,.07,-.060),new THREE.Vector3(x,.184,-.055),new THREE.Vector3(x,.198,.055),new THREE.Vector3(x,.073,.066)]),24,.005,6,false),leather);bag.add(handle);}
  const strap=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(.01,.06,-.065),new THREE.Vector3(.065,.25,-.066),new THREE.Vector3(.105,.365,-.04),new THREE.Vector3(.108,.385,.025),new THREE.Vector3(.061,.24,.072),new THREE.Vector3(.01,.07,.070)]),44,.005,6,false),leather);strap.name='Shoulder-supported-bag-strap';bag.add(strap);
  const tag=new THREE.Mesh(new THREE.BoxGeometry(.006,.045,.028),new THREE.MeshStandardMaterial({color:0xc78f97,roughness:.82}));tag.position.set(-.043,.014,-.071);tag.rotation.x=-.16;bag.add(tag);
  const tagCord=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-.044,.06,-.044),new THREE.Vector3(-.048,.045,-.072),new THREE.Vector3(-.044,.031,-.071)]),12,.0012,5),brass);bag.add(tagCord);
  // Retain the real loafers' UV details and silhouette, with a restrained brown finish.
  vrm.scene.traverse(o=>{if(!(o instanceof THREE.SkinnedMesh))return;for(const mat of Array.isArray(o.material)?o.material:[o.material]){if(/Shoes/.test(mat.name)&&'color' in mat)(mat as THREE.MeshStandardMaterial).color.multiply(new THREE.Color(0xd4b39c));}});
  // Keep all ribbon surfaces in front of the collar throughout chest motion.
  for(const part of bodyParent.children){if(part instanceof THREE.SkinnedMesh && /Folded-burgundy|Burgundy-ribbon|Bow-fold|Ribbon-knot/.test(part.name))part.geometry.translate(0,0,-.004);}
  const batches=new Map<THREE.Material,THREE.SkinnedMesh[]>();
  for(const object of [...bodyParent.children]){if(!(object instanceof THREE.SkinnedMesh)||object===top||bodyMeshes.includes(object)||Array.isArray(object.material)||!object.geometry.attributes.skinIndex)continue;if(!/Blouse|blouse|collar|lapel|Lapel|blazer|Blazer|Pocket|pocket|Burgundy|burgundy|Bow|Ribbon|ribbon/.test(object.name))continue;const list=batches.get(object.material)??[];list.push(object);batches.set(object.material,list);}
  for(const [mat,meshes] of batches){if(meshes.length<2)continue;for(const mesh of meshes){const geometry=mesh.geometry;if(!geometry.index)geometry.setIndex(Array.from({length:geometry.attributes.position.count},(_,i)=>i));if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));}const geometry=mergeGeometries(meshes.map(mesh=>mesh.geometry),false);if(!geometry)continue;const mesh=new THREE.SkinnedMesh(geometry,mat);mesh.name='Batched-reference-tailoring';mesh.bind(skeleton,top.bindMatrix);mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;bodyParent.add(mesh);meshes.forEach(part=>part.removeFromParent());}
  return {update(time,speed,phase){const blend=THREE.MathUtils.clamp(speed,0,1);skirt.rotation.x=Math.sin(phase)*.025*blend;skirt.rotation.z=Math.sin(time*1.35)*.005;bag.rotation.x=Math.sin(phase)*.055*blend;bag.rotation.z=Math.sin(time*1.2)*.012;}};
}
