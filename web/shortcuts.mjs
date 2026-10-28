import {t} from './i18n.mjs';
export const shortcuts=[
  Object.defineProperty(['add-glossary','Mod-Alt-g','Ctrl+Alt+G'],3,{get:()=>t('选中词加入术语库'),enumerable:true}),
  Object.defineProperty(['quick-save','Mod-s','Ctrl+S'],3,{get:()=>t('保存'),enumerable:true}),
  Object.defineProperty(['quick-undo','Mod-z','Ctrl+Z'],3,{get:()=>t('撤回'),enumerable:true}),
  Object.defineProperty(['quick-redo','Mod-Shift-z','Ctrl+Shift+Z'],3,{get:()=>t('重做'),enumerable:true}),
  Object.defineProperty(['quick-top','Mod-Home','Ctrl+Home'],3,{get:()=>t('到文件顶部'),enumerable:true}),
  Object.defineProperty(['quick-bottom','Mod-End','Ctrl+End'],3,{get:()=>t('到文件底部'),enumerable:true}),
  Object.defineProperty(['quick-chapter-top','Alt-ArrowUp','Alt+↑'],3,{get:()=>t('到章节顶部'),enumerable:true}),
  Object.defineProperty(['quick-chapter-bottom','Alt-ArrowDown','Alt+↓'],3,{get:()=>t('到章节底部'),enumerable:true}),
  Object.defineProperty(['quick-git','Mod-Shift-g','Ctrl+Shift+G'],3,{get:()=>t('Git 仓库与提交'),enumerable:true}),
  Object.defineProperty(['outline-toggle','Mod-Shift-o','Ctrl+Shift+O'],3,{get:()=>t('章节目录'),enumerable:true}),
  Object.defineProperty(['search-editor','Mod-f','Ctrl+F'],3,{get:()=>t('查找与替换'),enumerable:true}),
  Object.defineProperty(['toggle-display','Mod-Shift-p','Ctrl+Shift+P'],3,{get:()=>t('预览 / 源码'),enumerable:true}),
  Object.defineProperty(['focus-toggle','F11','F11'],3,{get:()=>t('专注模式'),enumerable:true}),
  Object.defineProperty(['theme','Mod-Alt-t','Ctrl+Alt+T'],3,{get:()=>t('外观模式'),enumerable:true}),
  Object.defineProperty(['settings','Mod-,','Ctrl+,'],3,{get:()=>t('编辑器设置'),enumerable:true}),
  Object.defineProperty(['export-doc','Mod-Shift-s','Ctrl+Shift+S'],3,{get:()=>t('导出文件'),enumerable:true}),
  Object.defineProperty(['import-doc','Mod-o','Ctrl+O'],3,{get:()=>t('导入文件'),enumerable:true}),
  Object.defineProperty(['new-doc','Mod-n','Ctrl+N'],3,{get:()=>t('新建文件'),enumerable:true}),
  Object.defineProperty(['close-active','Mod-w','Ctrl+W'],3,{get:()=>t('关闭当前标签'),enumerable:true}),
  Object.defineProperty(['home-button','Mod-Alt-h','Ctrl+Alt+H'],3,{get:()=>t('启动页'),enumerable:true}),
  Object.defineProperty(['plugins','Mod-Alt-p','Ctrl+Alt+P'],3,{get:()=>t('插件与组件'),enumerable:true}),
  Object.defineProperty(['commands','Mod-Shift-k','Ctrl+Shift+K'],3,{get:()=>t('命令与快捷键'),enumerable:true}),
  Object.defineProperty(['append-chapter','Mod-Alt-Enter','Ctrl+Alt+Enter'],3,{get:()=>t('追加章节'),enumerable:true}),
  Object.defineProperty(['locate-chapter','Mod-Alt-l','Ctrl+Alt+L'],3,{get:()=>t('定位当前章节'),enumerable:true}),
  Object.defineProperty(['refresh-folder','Mod-Alt-r','Ctrl+Alt+R'],3,{get:()=>t('刷新工作区'),enumerable:true}),
  Object.defineProperty(['new-folder','Mod-Alt-n','Ctrl+Alt+N'],3,{get:()=>t('新建工作区'),enumerable:true}),
  Object.defineProperty(['md-bold','Mod-b','Ctrl+B'],3,{get:()=>t('Markdown 加粗'),enumerable:true}),
  Object.defineProperty(['md-italic','Mod-i','Ctrl+I'],3,{get:()=>t('Markdown 斜体'),enumerable:true}),
  Object.defineProperty(['md-strike','Mod-Shift-x','Ctrl+Shift+X'],3,{get:()=>t('Markdown 删除线'),enumerable:true}),
  Object.defineProperty(['md-code','Mod-Alt-c','Ctrl+Alt+C'],3,{get:()=>t('Markdown 行内代码'),enumerable:true}),
  Object.defineProperty(['md-heading','Mod-Alt-1','Ctrl+Alt+1'],3,{get:()=>t('Markdown 一级标题'),enumerable:true}),
  Object.defineProperty(['md-list','Mod-Alt-7','Ctrl+Alt+7'],3,{get:()=>t('Markdown 无序列表'),enumerable:true}),
  Object.defineProperty(['md-task','Mod-Alt-8','Ctrl+Alt+8'],3,{get:()=>t('Markdown 任务列表'),enumerable:true}),
  Object.defineProperty(['md-quote','Mod-Alt-q','Ctrl+Alt+Q'],3,{get:()=>t('Markdown 引用'),enumerable:true}),
  Object.defineProperty(['format-emphasis','Mod-Shift-e','Ctrl+Shift+E'],3,{get:()=>t('TXT 着重号'),enumerable:true}),
  Object.defineProperty(['format-center','Mod-Alt-e','Ctrl+Alt+E'],3,{get:()=>t('TXT 居中'),enumerable:true})
];
export function matchesKey(event,binding){
  const parts=binding.split('-'),
    key=parts.pop().toLowerCase();
  const mod=parts.includes('Mod');
  return (
    event.key.toLowerCase()===key&&
    !!(event.ctrlKey||event.metaKey)===mod&&
    !!event.altKey===parts.includes('Alt')&&
    !!event.shiftKey===parts.includes('Shift')
  );
}
