import {keymap} from '@codemirror/view';
import {t,say} from './i18n.mjs';
import {escapeHtml as esc,MB} from './text-utils.mjs';
import {native,transport} from './platform.mjs';
import {readImportedArchive} from './imported-archive.mjs';
import {isTexComponentArchive} from './tex-component.mjs';
import {readPluginZip} from './plugin-package.mjs';
import {loadComponentDownloads,chunkFailure} from './lazy.mjs';

export function createPluginDialogs(context){
  const {$,openModal,closeModal,toast,chunkLoading,editorStates,pluginKeys,pluginExtras}=context;
  async function showPlugins(){
    if(!context.plugins)return;await context.plugins.ready;
    openModal(t('插件与组件'),`<p><button type="button" class="primary" id="install-plugin">${t('从 ZIP 安装')}</button></p>
      <section class="component-downloads" id="component-downloads"></section>
      <h3>${t('已安装')}</h3>
      <small>${t('可安装 LaTeX 引擎、中文支持、电子书阅读与 JavaScript / CodeMirror 插件。内置组件可停用，轻量版导入的组件可卸载。依赖 Android、Cordova、Ace 或未实现的 Acode 模块的插件会显示加载原因。')}</small><div class="plugin-list">${context.plugins.records.map((record,i)=>`<article class="plugin-card"><strong>${esc(record.manifest.id.startsWith('vela.component.tex')?t(record.manifest.name):record.manifest.name)}</strong><small>${esc(record.manifest.id)} · ${esc(record.manifest.version)} · ${record.builtin?t('内置组件'):record.manifest.vela?.type==='tex-component'||['reader-component','document-component'].includes(record.manifest.vela?.type)?t('可选组件'):t('插件')} · ${record.enabled?t('已启用'):t('已停用')}</small>${record.error?`<p class="error">${esc(t(record.error))}</p>`:''}<div class="button-row"><button type="button" class="secondary" data-plugin-enable="${i}">${record.enabled?t('停用'):t('启用')}</button>${record.manifest.vela?.type==='reader-component'?`<button type="button" class="secondary" data-plugin-open="${i}" ${record.enabled?'':'disabled'}>${t('打开阅读器')}</button>`:''}${context.plugins.settingsPages.has(record.manifest.id)?`<button type="button" class="secondary" data-plugin-settings="${i}">${t('插件设置')}</button>`:''}${record.builtin?'':`<button type="button" class="danger" data-plugin-remove="${i}">${t('卸载')}</button>`}</div>
      </article>`).join('')||`<p class="blank">${t('尚未安装插件。')}</p>`}</div>`,null,{noSubmit:true});
    const pluginSession=$('#dialog-body').viewSession;
    chunkLoading($('#component-downloads'));
    loadComponentDownloads().then(({mountComponentDownloads})=>{
      if(!pluginSession.alive())return;
      const downloadView=mountComponentDownloads($('#component-downloads'),{transport,native,platform:context.environment?.platform||'',appVersion:context.environment?.version||context.appVersion,descriptor:()=>context.texCompiler.assets.descriptor(),installed:async()=>new Map(context.plugins.records.map(record=>[record.manifest.id,{version:record.manifest.version,enabled:record.enabled}])),install:async bytes=>{
        await installPluginBytes(bytes,{reopen:false});
        if(pluginSession.alive())await showPlugins();
      }});pluginSession.onDispose(()=>downloadView.dispose());
    }).catch(error=>{if(pluginSession.alive())chunkFailure($('#component-downloads'),error,showPlugins);});
    $('#install-plugin').onclick=async e=>{
      if(native){
        const button=e.currentTarget;
        button.disabled=true;
        try{
          const result=await transport('importPlugin');
          if(result)await installPluginBytes(await readImportedArchive(result,token=>transport('releaseImport',{token})));
        }catch(e){
          $('#dialog-error').textContent=t(e.message);
        }finally{
          button.disabled=false;
        }
      }else $('#plugin-input').click();
    };
    $('.plugin-list').onclick=async e=>{try{
      const action=e.target.closest('button');if(action)action.disabled=true;
      const enable=e.target.closest('[data-plugin-enable]'),remove=e.target.closest('[data-plugin-remove]'),settings=e.target.closest('[data-plugin-settings]');
      const open=e.target.closest('[data-plugin-open]');if(open){
          const record=context.plugins.records[Number(open.dataset.pluginOpen)];
          closeModal();
          if(context.plugins.commands.has(record.manifest.id+'.open'))await context.plugins.execute(record.manifest.id+'.open');
        }
      if(enable){const record=context.plugins.records[Number(enable.dataset.pluginEnable)];await context.plugins.enable(record,!record.enabled);showPlugins();}
      if(remove){await context.plugins.remove(context.plugins.records[Number(remove.dataset.pluginRemove)]);showPlugins();}
      if(settings)showPluginSettings(context.plugins.records[Number(settings.dataset.pluginSettings)]);
    }catch(error){$('#dialog-error').textContent=t(error.message);}finally{if(e.target.closest('button'))e.target.closest('button').disabled=false;}};
  }
  function showPluginSettings(record){
    const config=context.plugins.settingsPages.get(record.manifest.id);if(!config)return;
    const items=config.list||[];
    openModal(say(`${record.manifest.name} · 设置`,`${record.manifest.name} · Settings`),items.map((item,i)=>`<label>${esc(item.text||item.key||t('设置'))}<input name="${i}" ${item.checkbox?'type="checkbox" '+(item.value?'checked':''):`value="${esc(item.value??'')}"`}></label>`).join(''),async f=>{
      for(let i=0;i<items.length;i++)await config.cb?.(items[i].key,items[i].checkbox?f.has(String(i)):f.get(String(i)));
      context.plugins.save();
    });
  }
  async function installPluginBytes(bytes,{reopen=true}={}){
    if(isTexComponentArchive(bytes)){await context.plugins.installComponent(bytes);if(reopen)await showPlugins();toast(t('离线排版组件已安装。'));return;}
    const record=await context.plugins.install(readPluginZip(bytes));
    if(reopen)await showPlugins();
    if(record.error)$('#dialog-error').textContent=record.error;else toast(say(`插件已安装：${record.manifest.name}`,`Plugin installed: ${record.manifest.name}`));
  }
  $('#plugin-input').onchange=async e=>{
    const button=$('#install-plugin');
    if(button)button.disabled=true;
    try{
      const file=e.target.files[0];
      if(!file)return;
      if(file.size>96*MB)throw new Error(t('安装包 ZIP 不能超过 96 MB。'));
      await installPluginBytes(new Uint8Array(await file.arrayBuffer()));
    }catch(error){
      $('#dialog-error').textContent=t(error.message);
    }finally{
      e.target.value='';
      if(button)button.disabled=false;
    }
  };
  function refreshPluginCommands(){
    for(const [id,state] of editorStates)editorStates.set(id,state.update({effects:[pluginKeys.reconfigure(keymap.of(context.plugins?.bindings()||[])),pluginExtras.reconfigure(context.plugins?.extensions()||[])]}).state);
    if(context.view&&pluginKeys.get(context.view.state)!==undefined)context.view.dispatch({effects:[pluginKeys.reconfigure(keymap.of(context.plugins?.bindings()||[])),pluginExtras.reconfigure(context.plugins?.extensions()||[])]});
  }
  function pluginDialog(title,message,kind,value=''){
    return new Promise(resolve=>openModal(title,kind==='prompt'?`<label>${esc(title)}<input name="value" value="${esc(value)}"></label>`:`<p>${esc(message)}</p>`,f=>{
      resolve(kind==='prompt'?f.get('value'):true);
    },{cancel:()=>resolve(kind==='prompt'?null:false)}));
  }
  return {showPlugins,refreshPluginCommands,pluginDialog};
}
