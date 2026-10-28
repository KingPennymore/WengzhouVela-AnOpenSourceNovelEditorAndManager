import {t} from './i18n.mjs';
import {createOutline,outlineText} from './outline.mjs';
import {createMap,mapText} from './map.mjs';
import {fileKind} from './model.mjs';
import {createGlossary,glossaryText} from './glossary.mjs';
import {createVelaV2,velaText} from './vela.mjs';
import {createVelaOdt} from './odf-base.mjs';
// Starter content follows the file format itself: the skeleton a new file of that type needs, not story placeholders.
const code={
  json:'{\n  "name": "",\n  "items": []\n}\n',
  json5:"{\n  // 注释\n  name: '',\n  items: [],\n}\n",
  jsonl:'{"id": 1, "text": ""}\n',
  js:"// @ts-check\n'use strict';\n\nfunction main() {\n}\n\nmain();\n",
  mjs:'export function main() {\n}\n',
  cjs:"'use strict';\n\nmodule.exports = {};\n",
  jsx:'export default function App() {\n  return <div></div>;\n}\n',
  ts:'export function main(): void {\n}\n',
  tsx:'export default function App(): JSX.Element {\n  return <div></div>;\n}\n',
  py:'def main() -> None:\n    pass\n\n\nif __name__ == "__main__":\n    main()\n',
  css:':root {\n}\n\nbody {\n  margin: 0;\n}\n',
  scss:'$color: #333;\n\nbody {\n  color: $color;\n}\n',
  sass:'$color: #333\n\nbody\n  color: $color\n',
  less:'@color: #333;\n\nbody {\n  color: @color;\n}\n',
  xml:'<?xml version="1.0" encoding="UTF-8"?>\n<root>\n</root>\n',
  svg:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">\n</svg>\n',
  yaml:'# YAML\nname: \nitems: []\n',
  toml:'# TOML\n[section]\nkey = ""\n',
  ini:'; INI\n[section]\nkey=\n',
  conf:'# 配置\nkey = value\n',
  cfg:'[section]\nkey = value\n',
  sh:'#!/bin/sh\nset -eu\n\n',
  bash:'#!/usr/bin/env bash\nset -euo pipefail\n\n',
  zsh:'#!/usr/bin/env zsh\n\n',
  java:name=>
    `public class ${name.replace(/\.java$/i,'').replace(/\W/g,'_')||'Main'} {\n    public static void main(String[] args) {\n    }\n}\n`,
  c:'#include <stdio.h>\n\nint main(void) {\n    return 0;\n}\n',
  cpp:'#include <iostream>\n\nint main() {\n    return 0;\n}\n',
  h:name=>{
    const guard=name.toUpperCase().replace(/\W/g,'_');
    return `#ifndef ${guard}\n#define ${guard}\n\n#endif\n`;
  },
  cs:'class Program\n{\n    static void Main(string[] args)\n    {\n    }\n}\n',
  rs:'fn main() {\n}\n',
  go:'package main\n\nfunc main() {\n}\n',
  kt:'fun main() {\n}\n',
  kts:'// Kotlin script\n',
  sql:'-- SQL\nSELECT 1;\n',
  php:'<?php\ndeclare(strict_types=1);\n\n',
  rb:'# frozen_string_literal: true\n\n',
  lua:'local M = {}\n\nreturn M\n',
  r:'# R\n',
  swift:'import Foundation\n\n',
  diff:'--- a/file\n+++ b/file\n',
  bib:'@book{key,\n  author    = {},\n  title     = {},\n  publisher = {},\n  year      = {}\n}\n',
  vue:'<template>\n  <div></div>\n</template>\n\n<script setup>\n</script>\n\n<style scoped>\n</style>\n',
  svelte:'<script>\n</script>\n\n<div></div>\n\n<style>\n</style>\n',
  dockerfile:'FROM alpine\nWORKDIR /app\nCOPY . .\nCMD ["sh"]\n',
  makefile:'.PHONY: all\n\nall:\n\t@echo done\n',
  cmakelists:'cmake_minimum_required(VERSION 3.16)\nproject(app)\n\nadd_executable(app main.cpp)\n'
};
Object.assign(code,{cc:code.cpp,hpp:code.h,patch:code.diff,pyw:code.py,yml:code.yaml});
const codeKey=name=>
  /^(Dockerfile|Makefile|CMakeLists\.txt)$/i.test(name)?name.replace(/\.txt$/i,'').toLowerCase():name.split('.').pop().toLowerCase();
