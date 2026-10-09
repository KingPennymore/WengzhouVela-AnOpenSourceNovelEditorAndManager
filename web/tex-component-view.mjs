import {native,transport} from './platform.mjs';
import {fromBase64} from './plugin-package.mjs';
import {t} from './i18n.mjs';

export function mountTexComponents(root,compiler,fail){
  const controls=document.createElement('div');controls.className='tex-component-controls';controls.hidden=true;
  const button=document.createElement('button');button.type='button';button.className='secondary tex-component-import';button.textContent=t('导入离线排版组件');
  const input=document.createElement('input');input.type='file';input.accept='.zip';input.multiple=true;input.hidden=true;input.className='tex-component-input';
  const note=document.createElement('span');note.className='tex-component-note';note.setAttribute('role','status');controls.append(button,input,note);root.querySelector('.tex-tools').after(controls);
  const refresh=async()=>{const status=await compiler.assets.status();if(!controls.isConnected)return;controls.hidden=status.builtin;note.textContent=status.ready?t('离线排版组件已就绪'):t('分别导入引擎包和中文包')+` · ${t('引擎')} ${status.engine?'✓':'—'} · ${t('中文')} ${status.chinese?'✓':'—'}`;};
  const install=async files=>{button.disabled=true;try{if(compiler.pending)throw Error(t('请等待当前编译结束。'));await compiler.dispose();for(const file of files){if(file.size>64*1024*1024)throw Error(t('单个排版组件不能超过 64 MB。'));note.textContent=t('正在校验并保存组件…');await compiler.assets.install(new Uint8Array(await file.arrayBuffer()));}await refresh();}catch(error){note.textContent=error.message;fail(error);}finally{button.disabled=false;input.value='';}};
  button.onclick=async()=>{if(!native){input.click();return;}button.disabled=true;try{const result=await transport('importPlugin',{purpose:'tex-component'});if(result){const bytes=fromBase64(result.data);await install([{size:bytes.length,arrayBuffer:async()=>bytes.buffer}]);}}catch(error){note.textContent=error.message;fail(error);}finally{button.disabled=false;}};
  input.onchange=()=>install([...input.files]);refresh().catch(fail);
}
