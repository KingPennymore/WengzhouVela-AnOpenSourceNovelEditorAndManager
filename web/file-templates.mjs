import {fileKind} from './model.mjs';
import {createGlossary,glossaryText} from './glossary.mjs';
import {createVelaV2,velaText} from './vela.mjs';
import {createVelaOdt} from './odf-base.mjs';
export const templates=[
 {id:'empty',label:'空白文件',kinds:['*'],description:'保留所选文件格式，创建空白内容。'},
 {id:'chapters',label:'小说正文',kinds:['TXT','MD','VODT'],description:'第一章、第二章及正文占位。'},
 {id:'outline',label:'故事大纲',kinds:['TXT','MD','VODT'],description:'梗概、人物目标、冲突、转折与结局。'},
 {id:'character',label:'人物设定',kinds:['TXT','MD','VODT'],description:'身份、外貌、性格、动机、关系与人物弧光。'},
 {id:'world',label:'世界观设定',kinds:['TXT','MD','VODT'],description:'地理、历史、社会规则与专有名词。'},
 {id:'plan',label:'章节规划表',kinds:['CSV'],description:'章节、视角、地点、事件、目标字数、进度。'},
 {id:'html',label:'阅读页',kinds:['HTML'],description:'离线可用、适合移动阅读的 HTML 文稿。'},
 {id:'tex',label:'中文文稿排版',kinds:['TEX'],description:'ctexart 中文文稿；编译仍需现有离线 TeX 组件。'},
 {id:'glossary',label:'术语库',kinds:['GLY'],description:'使用项目现有术语库结构。'},
 {id:'workspace',label:'工作区配置',kinds:['VELA'],description:'使用现有 VELA 配置结构。'}
];
export const templatesFor=name=>templates.filter(t=>t.kinds.includes('*')||!/^.*\.(fods|fodp|fodg)$/i.test(name)&&t.kinds.includes(fileKind(name)));
export function templateText(name,id){
 if(/\.(odt|ott|ods|ots|odp|otp|odg|otg)$/i.test(name))throw Error('二进制 ODF 请先创建 .vodt 或 Flat ODF 文稿，再从组件导出对应格式。');
 const kind=fileKind(name),template=templatesFor(name).find(t=>t.id===id);if(!template)throw Error('此模板不适用于当前文件格式。');
 if(kind==='GLY')return glossaryText(createGlossary(name));if(kind==='VELA')return velaText(createVelaV2(name.replace(/\.vela$/i,'')));
 const sections={chapters:['第一章','第二章'],outline:['故事梗概','人物目标','核心冲突','关键转折','结局'],character:['姓名与身份','外貌与习惯','性格与缺点','动机与目标','人物关系','成长与转变'],world:['地理与地点','历史与时间线','社会与文化','规则与限制','专有名词']};
 const lines=id==='empty'?[]:sections[id];
 if(kind==='VODT'){const match=/\.(fods|fodp|fodg)$/i.exec(name);if(match){const type={fods:'spreadsheet',fodp:'presentation',fodg:'graphics'}[match[1].toLowerCase()],body=type==='graphics'?'drawing':type;return createVelaOdt().replace('application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.'+type).replace('<office:text><text:p/></office:text>','<office:'+body+'/>').replace(' vela:profile="1"','');}return createVelaOdt(lines||[]);}
 if(lines)return lines.map(s=>(kind==='MD'?'# ':'')+s+'\n\n').join('\n');
 if(id==='plan')return (name.toLowerCase().endsWith('.tsv')?'章节\t视角\t地点\t核心事件\t目标字数\t状态\n第一章\t\t\t\t3000\t待写\n':'章节,视角,地点,核心事件,目标字数,状态\n第一章,,,,3000,待写\n');
 if(id==='html')return '<!doctype html>\n<html lang="zh-CN">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文稿</title><style>body{max-width:42em;margin:auto;padding:24px;font-family:system-ui;line-height:1.9}p{text-indent:2em}</style></head>\n<body><h1>第一章</h1><p>在这里开始写作。</p></body>\n</html>\n';
 if(id==='tex')return '\\documentclass[UTF8]{ctexart}\n\\usepackage[a4paper,margin=2.5cm]{geometry}\n\\title{文稿标题}\n\\author{作者}\n\\date{}\n\\begin{document}\n\\maketitle\n\\section{第一章}\n在这里开始写作。\n\\end{document}\n';
 return '';
}
