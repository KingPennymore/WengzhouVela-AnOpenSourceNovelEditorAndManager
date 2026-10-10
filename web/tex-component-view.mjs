import {t} from './i18n.mjs';
// All installs and lifecycle changes go through the same plugin manager.
export function mountTexComponents(root,compiler,fail){
  const controls=document.createElement('div');controls.className='tex-component-controls';
  const button=document.createElement('button');button.type='button';button.className='secondary tex-component-import';button.textContent=t('管理排版组件');
  const note=document.createElement('span');note.className='tex-component-note';note.setAttribute('role','status');controls.append(button,note);root.querySelector('.tex-tools').after(controls);
  button.onclick=()=>compiler.host.manageComponents();
  compiler.assets.status().then(status=>{if(controls.isConnected)note.textContent=status.ready?t('离线排版组件已就绪'):t('请在插件与组件列表中安装并启用排版组件');}).catch(fail);
}
