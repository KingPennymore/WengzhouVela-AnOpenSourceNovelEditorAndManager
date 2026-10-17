// Stylesheet refactoring guard: captures the computed style and box of every rendered element (and ::before /
// ::after) in many app states, then compares two captures. Used to show a CSS reorganization changes nothing.
//   node tests/style-snapshot.mjs capture <file.json.gz>
//   node tests/style-snapshot.mjs compare <before.json.gz> <after.json.gz> [--summary] [--unwrap div.a,div.b]
// States: start page, editor with sidebars, overflow menu, settings, Markdown preview with a formula, .vela form,
// glossary, selection menu, command palette, search panel, GitHub, subscriptions, reader library and book; for the
// windows (1440), harmonyos (1280 and 390) and android (390) profiles, light and dark.
import {chromium} from 'playwright';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {startSourceAppServer} from './source-app-server.mjs';
import {tour,tourPage,tourVariants} from './app-tour.mjs';

const properties=['display','position','top','right','bottom','left','float','z-index','width','height','min-width','min-height','max-width','max-height','box-sizing','margin-top','margin-right','margin-bottom','margin-left','padding-top','padding-right','padding-bottom','padding-left','border-top-width','border-right-width','border-bottom-width','border-left-width','border-top-style','border-right-style','border-bottom-style','border-left-style','border-top-color','border-right-color','border-bottom-color','border-left-color','border-top-left-radius','border-top-right-radius','border-bottom-left-radius','border-bottom-right-radius','outline-style','outline-width','outline-color','outline-offset','color','background-color','background-image','background-position','background-size','background-repeat','background-clip','box-shadow','opacity','visibility','overflow-x','overflow-y','font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-decoration-line','text-transform','text-indent','white-space','word-break','overflow-wrap','text-overflow','vertical-align','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis','justify-content','align-items','align-self','align-content','row-gap','column-gap','order','grid-template-columns','grid-template-rows','grid-column-start','grid-column-end','grid-row-start','grid-row-end','transform','transform-origin','transition-property','transition-duration','animation-name','filter','backdrop-filter','cursor','pointer-events','user-select','content','fill','stroke','stroke-width','object-fit','clip-path','scrollbar-width','scrollbar-color','caret-color','accent-color','color-scheme','writing-mode','list-style-type','table-layout','border-collapse','resize','inset-inline-start','isolation','mix-blend-mode','will-change','contain','scroll-behavior','touch-action','-webkit-line-clamp','text-shadow','font-variant-numeric','font-feature-settings','tab-size','hyphens','direction','unicode-bidi','overscroll-behavior-y','scroll-snap-type','aspect-ratio'];
// Runs in the page: key → [rect, style id] for every rendered element and pseudo-element.
function collect(properties){
  const styles=[],index=new Map(),result={};
  const styleId=style=>{const value=properties.map(name=>style.getPropertyValue(name)).join('\u0001');if(!index.has(value)){index.set(value,styles.length);styles.push(value);}return index.get(value);};
  const keyOf=element=>{const parts=[];for(let node=element;node&&node.nodeType===1;node=node.parentElement){let part=node.localName;if(node.id)part+='#'+node.id;const classes=[...node.classList].filter(name=>!/^(ͼ|cm-focused|vela-test)/.test(name)).slice(0,3);if(classes.length)part+='.'+classes.join('.');const same=node.parentElement?[...node.parentElement.children].filter(item=>item.localName===node.localName):[];if(same.length>1)part+=':'+same.indexOf(node);parts.unshift(part);if(node.id)break;}return parts.join('>');};
  const round=value=>Math.round(value*2)/2;
  for(const element of document.querySelectorAll('body *')){
    if(['script','style','template'].includes(element.localName))continue;const box=element.getBoundingClientRect();if(!box.width&&!box.height&&getComputedStyle(element).display==='none')continue;
    if(element.closest('#clock,#reader-clock,.start-time,[data-relative-time],.cm-cursorLayer'))continue;
    const key=keyOf(element);result[key]=[[round(box.x),round(box.y),round(box.width),round(box.height)],styleId(getComputedStyle(element))];
    for(const pseudo of ['::before','::after']){const style=getComputedStyle(element,pseudo);if(style.content&&style.content!=='none'&&style.content!=='normal')result[key+pseudo]=[null,styleId(style)];}
  }
  for(const pseudo of ['','::before','::after'])result['html'+pseudo]=[null,styleId(getComputedStyle(document.documentElement,pseudo||null))];
  result['body']=[null,styleId(getComputedStyle(document.body))];
  return {styles,elements:result};
}

