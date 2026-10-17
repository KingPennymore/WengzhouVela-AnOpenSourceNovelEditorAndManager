import {simplifyDrawingPoints} from './map-simplify.mjs';
self.onmessage=event=>{try{const {value,settings}=event.data,result=simplifyDrawingPoints(value,settings,progress=>self.postMessage({progress}));self.postMessage({result});}catch(error){self.postMessage({error:error.message});}};
