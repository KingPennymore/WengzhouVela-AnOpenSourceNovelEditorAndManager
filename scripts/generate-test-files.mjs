import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

// Run explicitly to regenerate the public, synthetic test workspace.
const root=resolve('测试文件'),files=new Map();
const add=(path,text)=>files.set(path,text.trim()+'\n');
add('正文/航路.txt',`文舟测试小说：航路

第一章 灯塔
　　海雾散开时，林舟在灯塔下发现了一本航海日志。“今天向东航行。”她写道。
　　这一段用于测试 Tab 两个全角空格缩进、中文选区、自动换行与撤回重做。

第二章 航路
${Array.from({length:80},(_,i)=>`　　第 ${i+1} 条航海记录：风从南方吹来，船驶向尚未命名的岛屿。`).join('\n')}

【三】归航
　　这一标题使用 .vela 中的自定义标题模板。尝试章节跳转和阅读进度恢复。

Chapter 4 Home
The harbour lights appeared at dawn. This heading tests English chapter detection.`);
add('正文/设定.md',`# 航路：人物设定

## 人物

| 姓名 | 身份 | 目标 |
| --- | --- | --- |
| 林舟 | 领航员 | 找到新航路 |
| 星澜 | 灯塔管理员 | 修复航海日志 |

- [x] 第一章提纲
- [ ] 第二章修订

> 所有内容都是虚构测试数据。

**粗体**、*斜体*、~~删除线~~ 与 \`行内代码\`。

行内公式 $E=mc^2$，块公式：

$$
\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}
$$

\`\`\`javascript
const chapter = { title: '灯塔', words: 1200 };
console.log(chapter.title);
\`\`\``);
add('正文/人物.csv',`姓名,身份,备注
林舟,领航员,"逗号,引号""和中文"
星澜,管理员,"第一行
第二行"
远帆,船长,`);
add('正文/年表.tsv',`时间\t事件\t地点
清晨\t启航\t灯塔
午后\t抵达\t海岛`);
add('HTML/index.html',`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>航路 · HTML 嵌入预览</title>
  <link rel="stylesheet" href="styles/page.css">
</head>
<body>
  <main class="book">
    <img class="cover" src="assets/cover.svg" alt="虚构小说航路的测试封面">
    <p class="eyebrow">VELA TEST WORKSPACE</p>
    <h1>航路</h1>
    <p>在文件标签右侧点击“预览”，这张页面应留在原来的源码区域中。</p>
    <section><h2>第一章 灯塔</h2><p>清晨，领航员在旧日志中发现了一条通往东方的航路。</p></section>
    <section><h2>第二章 海岛</h2><p>本地样式、SVG 图片、表格和窄屏布局都应正常显示。</p></section>
    <table><thead><tr><th>章节</th><th>进度</th></tr></thead><tbody><tr><td>灯塔</td><td>已完成</td></tr><tr><td>海岛</td><td>修订中</td></tr></tbody></table>
    <a href="../正文/设定.md">本地相对链接</a>
  </main>
</body>
</html>`);
add('HTML/styles/page.css',`@import url('./palette.css');
* { box-sizing: border-box; }
html { color-scheme: light dark; }
body { margin: 0; background: var(--background); color: var(--ink); font-family: system-ui, sans-serif; line-height: 1.8; }
.book { max-width: 760px; margin: auto; padding: 24px; }
.cover { display: block; width: 120px; max-width: 100%; float: right; margin: 0 0 18px 18px; }
.eyebrow { color: var(--accent); letter-spacing: .12em; font-size: .75rem; }
h1, h2 { color: var(--accent); }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid var(--accent); padding: 8px; text-align: left; }
@media (max-width: 420px) { .book { padding: 16px; } .cover { width: 80px; } }`);
add('HTML/styles/palette.css',`:root { --background: #f5faf6; --ink: #263b30; --accent: #23744e; }
@media (prefers-color-scheme: dark) { :root { --background: #17241b; --ink: #d6e7da; --accent: #8ad0a8; } }`);
add('HTML/assets/cover.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320">
  <rect width="240" height="320" rx="16" fill="#23744e"/>
  <path d="M35 220 Q120 100 205 220 M35 245 Q120 125 205 245" fill="none" stroke="#c5e4ce" stroke-width="4"/>
  <text x="120" y="110" text-anchor="middle" fill="white" font-family="sans-serif" font-size="42">航路</text>
  <text x="120" y="280" text-anchor="middle" fill="#c5e4ce" font-size="16">VELA TEST</text>
</svg>`);
add('HTML/交互测试.html',`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>独立预览交互测试</title></head>
<body><h1>独立预览交互测试</h1><p>嵌入预览中脚本不执行。点击“独立预览”，再开启“脚本”可测试本地交互。</p>
<button id="count">点击计数：0</button><output id="status">脚本未运行</output>
<script src="scripts/counter.js"></script></body></html>`);
add('HTML/scripts/counter.js',`let count = 0;
const button = document.querySelector('#count');
document.querySelector('#status').textContent = '本地脚本已运行';
button.addEventListener('click', () => { count += 1; button.textContent = '点击计数：' + count; });`);
add('LaTeX/main.tex',String.raw`% 使用 XeLaTeX 编译：中文、公式、多文件工程、本地宏包、文献与索引。
\documentclass[UTF8]{ctexart}
\usepackage{amsmath}
\usepackage{makeidx}
\usepackage{macros/vela-demo}
\makeindex
\title{航路：LaTeX 测试文稿}
\author{Vela Test Authors}
\date{2026年10月2日}
\begin{document}
\maketitle
\tableofcontents
\input{chapters/story.tex}
\section{公式与引用}
\label{sec:math}
\begin{align}
E &= mc^2 \\
\sum_{k=1}^{n} k &= \frac{n(n+1)}{2}
\end{align}
\velanote{这句话由工程内的自定义宏包生成。}
参见第\ref{sec:story}节与测试文献\cite{vela2026}。航路\index{航路}。
\bibliographystyle{plain}
\bibliography{references}
\printindex
\end{document}`);
add('LaTeX/chapters/story.tex',String.raw`\section{灯塔与航路}
\label{sec:story}
　　海雾散开时，林舟走进灯塔。这里是通过 \verb|\input| 导入的子文件。
\subsection{航海记录}
\begin{enumerate}
  \item 中文排版与章节标题。
  \item 多遍编译后的交叉引用。
  \item BibTeX 文献与 MakeIndex 索引。
\end{enumerate}`);
add('LaTeX/macros/vela-demo.sty',String.raw`\NeedsTeXFormat{LaTeX2e}
\ProvidesPackage{vela-demo}[2026/10/02 Vela synthetic test package]
\newcommand{\velanote}[1]{\par\noindent\textbf{Vela 测试：} #1\par}
\endinput`);
add('LaTeX/references.bib',`@book{vela2026,
  author = {Vela Test Authors},
  title = {The Imaginary Harbour},
  year = {2026},
  publisher = {Synthetic Test Press}
}`);
add('LaTeX/latin.tex',String.raw`% 可使用 pdfLaTeX 编译，无中文字体依赖。
\documentclass{article}
\usepackage{amsmath}
\begin{document}
\section{Vela PDF test}
This document tests the pdfLaTeX engine.
\[ a^2+b^2=c^2 \]
\end{document}`);
const code={
  'example.js':`export const novel = { title: 'Harbour', chapters: ['Lighthouse', 'Island'] };
export function chapterTitle(index) { return novel.chapters[index] ?? 'Untitled'; }
console.log(chapterTitle(0));`,
  'example.ts':`interface Chapter { title: string; words: number; }
const chapters: Chapter[] = [{ title: 'Lighthouse', words: 1200 }];
export const totalWords = (items: Chapter[]): number => items.reduce((sum, item) => sum + item.words, 0);`,
  'example.jsx':`export function ChapterCard({ title = 'Lighthouse' }) {
  return <article className="chapter"><h2>{title}</h2><p>Fictional test content.</p></article>;
}`,
  'example.tsx':`type Props = { title: string };
export function ChapterCard({ title }: Props) { return <article><h2>{title}</h2></article>; }`,
  'example.py':`from dataclasses import dataclass

@dataclass
class Chapter:
    title: str
    words: int

def total_words(chapters: list[Chapter]) -> int:
    return sum(chapter.words for chapter in chapters)

print(total_words([Chapter("Lighthouse", 1200)]))`,
  'example.json':`{"title":"Harbour","chapters":[{"number":1,"title":"Lighthouse"}],"published":false,"notes":null}`,
  'example.json5':`// Test comments and trailing commas.
{ title: 'Harbour', published: false, chapters: [1, 2,], }`,
  'example.jsonl':`{"chapter":1,"title":"Lighthouse"}
{"chapter":2,"title":"Island"}`,
  'example.xml':`<?xml version="1.0" encoding="UTF-8"?>
<novel title="Harbour"><chapter number="1"><title>Lighthouse</title></chapter></novel>`,
  'example.yaml':`title: Harbour
published: false
chapters:
  - number: 1
    title: Lighthouse`,
  'example.toml':`title = "Harbour"
published = false
[[chapters]]
number = 1
title = "Lighthouse"`,
  'example.ini':`[novel]
title=Harbour
published=false
[chapter_1]
title=Lighthouse`,
  'example.css':`.chapter { display: grid; gap: 16px; padding: 24px; color: #23744e; }
.chapter:hover { background: #e3f0e7; }`,
  'example.scss':`$accent: #23744e;
.chapter { color: $accent; h2 { font-size: 1.5rem; } }`,
  'example.less':`@accent: #23744e;
.chapter { color: @accent; h2 { font-size: 1.5rem; } }`,
  'example.sass':`$accent: #23744e
.chapter
  color: $accent
  padding: 24px`,
  'example.sh':`#!/bin/sh
# Prints synthetic data only; this is a source-format fixture.
title="Harbour"
for chapter in Lighthouse Island; do
  printf '%s: %s\\n' "$title" "$chapter"
done`,
  'Example.java':`public class Example {
    record Chapter(String title, int words) {}
    public static void main(String[] args) { System.out.println(new Chapter("Lighthouse", 1200)); }
}`,
  'example.c':`#include <stdio.h>
int main(void) { const char *title = "Lighthouse"; printf("%s\\n", title); return 0; }`,
  'example.h':`#ifndef VELA_CHAPTER_H
#define VELA_CHAPTER_H
struct Chapter { const char *title; int words; };
#endif`,
  'example.cpp':`#include <iostream>
#include <string>
struct Chapter { std::string title; int words; };
int main() { Chapter chapter{"Lighthouse", 1200}; std::cout << chapter.title << '\\n'; }`,
  'example.hpp':`#pragma once
#include <string>
struct Novel { std::string title; unsigned int chapters; };`,
  'Example.cs':`using System;
public record Chapter(string Title, int Words);
public class Example { public static void Main() { Console.WriteLine(new Chapter("Lighthouse", 1200)); } }`,
  'example.rs':`struct Chapter { title: String, words: usize }
fn main() { let chapter = Chapter { title: "Lighthouse".into(), words: 1200 }; println!("{}: {}", chapter.title, chapter.words); }`,
  'example.go':`package main
import "fmt"
type Chapter struct { Title string; Words int }
func main() { chapter := Chapter{Title: "Lighthouse", Words: 1200}; fmt.Println(chapter.Title) }`,
  'example.kt':`data class Chapter(val title: String, val words: Int)
fun main() { val chapter = Chapter("Lighthouse", 1200); println(chapter.title) }`,
  'example.sql':`CREATE TABLE chapters (id INTEGER PRIMARY KEY, title TEXT NOT NULL, words INTEGER);
INSERT INTO chapters VALUES (1, 'Lighthouse', 1200);
SELECT title, words FROM chapters WHERE words > 1000 ORDER BY id;`,
  'example.php':`<?php
declare(strict_types=1);
$chapter = ['title' => 'Lighthouse', 'words' => 1200];
echo $chapter['title'];
?>`,
  'example.rb':`Chapter = Struct.new(:title, :words)
chapter = Chapter.new('Lighthouse', 1200)
puts "#{chapter.title}: #{chapter.words}"`,
  'example.lua':`local chapter = { title = "Lighthouse", words = 1200 }
local function describe(value)
  return value.title .. ": " .. value.words
end
print(describe(chapter))`,
  'example.r':`chapters <- data.frame(title = c("Lighthouse", "Island"), words = c(1200, 900))
total_words <- sum(chapters$words)
print(total_words)`,
  'example.swift':`struct Chapter { let title: String; let words: Int }
let chapter = Chapter(title: "Lighthouse", words: 1200)
print(chapter.title)`,
  'example.vue':`<script setup>
const title = 'Lighthouse';
</script>
<template><article><h2>{{ title }}</h2></article></template>
<style scoped>article { color: #23744e; }</style>`,
  'example.svelte':`<script>let title = 'Lighthouse';</script>
<article><h2>{title}</h2></article>
<style>article { color: #23744e; }</style>`,
  'example.diff':`--- a/chapter.txt
+++ b/chapter.txt
@@ -1,2 +1,2 @@
 第一章 灯塔
-旧的航海记录。
+新的航海记录。`,
  'Dockerfile':`FROM alpine:3.22
WORKDIR /novel
COPY . /novel
CMD ["echo", "Vela synthetic fixture"]`,
  'Makefile':`.PHONY: info
info:
\t@echo "Vela synthetic fixture"`,
  'CMakeLists.txt':`cmake_minimum_required(VERSION 3.20)
project(VelaFixture LANGUAGES C)
add_executable(vela_fixture example.c)`
};
for(const [name,text] of Object.entries(code))add('代码/'+name,text);
add('README.md',`# 文舟公开测试工作区

所有人物、故事、代码和配置均为虚构测试数据，不含账户、令牌、设备标识或个人文件。

## 如何使用

1. 在文舟 GitHub 页面拉取本仓库的“测试文件”文件夹，或订阅本仓库后选择“仅拉取阅读清单”。保留文件的相对路径。
2. 阅读页应出现清单中的所有测试文稿；打开 TXT 切换上下 / 左右阅读，测试章节目录、字号和阅读进度恢复。
3. 打开 HTML/index.html，点击文件标签右侧“预览”。页面嵌入源码区，顶栏和文件标签保留；本地 CSS、CSS @import 和 SVG 封面应显示。
4. HTML/交互测试.html 的脚本仅用于独立预览；开启脚本后点击计数按钮。嵌入预览默认不执行脚本、不联网。
5. 打开 LaTeX/main.tex，选择 XeLaTeX，编译并导出 PDF。中文、目录、公式、多文件导入、自定义宏包、文献与索引都应显示。LaTeX/latin.tex 可使用 pdfLaTeX。
6. 打开代码文件，在源码视图输入前缀，再按 Ctrl+Space 查看补全；Enter 接受、Esc 关闭，Tab 仍为两个全角空格。检查关键字、字符串、注释与标签的高亮。
7. CSV 测试逗号、引号、空值和多行单元格；TSV 测试制表符分隔；Markdown 测试表格、任务列表、公式及代码块。

代码文件供高亮、补全与只读显示测试，文舟不会执行这些程序；补全包含语言提供器、常用关键字和文稿词语，不能替代 IDE 的工程语义分析。

LaTeX/macros/vela-demo.sty 为自包含宏包示例，可放在工作区直接使用。将其打包为插件的方法见仓库 docs/PLUGINS.md。LaTeX 子目录有独立 .vela，确保 TEX 工程根路径正确。

## 文件目录

${[...files.keys()].map(name=>'- '+name).join('\n')}

顶层 .vela 与 LaTeX/.vela 记录阅读清单、字号和标题模板。工作区测试清单包含所有可阅读样例，不包含配置文件本身。`);
const reading=[...files.keys()].sort();
add('.vela',JSON.stringify({version:1,name:'文舟格式与阅读测试',fontSize:18,titleTemplates:['【{number}】{title}'],reading:{files:reading}},null,2));
add('LaTeX/.vela',JSON.stringify({version:1,name:'LaTeX 编译测试',fontSize:18,titleTemplates:[],reading:{files:reading.filter(name=>name.startsWith('LaTeX/')).map(name=>name.slice('LaTeX/'.length))}},null,2));
for(const [path,text] of files){const target=resolve(root,path);if(!target.startsWith(root+'\\')&&!target.startsWith(root+'/'))throw Error('Invalid fixture path');await mkdir(dirname(target),{recursive:true});await writeFile(target,text);}
console.log(`已生成 ${files.size} 个公开测试文件，其中 ${reading.length} 个阅读文件。`);
