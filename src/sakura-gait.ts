/** Foot trajectories share stance velocity at both ends of the swing. */
export const STANCE = .56;
export const STRIDE = 1.18;
export function ease(t: number) { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); }
export function hermite(a: number, b: number, m: number, t: number) {
  const t2 = t * t, t3 = t2 * t;
  return (2*t3-3*t2+1)*a + (t3-2*t2+t)*m + (-2*t3+3*t2)*b + (t3-t2)*m;
}
export function footCurve(cycle: number, strideScale: number, weight = 1) {
  const amplitude = STRIDE * STANCE * .5 * strideScale;
  if (cycle < STANCE) {
    const q = cycle / STANCE;
    return { forward: amplitude * (1-2*q), lift: 0, pitch: .16*(1-ease(q/.20))-.22*ease((q-.73)/.27), contact: true };
  }
  const q = (cycle-STANCE)/(1-STANCE), m = -2*amplitude*(1-STANCE)/STANCE;
  return { forward: hermite(-amplitude, amplitude, m, q), lift: (.020+.040*Math.min(1,strideScale))*Math.sin(Math.PI*q)**2*weight,
    pitch: -.22*(1-ease(q/.55))+.16*ease((q-.48)/.52), contact: false };
}
export type SolePoint = { z: number; y: number };
/** Convex shoe envelope: evaluates heel/toe contact without per-frame skinning. */
export function soleHull(points: SolePoint[]): SolePoint[] {
  const sorted = [...points].sort((a,b)=>a.z-b.z||a.y-b.y);
  const cross = (o:SolePoint,a:SolePoint,b:SolePoint)=>(a.z-o.z)*(b.y-o.y)-(a.y-o.y)*(b.z-o.z);
  const lower:SolePoint[]=[], upper:SolePoint[]=[];
  for(const p of sorted){while(lower.length>1&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
  for(const p of sorted.reverse()){while(upper.length>1&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}
export function soleRoll(hull: readonly SolePoint[], pitch: number) {
  let minY=Infinity;const c=Math.cos(pitch),s=Math.sin(pitch);
  for(const p of hull)minY=Math.min(minY,p.y*c+p.z*s);
  return Number.isFinite(minY)?minY:0;
}
