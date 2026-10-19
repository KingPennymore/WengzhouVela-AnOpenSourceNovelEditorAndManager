import {convertDrawingTerrain} from './map-terrain.mjs';
import {simplifyDrawingPoints} from './map-simplify.mjs';
self.onmessage=event=>{try{const {value,settings,kind,id}=event.data,result=kind==='terrain'?convertDrawingTerrain(value,settings,id):simplifyDrawingPoints(value,settings,progress=>self.postMessage({progress}));self.postMessage({result});}catch(error){self.postMessage({error:error.message});}};
