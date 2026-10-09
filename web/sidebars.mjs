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
    try{this.widths=JSON.parse(localStorage.getItem('vela.sidebar-widths')||'{}');}catch{this.widths={};}
    if(!this.widths||typeof this.widths!=='object')this.widths={};
    this.handles=[this.makeHandle(this.left,'left'),this.makeHandle(this.right,'right')];
    window.addEventListener('resize',()=>this.update(false));
    this.motion.addEventListener('change',()=>this.update(false));
    this.update(false);
  }
  makeHandle(root,side){
    const handle=document.createElement('div');handle.className='sidebar-resize sidebar-resize-'+side;handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label',side==='left'?'调整文件侧栏宽度':'调整章节目录宽度');root.append(handle);
    const store=()=>{try{localStorage.setItem('vela.sidebar-widths',JSON.stringify(this.widths));}catch{};};
    const key=()=>this.root.clientWidth<=600?'phone':'wide';
    const set=value=>{this.widths[key()]={...this.widths[key()],[side]:Math.max(120,Math.min(480,value))};this.update(false);};
    handle.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();handle.focus({preventScroll:true});const start=event.clientX,width=this.current[side+'Width'];handle.setPointerCapture(event.pointerId);handle.onpointermove=move=>set(width+(move.clientX-start)*(side==='left'?1:-1));const end=()=>{handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;store();};handle.onpointerup=end;handle.onpointercancel=end;};
    handle.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const width=this.current[side+'Width'],direction=side==='left'?1:-1;set(event.key==='Home'?120:event.key==='End'?480:width+(event.key==='ArrowRight'?16:-16)*direction);store();};
    handle.ondblclick=()=>{delete this.widths[key()]?.[side];this.update(false);store();};return handle;
  }
  targets(){
    const width=this.root.clientWidth;
    const leftOpen=document.body.classList.contains('show-library');
    const rightOpen=document.body.classList.contains('show-outline')&&!document.body.classList.contains('focus')&&!document.querySelector('#write-view').hidden;
    const phone=width<=600;
    const profile=document.body.dataset.ui;
    const saved=this.widths[phone?'phone':'wide']||{};
    const preferred=(side,fallback)=>Number.isFinite(saved[side])?Math.max(120,Math.min(480,saved[side])):fallback;
    const leftWidth=preferred('left',phone?Math.min(180,width*.45):profile==='harmonyos'?282:profile==='windows'?244:260);
    const rightWidth=preferred('right',phone?Math.min(170,width*.42):profile==='harmonyos'?290:260);
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
    for(const [i,side] of ['left','right'].entries()){const handle=this.handles?.[i];if(handle){handle.setAttribute('aria-valuemin','120');handle.setAttribute('aria-valuemax',String(Math.min(480,this.root.clientWidth)));handle.setAttribute('aria-valuenow',String(Math.round(values[side+'Width'])));}}
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
