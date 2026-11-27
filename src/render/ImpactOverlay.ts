import { Camera, Vector3 } from 'three';
import type { GameEvent } from '../contracts';

const FEEDBACK={capacity:28,lifetime:0.65,rise:48} as const;
interface Label {node:HTMLSpanElement;life:number;x:number;z:number;isKill:boolean}

export class ImpactOverlay {
  private readonly labels:Label[];
  private readonly vector=new Vector3();
  private cursor=0;
  constructor(private readonly container:HTMLElement) {
    this.labels=Array.from({length:FEEDBACK.capacity},()=>{
      const node=document.createElement('span');node.className='world-impact';node.setAttribute('aria-hidden','true');node.hidden=true;container.append(node);
      return {node,life:0,x:0,z:0,isKill:false};
    });
  }

  update(camera:Camera,args:{dt:number;events:readonly GameEvent[]}):void {
    for(const event of args.events) this.consume(event);
    for(const label of this.labels) {
      label.life=Math.max(0,label.life-args.dt);label.node.hidden=label.life===0;
      if(label.life===0) continue;
      this.vector.set(label.x,1.4,label.z).project(camera);
      const x=(this.vector.x+1)*this.container.clientWidth/2;
      const y=(1-this.vector.y)*this.container.clientHeight/2-(1-label.life/FEEDBACK.lifetime)*FEEDBACK.rise;
      label.node.style.transform=`translate(${x}px,${y}px)`;label.node.style.opacity=String(Math.min(1,label.life*4));
    }
  }

  private consume(event:GameEvent):void {
    if(event.type!=='hit'&&event.type!=='execute') return;
    const label=this.labels[this.cursor++%FEEDBACK.capacity];
    label.x=event.x;label.z=event.z;label.life=FEEDBACK.lifetime;
    label.node.textContent=event.type==='execute'?'处决 +8 HP':`${Math.round(event.value??0)}`;
    label.node.classList.toggle('execution',event.type==='execute');
    label.node.classList.toggle('armored',event.kind==='crab'&&(event.value??0)<5);
  }

  dispose():void {for(const label of this.labels) label.node.remove();}
}
