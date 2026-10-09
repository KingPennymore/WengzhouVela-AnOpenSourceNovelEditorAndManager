const DURATION=240;
const fields=['left','right','leftWidth','rightWidth','bottom'];

// Both sidebar slots and the editor consume the same frame's layout dimensions.
export class SidebarLayout {
  constructor(measure){
    this.measure=measure;
    this.root=document.querySelector('#app');
    this.left=document.querySelector('#library-shell');
    this.right=document.querySelector('#outline-shell');
    this.current={left:0,right:0,leftWidth:255,rightWidth:270,bottom:80};
    this.frame=0;
    this.footerHeight=80;
    this.motion=matchMedia('(prefers-reduced-motion: reduce)');
    window.addEventListener('resize',()=>this.update(false));
    this.motion.addEventListener('change',()=>this.update(false));
    this.update(false);
  }
  targets(){
    const width=this.root.clientWidth;
    const leftOpen=document.body.classList.contains('show-library');
    const rightOpen=document.body.classList.contains('show-outline')&&!document.body.classList.contains('focus')&&!document.querySelector('#write-view').hidden;
    const phone=width<=600;
    const profile=document.body.dataset.ui;
    const leftWidth=phone?Math.min(180,width*.45):profile==='harmonyos'?282:profile==='windows'?244:260;
    const rightWidth=phone?Math.min(170,width*.42):profile==='harmonyos'?290:260;
    const footer=document.querySelector('#writing-footer'),height=footer.offsetHeight;
    if(height>0)this.footerHeight=height;
    this.root.style.setProperty('--footer-height',this.footerHeight+'px');
    this.root.style.setProperty('--shell-top',document.querySelector('.topbar').offsetHeight+'px');
    const minimumPaper=phone?Math.min(width,Math.max(160,width*.4)):Math.min(240,Math.max(96,width*.25));
    const budget=Math.max(0,width-minimumPaper);
    const total=(leftOpen?leftWidth:0)+(rightOpen?rightWidth:0);
    const ratio=total>budget?budget/total:1;
    return {left:leftOpen?leftWidth*ratio:0,right:rightOpen?rightWidth*ratio:0,
      leftWidth:leftOpen?leftWidth*ratio:this.current.left>0?this.current.leftWidth:leftWidth,
      rightWidth:rightOpen?rightWidth*ratio:this.current.right>0?this.current.rightWidth:rightWidth,
      bottom:!document.querySelector('#write-view').hidden?this.footerHeight:0};
  }
  apply(values,target){
    this.current=values;
    for(const [property,key] of [['--left-size','left'],['--right-size','right'],['--left-panel-width','leftWidth'],['--right-panel-width','rightWidth'],['--sidebar-bottom','bottom']])this.root.style.setProperty(property,values[key].toFixed(3)+'px');
    this.left.style.visibility=values.left>0||target.left>0?'visible':'hidden';
    this.right.style.visibility=values.right>0||target.right>0?'visible':'hidden';
    this.root.style.setProperty('--footer-progress',String(1-values.bottom/this.footerHeight));
    const footer=document.querySelector('#writing-footer');if(footer){footer.style.visibility=values.bottom>0||target.bottom>0?'visible':'hidden';footer.inert=target.bottom===0;}
    this.left.inert=target.left===0;this.right.inert=target.right===0;
    this.measure?.();
  }
  update(animate=true){
    const target=this.targets();
    if(animate&&this.frame&&fields.every(key=>Math.abs(this.target[key]-target[key])<.001))return;
    cancelAnimationFrame(this.frame);this.frame=0;
    this.target=target;
    const from={...this.current};
    if(!animate||this.motion.matches||fields.every(key=>Math.abs(from[key]-target[key])<.001)){
      this.apply(target,target);this.root.dataset.sidebarsAnimating='false';return;
    }
    this.root.dataset.sidebarsAnimating='true';
    const start=performance.now();
    this.apply(from,target);
    const tick=now=>{
      const progress=Math.max(0,Math.min(1,(now-start)/DURATION)),eased=1-(1-progress)**3;
      const values=Object.fromEntries(fields.map(key=>[key,from[key]+(target[key]-from[key])*eased]));
      this.apply(progress===1?target:values,target);
      if(progress<1)this.frame=requestAnimationFrame(tick);
      else{this.frame=0;this.root.dataset.sidebarsAnimating='false';}
    };
    this.frame=requestAnimationFrame(tick);
  }
}
