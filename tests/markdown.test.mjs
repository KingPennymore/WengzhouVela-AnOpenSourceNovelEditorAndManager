import {test} from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import {taskLists,relativeResource} from '../web/markdown-tools.mjs';
test('Markdown 标题、加粗、表格、代码、嵌套任务和引用生成可阅读结构',()=>{
  const md=new MarkdownIt({html:false}).use(taskLists),html=md.render('# 小说\n\n**重点**\n\n|人物|设定|\n|---|---|\n|甲|乙|\n\n- [x] 已写\n  - [ ] 未写\n\n> 引用\n\n```txt\n代码\n```\n\n[x] 普通段落');
  for(const pattern of [/<h1>/,/<strong>/,/<table>/,/<blockquote>/,/<pre>/,/已完成/,/未完成/,/\[x\] 普通段落/])assert.match(html,pattern);
});
test('工作区 Markdown 图片相对路径支持父目录，拒绝越过根目录、协议和反斜杠',()=>{
  assert.equal(relativeResource('book/chapters/a.md','../assets/封面.png'),'book/assets/封面.png');assert.equal(relativeResource('a.md','image%20one.png'),'image one.png');
  for(const path of ['../outside.png','https://example.com/a.png','file:///private/a.png','//server/a.png','a\\b.png'])assert.equal(relativeResource('a.md',path),null);
});
