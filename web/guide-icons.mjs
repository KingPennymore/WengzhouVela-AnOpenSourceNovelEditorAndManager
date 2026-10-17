import {icon} from './icons.mjs';
export function guideIconSvg(name){const svg=icon(name);return svg.includes('undefined')?null:svg.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="#49735e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ');}
const cache=new Map();
export function guideIconImage(src,alt,escape){const match=/^vela-guide-icons\/([A-Za-z][A-Za-z0-9]*)\.svg$/.exec(src);if(!match)return null;if(!cache.has(src)){const svg=guideIconSvg(match[1]);cache.set(src,svg?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg):null);}const url=cache.get(src);return url?`<img class="vela-guide-icon" src="${url}" alt="${escape(alt)}" width="24" height="24">`:null;}
