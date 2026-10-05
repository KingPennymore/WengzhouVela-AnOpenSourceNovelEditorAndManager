import {chromium} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const media=path.join(root,'AppScope/resources/base/media');
const source=await readFile(path.join(media,'app_icon.svg'),'utf8');
// Render vector artwork directly; do not resize a pre-rounded bitmap.
const background=source.match(/<rect\s+id="icon-background"[^>]*\/>/)?.[0];
if(!background||/\br[xy]=/.test(background)||!source.includes('width="1024" height="1024"'))throw Error('Expected a square, full-bleed 1024px icon source.');
const backgroundSvg=source.replace(/<path\s+id="vela-mark"[^>]*\/>/,'');
const foregroundSvg=source.replace(background,'');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  const page=await browser.newPage({viewport:{width:1024,height:1024},deviceScaleFactor:1});
  for(const [name,svg] of [['app_icon_background.png',backgroundSvg],['app_icon_foreground.png',foregroundSvg],['app_icon_1024.png',source]]){
    await page.setContent('<style>html,body{margin:0;width:1024px;height:1024px;background:transparent}img{display:block;width:1024px;height:1024px}</style><img alt="Vela" src="data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64')+'">');
    await page.locator('img').evaluate(img=>img.decode());
    await page.screenshot({path:path.join(media,name),omitBackground:true});
    console.log('Generated '+name+' (1024 × 1024)');
  }
  // Preview system masks separately; these masks are never baked into assets.
  const output=path.join(root,'test-results/icon-0.8.3');await mkdir(output,{recursive:true});
  await page.setViewportSize({width:768,height:288});
  const url='data:image/svg+xml;base64,'+Buffer.from(source).toString('base64');
  await page.setContent('<style>body{margin:0;background:#eaf0ec;display:flex;gap:32px;padding:32px}img{width:192px;height:192px;display:block}.round{border-radius:23%}.circle{border-radius:50%}</style><img src="'+url+'"><img class="round" src="'+url+'"><img class="circle" src="'+url+'">');
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
  await page.screenshot({path:path.join(output,'mask-preview.png')});
}finally{await browser.close();}
