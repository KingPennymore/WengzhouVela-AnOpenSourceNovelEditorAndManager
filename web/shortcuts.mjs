export const shortcuts=[
  ['add-glossary','Mod-Alt-g','Ctrl+Alt+G','选中词加入术语库'],
  ['quick-save','Mod-s','Ctrl+S','保存'],
  ['quick-undo','Mod-z','Ctrl+Z','撤回'],
  ['quick-redo','Mod-Shift-z','Ctrl+Shift+Z','重做'],
  ['quick-top','Mod-Home','Ctrl+Home','到文件顶部'],
  ['quick-bottom','Mod-End','Ctrl+End','到文件底部'],
  ['quick-chapter-top','Alt-ArrowUp','Alt+↑','到章节顶部'],
  ['quick-chapter-bottom','Alt-ArrowDown','Alt+↓','到章节底部'],
  ['quick-git','Mod-Shift-g','Ctrl+Shift+G','Git 仓库与提交'],
  ['outline-toggle','Mod-Shift-o','Ctrl+Shift+O','章节目录'],
  ['search-editor','Mod-f','Ctrl+F','查找与替换'],
  ['preview-toggle','Mod-Shift-p','Ctrl+Shift+P','预览 / 源码'],
  ['focus-toggle','F11','F11','专注模式'],
  ['theme','Mod-Alt-t','Ctrl+Alt+T','外观模式'],
  ['settings','Mod-,','Ctrl+,','编辑器设置'],
  ['export-doc','Mod-Shift-s','Ctrl+Shift+S','导出文件'],
  ['import-doc','Mod-o','Ctrl+O','导入文件'],
  ['new-doc','Mod-n','Ctrl+N','新建文件'],
  ['close-active','Mod-w','Ctrl+W','关闭当前标签'],
  ['home-button','Mod-Alt-h','Ctrl+Alt+H','启动页'],
  ['plugins','Mod-Alt-p','Ctrl+Alt+P','Acode 插件'],
  ['commands','Mod-Shift-k','Ctrl+Shift+K','命令与快捷键'],
  ['append-chapter','Mod-Alt-Enter','Ctrl+Alt+Enter','追加章节'],
  ['locate-chapter','Mod-Alt-l','Ctrl+Alt+L','定位当前章节'],
  ['refresh-folder','Mod-Alt-r','Ctrl+Alt+R','刷新工作区'],
  ['new-folder','Mod-Alt-n','Ctrl+Alt+N','新建工作区'],
  ['md-bold','Mod-b','Ctrl+B','Markdown 加粗'],
  ['md-italic','Mod-i','Ctrl+I','Markdown 斜体'],
  ['md-strike','Mod-Shift-x','Ctrl+Shift+X','Markdown 删除线'],
  ['md-code','Mod-Alt-c','Ctrl+Alt+C','Markdown 行内代码'],
  ['md-heading','Mod-Alt-1','Ctrl+Alt+1','Markdown 一级标题'],
  ['md-list','Mod-Alt-7','Ctrl+Alt+7','Markdown 无序列表'],
  ['md-task','Mod-Alt-8','Ctrl+Alt+8','Markdown 任务列表'],
  ['md-quote','Mod-Alt-q','Ctrl+Alt+Q','Markdown 引用']
];
export function matchesKey(event,binding) {
  const parts=binding.split('-'),key=parts.pop().toLowerCase();
  const mod=parts.includes('Mod');
  return event.key.toLowerCase()===key && !!(event.ctrlKey||event.metaKey)===mod && !!event.altKey===parts.includes('Alt') && !!event.shiftKey===parts.includes('Shift');
}
