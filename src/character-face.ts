import * as THREE from 'three';
import { MToonMaterial, type VRM } from '@pixiv/three-vrm';

/** Reference-directed facial palette; retains the avatar's expression morphs and UVs. */
export async function tuneCompanionFace(vrm: VRM): Promise<void> {
  const iris = await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}characters/haruka-iris-reference.png`);
  iris.colorSpace = THREE.SRGBColorSpace;
  iris.flipY = false;
  iris.anisotropy = 4;
  iris.name = 'Haruka-reference-chestnut-iris';
  const seen = new Set<THREE.Material>();
  vrm.scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (seen.has(material) || !(material instanceof MToonMaterial)) continue;
      seen.add(material);
      if (/Face_00_SKIN/.test(material.name)) {
        material.color.set('#dec8c3');
        material.shadeColorFactor.set('#cbaab0');
        material.giEqualizationFactor = .55;
        material.parametricRimColorFactor.set('#000000');
        material.outlineWidthFactor *= .6;
      } else if (/EyeIris/.test(material.name)) {
        material.map = iris;
        material.shadeMultiplyTexture = iris;
        material.color.set('#b49b9e');
        material.shadeColorFactor.set('#958081');
        material.giEqualizationFactor = .85;
      } else if (/Eyeline|Eyelash|Brow/.test(material.name)) {
        material.color.set('#574042');
        material.shadeColorFactor.set('#39282b');
        material.giEqualizationFactor = .9;
      } else if (/EyeWhite/.test(material.name)) {
        material.color.set('#e0d4cd');
        material.shadeColorFactor.set('#c0acb1');
      }
      material.needsUpdate = true;
    }
  });
}
