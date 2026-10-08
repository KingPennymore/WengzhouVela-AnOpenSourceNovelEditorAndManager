import {NounIndex} from './noun-index.mjs';
const index=new NounIndex();
self.onmessage=({data})=>{try{for(const id of data.remove||[])index.remove(id);for(const block of data.blocks||[])index.put(block.id,block.text,block.start,block.end);self.postMessage({revision:data.revision,options:index.candidates()});}catch{self.postMessage({revision:data.revision,options:[],failed:true});}};
