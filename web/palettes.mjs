const colors=(bg,panel,paper,text,muted,line,accent,soft,selection)=>({bg,panel,paper,text,muted,line,accent,soft,selection});
export const palettes=[
  {id:'pine',name:'青松',light:colors('#eef3ef','#f4f8f5','#fcfefc','#28372f','#66776c','#d9e5dc','#23744e','#e3f0e7','#70b58b66'),dark:colors('#161e1a','#1c2821','#202e25','#d5e5db','#96ac9e','#35483c','#8ad0a8','#2e4838','#70b58b66')},
  {id:'jade',name:'玉石',light:colors('#edf4f1','#f3f9f6','#fdfffe','#273a35','#637971','#d7e7e0','#176e5e','#e0f0e9','#60bda366'),dark:colors('#15201c','#1b2c25','#20332a','#d3e8df','#92ada1','#344d40','#81d3b6','#2b4a3d','#60bda366')},
  {id:'bamboo',name:'墨竹',light:colors('#f0f3e9','#f7f9f1','#fefff9','#333d2c','#6d7861','#e0e6d5','#4e6c36','#eaf0df','#91ae6866'),dark:colors('#1c2117','#252e1e','#2b3524','#e0e8d6','#a0ae92','#47543a','#b3cf8e','#3d4d2e','#91ae6866')},
  {id:'wheat',name:'麦田',light:colors('#f4f0e8','#faf7ef','#fffdf8','#3c362c','#7b7160','#e8e0d1','#886218','#f2e9d3','#ceb06c66'),dark:colors('#231e17','#2e271d','#352d21','#eae2d2','#b9a98c','#554936','#e5c27d','#4d3e25','#ceb06c66')},
  {id:'graphite',name:'石墨',light:colors('#eef1f2','#f5f7f8','#ffffff','#2d373e','#697780','#dce3e7','#52636d','#e6ecef','#90a5b266'),dark:colors('#1b2023','#232b30','#29333a','#dce3e7','#a0afb9','#46535d','#b0c4d1','#3b4a55','#90a5b266')}
];
export function paletteFor(id,dark){const palette=palettes.find(item=>item.id===id)||palettes[0];return {id:palette.id,colors:dark?palette.dark:palette.light};}
export function applyPalette(element,id,dark){const selected=paletteFor(id,dark);for(const [name,color] of Object.entries(selected.colors))element.style.setProperty('--'+name,color);return selected.id;}
