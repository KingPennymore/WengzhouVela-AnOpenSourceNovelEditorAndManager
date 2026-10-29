// Settings → AI assistant (docs/AI-ASSIST.md). The key is verified, then handed to the native secure store; this
// dialog only ever sees whether one is saved and its last four characters.
import {t,say} from './i18n.mjs';
import {escapeHtml as esc} from './text-utils.mjs';
import {native} from './platform.mjs';
import {PRESETS,FORMATS,preset,normalizeEndpoint,isLocalEndpoint} from './ai-providers.mjs';
import {aiSettings,aiStatus,aiVerify,aiSave,aiClear,aiReady} from './ai-client.mjs';

const $=selector=>document.querySelector('#dialog-body '+selector);
const FORMAT_LABELS={openai:'OpenAI 兼容',anthropic:'Anthropic',gemini:'Gemini',azure:'Azure OpenAI'}; // i18n-data: labels go through t()

/** Opens the AI settings dialog. `changed` runs after the settings were saved (to show or hide the AI button). */
export async function showAiSettings({workspace,openModal,save,toast,changed}){
  const settings=aiSettings(workspace);
  let status=await aiStatus().catch(()=>({saved:false})),models=settings.models.available||[];
  const option=(value,label,selected)=>`<option value="${esc(value)}"${selected?' selected':''}>${esc(label)}</option>`;
  openModal(t('AI 助手'),`
    <div class="notice ai-consent"${settings.consented?' hidden':''}>
      <p>${t('AI 助手会把你选择的章节，或续写时光标前的文字，直接发送给你配置的 AI 服务。文舟开发者不经手、不保存这些内容；该服务按其自己的条款和隐私政策处理数据，并可能收费。')}</p>
      <label class="checkbox"><input type="checkbox" name="consent">${t('我已了解，并同意在使用时发送上述内容')}</label>
    </div>
    <label class="checkbox"><input type="checkbox" name="enabled"${settings.enabled?' checked':''}>${t('启用 AI 助手')}</label>
    <label>${t('服务')}<select name="provider">${PRESETS.map(item=>option(item.id,t(item.name),item.id===settings.provider)).join('')}</select></label>
    <label data-ai-format>${t('请求格式')}<select name="format">${FORMATS.map(format=>option(format,t(FORMAT_LABELS[format]),format===settings.format)).join('')}</select></label>
    <label>${t('接口地址')}<input name="endpoint" required maxlength="512" spellcheck="false" autocomplete="off" value="${esc(settings.endpoint)}"></label>
    <label data-ai-version>${t('API 版本')}<input name="apiVersion" maxlength="32" spellcheck="false" value="${esc(settings.apiVersion)}"></label>
    <fieldset class="ai-key"><legend>API Key</legend>
      <p class="ai-key-status" role="status"></p>
      <input name="key" type="password" autocomplete="off" spellcheck="false" maxlength="4096" aria-label="API Key" placeholder="${t('粘贴 API Key')}">
      <p class="button-row"><button type="button" class="secondary" id="ai-verify">${t('验证并保存')}</button><button type="button" class="danger" id="ai-clear">${t('删除密钥')}</button></p>
      <small>${native?t('密钥保存在系统安全存储中，保存后无法再查看，只能删除或替换。'):t('浏览器预览版仅供测试：密钥只保存在当前页面，刷新后清除。')}</small>
    </fieldset>
    <datalist id="ai-models">${models.map(id=>option(id,id,false)).join('')}</datalist>
    <label>${t('整理文件使用的模型')}<input name="extractModel" list="ai-models" maxlength="128" spellcheck="false" value="${esc(settings.models.extract)}"></label>
    <label>${t('续写建议使用的模型')}<input name="suggestModel" list="ai-models" maxlength="128" spellcheck="false" placeholder="${t('留空则与整理文件相同')}" value="${esc(settings.models.suggest)}"></label>
    <label>${t('单次发送超过多少字时先确认')}<input type="number" name="confirmChars" min="0" max="10000000" step="1000" value="${settings.confirmChars}"></label>
    <label>${t('每日发送上限（字，0 为不限）')}<input type="number" name="dailyChars" min="0" max="100000000" step="10000" value="${settings.dailyChars}"></label>`,async form=>{
    if(form.has('enabled')&&!settings.consented&&!form.has('consent'))throw new Error(t('启用前请先阅读并勾选数据发送说明。'));
    const provider=form.get('provider'),format=provider==='custom'?form.get('format'):preset(provider).format,endpoint=normalizeEndpoint(form.get('endpoint'));
    if(endpoint instanceof Error)throw endpoint;
    Object.assign(settings,{enabled:form.has('enabled'),consented:settings.consented||form.has('consent'),provider,format,endpoint,apiVersion:String(form.get('apiVersion')||settings.apiVersion).trim(),
      confirmChars:Math.max(0,Number(form.get('confirmChars'))||0),dailyChars:Math.max(0,Number(form.get('dailyChars'))||0)});
    Object.assign(settings.models,{extract:String(form.get('extractModel')).trim(),suggest:String(form.get('suggestModel')).trim(),available:models});
    if(settings.enabled&&!settings.models.extract)throw new Error(t('请先选择模型。'));
    save();changed?.();
    if(settings.enabled&&!aiReady(settings,status)&&!isLocalEndpoint(endpoint))toast(t('AI 助手已启用，但还没有为这个接口地址保存 API Key。'));
  },{label:t('保存')});

  const current=()=>{const provider=$('[name=provider]').value;return {provider,format:provider==='custom'?$('[name=format]').value:preset(provider).format,endpoint:$('[name=endpoint]').value.trim().replace(/\/+$/,'')};};
  const refresh=()=>{
    const {provider,format,endpoint}=current();
    $('[data-ai-format]').hidden=provider!=='custom';
    $('[data-ai-version]').hidden=format!=='azure';
    const bound=status.saved&&status.format===format&&status.endpoint===endpoint;
    const tail=status.last4||t('（无）');
    $('.ai-key-status').textContent=bound?say(`已保存 · 末尾 ${tail}`,`Saved · ends in ${tail}`)
      :status.saved?say(`已保存的密钥属于 ${status.endpoint}，当前地址需要重新输入。`,`The saved key belongs to ${status.endpoint}; enter one for this address.`)
      :t('尚未保存密钥');
    $('#ai-clear').disabled=!status.saved;
  };
  $('[name=provider]').onchange=()=>{const item=preset($('[name=provider]').value);if(item.id!=='custom'){$('[name=endpoint]').value=item.endpoint;$('[name=format]').value=item.format;}refresh();};
  $('[name=format]').onchange=refresh;$('[name=endpoint]').oninput=refresh;
  $('[name=enabled]').onchange=()=>{if(!settings.consented)$('.ai-consent').hidden=!$('[name=enabled]').checked;};
  if(!settings.consented)$('.ai-consent').hidden=!settings.enabled;
  $('#ai-verify').onclick=async()=>{
    const button=$('#ai-verify'),{format,endpoint}=current(),key=$('[name=key]').value.trim(),error=document.querySelector('#dialog-error');
    if(!key&&!isLocalEndpoint(endpoint)){error.textContent=t('请粘贴 API Key。');return;}
    button.disabled=true;error.textContent='';$('.ai-key-status').textContent=t('正在验证…');
    try{
      const found=await aiVerify({format,endpoint,key});
      status=await aiSave({format,endpoint,key});
      $('[name=key]').value='';
      if(found.length){models=found;$('#ai-models').innerHTML=found.map(id=>option(id,id,false)).join('');if(!$('[name=extractModel]').value)$('[name=extractModel]').value=found[0];}
      toast(found.length?say(`密钥已保存，找到 ${found.length} 个模型`,`Key saved; ${found.length} models found`):t('密钥已保存'));
    }catch(cause){error.textContent=t(cause.message);}
    finally{button.disabled=false;refresh();}
  };
  $('#ai-clear').onclick=async()=>{
    try{await aiClear();status=await aiStatus();toast(t('密钥已删除'));}catch(cause){document.querySelector('#dialog-error').textContent=t(cause.message);}
    refresh();changed?.();
  };
  refresh();
}
