// Settings → AI assistant. Service credentials remain drafts until verification succeeds.
// Model and usage changes apply immediately; credentials never enter workspace persistence.
import {switchControl,segmented} from './ui-components.mjs';
import {t,say} from './i18n.mjs';
import {escapeHtml as esc} from './text-utils.mjs';
import {native} from './platform.mjs';
import {PRESETS,FORMATS,preset,normalizeEndpoint,isLocalEndpoint,MAX_ENDPOINT,MAX_KEY,buildRequest} from './ai-providers.mjs';
import {aiSettings,aiStatus,aiVerify,aiSave,aiClear,aiReady} from './ai-client.mjs';

const FORMAT_LABELS={openai:'OpenAI 兼容',anthropic:'Anthropic',gemini:'Gemini',azure:'Azure OpenAI'}; // i18n-data: labels go through t()
// HTML parsing replaces NUL in option values with U+FFFD, breaking manual entry.
const OTHER='\ufffdother';

export async function mountAiSettings(root,{workspace,toast,changed,session,draft=new Map()}){
  const settings=aiSettings(workspace);
  let status=await aiStatus().catch(()=>({saved:false})),models=[...(settings.models.available||[])];
  if(session&&!session.alive())return;
  const alive=()=>!session||session.alive();
  const listen=(node,type,handler)=>node.addEventListener(type,handler,session?{signal:session.signal}:{});
  const option=(value,label,selected)=>`<option value="${esc(value)}"${selected?' selected':''}>${esc(label)}</option>`;
  const $=selector=>root.querySelector(selector);
  root.innerHTML=`
    <div class="ui-card ai-status-card"><p data-ai-status></p>${switchControl('aiEnabled',settings.enabled,t('启用 AI 助手'))}</div>
    <p>${t('把选定章节整理成术语库、大纲与关系或地图，并在写作时给出续写建议。使用你自己的 AI 服务和 API Key。')}</p>
    <div class="ai-settings-body"><h4>${say('服务与密钥','Service and key')}</h4>
      <label>${t('服务')}<select name="aiProvider">${PRESETS.map(item=>option(item.id,t(item.name),item.id===settings.provider)).join('')}</select></label>
      <div data-ai-format>${segmented('aiFormat',FORMATS.map(value=>({value,label:t(FORMAT_LABELS[value])})),settings.format,{label:t('请求格式')})}</div>
      <label>${t('接口地址')}<input name="aiEndpoint" maxlength="${MAX_ENDPOINT}" inputmode="url" spellcheck="false" autocomplete="off" autocapitalize="off" value="${esc(settings.endpoint)}"></label>
      <label data-ai-version>${t('API 版本')}<input name="aiApiVersion" maxlength="32" spellcheck="false" autocomplete="off" autocapitalize="off" value="${esc(settings.apiVersion)}"></label>
      <label>API Key<input name="aiKey" type="password" maxlength="${MAX_KEY}" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="${t('粘贴 API Key')}"></label>
      <p class="ai-key-status" role="status"></p>
      <p class="button-row"><button type="button" class="secondary" data-ai-verify>${t('验证并保存')}</button><button type="button" class="secondary" data-ai-clear>${t('删除密钥')}</button></p>
      <small>${native?t('密钥保存在系统安全存储中，保存后无法再查看，只能删除或替换。'):t('浏览器预览版仅供测试：密钥只保存在当前页面，刷新后清除。')}</small>
      <h4>${say('模型','Models')}</h4><label>${t('整理文件使用的模型')}<select name="aiExtractModel"></select></label>
      <label data-ai-other="aiExtractModel">${t('模型名称')}<input name="aiExtractModelOther" maxlength="128" spellcheck="false" autocomplete="off" autocapitalize="off"></label>
      <label>${t('续写建议使用的模型')}<select name="aiSuggestModel"></select></label>
      <label data-ai-other="aiSuggestModel">${t('模型名称')}<input name="aiSuggestModelOther" maxlength="128" spellcheck="false" autocomplete="off" autocapitalize="off"></label>
      <label>${t('模型上下文上限（token）')}<input type="number" name="aiContextTokens" min="4096" max="1048576" value="${settings.contextTokens}"></label>
      <small>${t('按所选模型的较小上限填写，默认 8192；整理时为输出和指令预留空间。')}</small>
      <h4>${say('用量','Usage')}</h4><p data-ai-usage></p><label>${t('单次发送超过多少字时先确认')}<input type="number" name="aiConfirmChars" inputmode="numeric" min="0" max="10000000" step="1000" value="${settings.confirmChars}"></label>
      <label>${t('每日发送上限（字，0 为不限）')}<input type="number" name="aiDailyChars" inputmode="numeric" min="0" max="100000000" step="10000" value="${settings.dailyChars}"></label>
    </div>`;

  // Models: the list read while verifying the key, the current choice, and a manual entry for anything else.
  const fillModels=(name,value,{same=false}={})=>{
    const select=$(`[name=${name}]`),list=[...models];
    if(value&&!list.includes(value))list.unshift(value);
    select.innerHTML=(same?option('',t('与整理文件相同'),!value):list.length?'':option('',t('请先验证 API Key 读取模型'),!value))
      +list.map(id=>option(id,id,id===value)).join('')+option(OTHER,t('手动填写…'),false);
    $(`[data-ai-other=${name}]`).hidden=true;
  };
  const modelValue=(form,name)=>{const value=form.get(name);return String(value===OTHER?form.get(name+'Other'):value||'').trim();};
  fillModels('aiExtractModel',settings.models.extract);fillModels('aiSuggestModel',settings.models.suggest,{same:true});
  for(const name of ['aiExtractModel','aiSuggestModel'])listen($(`[name=${name}]`),'change',()=>{
    const other=$(`[data-ai-other=${name}]`);other.hidden=$(`[name=${name}]`).value!==OTHER;
    if(!other.hidden)other.querySelector('input').focus();
  });

  const current=()=>{const provider=$('[name=aiProvider]').value;return {provider,format:provider==='custom'?$('[name=aiFormat]:checked').value:preset(provider).format,endpoint:$('[name=aiEndpoint]').value.trim().replace(/\/+$/,'')};};
  const refresh=()=>{
    const enabled=$('[name=aiEnabled]').checked,{provider,format,endpoint}=current();
    $('.ai-settings-body').hidden=!enabled;
    $('[data-ai-status]').textContent=!enabled?say('未启用','Disabled'):aiReady(settings,status)&&settings.models.extract?say(`已连接 ${t(preset(settings.provider).name)} · ${settings.models.extract}`,`Connected ${t(preset(settings.provider).name)} · ${settings.models.extract}`):t('尚未保存密钥');
    $('[data-ai-format]').hidden=provider!=='custom';
    $('[data-ai-version]').hidden=format!=='azure';
    const bound=status.saved&&status.format===format&&status.endpoint===endpoint,tail=status.last4||t('（无）');
    $('.ai-key-status').textContent=bound?say(`密钥已保存 · 末尾 ${tail}`,`Key saved · ends in ${tail}`)
      :status.saved?say(`已保存的密钥属于 ${status.endpoint}，当前地址需要重新输入。`,`The saved key belongs to ${status.endpoint}; enter one for this address.`)
      :t('尚未保存密钥');
    $('[data-ai-clear]').hidden=!status.saved;
    const usage=$('[data-ai-usage]'),now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-'),chars=settings.usage.day===today?settings.usage.chars:0;
    usage.textContent=say(`今日已发送 ${chars.toLocaleString()} 字`,`Sent ${chars.toLocaleString()} characters today`);
  };
  const error=message=>{const node=root.querySelector('[data-ai-error]');if(node)node.textContent=message;};
  root.insertAdjacentHTML('afterbegin','<p data-ai-error role=alert></p>');
  listen($('[name=aiEnabled]'),'change',async()=>{
    const input=$('[name=aiEnabled]');
    if(input.checked&&!settings.consented){
      const dialog=document.createElement('dialog');dialog.className='ui-dialog ai-consent-dialog';
      dialog.innerHTML=`<form method="dialog"><h2>${t('AI 助手')}</h2><p>${t('AI 助手会把你选择的章节，或续写时光标前的文字，直接发送给你配置的 AI 服务。文舟开发者不经手、不保存这些内容；该服务按其自己的条款和隐私政策处理数据，并可能收费。')}</p><p class="button-row"><button value="cancel" class="ui-button ui-button--secondary">${t('取消')}</button><button value="agree" class="ui-button ui-button--primary">${t('我已了解，并同意在使用时发送上述内容')}</button></p></form>`;
      root.append(dialog);dialog.showModal();
      const accepted=await new Promise(resolve=>{session?.onDispose(()=>{dialog.remove();resolve(false);});dialog.addEventListener('close',()=>resolve(dialog.returnValue==='agree'),{once:true});});dialog.remove();
      if(!alive())return;
      if(!accepted){input.checked=false;refresh();return;}settings.consented=true;
    }
    settings.enabled=input.checked;changed?.();if(settings.enabled&&!aiReady(settings,status))toast(t('AI 助手已启用，但还没有为这个接口地址保存 API Key。'));
    refresh();
  });
  listen($('[name=aiProvider]'),'change',()=>{const item=preset($('[name=aiProvider]').value);if(item.id!=='custom'){$('[name=aiEndpoint]').value=item.endpoint;root.querySelectorAll('[name=aiFormat]').forEach(radio=>radio.checked=radio.value===item.format);}refresh();});
  root.querySelectorAll('[name=aiFormat]').forEach(radio=>listen(radio,'change',refresh));listen($('[name=aiEndpoint]'),'input',refresh);
  // Enter in the key field verifies the key instead of submitting the whole settings form without it.
  listen($('[name=aiKey]'),'keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('[data-ai-verify]').click();}});
  $('[data-ai-verify]').onclick=async()=>{
    const button=$('[data-ai-verify]'),candidate={...current(),apiVersion:$('[name=aiApiVersion]').value.trim()}, {format,endpoint}=candidate,key=$('[name=aiKey]').value.trim();
    if(format==='azure'){try{buildRequest(format,{model:'validation',messages:[],apiVersion:candidate.apiVersion});}catch(cause){error(t(cause.message));return;}}
    if(!key&&!isLocalEndpoint(endpoint)){error(t('请粘贴 API Key。'));$('[name=aiKey]').focus();return;}
    const fields=[...root.querySelectorAll('[name=aiProvider],[name=aiFormat],[name=aiEndpoint],[name=aiApiVersion],[name=aiKey]')];
    fields.forEach(field=>field.disabled=true);
    button.disabled=true;error('');$('.ai-key-status').textContent=t('正在验证…');
    try{
      const found=await aiVerify({format,endpoint,key});
      if(!alive())return;
      const saved=await aiSave({format,endpoint,key});
      if(!alive())return;
      status=saved;
      Object.assign(settings,{...candidate,endpoint:normalizeEndpoint(endpoint)});
      for(const name of ['aiProvider','aiFormat','aiEndpoint','aiApiVersion','aiKey'])draft.delete(name);
      $('[name=aiKey]').value='';$('[name=aiKey]').blur();
      if(found.length){
        models=found;
        const extract=modelValue(new FormData(root.closest('form')),'aiExtractModel')||found[0],suggest=modelValue(new FormData(root.closest('form')),'aiSuggestModel');
        fillModels('aiExtractModel',extract);fillModels('aiSuggestModel',suggest,{same:true});
      }
      {settings.models.available=models;settings.models.extract=modelValue(new FormData(root.closest('form')),'aiExtractModel');settings.models.suggest=modelValue(new FormData(root.closest('form')),'aiSuggestModel');}
      toast(found.length?say(`密钥已保存，读取到 ${found.length} 个模型`,`Key saved; ${found.length} models found`):t('密钥已保存'));
      changed?.();
    }catch(cause){if(alive())error(t(cause.message));}
    finally{if(alive()){fields.forEach(field=>field.disabled=false);button.disabled=false;refresh();}}
  };
  $('[data-ai-clear]').onclick=async()=>{
    try{await aiClear();const next=await aiStatus();if(!alive())return;status=next;toast(t('密钥已删除'));changed?.();}catch(cause){if(alive())error(t(cause.message));}
    if(alive())refresh();
  };
  for(const input of root.querySelectorAll('input,select'))if(draft.has(input.name)){if(input.type==='radio')input.checked=input.value===draft.get(input.name);else input.value=draft.get(input.name);}
  for(const name of ['aiExtractModel','aiSuggestModel'])$(`[data-ai-other=${name}]`).hidden=$(`[name=${name}]`).value!==OTHER;
  refresh();

  {
    for(const input of root.querySelectorAll('input[type=number]')){input.required=true;input.step='1';input.insertAdjacentHTML('afterend',`<span class="settings-error" id="${input.name}-error" role="alert"></span>`);listen(input,'change',()=>{
      const message=root.querySelector('#'+input.name+'-error');
      if(!input.checkValidity()){input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',message.id);message.textContent=say(`请输入 ${input.min} 至 ${input.max} 之间的有效数值。`,`Enter a valid value from ${input.min} to ${input.max}.`);return;}
      input.removeAttribute('aria-invalid');message.textContent='';const name={aiContextTokens:'contextTokens',aiConfirmChars:'confirmChars',aiDailyChars:'dailyChars'}[input.name];settings[name]=input.valueAsNumber;draft.delete(input.name);changed?.();
    });}
    for(const name of ['aiExtractModel','aiSuggestModel']){
      const saveModel=()=>{if(!alive())return;const value=modelValue(new FormData(root.closest('form')),name);if(value===OTHER||$(`[name=${name}]`).value===OTHER&&!value)return;settings.models[name==='aiExtractModel'?'extract':'suggest']=value;changed?.();refresh();};
      listen($(`[name=${name}]`),'change',()=>{if($(`[name=${name}]`).value!==OTHER)saveModel();});listen($(`[name=${name}Other]`),'change',saveModel);
    }
    root.querySelectorAll('button').forEach(button=>button.className='ui-button ui-button--secondary');
    for(const input of root.querySelectorAll('input,select'))listen(input,'input',()=>draft.set(input.name,input.value));
    for(const input of root.querySelectorAll('input[type=number]'))if(!input.checkValidity())input.dispatchEvent(new Event('change',{bubbles:true}));
  }

}
