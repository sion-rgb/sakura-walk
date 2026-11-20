import type { Vector3 } from 'three';

type Obstacle = { x: number; z: number; radius: number; height?: number };

/** Rise gradually over low garden furniture before it can push the lens into the pair. */
export function clearLowProps(focus: Vector3, yaw: number, pitch: number, distance: number, obstacles: Obstacle[]) {
  const x=Math.sin(yaw),z=Math.cos(yaw),reach=distance*Math.cos(pitch);
  let elevation=pitch;
  for(const obstacle of obstacles){
    if(obstacle.height===undefined||obstacle.height<=focus.y)continue;
    const ox=obstacle.x-focus.x,oz=obstacle.z-focus.z;
    const along=ox*x+oz*z,side=Math.abs(ox*z-oz*x),radius=obstacle.radius+.27;
    if(along<=0||along-radius>=reach||side>=radius+.85)continue;
    const entry=Math.max(.25,along-Math.sqrt(Math.max(0,radius*radius-side*side)));
    const aim=Math.atan2(obstacle.height+.30-focus.y,entry);
    const blend=Math.max(0,Math.min(1,(radius+.85-side)/.85));
    elevation=Math.max(elevation,pitch+(aim-pitch)*blend*blend*(3-2*blend));
  }
  return Math.min(1.18,elevation);
}

/** First covered part of the sightline, including clearance for the near plane. */
export function cameraClearance(focus: Vector3, end: Vector3, obstacles: Obstacle[]) {
  const dx = end.x - focus.x, dz = end.z - focus.z, dy = end.y - focus.y;
  const length = Math.hypot(dx, dz);
  if (length < .001) return 1;
  const x = dx / length, z = dz / length;
  let clear = length;
  for (const obstacle of obstacles) {
    const ox = obstacle.x - focus.x, oz = obstacle.z - focus.z;
    const along = ox * x + oz * z, side = ox * z - oz * x;
    const radius = obstacle.radius + .24;
    if (along <= 0 || along - radius >= clear || Math.abs(side) >= radius) continue;
    const entry = Math.max(0, along - Math.sqrt(radius * radius - side * side));
    if (entry >= clear || focus.y + dy * entry / length > (obstacle.height ?? Infinity) + .14) continue;
    clear = entry;
  }
  return clear / length;
}

/** Dissolve between viewpoints without passing the camera through either avatar. */
export function dissolveView(canvas: HTMLCanvasElement) {
  const layer = document.createElement('canvas');
  const scale = Math.min(1, 1024 / Math.max(canvas.width, canvas.height));
  layer.width = Math.max(1, Math.round(canvas.width * scale));
  layer.height = Math.max(1, Math.round(canvas.height * scale));
  const context = layer.getContext('2d');
  if (!context) return;
  context.drawImage(canvas, 0, 0, layer.width, layer.height);
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  // A second, rapid switch replaces the previous short-lived dissolve.
  canvas.parentElement?.querySelector('[data-view-dissolve]')?.remove();
  layer.dataset.viewDissolve = '';
  canvas.after(layer);
  const fade = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 190, easing: 'ease-out' });
  fade.onfinish = fade.oncancel = () => layer.remove();
}
