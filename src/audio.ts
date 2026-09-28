/** Original synthesized soundscape. No external requests or copyrighted recordings. */
export class Soundscape {
  context?: AudioContext; private master?: GainNode; private wind?: GainNode;
  muted=false; volume=.55; music=true; private randomState=5301; private nextBird=4; private nextBell=17; private nextNote=1; private note=0;
  private rnd(){this.randomState=(Math.imul(1664525,this.randomState)+1013904223)>>>0;return this.randomState/4294967296;}
  async unlock(){
    if(!this.context){
      const c=this.context=new AudioContext();this.master=c.createGain();this.master.gain.value=this.muted?0:this.volume*.5;this.master.connect(c.destination);
      const buffer=c.createBuffer(1,c.sampleRate*8,c.sampleRate),data=buffer.getChannelData(0);let low=0;
      for(let i=0;i<data.length;i++){low=(low+.025*(this.rnd()*2-1))/1.025;data[i]=low*3.4;}
      const src=c.createBufferSource();src.buffer=buffer;src.loop=true;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=700;
      this.wind=c.createGain();this.wind.gain.value=.24;src.connect(filter).connect(this.wind).connect(this.master);src.start();
    }
    await this.context.resume();
  }
  setMuted(m:boolean){this.muted=m;this.setVolume(this.volume);}
  setVolume(v:number){this.volume=v;if(this.context&&this.master)this.master.gain.setTargetAtTime(this.muted?0:v*.5,this.context.currentTime,.1);}
  async pause(p:boolean){if(this.context){if(p)await this.context.suspend();else await this.context.resume();}}
  private tone(freq:number,duration:number,volume:number,type:OscillatorType='sine',delay=0,pan=0){
    const c=this.context;if(!c||c.state!=='running'||!this.master)return;
    const t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain(),p=c.createStereoPanner();o.type=type;o.frequency.value=freq;p.pan.value=pan;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.025);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(g).connect(p).connect(this.master);o.start(t);o.stop(t+duration+.1);o.onended=()=>{o.disconnect();g.disconnect();p.disconnect();};return o;
  }
  chime(){this.tone(659.25,1.3,.1);this.tone(987.77,1.6,.045,'sine',.12);}
  step(companion=false){
    const c=this.context;if(!c||c.state!=='running'||!this.master)return;
    const b=c.createBuffer(1,Math.floor(c.sampleRate*.085),c.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(this.rnd()*2-1)*Math.exp(-i/d.length*8);
    const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain(),p=c.createStereoPanner();s.buffer=b;f.type='lowpass';f.frequency.value=520+this.rnd()*360;g.gain.value=companion?.055:.075;p.pan.value=companion?.36:-.15;s.connect(f).connect(g).connect(p).connect(this.master);s.start();s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();p.disconnect();};
  }
  update(dt:number,time:number){
    if(!this.context||this.context.state!=='running')return;
    if(this.wind)this.wind.gain.setTargetAtTime(.17+.05*Math.sin(time*.17),this.context.currentTime,.7);
    this.nextBird-=dt;this.nextBell-=dt;this.nextNote-=dt;
    if(this.nextBird<0){this.nextBird=6+this.rnd()*9;const p=this.rnd()*1.7-.85;for(let i=0;i<3;i++){const o=this.tone(1900+this.rnd()*700,.16,.015,'sine',i*.21,p);o?.frequency.exponentialRampToValueAtTime(3100,this.context.currentTime+i*.21+.1);}}
    if(this.nextBell<0){this.nextBell=27+this.rnd()*19;[293.66,587.32,822.25].forEach((f,i)=>this.tone(f,6-i,.027/(i+1),'sine',0,.6));}
    if(this.nextNote<0){this.nextNote=1.8+(this.note%4===3?2.5:0);if(this.music){const notes=[60,64,67,71,69,67,64,62,57,60,64,67,65,64,62,55];const f=440*2**((notes[this.note%notes.length]-69)/12);this.tone(f,4.2,.062,'sine');this.tone(f*2,1.8,.012,'triangle');if(this.note%4===0)this.tone(f/2,6,.04);}this.note++;}
  }
  get diagnostics(){return {state:this.context?.state??'locked',muted:this.muted,volume:this.volume,music:this.music,provider:'local Web Audio synthesis'};}
}
