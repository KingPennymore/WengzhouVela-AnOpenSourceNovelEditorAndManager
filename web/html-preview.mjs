import DOMPurify from 'dompurify';
export function htmlPreview(text,{dark,fontSize}){
  const clean=DOMPurify.sanitize(text,{WHOLE_DOCUMENT:true,FORBID_TAGS:['script','iframe','form','input','button','video','audio','link','meta','base','object','embed'],FORBID_ATTR:['href','src','srcset','action']});
  const parsed=new DOMParser().parseFromString(clean,'text/html');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><style>html{color-scheme:${dark?'dark':'light'}}body{margin:24px;font-family:sans-serif;font-size:${fontSize}px;line-height:1.8;color:${dark?'#d3dbe7':'#29333e'};background:${dark?'#202631':'#fff'};overflow-wrap:anywhere}table{border-collapse:collapse}td,th{border:1px solid #888;padding:8px}</style>${parsed.head.innerHTML}</head>${parsed.body.outerHTML}</html>`;
}
