import {paletteFor} from './palettes.mjs';

/** Only presentation tokens cross into the isolated HTML reader. No host DOM or bridge is shared. */
export function readerThemeTokens(serialized,dark=false){
  let supplied={};try{supplied=typeof serialized==='string'?JSON.parse(serialized):serialized||{};}catch{}
  const fallback=paletteFor('pine',dark).colors,result={};
  for(const key of ['bg','panel','paper','text','muted','line','accent','soft','selection'])result[key]=/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(supplied[key]||'')?supplied[key]:fallback[key];
  return result;
}
export const readerChromeCss=`
  :host{font:14px sans-serif;color:var(--reader-text)}
  header{display:grid;grid-template-columns:minmax(44px,1fr) 0 auto;height:52px;background:var(--reader-panel);border-bottom:1px solid var(--reader-line);pointer-events:auto}
  .header-left,.header-right{display:flex;align-items:center;gap:4px;min-width:0;padding:0 8px}.header-right{justify-content:flex-end}
  button{font:13px sans-serif;min-height:44px;padding:10px;border:0;border-radius:8px;background:none;color:inherit;cursor:pointer}
  button:hover{background:var(--reader-soft)}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--reader-accent);outline-offset:-2px}
  button svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7}
  header button,.tools .icon-action{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;min-width:44px;flex-shrink:0;padding:0}
  strong{min-width:0;flex:1;font-size:12px;font-weight:500;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  footer{position:absolute;bottom:0;left:0;right:0;height:29px;display:flex;justify-content:space-between;gap:12px;align-items:center;border-top:1px solid var(--reader-line);background:var(--reader-panel);padding:0 clamp(16px,4vw,64px);font-size:10px;color:var(--reader-muted)}
  aside{display:none;position:absolute;top:53px;right:0;bottom:30px;width:min(320px,100%);overflow:auto;background:var(--reader-panel);border-left:1px solid var(--reader-line);box-sizing:border-box;pointer-events:auto}
  aside button{display:block;width:100%;text-align:left;padding:12px;border-bottom:1px solid var(--reader-line)}
  .tools .icon-action{display:inline-flex}.tools input,.tools textarea{color:var(--reader-text);background:var(--reader-paper);border:1px solid var(--reader-line);border-radius:8px;min-height:44px}
`;
