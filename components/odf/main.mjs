import {renderVelaOdt} from './view.mjs';
import {odfToFlat,parseOdf,odfPlainText,odfToHtml} from './engine.mjs';
const id='vela.component.odf';
acode.setPluginInit(id,(base)=>{
 const vela=acode.require('vela'),link=document.createElement('link');link.rel='stylesheet';link.href=base+'style.css';document.head.append(link);vela.dispose(()=>link.remove());
 vela.registerDocumentFormat({id:'odf',extensions:['.odt','.ott','.ods','.ots','.odp','.otp','.odg','.otg','.velaodt','.vodt','.fodt','.fods','.fodp','.fodg'],
  importBytes(bytes,name){const text=odfToFlat(bytes);return {name:name.replace(/\.[^.]+$/,'.vodt'),text};},
  validate:parseOdf,plainText:source=>odfPlainText(parseOdf(source)),toHtml:source=>odfToHtml(parseOdf(source)),render:renderVelaOdt
 });
});
acode.setPluginUnmount(id,()=>{});
