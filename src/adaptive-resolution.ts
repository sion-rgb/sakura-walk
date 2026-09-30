export type ResolutionMode = 'auto' | 'native' | 'quality' | 'performance';

/** Samples asynchronously: no query-result read until the driver marks it ready. */
export class GpuTimer {
  private readonly extension: { TIME_ELAPSED_EXT:number; GPU_DISJOINT_EXT:number } | null;
  private pending:WebGLQuery[]=[];
  private active:WebGLQuery|null=null;
  private frame=0;
  enabled=true;
  samples=0;
  milliseconds:number|null=null;
  constructor(private readonly gl:WebGL2RenderingContext){
    this.extension=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    gl.canvas.addEventListener('webglcontextlost',()=>{this.pending=[];this.active=null;this.milliseconds=null;this.samples=0;});
  }
  get supported(){return !!this.extension;}
  setEnabled(value:boolean){this.enabled=value;this.clear();}
  private clear(){for(const query of this.pending)this.gl.deleteQuery(query);this.pending=[];this.milliseconds=null;this.samples=0;}
  begin(){
    const ext=this.extension,gl=this.gl;if(!ext||!this.enabled||gl.isContextLost())return;
    if(gl.getParameter(ext.GPU_DISJOINT_EXT)){this.clear();return;}
    while(this.pending.length&&gl.getQueryParameter(this.pending[0],gl.QUERY_RESULT_AVAILABLE)){
      const query=this.pending.shift()!;this.milliseconds=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;this.samples++;gl.deleteQuery(query);
    }
    if(this.frame++%8||this.pending.length>=4)return;
    this.active=gl.createQuery();if(this.active)gl.beginQuery(ext.TIME_ELAPSED_EXT,this.active);
  }
  end(){if(this.active){this.gl.endQuery(this.extension!.TIME_ELAPSED_EXT);this.pending.push(this.active);this.active=null;}}
}

/** A slow hysteretic controller changes scale only from measured GPU work. */
export class AdaptiveResolution {
  mode:ResolutionMode='auto';
  scale=1;
  readonly minScale=.55;
  readonly budgetMs=14.5;
  private history:number[]=[];
  private elapsed=0;
  private lastSample=-1;
  private settling=2;
  setMode(mode:ResolutionMode,autoFallback=1){
    this.mode=mode;this.scale=mode==='quality'?.85:mode==='performance'?.67:mode==='auto'?autoFallback:1;this.reset();
  }
  reset(){this.history=[];this.elapsed=0;this.settling=2;this.lastSample=-1;}
  observe(timer:GpuTimer,dt:number,allowChange:boolean){
    if(this.mode!=='auto'||!allowChange||!timer.supported||!timer.enabled)return false;
    if(timer.milliseconds===null){this.history=[];this.elapsed=0;this.lastSample=-1;return false;}
    this.settling=Math.max(0,this.settling-dt);
    if(timer.samples!==this.lastSample&&timer.milliseconds!==null){this.history.push(timer.milliseconds);this.lastSample=timer.samples;if(this.history.length>18)this.history.shift();}
    this.elapsed+=dt;
    if(this.settling>0||this.history.length<10||this.elapsed<2)return false;
    const sorted=[...this.history].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length*.5)];
    let next=this.scale;
    if(median>this.budgetMs*1.12)next=Math.max(this.minScale,Math.round((this.scale-.1)*100)/100);
    else if(median<this.budgetMs*.67&&this.elapsed>6)next=Math.min(1,Math.round((this.scale+.05)*100)/100);
    if(next===this.scale)return false;
    this.scale=next;this.reset();return true;
  }
}
