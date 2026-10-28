export const MB=1024*1024;
const HTML_ENTITIES={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>HTML_ENTITIES[c]);
const encoder=new TextEncoder();
export const textBytes=text=>encoder.encode(text).length;
export const formatBytes=bytes=>bytes>=MB?(bytes/MB).toFixed(1)+' MB':bytes>=1024?Math.round(bytes/1024)+' KB':bytes+' B';
