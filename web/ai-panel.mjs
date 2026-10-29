// The floating AI button over the editor and its panel (docs/AI-ASSIST.md). Loaded only once AI is enabled.
import {t,say} from './i18n.mjs';
import {escapeHtml as esc} from './text-utils.mjs';
import {icon} from './icons.mjs';
import {preset} from './ai-providers.mjs';
import {aiSettings,aiStatus,aiReady} from './ai-client.mjs';

/**
 * `app` gives workspace, current(), documentKind, home, isPreview and pageName through accessors, plus
 * openSettings() for the AI settings dialog.
 */
export function createAiAssistant(app){
  let status=null,statusRequest=null,panel=null;
  // Escape works wherever focus is while the panel is open (re-rendering replaces the focused button).
  const escape=event=>{if(event.key==='Escape'&&panel){event.stopPropagation();close();button.focus();}};
  const button=document.createElement('button');
  button.type='button';button.id='ai-button';button.className='ai-button';button.hidden=true;
  button.innerHTML=icon('sparkle')||'AI';
  button.title=t('AI 助手');button.setAttribute('aria-label',t('AI 助手'));button.setAttribute('aria-expanded','false');
  document.querySelector('#editor').append(button);
  button.onclick=()=>panel?close():open();

  const refreshStatus=()=>statusRequest??=aiStatus().then(value=>{status=value;},()=>{status=null;}).finally(()=>{statusRequest=null;update();});
  function visible(){
    const settings=app.workspace?.settings.ai,doc=app.current();
    return !!settings?.enabled&&app.pageName==='write'&&!app.home&&!app.isPreview&&!!doc&&['TXT','MD'].includes(app.documentKind(doc));
  }
  function update(){
    button.hidden=!visible();
    if(button.hidden&&panel)close();
    if(!button.hidden&&!status&&!statusRequest)refreshStatus();
    if(panel)renderPanel();
  }
  function open(){
    panel=document.createElement('aside');
    panel.className='ai-panel';panel.id='ai-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-label',t('AI 助手'));
    document.body.append(panel);
    button.setAttribute('aria-expanded','true');
    document.addEventListener('keydown',escape,true);
    renderPanel();
    panel.querySelector('button')?.focus();
    refreshStatus();
  }
  function close(){
    panel?.remove();panel=null;
    document.removeEventListener('keydown',escape,true);
    button.setAttribute('aria-expanded','false');
  }
  function renderPanel(){
    const focused=panel.contains(document.activeElement);
    const settings=aiSettings(app.workspace),ready=aiReady(settings,status),model=settings.models.extract;
    // A custom service is named by its host, so the panel always says where the text goes.
    let service=t(preset(settings.provider).name);
    if(settings.provider==='custom')try{service=new URL(settings.endpoint).host;}catch{}
    panel.innerHTML=`<header class="ai-panel-header"><h2>${t('AI 助手')}</h2><button type="button" class="icon-button" data-ai-close aria-label="${t('关闭')}">${icon('close')||'×'}</button></header>
      <p class="ai-destination">${ready
        ?say(`内容将发送给 ${esc(service)} · ${esc(model)}`,`Content is sent to ${esc(service)} · ${esc(model)}`)
        :status?t('还没有为当前服务保存 API Key。'):t('正在读取 AI 设置…')}</p>
      ${ready?'':`<p><button type="button" class="primary" data-ai-settings>${t('打开 AI 设置')}</button></p>`}
      <section class="ai-section"><h3>${t('整理辅助文件')}</h3><p>${t('把选定章节整理成术语库、大纲与关系或地图草稿，预览确认后再写入。')}</p><p class="ai-soon">${t('即将推出')}</p></section>
      <section class="ai-section"><h3>${t('续写建议')}</h3><p>${t('在光标后以淡色显示续写建议，按 Tab 或点按接受，不影响正常输入。')}</p><p class="ai-soon">${t('即将推出')}</p></section>
      ${ready?`<p><button type="button" class="secondary" data-ai-settings>${t('AI 设置…')}</button></p>`:''}`;
    panel.querySelector('[data-ai-close]').onclick=()=>{close();button.focus();};
    panel.querySelectorAll('[data-ai-settings]').forEach(item=>item.onclick=()=>{close();app.openSettings();});
    if(focused)panel.querySelector('[data-ai-close]').focus();
  }
  return {update,refreshStatus:()=>{status=null;return refreshStatus();},close};
}
