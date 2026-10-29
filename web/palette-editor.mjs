import {t,say} from './i18n.mjs';
import {escapeHtml as esc} from './text-utils.mjs';
import {allPalettes,customPalettes,setCustomPalettes,derivePalette,paletteWarnings,validateCustomPalette,paletteBase,newPaletteId,MAX_CUSTOM_PALETTES} from './palettes.mjs';

const $=s=>document.querySelector(s);
/** Create or edit a custom palette: three colours per mode with a live preview and readability notes. */
export function showPaletteEditor({workspace,openModal,closeModal,applyTheme,save,toast},id='',from=workspace.settings.palette){
  // i18n-data: file names, matching text and editable defaults stay as written
  const existing=customPalettes().find(item=>item.id===id),base=existing?structuredClone(existing.base):paletteBase(from),name=existing?.name||'我的配色';
  const field=(mode,key,label)=>`<label class="palette-color">${label}<input type="color" name="${mode}-${key}" value="${base[mode][key]}"></label>`;
  const column=(mode,title)=>`<fieldset class="palette-mode"><legend>${title}</legend>${field(mode,'paper',t('纸张'))}${field(mode,'text',t('文字'))}${field(mode,'accent',t('强调色'))}<div class="palette-preview" data-preview="${mode}"><strong>${t('第一章 风起')}</strong><p>${t('林舟冷笑一声，转身离去。')}</p>
    <small>${t('本章 2,318 字')}</small><span class="palette-preview-button">${t('保存')}</span></div>
    <p class="palette-warnings" data-warnings="${mode}" role="status"></p>
    </fieldset>`;
  openModal(existing?t('编辑配色'):t('自定义配色'),`<label>${t('名称')}<input name="name" required maxlength="16" value="${esc(name)}"></label>
    ${existing?'':`<label>${t('起点')}<select name="from">${allPalettes().map(p=>`<option value="${p.id}"${p.id===from?' selected':''}>${esc(p.custom?p.name:t(p.name))}</option>`).join('')}</select></label>`}<div class="palette-modes">${column('light',t('浅色'))}${column('dark',t('深色'))}</div>
    <small>${t('只需选纸张、文字和强调色，背景、面板、分隔线和选区会自动推导，保持与内置配色相同的层次。配色只保存在本机设置中。')}</small>${existing?`<p><button type="button" class="danger" id="delete-palette">${t('删除此配色')}</button></p>`:''}`,form=>{
    const value=validateCustomPalette({id:existing?.id||newPaletteId(),name:form.get('name'),light:read(form,'light'),dark:read(form,'dark')});
    const list=(workspace.settings.customPalettes||[]).filter(item=>item.id!==value.id);
    workspace.settings.customPalettes=[...list,value].slice(-MAX_CUSTOM_PALETTES);
    setCustomPalettes(workspace.settings.customPalettes);
    workspace.settings.palette=value.id;
    applyTheme();
    save();
    toast(say(`已使用配色“${value.name}”`,`Using palette “${value.name}”`));
  },{label:t('保存并使用')});
  function read(form,mode){return {paper:form.get(mode+'-paper'),text:form.get(mode+'-text'),accent:form.get(mode+'-accent')};}
  const preview=()=>{
    const form=new FormData($('#dialog-form'));
    for(const mode of ['light','dark']){
      const colors=derivePalette(read(form,mode),mode==='dark'),box=$(`#dialog-body [data-preview="${mode}"]`);
      for(const [key,color] of Object.entries(colors))box.style.setProperty('--p-'+key,color);
      const notes=paletteWarnings(read(form,mode));
      $(`#dialog-body [data-warnings="${mode}"]`).textContent=notes.map(note=>{
        const ratio=/[0-9]+\.[0-9]+/.exec(note)?.[0];
        // i18n-data: file names, matching text and editable defaults stay as written
        return note.startsWith('正文与纸张对比度 ')
          ?say(note,`Text-to-paper contrast ${ratio}:1 is below 4.5:1; long reading sessions may be tiring`)
          :say(note,`Accent-to-paper contrast ${ratio}:1 is below 3:1; buttons and markers may be hard to see`);
      }).join(say('；','; '));
    }
  };
  $('#dialog-body').addEventListener('input',preview);preview();
  const start=$('#dialog-body [name=from]');if(start)start.onchange=()=>{
    const next=paletteBase(start.value);
    for(const mode of ['light','dark'])for(const key of ['paper','text','accent'])$(`#dialog-body [name="${mode}-${key}"]`).value=next[mode][key];
    preview();
  };
  const remove=$('#delete-palette');if(remove)remove.onclick=()=>{
    workspace.settings.customPalettes=(workspace.settings.customPalettes||[]).filter(item=>item.id!==id);
    setCustomPalettes(workspace.settings.customPalettes);
    if(workspace.settings.palette===id)workspace.settings.palette='pine';
    applyTheme();
    save();
    closeModal();
    toast(t('配色已删除'));
  };
}
