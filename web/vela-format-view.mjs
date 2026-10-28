// The "TXT 格式" page of the .vela editor: whether the format tools are on, the named styles, and the formats stored
// for each TXT of the work (richText.documents). The configuration page and this page edit the same file.
import {resolveStyles,BUILTIN_STYLES,styleCss,paragraphStyle,STYLE_LABELS} from './rich-text-styles.mjs';
import {configStyles} from './vela-v2.mjs';
import {sidecarTarget} from './rich-text.mjs';
import {documentPath} from './workspace.mjs';
import {t,say} from './i18n.mjs';
const count=(record,group)=>(record?.[group]||[]).length;
const describe=style=>[style.font&&t(STYLE_LABELS.font[style.font]),style.size&&say(`${t(STYLE_LABELS.size[style.size])}字`,`${t(STYLE_LABELS.size[style.size])} text`),style.color&&t(STYLE_LABELS.color[style.color]),style.bold&&t('加粗'),style.align&&t(STYLE_LABELS.align[style.align]),style.indent===2&&t('整段缩进'),style.frame&&t('边框')].filter(Boolean).join(' · ')||'—';

/** HTML of the format page. `inherited` is the global configuration (for a work's styles that come from it). */
export function formatPaneHtml({config,global,folder,inherited,workspace,escape:esc}){
  const rich=config.richText||{},own=configStyles(config),parent=global?{}:configStyles(inherited),styles=resolveStyles({...parent,...own});
  const source=id=>own[id]?t(global?'全局':'本作品'):parent[id]?t('全局配置'):BUILTIN_STYLES[id]?t('内置'):'';
  const records=Object.entries(rich.documents||{}).sort(([a],[b])=>a.localeCompare(b,'zh-CN',{numeric:true})),prefix=folder?folder+'/':'';
  const exists=key=>workspace.documents.some(doc=>documentPath(doc)===prefix+key);
  const legacy=global
    ?[]
    :workspace.documents.filter(doc=>{
    const target=sidecarTarget(documentPath(doc));
    return target&&(!folder||target.startsWith(prefix));
  });
  const enabled=rich.enabled===true?'true':rich.enabled===false?'false':'';
  return (`<div class="vela-format-grid">
<section class="vela-card">`+
    `<h3>${t('TXT 格式工具')}</h3>`+
    `<label>${t(global?'默认':'本作品')}<select name="richTextEnabled">`+
    `<option value="">${t(global?'跟随应用设置':'继承')}</option>`+
    `<option value="true"${enabled==='true'?' selected':''}>${t('启用')}</option>`+
    `<option value="false"${enabled==='false'?' selected':''}>${t('关闭')}</option>`+
    `</select>`+
    `<small>${t('启用后，TXT 文稿显示格式工具。已有格式的 TXT 总会显示。')}</small>`+
    `</label>`+
    `</section>
<section class="vela-card">`+
    `<div class="vela-files-heading">`+
    `<h3>${t('命名样式')}</h3>`+
    `<button type="button" class="secondary" data-vela-styles>${t('管理样式…')}</button>`+
    `</div>`+
    `<ul class="vela-style-list">${Object.entries(styles).map(([id,style])=>`<li><span class="vela-style-sample" style="${esc(styleCss(style,{inline:true}))}">${esc(style.label)}</span><small>${esc(t(paragraphStyle(style)?'常用于整段':'常用于文字'))} · ${esc(describe(style))}</small><small class="vela-style-source">${esc(source(id))}</small></li>`).join('')}</ul>`+
    `<small>${t('选中文字时样式只作用于选中的字；没有选中时作用于整段。')}</small>`+
    `</section>
${global
    ?''
    :(`<section class="vela-card vela-format-documents">`+
    `<div class="vela-files-heading">`+
    `<h3>${t('文稿格式')}</h3>`+
    `<output>${records.length}</output>`+
    `</div>${records.length
    ?`<ul class="vela-record-list">${records.map(([key,record])=>(`<li data-record="${esc(key)}">`+
    `<div>`+
    `<strong data-user-content>${esc(key)}</strong>`+
    `<small>${[[t('文字格式'),count(record,'marks')],[t('段落格式'),count(record,'blocks')],[t('插图'),count(record,'inserts')]].filter(([,n])=>n).map(([label,n])=>esc(label)+' '+n).join(' · ')||t('无格式')}${count(record,'review')?` · <span class="warning">${t('待确认')} ${count(record,'review')}</span>`:''}${exists(key)?'':` · <span class="warning">${t('文件不存在')}</span>`}</small>`+
    `</div>`+
    `<span class="vela-record-actions">${exists(key)?`<button type="button" class="secondary" data-record-open="${esc(key)}">${t('打开')}</button>`:''}<button type="button" class="secondary danger" data-record-remove="${esc(key)}">${t('移除格式')}</button>`+
    `</span>`+
    `</li>`)).join('')}</ul>`
    :`<p>${t('还没有 TXT 保存格式。打开 TXT 并使用格式工具后，格式记录会出现在这里。')}</p>`}${legacy.length?`<p><small>${t('还有 {n} 个 0.9.7 的格式旁注（.txt.vela）。打开对应 TXT 并保存后，格式会并入此文件，旁注移入回收站。').replace('{n}',legacy.length)}</small></p>`:''}<small>${t('格式保存在此 .vela 中，TXT 正文保持纯文字。在文舟外改过正文后，格式按所在段落和原文重新定位，找不到的进入“待确认”。')}</small>`+
    `</section>`)}
</div>`);
}

/** Wires the format page; `onRemove(key)` drops a record, `onOpen(path)` opens a TXT, `onManageStyles()` opens the style editor. */
export function bindFormatPane(root,{folder,onRemove,onOpen,onManageStyles}){
  root.querySelector('[data-vela-styles]')?.addEventListener('click',()=>onManageStyles?.());
  root.querySelectorAll('[data-record-open]').forEach(button=>button.onclick=()=>onOpen?.((folder?folder+'/':'')+button.dataset.recordOpen));
  root.querySelectorAll('[data-record-remove]').forEach(button=>button.onclick=async()=>{
    if(button.dataset.confirm!=='1'){
      button.dataset.confirm='1';
      button.textContent=t('确认移除');
      setTimeout(()=>{
        if(button.isConnected){
          button.dataset.confirm='';
          button.textContent=t('移除格式');
        }
      },4000);
      return;
    }
    button.disabled=true;
    try{
      await onRemove(button.dataset.recordRemove);
    }catch(error){
      button.disabled=false;
      root.querySelector('#vela-error').textContent=error.message;
    }
  });
}
