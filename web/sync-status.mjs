import {t} from './i18n.mjs';
export class SyncActivity {
  constructor(changed){this.items=new Map();this.changed=changed;}
  async run(key,action){if(this.items.get(key)?.state==='busy')throw Error(t('此文件正在同步，请稍后重试。'));this.items.set(key,{state:'busy'});this.changed();try{const value=await action();this.items.set(key,{state:'success'});this.changed();return value;}catch(error){this.items.set(key,{state:'failed',message:error.message});this.changed();throw error;}}
  label(key,modified=false){const item=this.items.get(key);return item?.state==='busy'?t('正在同步…'):item?.state==='failed'?t('同步失败')+' · '+item.message:modified?t('本地已修改 · 待同步'):t('已与远端同步');}
}
