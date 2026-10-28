import{H as j,I as M,J as B,K as C,e as S,h as k,i as v,r as E}from"./chunk-WBSHM7L3.js";import{a as f}from"./chunk-RJZ6KQTN.js";import{d as y}from"./chunk-TTC262CJ.js";y();var G=Object.freeze({"image/jpeg":"jpg","image/png":"png","image/gif":"gif","image/webp":"webp"}),J=5*1048576,K=e=>(String(e||"").replace(/[\\/:*?"<>|\x00-\x1f\x7f]+/g," ").replace(/\s+/g," ").trim().slice(0,120).trim()||"\u7535\u5B50\u4E66")+".epub";y();var x=e=>!e.trim(),z=e=>{let r=[0];for(let t=0;t<e.length;t++)e.charCodeAt(t)===10&&r.push(t+1);return r};function A(e,r,{from:t,to:n=t,includeTitle:o=!0,keepLines:l=new Set}={}){if(!Array.isArray(r)||!r.length)throw new Error("\u6CA1\u6709\u53EF\u5BFC\u51FA\u7684\u7AE0\u8282\u3002");if(!Number.isInteger(t)||!Number.isInteger(n)||t<0||n>=r.length||t>n)throw new Error("\u7AE0\u8282\u8303\u56F4\u65E0\u6548\u3002");let a=z(e),m=[],u=i=>{let c=a[i],s=i+1<a.length?a[i+1]-1:e.length;return{row:i,start:c,end:s,text:e.slice(c,s)}};for(let i=t;i<=n;i++){let c=r[i],s=[];for(let p=c.heading&&!o?c.row+1:c.row;p<c.endRow&&p<a.length;p++)s.push(u(p));for(;s.length&&x(s[0].text)&&!l.has(s[0].row);)s.shift();for(;s.length&&x(s.at(-1).text)&&!l.has(s.at(-1).row);)s.pop();s.length&&m.push(s.map(p=>({...p,heading:!!c.heading&&p.row===c.row})))}return m}function N(e,r,t){let n=z(e),o=new Set;for(let l of r.filter(a=>a.group==="inserts")){let a=0;for(;a+1<n.length&&n[a+1]<=l.from;)a++;o.add(a)}return{...t,keepLines:o}}var H=/^[\p{P}\p{S}]|[\p{P}\p{S}]$/u,L=(e,r)=>{let t=e.replace(/([\\`*_[\]<>~|])/g,"\\$1");if(!r.length)return t;let n=H.test(e)||/^\s|\s$/.test(e);return r.includes("emphasis")&&(t=n?"<em>"+t+"</em>":"*"+t+"*"),r.includes("strong")&&(t=n?"<strong>"+t+"</strong>":"**"+t+"**"),t},P=(e,r,t,n)=>j(e,r,t,n).map(o=>o.ruby===void 0?L(o.text,o.types):"<ruby>"+o.runs.map(l=>L(l.text,l.types)).join("")+"<rt>"+f(o.ruby)+"</rt></ruby>").join(""),R=(e,r,t)=>P(e,r.start,r.end,t).replace(/^(\s*)([#>+=-]|\d+[.)])(?=\s|$)/u,"$1\\$2"),U=e=>"!["+(e.alt||"").replace(/([\\[\]])/g,"\\$1")+"]("+encodeURI(e.src).replace(/[()]/g,r=>r==="("?"%28":"%29")+")";function et(e,r,t,n,{tables:o=new Map}={}){let l=A(e,r,N(e,t,n)),a=C(e,t),m=S(e,t),u=[],i=l.map(c=>c.flatMap(s=>{let p=[];x(s.text)||p.push(s.heading?"## "+R(e,{...s,start:s.start+s.text.match(/^\s*/)[0].length},t).trim():R(e,s,t));for(let b of a.get(s.end)||[])p.push(U(b));for(let b of m.get(s.end)||[]){let g=o.get(b.src);(!g||g.error)&&u.push(b.src),p.push('<div class="csv-table">'+k(g,b)+"</div>")}return p}).join(`

`)).filter(Boolean).join(`

`);return{text:i?i+`
`:"",chapters:l.length,missing:u}}var _=(e,r)=>{let t=f(e);for(let n of r.filter(o=>o.startsWith("style:")))t=`<span class="style-${n.slice(6)}">${t}</span>`;return r.includes("emphasis")&&(t='<em class="emphasis">'+t+"</em>"),r.includes("strong")&&(t="<strong>"+t+"</strong>"),t},I=(e,r,t)=>j(e,r.start,r.end,t).map(n=>n.ruby===void 0?_(n.text,n.types):"<ruby>"+n.runs.map(o=>_(o.text,o.types)).join("")+"<rp>\uFF08</rp><rt>"+f(n.ruby)+"</rt><rp>\uFF09</rp></ruby>").join(""),V=(e,r,t)=>{let n=[r.get(e.start),t.has(e.start)?"style-"+t.get(e.start):null].filter(Boolean);return n.length?` class="${n.join(" ")}"`:""};function F(e,r,t,n,{imageUrl:o=()=>null,tables:l=new Map}={}){let a=M(t),m=B(t),u=C(e,t),i=A(e,r,N(e,t,n)),c=S(e,t),s=[],p=g=>{let h=o(g.src);return h?[`<figure class="illustration"><img src="${f(h)}" alt="${f(g.alt||"")}"/>${g.alt?`<figcaption>${f(g.alt)}</figcaption>`:""}</figure>`]:(s.push(g.src),[])};return{html:i.map(g=>`<section>
`+g.flatMap(h=>{let w=[];if(!x(h.text)){let d=V(h,a,m);w.push(h.heading?`<h2${d}>${I(e,h,t).trim()}</h2>`:`<p${d}>${I(e,h,t)}</p>`)}for(let d of u.get(h.end)||[])w.push(...p(d));for(let d of c.get(h.end)||[]){let $=l.get(d.src);(!$||$.error)&&s.push(d.src),w.push('<div class="csv-table">'+k($,d)+"</div>")}return w}).join(`
`)+`
</section>`).join(`
`),chapters:i.length,missing:s}}var X=`figure.illustration{margin:1em auto;text-align:center;break-inside:avoid;page-break-inside:avoid}
figure.illustration img{max-width:100%;max-height:90vh;height:auto}
figure.illustration figcaption{font-size:.85em;color:#666;margin-top:.3em}
ruby rt{font-size:.55em}`;function rt(e,r,t,n,{title:o="\u6587\u7A3F",styles:l={},images:a=new Map,tables:m=new Map}={}){let{html:u,chapters:i,missing:c}=F(e,r,t,n,{imageUrl:p=>a.get(p)||null,tables:m});return{text:`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${f(o)}</title>
<style>
body{max-width:42em;margin:0 auto;padding:2em 1.25em;font:18px/1.9 "Songti SC","Noto Serif CJK SC","Source Han Serif SC",serif;color:#222;background:#fff}
p{margin:0 0 .5em;white-space:pre-wrap}
h2{font-size:1.4em;margin:2em 0 1em;white-space:pre-wrap}
section:first-child h2{margin-top:0}
.center{text-align:center}.right{text-align:right}
em.emphasis{font-style:normal;text-emphasis:filled dot;text-emphasis-position:under right;-webkit-text-emphasis:filled dot;-webkit-text-emphasis-position:under right}
${X}
${v}
${E(l)}
@media (prefers-color-scheme:dark){body{color:#ddd;background:#1b1b1b}}
</style>
</head>
<body>
${u}
</body>
</html>
`,html:u,chapters:i,missing:c}}export{G as a,J as b,K as c,A as d,N as e,et as f,I as g,V as h,X as i,rt as j};
