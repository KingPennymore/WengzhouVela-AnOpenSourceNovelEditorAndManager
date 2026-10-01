export function decodeFileText(bytes){
  const encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';
  let text;
  try{text=new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch(error){if(encoding!=='utf-8')throw error;text=new TextDecoder('gb18030',{fatal:true}).decode(bytes);}
  if(/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text))throw new Error('此文件包含二进制内容，不能作为文本打开。');
  return text.replace(/^\uFEFF/,'');
}
