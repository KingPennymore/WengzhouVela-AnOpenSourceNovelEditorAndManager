import {strToU8,strFromU8} from 'fflate';
export const MAX_IMAGE_BYTES=2*1024*1024;
export function imageMime(bytes){
 if(bytes.length>=8&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)return 'image/png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(/^GIF8[79]a$/.test(strFromU8(bytes.subarray(0,6))))return 'image/gif';
 if(strFromU8(bytes.subarray(0,4))==='RIFF'&&strFromU8(bytes.subarray(8,12))==='WEBP')return 'image/webp';
 throw Error('只支持 PNG、JPEG、GIF、WebP 图片；SVG 和其他格式请先转换。');
}
export function bytesToBase64(bytes){let raw='';for(let i=0;i<bytes.length;i+=16384)raw+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(raw);}
export function imageData(data){const match=/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(data||'');if(!match)throw Error('图片需要嵌入本地数据，不能使用外部 URL。');if(match[2].length>Math.ceil(MAX_IMAGE_BYTES*4/3)+16)throw Error('单张图片不得超过 2 MB。');const bytes=Uint8Array.from(atob(match[2].replace(/\s/g,'')),c=>c.charCodeAt(0)),mime=imageMime(bytes);if(mime!==match[1])throw Error('图片内容与类型不一致。');return {mime,bytes,base64:bytesToBase64(bytes)};}
export async function loadImage(file){
 if(file.size>MAX_IMAGE_BYTES)throw Error('单张图片不得超过 2 MB，请先压缩。');const bytes=new Uint8Array(await file.arrayBuffer()),mime=imageMime(bytes),data='data:'+mime+';base64,'+bytesToBase64(bytes);
 const img=new Image();img.src=data;await img.decode();if(img.naturalWidth*img.naturalHeight>24*1024*1024)throw Error('图片像素过大，请先缩小。');
 // WebP is converted to PNG for office interoperability. Large static pictures
 // are resized to at most 1600 px without shipping a separate imaging engine.
 if(mime==='image/webp'||mime!=='image/gif'&&Math.max(img.naturalWidth,img.naturalHeight)>1600){const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const value=canvas.toDataURL(mime==='image/jpeg'?'image/jpeg':'image/png',.86);imageData(value);return {src:value,width:canvas.width,height:canvas.height};}
 return {src:data,width:img.naturalWidth,height:img.naturalHeight};
}
