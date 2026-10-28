import{a as $,b as H,c as nt,d as J,e as W,g as K,h as Q,i as tt}from"./chunk-6UXOVVFA.js";import{I as V,J as X,K as q,e as I,h as G,i as R,r as Z}from"./chunk-WBSHM7L3.js";import"./chunk-WRURWG4Q.js";import{a as F,b as D}from"./chunk-EAJZBBOR.js";import"./chunk-JHMIH35Z.js";import"./chunk-JMPP5M5E.js";import"./chunk-HMEMVOPS.js";import"./chunk-WULLKQZ4.js";import{a as Y}from"./chunk-RJZ6KQTN.js";import{d as _}from"./chunk-TTC262CJ.js";_();var r={opf:"http://www.idpf.org/2007/opf",dc:"http://purl.org/dc/elements/1.1/",xhtml:"http://www.w3.org/1999/xhtml",epub:"http://www.idpf.org/2007/ops",ncx:"http://www.daisy.org/z3986/2005/ncx/",container:"urn:oasis:names:tc:opendocument:xmlns:container"},b=n=>Error("\u65E0\u6CD5\u5BFC\u51FA EPUB\uFF1A"+n),u=n=>String(n).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,""),i=n=>u(n).replace(/[&<>"]/g,f=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[f]),ot=n=>n.toISOString().replace(/\.\d{3}Z$/,"Z"),L=n=>String(n).padStart(3,"0");function lt({title:n,lines:f,text:m,entries:w,aligned:E,styled:S,images:c,figure:l,tableEntries:P,tableFigure:T,language:y,id:O}){let p=f.flatMap(o=>{let d=[];if(o.text.trim()){let h=Q(o,E,S),v=u(K(m,o,w));d.push(o.heading?`<h1${h}>${v.trim()}</h1>`:`<p${h}>${v}</p>`)}for(let h of c.get(o.end)||[])d.push(...l(h));for(let h of P.get(o.end)||[])d.push(T(h));return d}).join(`
`);return`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${r.xhtml}" xmlns:epub="${r.epub}" lang="${i(y)}" xml:lang="${i(y)}">
<head>
<meta charset="utf-8"/>
<title>${i(n)}</title>
<link rel="stylesheet" type="text/css" href="../styles/book.css"/>
</head>
<body>
<section epub:type="chapter" id="${O}">
${p}
</section>
</body>
</html>
`}var st=`body{margin:0 4%;line-height:1.8;text-align:justify}
p{margin:0 0 .45em}
h1{font-size:1.4em;font-weight:bold;text-align:center;margin:1.6em 0 1.2em;line-height:1.5}
.center{text-align:center}
.right{text-align:right}
strong{font-weight:bold}
em.emphasis{font-style:normal;text-emphasis:filled dot;text-emphasis-position:under right;-webkit-text-emphasis:filled dot;-webkit-text-emphasis-position:under right;-epub-text-emphasis:filled dot;-epub-text-emphasis-position:under right}
.cover{margin:0;padding:0;text-align:center}
.cover img{max-width:100%;max-height:100%}
`+tt+`
`+R+`
`;function ft({text:n,sections:f,entries:m=[],from:w=0,to:E=f.length-1,includeTitle:S=!0,metadata:c={},cover:l=null,styles:P={},images:T=new Map,tables:y=new Map,clock:O=()=>new Date}){let p=u(c.title||"").trim(),o=c.language||"zh-CN",d=c.identifier||"urn:uuid:"+crypto.randomUUID();if(!p||p.length>1e3)throw b("\u8BF7\u586B\u5199\u4E66\u540D\uFF08\u6700\u591A 1000 \u5B57\uFF09\u3002");if(!/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(o))throw b("\u8BED\u8A00\u4EE3\u7801\u65E0\u6548\uFF0C\u4F8B\u5982 zh-CN\u3002");if(l){if(!$[l.type])throw b("\u5C01\u9762\u987B\u4E3A JPEG\u3001PNG\u3001GIF \u6216 WebP \u56FE\u7247\u3002");if(!(l.bytes instanceof Uint8Array)||!l.bytes.length||l.bytes.length>H)throw b("\u5C01\u9762\u56FE\u7247\u4E0D\u80FD\u8D85\u8FC7 5 MB\u3002")}let h=V(m),v=X(m),M=q(n,m),z=I(n,m),s=[],x=new Map,k=[],et=t=>{let e=T.get(t.src);if(!e||!$[e.type]||!(e.bytes instanceof Uint8Array))return k.push(t.src),[];x.has(t.src)||x.set(t.src,{...e,file:"images/illustration-"+L(x.size+1)+"."+$[e.type]});let g=Y(u(t.alt||""));return[`<figure class="illustration"><img src="../${x.get(t.src).file}" alt="${g}"/>${g?`<figcaption>${g}</figcaption>`:""}</figure>`]},it=t=>{let e=y.get(t.src);return(!e||e.error)&&k.push(t.src),'<div class="csv-table">'+u(G(e,t))+"</div>"};for(let t=w;t<=E;t++){let[e]=J(n,f,W(n,m,{from:t,to:t,includeTitle:S}));if(!e?.some(C=>C.text.trim()||z.has(C.end)||M.has(C.end)))continue;let g="chapter-"+L(s.length+1),N=f[t].title.trim()||"\u7B2C "+(s.length+1)+" \u90E8\u5206";s.push({id:g,file:"text/"+g+".xhtml",title:N,xhtml:lt({title:N,lines:e,text:n,entries:m,aligned:h,styled:v,images:M,figure:et,tableEntries:z,tableFigure:it,language:o,id:g})})}if(!s.length)throw b("\u6240\u9009\u7AE0\u8282\u6CA1\u6709\u6B63\u6587\u3002");let B=new Map,a=(t,e)=>B.set(t,e);a("mimetype","application/epub+zip"),a("META-INF/container.xml",`<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="${r.container}" version="1.0">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`);let U=l?"images/cover."+$[l.type]:null;l&&(a("OEBPS/"+U,l.bytes),a("OEBPS/text/cover.xhtml",`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${r.xhtml}" xmlns:epub="${r.epub}" lang="${i(o)}" xml:lang="${i(o)}">
<head><meta charset="utf-8"/><title>${i(p)}</title><link rel="stylesheet" type="text/css" href="../styles/book.css"/></head>
<body class="cover"><section epub:type="cover" class="cover"><img src="../${U}" alt="${i(p)}"/></section></body>
</html>
`));for(let t of s)a("OEBPS/"+t.file,t.xhtml);for(let t of x.values())a("OEBPS/"+t.file,t.bytes);a("OEBPS/styles/book.css",st+Z(P)+`
`),a("OEBPS/nav.xhtml",`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${r.xhtml}" xmlns:epub="${r.epub}" lang="${i(o)}" xml:lang="${i(o)}">
<head><meta charset="utf-8"/><title>\u76EE\u5F55</title><link rel="stylesheet" type="text/css" href="styles/book.css"/></head>
<body>
<nav epub:type="toc" id="toc"><h1>\u76EE\u5F55</h1>
<ol>
${s.map(t=>`<li><a href="${t.file}">${i(t.title)}</a></li>`).join(`
`)}
</ol>
</nav>
</body>
</html>
`),a("OEBPS/toc.ncx",`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="${r.ncx}" version="2005-1" xml:lang="${i(o)}">
<head><meta name="dtb:uid" content="${i(d)}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${i(p)}</text></docTitle>
<navMap>
${s.map((t,e)=>`<navPoint id="nav-${t.id}" playOrder="${e+1}"><navLabel><text>${i(t.title)}</text></navLabel><content src="${t.file}"/></navPoint>`).join(`
`)}
</navMap>
</ncx>
`);let j=[["creator",c.author],["description",c.description],["publisher",c.publisher]].filter(([,t])=>u(t||"").trim()).map(([t,e])=>`<dc:${t}>${i(e.trim())}</dc:${t}>`).join(`
`);a("OEBPS/content.opf",`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="${r.opf}" version="3.0" unique-identifier="book-id" xml:lang="${i(o)}">
<metadata xmlns:dc="${r.dc}">
<dc:identifier id="book-id">${i(d)}</dc:identifier>
<dc:title>${i(p)}</dc:title>
<dc:language>${i(o)}</dc:language>
${j?j+`
`:""}<meta property="dcterms:modified">${ot(O())}</meta>
${l?`<meta name="cover" content="cover-image"/>
`:""}</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="style" href="styles/book.css" media-type="text/css"/>
${l?`<item id="cover-image" href="${U}" media-type="${l.type}" properties="cover-image"/>
<item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>
`:""}${[...x.values()].map((t,e)=>`<item id="illustration-${L(e+1)}" href="${t.file}" media-type="${t.type}"/>
`).join("")}${s.map(t=>`<item id="${t.id}" href="${t.file}" media-type="application/xhtml+xml"/>`).join(`
`)}
</manifest>
<spine toc="ncx">
${l?`<itemref idref="cover" linear="yes"/>
`:""}${s.map(t=>`<itemref idref="${t.id}"/>`).join(`
`)}
</spine>
</package>
`);let A={};for(let[t,e]of B)A[t]=t==="mimetype"?[F(e),{level:0}]:typeof e=="string"?F(e):e;return{bytes:D(A,{level:6}),files:B,chapters:s.length,identifier:d,missing:[...new Set(k)]}}export{$ as COVER_TYPES,H as MAX_COVER_BYTES,ft as buildEpub,nt as epubFileName};
