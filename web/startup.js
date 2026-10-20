// Small, synchronous appearance bootstrap. It runs before the editor module and never reads document bodies.
(()=>{
 const root=document.documentElement,key='vela.appearance',motionOff=()=>{try{return localStorage.getItem('vela.test.motion')==='off';}catch{return false;}},quiet=matchMedia('(prefers-reduced-motion: reduce)').matches||motionOff();
 const defaults={light:{bg:'#eef3ef',paper:'#fcfefc',text:'#28372f',accent:'#23744e'},dark:{bg:'#161e1a',paper:'#202e25',text:'#d5e5db',accent:'#8ad0a8'}};
 let cached;try{cached=JSON.parse(localStorage.getItem(key)||'null');}catch{}
 let systemDark=matchMedia('(prefers-color-scheme: dark)').matches;try{const environment=JSON.parse(window.WenzhouNative?.readEnvironment?.()||'null');if(typeof environment?.dark==='boolean')systemDark=environment.dark;}catch{}
 const theme=['light','dark','system'].includes(cached?.theme)?cached.theme:'system',dark=theme==='dark'||theme==='system'&&systemDark;
 function paint(colors,isDark){for(const name of ['bg','paper','text','accent']){const color=colors?.[name];if(/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(color||''))root.style.setProperty('--startup-'+name,color);}root.style.setProperty('--startup-veil',isDark?'rgba(255,255,255,.07)':'rgba(0,0,0,.10)');root.style.colorScheme=isDark?'dark':'light';root.style.backgroundColor='var(--startup-bg)';}
 paint({...defaults[dark?'dark':'light'],...cached?.colors?.[dark?'dark':'light']},dark);
 if(!quiet)root.dataset.startup='loading';
 let phase,finished=false,appearanceDark=dark;
 const motionDone=(selector,name)=>new Promise(resolve=>requestAnimationFrame(()=>{const animations=document.querySelector(selector)?.getAnimations().filter(animation=>animation.animationName===name)||[];Promise.allSettled(animations.map(animation=>animation.finished)).then(resolve);}));
 // The logo starts its exit while the last bars are settling, so the whole opening reads as one wave.
 const CHROME_SETTLE=240;
 const dismiss=()=>{finished=true;delete root.dataset.startup;const app=document.getElementById('app');if(app){app.inert=false;app.removeAttribute('aria-busy');}document.getElementById('startup-screen')?.remove();};
 const activate=()=>{const app=document.getElementById('app');if(!quiet&&!finished&&app){app.inert=true;app.setAttribute('aria-busy','true');}document.body?.classList.toggle('dark',appearanceDark);if(quiet)dismiss();};
 document.addEventListener('DOMContentLoaded',activate,{once:true});
 window.velaStartup={
  remember(settings,colors){appearanceDark=settings.dark;const value={theme:settings.theme,palette:settings.palette,colors};try{const encoded=JSON.stringify(value);if(localStorage.getItem(key)!==encoded)localStorage.setItem(key,encoded);}catch{}paint(colors[settings.dark?'dark':'light'],settings.dark);},
  layoutReady(){if(phase)return phase;if(quiet||finished)return phase=Promise.resolve();phase=new Promise(resolve=>requestAnimationFrame(()=>{if(finished){resolve();return;}root.dataset.startup='assembling';setTimeout(resolve,CHROME_SETTLE);}));return phase;},
  // Called after the editor or start page exists, so a slow editor build cannot consume the content fade.
  reveal(){if(quiet||!document.body)return;document.body.classList.add('vela-startup-in');setTimeout(()=>document.body?.classList.remove('vela-startup-in'),700);},
  async ready(){await this.layoutReady();if(!quiet&&!finished){root.dataset.startup='finishing';await motionDone('.startup-brand','vela-logo-exit');}dismiss();},
  dismiss
 };
 // A missing entry module must never leave an opaque splash over the failure page.
 addEventListener('error',event=>{if(event.target instanceof HTMLScriptElement&&/\/app\.js(?:\?|$)/.test(event.target.src))dismiss();},true);
})();
