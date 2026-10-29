// The floating AI button over the editor and its panel (docs/AI-ASSIST.md). Loaded only once AI is enabled. The panel
// is an ordinary app dialog (bottom sheet on phones), so it behaves like every other dialog.
import {t,say} from './i18n.mjs';
import {escapeHtml as esc} from './text-utils.mjs';
import {icon} from './icons.mjs';
import {preset} from './ai-providers.mjs';
import {aiSettings,aiStatus,aiReady} from './ai-client.mjs';

/**
 * `app` gives workspace, current(), documentKind, home, isPreview and pageName through accessors, plus openModal and
 * openSettings() (Settings at the AI section).
 */
export function createAiAssistant(app){
  let status=null,statusRequest=null,panel=null;
  const button=document.createElement('button');
  button.type='button';button.id='ai-button';button.className='ai-button';button.hidden=true;
  button.innerHTML=icon('sparkle');
  button.title=t('AI 助手');button.setAttribute('aria-label',t('AI 助手'));button.setAttribute('aria-haspopup','dialog');
  document.querySelector('#editor').append(button);
  button.onclick=open;

  const refreshStatus=()=>statusRequest??=aiStatus().then(value=>{status=value;},()=>{status=null;}).finally(()=>{statusRequest=null;update();});
  function visible(){
    const settings=app.workspace?.settings.ai,doc=app.current();
    return !!settings?.enabled&&app.pageName==='write'&&!app.home&&!app.isPreview&&!!doc&&['TXT','MD'].includes(app.documentKind(doc));
  }
  function update(){
    button.hidden=!visible();
    if(!button.hidden&&!status&&!statusRequest)refreshStatus();
    if(panel?.alive())render();
  }
  function open(){
    panel=app.openModal(t('AI 助手'),'<div class="ai-panel"></div>',null,{noSubmit:true});
    panel.onDispose(()=>{panel=null;});
    render();
    refreshStatus();
  }
  function render(){
    const root=panel.root.querySelector('.ai-panel');if(!root)return;
    const settings=aiSettings(app.workspace),ready=aiReady(settings,status),model=settings.models.extract;
    // A custom service is named by its host, so the panel always says where the text goes.
    let service=t(preset(settings.provider).name);
    if(settings.provider==='custom')try{service=new URL(settings.endpoint).host;}catch{}
    root.innerHTML=`<p class="ai-destination">${ready
        ?say(`内容将发送给 ${esc(service)} · ${esc(model)}`,`Content is sent to ${esc(service)} · ${esc(model)}`)
        :status?t('还没有为当前服务保存 API Key。'):t('正在读取 AI 设置…')}</p>
      <section class="ai-section"><h3>${t('整理辅助文件')}</h3><p>${t('把选定章节整理成术语库、大纲与关系或地图草稿，预览确认后再写入。')}</p><small>${t('即将推出')}</small></section>
      <section class="ai-section"><h3>${t('续写建议')}</h3><p>${t('在光标后以淡色显示续写建议，按 Tab 或点按接受，不影响正常输入。')}</p><small>${t('即将推出')}</small></section>
      <p class="button-row"><button type="button" class="${ready?'secondary':'primary'}" data-ai-settings>${t(ready?'AI 设置…':'打开 AI 设置')}</button></p>`;
    root.querySelector('[data-ai-settings]').onclick=()=>app.openSettings();
  }
  return {update,refreshStatus:()=>{status=null;return refreshStatus();}};
}