const formats={
  TXT:{
    get label(){
      return t('纯文本');
    },
    get description(){
      return t('纯文本：首行为标题，段落之间空一行；“第一章”等行可被识别为章节。');
    },
    text:()=>'标题\n\n第一段。\n\n第二段。\n'
  },
  MD:{
    get label(){
      return t('Markdown 格式');
    },
    get description(){
      return t('Markdown：标题、强调、列表、引用、链接、表格与代码块的基本写法。');
    },
    text:()=>
      '# 一级标题\n\n段落文字，支持**加粗**、*斜体*和`行内代码`。\n\n## 二级标题\n\n- 无序列表\n- 第二项\n\n1. 有序列表\n2. 第二项\n\n> 引用\n\n[链接文字](https://example.com)\n\n'+
      '| 列一 | 列二 |\n| --- | --- |\n| 内容 | 内容 |\n\n```\n代码块\n```\n'
  },
  CSV:{
    get label(){
      return t('表格格式');
    },
    get description(){
      return t('带表头的表格：第一行为列名，CSV 用逗号、TSV 用制表符分隔。');
    },
    text:name=>{
      const sep=/\.tsv$/i.test(name)?'\t':',';
      return ['列一','列二','列三'].join(sep)+'\n'+['','',''].join(sep)+'\n';
    }
  },
  HTML:{
    get label(){
      return t('HTML 文档');
    },
    get description(){
      return t('完整 HTML5 文档结构：字符集、视口、标题、样式与正文。');
    },
    text:()=>
      '<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="utf-8">\n'+
      '  <meta name="viewport" content="width=device-width,initial-scale=1">\n  <title>标题</title>\n  <style>\n'+
      '    body{max-width:42em;margin:auto;padding:24px;font-family:system-ui;line-height:1.8}\n  </style>\n</head>\n'+
      '<body>\n  <h1>标题</h1>\n  <p>正文。</p>\n</body>\n</html>\n'
  },
  TEX:{
    get label(){
      return t('LaTeX 文档');
    },
    get description(){
      return t('ctexart 中文文档结构：导言区、标题信息与正文；编译需要离线 TeX 组件。');
    },
    text:()=>
      '\\documentclass[UTF8]{ctexart}\n\\usepackage[a4paper,margin=2.5cm]{geometry}\n\n\\title{标题}\n\\author{作者}\n'+
      '\\date{\\today}\n\n\\begin{document}\n\\maketitle\n\n\\section{第一节}\n正文。\n\n\\end{document}\n'
  },
  OUTLINE:{
    get label(){
      return t('大纲结构');
    },
    get description(){
      return t('从空白开始组织剧情树与人物关系图。');
    },
    text:name=>outlineText(createOutline(name.replace(/\.(process|pcs)$/i,'')))
  },
  MAP:{
    get label(){
      return t('地图结构');
    },
    get description(){
      return t('绘制点生成边界，信息点记录地点并链接地图。');
    },
    text:name=>mapText(createMap(name.replace(/\.(velamap|vlmp)$/i,'')))
  },
  GLY:{
    get label(){
      return t('术语库结构');
    },
    get description(){
      return t('使用项目现有术语库结构。');
    },
    text:name=>glossaryText(createGlossary(name))
  },
  VELA:{
    get label(){
      return t('工作区配置结构');
    },
    get description(){
      return t('使用现有 VELA 配置结构。');
    },
    text:name=>velaText(createVelaV2(name.replace(/\.vela$/i,''),{global:name==='.global.vela'}))
  },
  CODE:{
    get label(){
      return t('代码格式');
    },
    get description(){
      return t('按扩展名生成该语言的最小可用结构。');
    },
    text:name=>{
      const value=code[codeKey(name)];
      return typeof value==='function'?value(name):value||'';
    }
  }
};
const kindOf=name=>(/\.(fods|fodp|fodg)$/i.test(name)?null:fileKind(name));
export const templates=[
  {
    id:'empty',
    get label(){
      return t('空白文件');
    },
    kinds:['*'],
    get description(){
      return t('保留所选文件格式，创建空白内容。');
    }
  },
  {
    id:'format',
    get label(){
      return t('格式结构');
    },
    kinds:Object.keys(formats),
    get description(){
      return t('按文件格式生成基本结构。');
    }
  }
];
export function templatesFor(name){
  const kind=kindOf(name),
    format=formats[kind];
  if(!format||(kind==='CODE'&&!code[codeKey(name)]))return [templates[0]];
  return [templates[0],{...templates[1],label:format.label,description:format.description}];
}
export function templateText(name,id,settings){
  if(/\.(odt|ott|ods|ots|odp|otp|odg|otg)$/i.test(name))
    throw Error(t('二进制 ODF 请先创建 .vodt 或 Flat ODF 文稿，再从组件导出对应格式。'));
  const kind=fileKind(name);
  if(!templatesFor(name).some(t=>t.id===id))throw Error(t('此模板不适用于当前文件格式。'));
  // Structured formats must stay parseable even when blank.
  if(kind==='OUTLINE'){
    const value=createOutline(name.replace(/\.(process|pcs)$/i,''));
    value.view=settings?.outline?.defaultView==='relations'?'relations':'outline';
    return outlineText(value);
  }
  if(kind==='MAP'){
    const value=createMap(name.replace(/\.(velamap|vlmp)$/i,''));
    value.grid={orientation:settings?.map?.orientation||value.grid.orientation,size:settings?.map?.hexSize||value.grid.size};
    value.drawing.distance=settings?.map?.neighborDistance??value.drawing.distance;
    return mapText(value);
  }
  if(['GLY','VELA'].includes(kind))return formats[kind].text(name);
  if(kind==='VODT'){
    const match=/\.(fods|fodp|fodg)$/i.exec(name);
    if(match){
      const type={fods:'spreadsheet',fodp:'presentation',fodg:'graphics'}[match[1].toLowerCase()],
        body=type==='graphics'?'drawing':type;
      return createVelaOdt()
        .replace('application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.'+type)
        .replace('<office:text><text:p/></office:text>','<office:'+body+'/>')
        .replace(' vela:profile="1"','');
    }
    return createVelaOdt([]);
  }
  return id==='empty'?'':formats[kind].text(name);
}
