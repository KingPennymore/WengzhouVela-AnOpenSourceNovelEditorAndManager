# iepub

[EPUB](https://www.w3.org/TR/2023/REC-epub-33-20230525/)、[MOBI](https://wiki.mobileread.com/wiki/MOBI)读写库，

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/inkroom/iepub/release.yml?label=CI)
[![Crates.io version](https://img.shields.io/crates/v/iepub.svg)](https://crates.io/crates/iepub)

[English](https://github.com/inkroom/iepub/blob/master/README_EN.md)

## EPUB

支持从文件和内存读取和生成EPUB电子书

### 生成

- 可以使用`EpubBook`结构体手动生成epub
- （推荐）使用`EpubBuilder`快速生成

```rust
use iepub::prelude::EpubHtml;
use iepub::prelude::EpubBuilder;
use iepub::prelude::Direction;

EpubBuilder::default()
    .with_title("书名")
    .with_creator("作者")
    .with_date("2024-03-14")
    .with_description("一本好书")
    .with_identifier("isbn")
    .with_publisher("行星出版社")
    .with_direction(Direction::RTL)
    .add_chapter(
        EpubHtml::default()
            .with_file_name("0.xml")
            .with_title("第一章")
            .with_data("<p>锻炼</p>".to_string().as_bytes().to_vec()),
    )
    .add_chapter(
        EpubHtml::default()
            .with_file_name("1.xml")
            .with_title("第二章")
            .with_direction(crate::prelude::Direction::LTR)
            .with_data("<p>锻炼33333</p>".to_string().as_bytes().to_vec()),
    )
    .add_assets("1.css", "p{color:red}".to_string().as_bytes().to_vec())
    .metadata("s", "d")
    .metadata("h", "m")
    .file("target/build.epub")
    .unwrap();

```

### 读取

```rust
use iepub::prelude::{reader::read_from_vec, reader::read_from_file, EpubHtml};
let mut data = Vec::new();// epub的二进制数据

let mut book = read_from_vec(data);
// 从文件读取
let mut bbook = read_from_file("epub格式文件绝对路径");

```

### 注意事项

- `iepub`使用`EpubHtml`来存储章节内容，但是`EpubHtml#data`实际只会存储 html>body 节点内的内容，其他比如样式表将会存放在其他属性中
- 不同的阅读器对于文件名的兼容性不同，这里建议文件最好使用`.xhtml`后缀，例如`EpubHtml::default().with_file_name("1.xhtml")`


#### 自定义目录

- 如果需要自定义目录，需要调用`custome_nav(true)`,然后调用`add_nav()`添加目录

#### 自动生成封面

自动生成黑底白字，写着书籍名的封面图

需要启用feature `cover`，然后调用`auto_gen_cover(true)`，同时需要调用`with_font(font)`设置字体文件位置。


## mobi

### 读取

```rust
use iepub::prelude::*;

let path = std::env::current_dir().unwrap().join("1.mobi");
let mut mobi = MobiReader::new(std::fs::File::open(path.to_str().unwrap()).unwrap()).unwrap();
let book = mobi.load().unwrap();
```

### 写入

使用`builder`

```rust
let v = MobiBuilder::default()
            .with_title("书名")
            .with_creator("作者")
            .with_date("2024-03-14")
            .with_description("一本好书")
            .with_identifier("isbn")
            .with_publisher("行星出版社")
            .append_title(true)
            .custome_nav(true)
            .add_chapter(MobiHtml::new(1).with_title("标题").with_data("<p>锻炼</p>".as_bytes().to_vec()))
            // .file("builder.mobi")
            .mem()
            .unwrap();
```

#### 自定义目录

- 如果需要自定义目录，需要调用`custome_nav(true)`,然后调用`add_nav()`添加目录
- 为了关联目录nav和章节chap，需要调用`MobiNav#set_chap_id()`指明指向的章节；如果是类似卷首目录，指向最接近的章节即可

#### 图片

- mobi格式中图片是不存在文件路径的，如果需要添加图片，首先在章节中使用 `img` 标签的src属性，随便给个文件名，只要不重复就行，然后添加图片的时候也指向同一个文件名，最后写入就会添加图片了
- 由于mobi设计原因，如果某个图片未被引用，最终仍然会被写入到文件，但是不可索引，不可查看，只能白白占用空间
- 另外封面需要调用`cover()`设置


#### 标题

默认情况下会在章节的html片段前面加一段**标题xml**，如果章节内容里本身就有可阅读的标题，设置`append_title(false)`

#### 自动生成封面

自动生成黑底白字，写着书籍名的封面图

需要启用feature `cover`，然后调用`auto_gen_cover(true)`，同时需要调用`with_font(font)`设置字体文件位置。

## 转换

### mobi -> epub

```rust
use iepub::prelude::*;
let mut book = std::fs::File::open(std::path::PathBuf::from("example.mobi"))
            .map_err(|e| IError::Io(e))
            .and_then(|f| MobiReader::new(f))
            .and_then(|mut f| f.load())
            .unwrap();

let mut epub = mobi_to_epub(&mut book).unwrap();
epub.write("convert.epub").unwrap();
```

### epub -> mobi

```rust
use iepub::prelude::*;
let mut epub = EpubBook::default();

let mobi = epub_to_mobi(&mut epub).unwrap();
let mut v = std::io::Cursor::new(Vec::new());
MobiWriter::new(&mut v)
    .unwrap()
    .with_append_title(false)
    .write(&mobi)
    .unwrap();
```

## 命令行工具

[lib/src/cli](https://github.com/inkroom/iepub/releases)目录为命令行工具，支持mobi和epub格式，但是不同格式支持的命令不尽相同

目前支持
- 获取元数据，如标题、作者
- 修改元数据
- 提取封面
- 提取所有图片
- 提取某章节文本
- 获取目录
- 格式转换
- 电子书合并
- 文本替换
- 电子书瘦身

可通过`-h`获取使用方法说明

可以使用`cargo install iepub`安装

## 缓存

启用**cache** feature可以缓存到文件，适用于爬虫场景重试
