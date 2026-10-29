// Settings → AI assistant (docs/AI-ASSIST.md), mounted into the settings form like the font settings. The fields are
// saved with the rest of the settings; verifying and deleting the key act at once. This code only ever sees whether a
// key is saved and its last four characters.
import {t,say} from './i18n.mjs';
import {escapeHtml as esc} from './text-utils.mjs';
import {native} from './platform.mjs';
import {PRESETS,FORMATS,preset,normalizeEndpoint,isLocalEndpoint,MAX_ENDPOINT,MAX_KEY} from './ai-providers.mjs';
import {aiSettings,aiStatus,aiVerify,aiSave,aiClear,aiReady} from './ai-client.mjs';

const FORMAT_LABELS={openai:'OpenAI 兼容',anthropic:'Anthropic',gemini:'Gemini',azure:'Azure OpenAI'}; // i18n-data: labels go through t()
const OTHER='\u0000other';

/**
 * Fills `root` (the AI fieldset of the settings form). Returns apply(form), which the settings submit calls first:
 * it validates and stores the AI fields, or throws so nothing is saved. `changed` runs after the key changed.
 */
export async function mountAiSettings(root,{workspace,toast,changed}){
  const settings=aiSettings(workspace);
  let status=await aiStatus().catch(()=>({saved:false})),models=[...(settings.models.available||[])];
  const option=(value,label,selected)=>`<option value="${esc(value)}"${selected?' selected':''}>${esc(label)}</option>`;
  const $=selector=>root.querySelector(selector);
  root.innerHTML=`
    <label class="checkbox"><input type="checkbox" name="aiEnabled"${settings.enabled?' checked':''}>${t('启用 AI 助手')}</label>
    <small>${t('把选定章节整理成术语库、大纲与关系或地图，并在写作时给出续写建议。使用你自己的 AI 服务和 API Key。')}</small>
    <div class="ai-settings-body">
      <div class="notice ai-consent"${settings.consented?' hidden':''}>
        <p>${t('AI 助手会把你选择的章节，或续写时光标前的文字，直接发送给你配置的 AI 服务。文舟开发者不经手、不保存这些内容；该服务按其自己的条款和隐私政策处理数据，并可能收费。')}</p>
        <label class="checkbox"><input type="checkbox" name="aiConsent">${t('我已了解，并同意在使用时发送上述内容')}</label>
      </div>
      <label>${t('服务')}<select name="aiProvider">${PRESETS.map(item=>option(item.id,t(item.name),item.id===settings.provider)).join('')}</select></label>
      <label data-ai-format>${t('请求格式')}<select name="aiFormat">${FORMATS.map(format=>option(format,t(FORMAT_LABELS[format]),format===settings.format)).join('')}</select></label>
      <label>${t('接口地址')}<input name="aiEndpoint" maxlength="${MAX_ENDPOINT}" inputmode="url" spellcheck="false" autocomplete="off" autocapitalize="off" value="${esc(settings.endpoint)}"></label>
      <label data-ai-version>${t('API 版本')}<input name="aiApiVersion" maxlength="32" spellcheck="false" autocomplete="off" autocapitalize="off" value="${esc(settings.apiVersion)}"></label>
      <label>API Key<input name="aiKey" type="password" maxlength="${MAX_KEY}" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="${t('粘贴 API Key')}"></label>
      <p class="ai-key-status" role="status"></p>
      <p class="button-row"><button type="button" class="secondary" data-ai-verify>${t('验证并保存')}</button><button type="button" class="secondary" data-ai-clear>${t('删除密钥')}</button></p>
      <small>${native?t('密钥保存在系统安全存储中，保存后无法再查看，只能删除或替换。'):t('浏览器预览版仅供测试：密钥只保存在当前页面，刷新后清除。')}</small>
      <label>${t('整理文件使用的模型')}<select name="aiExtractModel"></select></label>
      <label data-ai-other="aiExtractModel">${t('模型名称')}<input name="aiExtractModelOther" maxlength="128" spellcheck="false" autocomplete="off" autocapitalize="off"></label>
      <label>${t('续写建议使用的模型')}<select name="aiSuggestModel"></select></label>
      <label data-ai-other="aiSuggestModel">${t('模型名称')}<input name="aiSuggestModelOther" maxlength="128" spellcheck="false" autocomplete="off" autocapitalize="off"></label>
      <label>${t('单次发送超过多少字时先确认')}<input type="number" name="aiConfirmChars" inputmode="numeric" min="0" max="10000000" step="1000" value="${settings.confirmChars}"></label>
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
  for(const name of ['aiExtractModel','aiSuggestModel'])$(`[name=${name}]`).addEventListener('change',()=>{
    const other=$(`[data-ai-other=${name}]`);other.hidden=$(`[name=${name}]`).value!==OTHER;
    if(!other.hidden)other.querySelector('input').focus();
  });

  const current=()=>{const provider=$('[name=aiProvider]').value;return {provider,format:provider==='custom'?$('[name=aiFormat]').value:preset(provider).format,endpoint:$('[name=aiEndpoint]').value.trim().replace(/\/+$/,'')};};
  const refresh=()=>{
    const enabled=$('[name=aiEnabled]').checked,{provider,format,endpoint}=current();
    $('.ai-settings-body').hidden=!enabled;
    $('[data-ai-format]').hidden=provider!=='custom';
    $('[data-ai-version]').hidden=format!=='azure';
    const bound=status.saved&&status.format===format&&status.endpoint===endpoint,tail=status.last4||t('（无）');
    $('.ai-key-status').textContent=bound?say(`密钥已保存 · 末尾 ${tail}`,`Key saved · ends in ${tail}`)
      :status.saved?say(`已保存的密钥属于 ${status.endpoint}，当前地址需要重新输入。`,`The saved key belongs to ${status.endpoint}; enter one for this address.`)
      :t('尚未保存密钥');
    $('[data-ai-clear]').hidden=!status.saved;
  };
  const error=message=>{const node=document.querySelector('#dialog-error');if(node)node.textContent=message;};
  $('[name=aiEnabled]').addEventListener('change',refresh);
  $('[name=aiProvider]').addEventListener('change',()=>{const item=preset($('[name=aiProvider]').value);if(item.id!=='custom'){$('[name=aiEndpoint]').value=item.endpoint;$('[name=aiFormat]').value=item.format;}refresh();});
  $('[name=aiFormat]').addEventListener('change',refresh);$('[name=aiEndpoint]').addEventListener('input',refresh);
  // Enter in the key field verifies the key instead of submitting the whole settings form without it.
  $('[name=aiKey]').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('[data-ai-verify]').click();}});
  $('[data-ai-verify]').onclick=async()=>{
    const button=$('[data-ai-verify]'),{format,endpoint}=current(),key=$('[name=aiKey]').value.trim();
    if(!key&&!isLocalEndpoint(endpoint)){error(t('请粘贴 API Key。'));$('[name=aiKey]').focus();return;}
    button.disabled=true;error('');$('.ai-key-status').textContent=t('正在验证…');
    try{
      const found=await aiVerify({format,endpoint,key});
      status=await aiSave({format,endpoint,key});
      $('[name=aiKey]').value='';$('[name=aiKey]').blur();
      if(found.length){
        models=found;
        const extract=modelValue(new FormData(root.form),'aiExtractModel')||found[0],suggest=modelValue(new FormData(root.form),'aiSuggestModel');
        fillModels('aiExtractModel',extract);fillModels('aiSuggestModel',suggest,{same:true});
      }
      toast(found.length?say(`密钥已保存，读取到 ${found.length} 个模型`,`Key saved; ${found.length} models found`):t('密钥已保存'));
      changed?.();
    }catch(cause){error(t(cause.message));}
    finally{button.disabled=false;refresh();}
  };
  $('[data-ai-clear]').onclick=async()=>{
    try{await aiClear();status=await aiStatus();toast(t('密钥已删除'));changed?.();}catch(cause){error(t(cause.message));}
    refresh();
  };
  refresh();

  return {apply(form){
    const enabled=form.has('aiEnabled');
    if(enabled&&!settings.consented&&!form.has('aiConsent'))throw new Error(t('启用 AI 助手前请先阅读并勾选数据发送说明。'));
    const provider=form.get('aiProvider'),format=provider==='custom'?form.get('aiFormat'):preset(provider).format;
    const endpoint=normalizeEndpoint(form.get('aiEndpoint'));
    if(enabled&&endpoint instanceof Error)throw endpoint;
    const extract=modelValue(form,'aiExtractModel'),suggest=modelValue(form,'aiSuggestModel');
    if(enabled&&!extract)throw new Error(t('请先选择 AI 模型。'));
    Object.assign(settings,{enabled,consented:settings.consented||form.has('aiConsent'),provider,format,
      endpoint:endpoint instanceof Error?settings.endpoint:endpoint,apiVersion:String(form.get('aiApiVersion')||settings.apiVersion).trim(),
      confirmChars:Math.max(0,Number(form.get('aiConfirmChars'))||0),dailyChars:Math.max(0,Number(form.get('aiDailyChars'))||0)});
    Object.assign(settings.models,{extract,suggest,available:models});
    return {enabled,ready:aiReady(settings,status)||isLocalEndpoint(settings.endpoint)};
  }};
}
