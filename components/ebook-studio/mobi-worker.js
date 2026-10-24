self.onmessage=async({data})=>{
 try{
  const module=await WebAssembly.compile(data.wasm);
  if(WebAssembly.Module.imports(module).length)throw Error('MOBI 引擎含不支持的外部依赖。');
  const {exports:api}=await WebAssembly.instantiate(module,{}),input=new TextEncoder().encode(JSON.stringify(data.book));
  const pointer=api.studio_alloc(input.length);new Uint8Array(api.memory.buffer,pointer,input.length).set(input);
  let result;
  try{result=api.studio_convert(pointer,input.length);}finally{api.studio_free(pointer,input.length);}
  const outPointer=Number(result&0xffffffffn),length=Number(result>>32n);
  if(!length||length>32*1024*1024+1)throw Error('MOBI 输出超过 32 MB 或数据无效。');
  let bytes;try{bytes=new Uint8Array(api.memory.buffer,outPointer,length).slice();}finally{api.studio_free(outPointer,length);}
  if(bytes[0]!==1)throw Error(new TextDecoder().decode(bytes.subarray(1)));
  const output=bytes.slice(1);self.postMessage({bytes:output},[output.buffer]);
 }catch(error){self.postMessage({error:'MOBI 导出失败：'+error.message});}
};
