import {icon} from './icons.mjs';

const actions=[
  ['new-doc','newFile','新建文件','开始新的文稿或工作区文件'],
  ['import-doc','import','导入文件','从设备添加文稿与阅读文件'],
  ['recent','recent','最近文件','继续查看或编辑已有文件'],
  ['quick-git','github','Git 仓库','连接 GitHub / Gitee，管理与同步文件'],
  ['guide','guide','操作指南','了解文舟的功能与使用方法'],
  ['commands','commands','命令与快捷键','查找操作与键盘快捷键'],
  ['plugins','plugins','插件与组件','安装、启停和管理扩展功能'],
  ['settings','settings','设置','调整外观、语言与编辑偏好']
];

// Two independently scrolling panels share one viewport. Inactive panels stay
// mounted for the slide animation, but cannot receive focus or pointer input.
export function startPageMarkup({files,projects,reading,recentMarkup}){
  return `<div class="start-content"><section class="start-hero"><header class="start-page-header">${icon('write')}<div><h1>文舟</h1></div></header><div class="start-stats"><div class="start-stat"><strong>${files}</strong>本地文件</div><div class="start-stat"><strong>${projects}</strong>工作区</div><div class="start-stat"><strong>${reading}</strong>阅读文件</div></div></section><div class="start-stage"><section id="start-actions-panel" class="start-panel start-menu" aria-label="启动页操作">${actions.map(([action,name,label,description])=>`<button class="start-action" data-start="${action}"${action==='recent'?' aria-controls="start-recent-panel" aria-expanded="false"':''}><span class="start-action-icon">${icon(name)}</span><span class="start-action-text"><strong>${label}</strong><small>${description}</small></span></button>`).join('')}</section><section id="start-recent-panel" class="start-panel start-recent" aria-labelledby="start-recent-heading" aria-hidden="true" inert><header class="start-recent-header"><button class="start-back" data-start="back" aria-label="返回启动页">${icon('back')}<span>返回</span></button><h2 id="start-recent-heading">最近文件</h2></header><div class="recent-files">${recentMarkup}</div></section></div></div>`;
}

export function setStartPanel(root,name,{focus=true}={}){
  const recent=name==='recent',menu=root.querySelector('#start-actions-panel'),list=root.querySelector('#start-recent-panel');
  if(!menu||!list)return;
  root.dataset.panel=recent?'recent':'actions';
  menu.inert=recent;list.inert=!recent;
  menu.setAttribute('aria-hidden',String(recent));list.setAttribute('aria-hidden',String(!recent));
  const trigger=menu.querySelector('[data-start="recent"]');trigger.setAttribute('aria-expanded',String(recent));
  if(focus)(recent?list.querySelector('.start-back'):trigger).focus({preventScroll:true});
}
