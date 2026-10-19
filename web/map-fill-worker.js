import {updateDrawingFill} from './map-fill.mjs';
import {mapText} from './map.mjs';
self.onmessage=event=>{
 try{const {value,settings}=event.data;updateDrawingFill(value,settings);mapText(value);self.postMessage({generated:value.generated.filter(layer=>layer.id==='g-drawing-fill')});}
 catch(error){self.postMessage({error:error.message});}
};
