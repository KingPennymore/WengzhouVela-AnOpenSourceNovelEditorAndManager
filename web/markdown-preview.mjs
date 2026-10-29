import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import {markdownMath} from './latex.mjs';
import {taskLists,relativeResource} from './markdown-tools.mjs';
import {guideIconImage} from './guide-icons.mjs';
import {t,say} from './i18n.mjs';
import {escapeHtml as esc} from './text-utils.mjs';

export const sanitize=DOMPurify.sanitize;
export const md=new MarkdownIt({html:false,linkify:false,breaks:true});
// Local previews do not fetch remote images or open links inside the privileged WebView.
md.use(taskLists);md.use(markdownMath);
md.renderer.rules.image=(tokens,i,_options,env)=>{
  const token=tokens[i],src=token.attrGet('src')||'',alt=token.content||t('图片'),guideImage=guideIconImage(src,alt,esc);
  if(guideImage)return guideImage;
  if(/^data:image\/(png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/.test(src))return `<img src="${src}" alt="${esc(alt)}">`;
  const path=relativeResource(env.path||'',src);
  return path?`<span class="workspace-image" data-workspace-image="${esc(path)}">${say(`[图片：${esc(alt)}]`,`[Image: ${esc(alt)}]`)}</span>`:`<span>${say(`[外部图片：${esc(alt)}]`,`[External image: ${esc(alt)}]`)}</span>`;
};