async function capture(file){
  const server=await startSourceAppServer(),browser=await chromium.launch({headless:true,executablePath:process.env.WENZHOU_CHROME||(existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
  const snapshot={properties,states:{}};
  try{
    for(const [profile,width,height] of tourVariants)for(const theme of ['light','dark']){
      const {context,page}=await tourPage(browser,{profile,width,height,theme}),prefix=`${profile}-${width}-${theme}/`;
      await tour(page,{url:server.url,profile,width},async name=>{snapshot.states[prefix+name]=await page.evaluate(collect,properties);});
      await context.close();console.log('captured',prefix);
    }
  }finally{await browser.close();await server.close();}
  writeFileSync(file,gzipSync(JSON.stringify(snapshot)));
}

function compare(beforeFile,afterFile,summary=false){
  const read=file=>JSON.parse(gunzipSync(readFileSync(file)).toString());const before=read(beforeFile),after=read(afterFile),report={states:0,changed:0,details:[]};
  // --unwrap a,b: path segments of wrappers added on purpose are dropped from the keys of the second capture.
  const unwrap=(process.argv[process.argv.indexOf('--unwrap')+1]||'').split(',').filter(()=>process.argv.includes('--unwrap'));
  if(unwrap.length)for(const state of Object.values(after.states))state.elements=Object.fromEntries(Object.entries(state.elements).filter(([key])=>!unwrap.some(name=>key.endsWith('>'+name))).map(([key,value])=>[key.split('>').filter(part=>!unwrap.includes(part)).join('>'),value]));
  for(const [state,a] of Object.entries(before.states)){
    const b=after.states[state];report.states++;if(!b){report.details.push({state,missing:true});report.changed++;continue;}
    const keys=new Set([...Object.keys(a.elements),...Object.keys(b.elements)]),diffs=[];
    for(const key of keys){
      const x=a.elements[key],y=b.elements[key];if(!x||!y){diffs.push({key,only:x?'before':'after'});continue;}
      const rect=x[0]&&y[0]&&x[0].some((value,i)=>Math.abs(value-y[0][i])>0.5);const sx=a.styles[x[1]].split('\u0001'),sy=b.styles[y[1]].split('\u0001');
      const props=before.properties.map((name,i)=>sx[i]!==sy[i]?`${name}: ${sx[i]} → ${sy[i]}`:null).filter(Boolean);
      if(rect||props.length)diffs.push({key,rect:rect?[x[0],y[0]]:undefined,props});
    }
    if(diffs.length){report.changed++;report.details.push({state,count:diffs.length,diffs:summary?diffs:diffs.slice(0,12)});}
  }
  if(summary){
    // One line per element (last path segment) and property, with the number of states it differs in.
    const lines=new Map();for(const detail of report.details)for(const diff of detail.diffs||[]){const element=diff.key.split('>').pop().replace(/:\d+/g,'');for(const change of diff.props||[]){const key=element+' | '+change;lines.set(key,(lines.get(key)||0)+1);}if(diff.rect)lines.set(element+' | rect',(lines.get(element+' | rect')||0)+1);if(diff.only)lines.set(element+' | only '+diff.only,(lines.get(element+' | only '+diff.only)||0)+1);}
    console.log(`${report.changed} of ${report.states} states differ`);for(const [key,count] of [...lines].sort((a,b)=>b[1]-a[1]))console.log(count+'	'+key);
  }else console.log(JSON.stringify(report,null,1));
  if(report.changed)process.exitCode=1;
}

const [command,a,b]=process.argv.slice(2);
if(command==='capture')await capture(a);else if(command==='compare')compare(a,b,process.argv.includes('--summary'));else{console.error('usage: capture <file> | compare <before> <after>');process.exitCode=2;}
