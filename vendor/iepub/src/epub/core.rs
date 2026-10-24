use std::collections::HashMap;
use std::fmt::{Debug, Display};
use std::io::Write;
use std::sync::{Arc, Mutex};

use super::common::{self};
use super::html::{get_html_info, to_html};
use crate::cache_struct;
use crate::common::{escape_xml, urldecode_enhanced, IError, IResult};
use crate::epub::common::LinkRel;
use crate::epub::html;
use crate::parser::HtmlParser;
crate::cache_enum! {
    #[derive(Clone)]
    pub enum Direction {
        RTL,
        LTR,
        CUS(String),
    }
}

impl Display for Direction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Direction::RTL => f.write_str("rtl"),
            Direction::LTR => f.write_str("ltr"),
            Direction::CUS(v) => f.write_fmt(format_args!("{}", escape_xml(v))),
        }
    }
}

impl From<String> for Direction {
    fn from(value: String) -> Self {
        if value.eq_ignore_ascii_case("rtl") {
            Direction::RTL
        } else if value.eq_ignore_ascii_case("ltr") {
            Direction::LTR
        } else {
            Direction::CUS(value)
        }
    }
}

macro_rules! epub_base_field{
    (
     // meta data about struct
     $(#[$meta:meta])*
     $vis:vis struct $struct_name:ident {
        $(
        // meta data about field
        $(#[$field_meta:meta])*
        $field_vis:vis $field_name:ident : $field_type:ty
        ),*$(,)?
    }
    ) => {

            crate::cache_struct!{
                $(#[$meta])*
                pub struct $struct_name{

                    pub(crate) id:String,
                    pub(crate) _file_name:String,
                    pub(crate) media_type:String,
                    _data: Option<Vec<u8>>,
                    #[cfg(not(feature="cache"))]
                    reader:Option<std::sync::Arc<std::sync::Mutex< Box<dyn EpubReaderTrait+Send+Sync>>>>,
                    #[cfg(feature="cache")]
                    #[serde(skip)]
                    reader:Option<std::sync::Arc<std::sync::Mutex< Box<dyn EpubReaderTrait+Send+Sync>>>>,
                    $(
                        $(#[$field_meta])*
                        $field_vis $field_name : $field_type,
                    )*

                }
            }

            impl $struct_name {
                ///
                /// 文件路径
                ///
                /// 注意，如果是 EPUB 目录下的文件，返回的时候不会带有EPUB路径
                ///
                pub fn file_name(&self)->&str{
                    self._file_name.as_str()
                }
                ///
                /// 设置文件路径
                ///
                pub fn set_file_name<T:Into<String>>(&mut self,value: T){
                    self._file_name = value.into();
                }

                pub fn id(&self)->&str{
                    self.id.as_str()
                }
                pub fn set_id<T:Into<String>>(&mut self,id: T){
                    self.id = id.into();
                }

                pub fn set_data(&mut self, data: Vec<u8>) {
                    // if let Some(d) = &mut self._data {
                    //     d.clear();
                    //     d.append(data);
                    // }else{
                        self._data = Some(data);
                    // }
                }
                pub fn with_file_name<T: Into<String>>(mut self,value: T)->Self{
                    self.set_file_name(value);
                    self
                }

                pub fn with_data(mut self, value:Vec<u8>)->Self{
                    self.set_data(value);
                    self
                }

            }


    }
}

crate::cache_struct! {
    /**
     * 链接文件，可能是css
     */
    #[derive(Debug, Clone)]
    pub struct EpubLink {
        pub rel: LinkRel,
        pub file_type: String,
        pub href: String,
        pub data: Vec<u8>,
    }
}

epub_base_field! {
    #[derive(Default, Clone)]
    pub struct EpubHtml {
        pub(crate) lang: String,
        links: Option<Vec<EpubLink>>,
        /// 章节名称
        title: String,
        /// 自定义的css
        css: Option<String>,
        /// 文件初始内容
        raw_data:Option<String>,
        /// 方向
        pub(crate) direction: Option<Direction>,
        /// body 标签上的attribute
        pub(crate) body_attribute: Option<Vec<u8>>,
    }
}

impl Debug for EpubHtml {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("EpubHtml")
            .field("id", &self.id)
            .field("_file_name", &self._file_name)
            .field("media_type", &self.media_type)
            .field("_data", &self._data)
            .field("lang", &self.lang)
            .field("links", &self.links)
            .field("title", &self.title)
            .field("css", &self.css)
            .finish()
    }
}

impl EpubHtml {
    const PREFIXES: [&str; 4] = ["", common::EPUB, common::EPUB3, "OPS/"];

    pub fn string_data(&mut self) -> String {
        if self._data.is_none() {
            self.data_mut();
        }
        if let Some(data) = &mut self._data {
            String::from_utf8(data.clone()).unwrap_or_else(|_e| String::new())
        } else {
            String::new()
        }
    }

    pub fn data(&self) -> Option<&[u8]> {
        self._data.as_deref()
    }

    pub fn parser(&mut self) -> Option<HtmlParser> {
        let mut obj = None;
        let html = self.string_data();
        if !html.is_empty() {
            let mut parser = HtmlParser::new();
            if parser.parse(&html).is_ok() {
                obj = Some(parser);
            }
        }
        obj
    }

    pub(crate) fn read_data(&mut self, reader: &mut impl EpubReaderTrait) {
        let (id, origin) = if let Some(index) = self._file_name.find('#') {
            (
                Some(&self._file_name[(index + 1)..]),
                self._file_name[0..index].to_string(),
            )
        } else {
            (None, self.file_name().to_string())
        };
        let mut f = String::from(self._file_name.as_str());
        if self._data.is_none() && !f.is_empty() {
            for prefix in EpubHtml::PREFIXES.iter() {
                // 添加 前缀再次读取
                f = format!("{prefix}{origin}");
                let d = reader.read_string(f.as_str());
                match d {
                    Ok(v) => {
                        if let Ok(html::HtmlInfo {
                            title,
                            content,
                            language,
                            direction,
                            mut link,
                            style,
                            body_attribute,
                        }) = get_html_info(v.as_str(), id)
                        {
                            if !title.is_empty() {
                                self.set_title(&title);
                            }
                            self.set_data(content);
                            if let Some(lang) = language {
                                self.set_language(lang);
                            }
                            self.direction = direction;
                            // css link 需要读取内容
                            for ele in link.iter_mut() {
                                // ele.data = Vec::new();
                                if ele.href.starts_with("https://")
                                    || ele.href.starts_with("http://")
                                {
                                    // 远程的,不支持
                                    // if let Ok(get) = reqwest::blocking::get(ele.href.as_str()).and_then(|f|f.bytes()) {
                                    //     ele.data = get.to_vec();
                                    // }
                                } else {
                                    // 本地的
                                    let l = format!(
                                        "{prefix}{}",
                                        crate::path::Path::system(self._file_name.as_str())
                                            .pop()
                                            .join(ele.href.as_str())
                                            .to_str()
                                    );
                                    if let Ok(vs) = reader.read_file(l.as_str()) {
                                        ele.data = vs;
                                    }
                                }
                            }
                            if !link.is_empty() {
                                self.links = Some(link);
                            }
                            self.css = style;
                            self.body_attribute = body_attribute;
                        }
                        break;
                    }
                    Err(IError::FileNotFound) => {}
                    Err(_e) => {
                        break;
                    }
                }
            }
        }
    }

    ///
    /// 获取数据
    ///
    /// 支持延迟读取
    ///
    pub fn data_mut(&mut self) -> Option<&[u8]> {
        let (id, origin) = if let Some(index) = self._file_name.find('#') {
            (
                Some(&self._file_name[(index + 1)..]),
                self._file_name[0..index].to_string(),
            )
        } else {
            (None, self.file_name().to_string())
        };
        let mut f = String::from(self._file_name.as_str());
        if self._data.is_none() && self.reader.is_some() && !f.is_empty() {
            for prefix in EpubHtml::PREFIXES.iter() {
                // 添加 前缀再次读取
                f = format!("{prefix}{origin}");
                let s = self.reader.as_mut().unwrap();
                let mut r = s.lock().unwrap();
                let d = r.read_string(f.as_str());
                match d {
                    Ok(v) => {
                        if let Ok(html::HtmlInfo {
                            title,
                            content,
                            language,
                            direction,
                            mut link,
                            style,
                            body_attribute,
                        }) = get_html_info(v.as_str(), id)
                        {
                            if !title.is_empty() {
                                // self.set_title(&title);
                                self.title = title;
                            }
                            self._data = Some(content);
                            // self.set_data(content);
                            if let Some(lang) = language {
                                // self.set_language(lang);
                                self.lang = lang;
                            }
                            self.direction = direction;
                            for ele in &mut link {
                                // ele.data = Vec::new();
                                if ele.href.starts_with("https://")
                                    || ele.href.starts_with("http://")
                                {
                                    // 远程的,不支持
                                    // if let Ok(get) = reqwest::blocking::get(ele.href.as_str()).and_then(|f|f.bytes()) {
                                    //     ele.data = get.to_vec();
                                    // }
                                } else {
                                    // 本地的
                                    let l = format!(
                                        "{prefix}{}",
                                        crate::path::Path::system(self._file_name.as_str())
                                            .pop()
                                            .join(ele.href.as_str())
                                            .to_str()
                                    );
                                    if let Ok(vs) = r.read_file(l.as_str()) {
                                        ele.data = vs;
                                    }
                                }
                            }

                            if !link.is_empty() {
                                self.links = Some(link);
                            }
                            self.css = style;
                            self.body_attribute = body_attribute;
                        }
                        break;
                    }
                    Err(IError::FileNotFound) => {}
                    Err(_e) => {
                        break;
                    }
                }
            }
        }
        self._data.as_deref()
    }

    pub fn release_data(&mut self) {
        if let Some(data) = &mut self._data {
            data.clear();
        }
        self._data = None;
    }

    pub fn format(&mut self) -> Option<String> {
        self.data_mut();
        Some(to_html(self, false, &None))
    }

    pub fn raw_data(&mut self) -> Option<&str> {
        let (_id, origin) = if let Some(index) = self._file_name.find('#') {
            (
                Some(&self._file_name[(index + 1)..]),
                self._file_name[0..index].to_string(),
            )
        } else {
            (None, self.file_name().to_string())
        };
        let mut f = String::from(self._file_name.as_str());
        if self.raw_data.is_none() && self.reader.is_some() && !f.is_empty() {
            for prefix in EpubHtml::PREFIXES.iter() {
                // 添加 前缀再次读取
                f = format!("{prefix}{origin}");
                if let Some(mut s) = self.reader.as_mut().and_then(|m| m.lock().ok()) {
                    let d = s.read_string(f.as_str());
                    if let Ok(data) = d {
                        self.raw_data = Some(data);
                    }
                }
            }
        }
        self.raw_data.as_deref()
    }

    pub fn release_raw_data(&mut self) {
        if let Some(data) = &mut self.raw_data {
            data.clear();
        }
        self.raw_data = None;
    }

    pub fn set_title<T: Into<String>>(&mut self, title: T) {
        self.title = title.into();
    }

    pub fn with_title<T: Into<String>>(mut self, title: T) -> Self {
        self.set_title(title);

        self
    }

    pub fn title(&self) -> &str {
        &self.title
    }

    pub fn set_css<T: Into<String>>(&mut self, css: T) {
        self.css = Some(css.into());
    }
    pub fn with_css<T: Into<String>>(mut self, css: T) -> Self {
        self.set_css(css);
        self
    }
    pub fn css(&self) -> Option<&str> {
        self.css.as_deref()
    }

    pub fn set_language<T: Into<String>>(&mut self, lang: T) {
        self.lang = lang.into();
    }

    pub fn with_language<T: Into<String>>(mut self, lang: T) -> Self {
        self.set_language(lang);
        self
    }

    pub fn links(&self) -> Option<std::slice::Iter<'_, EpubLink>> {
        self.links.as_ref().map(|f| f.iter())
    }

    pub fn links_mut(&mut self) -> Option<std::slice::IterMut<'_, EpubLink>> {
        self.links.as_mut().map(|f| f.iter_mut())
    }

    pub fn add_link(&mut self, link: EpubLink) {
        if let Some(links) = &mut self.links {
            links.push(link);
        } else {
            self.links = Some(vec![link]);
        }
    }

    pub fn with_link(mut self, link: Vec<EpubLink>) -> Self {
        self.links = Some(link);
        self
    }

    fn get_links(&mut self) -> Option<&mut Vec<EpubLink>> {
        self.links.as_mut()
    }

    pub fn set_direction(&mut self, dir: Direction) {
        self.direction = Some(dir);
    }

    pub fn with_direction(mut self, dir: Direction) -> Self {
        self.set_direction(dir);
        self
    }
}

epub_base_field! {
///
/// 非章节资源
///
/// 例如css，字体，图片等
///
#[derive(Default,Clone)]
pub struct EpubAssets {
   pub(crate) version:String,
}
}

impl EpubAssets {
    pub fn with_version<T: Into<String>>(&mut self, version: T) {
        self.version = version.into();
    }

    pub fn data(&self) -> Option<&[u8]> {
        self._data.as_deref()
    }

    pub fn data_mut(&mut self) -> Option<&[u8]> {
        let mut f = String::from(self._file_name.as_str());
        if self._data.is_none()
            && self.reader.is_some()
            && !f.is_empty()
            && self._data.is_none()
            && self.reader.is_some()
            && !f.is_empty()
        {
            for prefix in EpubHtml::PREFIXES.iter() {
                let s = self.reader.as_mut().unwrap();
                // 添加 前缀再次读取
                f = format!("{prefix}{}", self._file_name);
                let d = s.lock().unwrap().read_file(f.as_str());
                if let Ok(v) = d {
                    self.set_data(v);
                    break;
                }
                // 有的文件名被url编码了，所以这里加一个解码后的读取
                if let Ok(fname) = urldecode_enhanced(self._file_name.as_str()) {
                    f = format!("{prefix}{}", fname);
                    let d = s.lock().unwrap().read_file(f.as_str());
                    if let Ok(v) = d {
                        self.set_data(v);
                        break;
                    }
                }
            }
        }
        self._data.as_deref()
    }

    pub fn write_to<W: Write>(&mut self, writer: &mut W) -> IResult<()> {
        if let Some(data) = self.data_mut() {
            writer.write_all(data)?;
            writer.flush()?;
        }
        Ok(())
    }

    pub fn save_to<T: AsRef<str>>(&mut self, file_path: T) -> IResult<()> {
        let mut f: String = self._file_name.clone();
        if self.reader.is_some() && !f.is_empty() {
            for prefix in EpubHtml::PREFIXES.iter() {
                if let Some(mut s) = self.reader.as_mut().and_then(|m| m.lock().ok()) {
                    f = format!("{prefix}{}", self._file_name);
                    let d: Result<(), IError> = s.read_to_path(f.as_str(), file_path.as_ref());
                    if d.is_ok() {
                        break;
                    }
                }
            }
        }
        Ok(())
    }

    pub fn release_data(&mut self) {
        if let Some(data) = &mut self._data {
            data.clear();
        }
        self._data = None;
    }
}

impl Debug for EpubAssets {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("EpubAssets")
            .field("id", &self.id)
            .field("_file_name", &self._file_name)
            .field("media_type", &self.media_type)
            .field("_data", &self._data)
            .field("reader_mode", &self.reader.is_some())
            .finish()
    }
}

// impl Clone for EpubAssets {
//     fn clone(&self) -> Self {
//         Self {
//             id: self.id.clone(),
//             _file_name: self._file_name.clone(),
//             media_type: self.media_type.clone(),
//             _data: self._data.clone(),
//             reader: self.reader.clone(),
//         }
//     }
// }
epub_base_field! {
///
/// 目录信息
///
/// 支持嵌套
///
#[derive(Default)]
pub struct EpubNav {
    /// 章节目录
    /// 如果需要序号需要调用方自行处理
    title: String,
    child: Vec<EpubNav>,
}
}
impl Debug for EpubNav {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("EpubNav")
            .field("id", &self.id)
            .field("_file_name", &self._file_name)
            .field("media_type", &self.media_type)
            .field("_data", &self._data)
            .field("title", &self.title)
            .field("child", &self.child)
            .finish()
    }
}

impl Clone for EpubNav {
    fn clone(&self) -> Self {
        Self {
            id: self.id.clone(),
            _file_name: self._file_name.clone(),
            media_type: self.media_type.clone(),
            _data: self._data.clone(),
            reader: None,
            title: self.title.clone(),
            child: self.child.clone(),
        }
    }
}

impl EpubNav {
    pub fn title(&self) -> &str {
        &self.title
    }
    pub fn set_title<T: Into<String>>(&mut self, title: T) {
        self.title = title.into();
    }
    pub fn with_title<T: Into<String>>(mut self, title: T) -> Self {
        self.set_title(title);
        self
    }
    ///
    ///
    /// 添加下级目录
    ///
    pub fn push(&mut self, child: EpubNav) {
        self.child.push(child);
    }

    pub fn child(&self) -> std::slice::Iter<'_, EpubNav> {
        self.child.iter()
    }
}

cache_struct! {
///
/// 书籍元数据
///
/// 自定义的数据，不在规范内
///
#[derive(Debug, Default)]
pub struct EpubMetaData {
    /// 属性
    attr: HashMap<String, String>,
    /// 文本
    text: Option<String>,
}
}

impl EpubMetaData {
    pub fn with_attr<K: Into<String>>(mut self, key: K, value: K) -> Self {
        self.push_attr(key, value);
        self
    }

    pub fn push_attr<T: Into<String>>(&mut self, key: T, value: T) {
        self.attr.insert(key.into(), value.into());
    }
    pub fn with_text<T: Into<String>>(mut self, text: T) -> Self {
        self.set_text(text);
        self
    }

    pub fn set_text<T: Into<String>>(&mut self, text: T) {
        self.text = Some(text.into());
    }

    pub fn text(&self) -> Option<&str> {
        self.text.as_deref()
    }

    pub fn attrs(&self) -> std::collections::hash_map::Iter<'_, String, String> {
        self.attr.iter()
    }

    pub fn get_attr<T: AsRef<str>>(&self, key: T) -> Option<&String> {
        self.attr.get(key.as_ref())
    }
}
crate::cache_struct! {
/// 书本
#[derive(Default)]
pub struct EpubBook {
    /// 上次修改时间
    last_modify: Option<String>,
    /// epub电子书创建者信息
    generator: Option<String>,
    /// 书本信息
    info: crate::common::BookInfo,
    /// 元数据
    meta: Vec<EpubMetaData>,
    /// 目录信息
    nav: Vec<EpubNav>,
    /// 资源
    assets: Vec<EpubAssets>,
    /// 章节
    chapters: Vec<EpubHtml>,
    /// 封面页
    pub(crate) cover_chapter: Option<EpubHtml>,
    /// 封面
    cover: Option<EpubAssets>,
    /// 版本号
    version: String,
    /// 处于读模式
    #[cfg(not(feature="cache"))]
    reader:Option<std::sync::Arc<std::sync::Mutex< Box<dyn EpubReaderTrait+Send+Sync>>>>,
    #[cfg(feature="cache")]
    #[serde(skip)]
    reader:Option<std::sync::Arc<std::sync::Mutex< Box<dyn EpubReaderTrait+Send+Sync>>>>,
    /// PREFIX
    pub(crate) prefix: String,
    /// 方向
   pub(crate) direction: Option<Direction>,
   /// 语言
   language: Option<String>,
   /// toc.ncx
   toc: Option<EpubAssets>,
}
}

impl Display for EpubBook {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f,"last_modify={:?},info={:?},meta={:?},nav={:?},assets={:?},chapters={:?},cover={:?},is in read mode={}",
        self.last_modify,
        self.info,
        self.meta,
        self.nav,
        self.assets,
        self.chapters,
        self.cover,
        self.reader.is_some()
    )
    }
}
impl Drop for EpubBook {
    fn drop(&mut self) {
        self.release_memory();
    }
}

impl EpubBook {
    iepub_derive::option_string_method!("作者", info, creator);
    iepub_derive::option_string_method!("简介", info, description);
    iepub_derive::option_string_method!("电子书创建者", info, contributor);
    iepub_derive::option_string_method!("出版日期", info, date);
    iepub_derive::option_string_method!("format", info, format);
    iepub_derive::option_string_method!("出版社", info, publisher);
    iepub_derive::option_string_method!("主题", info, subject);
    // /
    // / 设置epub最后修改时间
    // /
    // / # Examples
    // /
    // / ```
    // / let mut epub = EpubBook::default();
    // / epub.set_last_modify("2024-06-28T08:07:07UTC");
    // / ```
    // /
    iepub_derive::option_string_method!("电子书最后修改时间", last_modify);
    iepub_derive::option_string_method!("电子书生成者", generator);
    iepub_derive::option_string_method!("语言", language);
}

// 元数据
impl EpubBook {
    pub fn toc(&self) -> Option<&EpubAssets> {
        self.toc.as_ref()
    }

    pub(crate) fn set_toc(&mut self, toc: EpubAssets) {
        self.toc = Some(toc)
    }

    pub fn set_direction(&mut self, dir: Direction) {
        self.direction = Some(dir);
    }

    pub fn with_direction(mut self, dir: Direction) -> Self {
        self.set_direction(dir);
        self
    }

    pub fn set_title<T: AsRef<str>>(&mut self, title: T) {
        self.info.title.clear();
        self.info.title.push_str(title.as_ref());
    }

    pub fn title(&self) -> &str {
        self.info.title.as_str()
    }

    pub fn with_title<T: AsRef<str>>(mut self, title: T) -> Self {
        self.set_title(title.as_ref());
        self
    }

    pub fn identifier(&self) -> &str {
        self.info.identifier.as_str()
    }

    pub fn set_identifier<T: AsRef<str>>(&mut self, identifier: T) {
        self.info.identifier.clear();
        self.info.identifier.push_str(identifier.as_ref());
    }

    pub fn with_identifier<T: AsRef<str>>(mut self, identifier: T) -> Self {
        self.set_identifier(identifier.as_ref());
        self
    }

    ///
    /// 添加元数据
    ///
    /// # Examples
    ///
    /// ```
    /// use iepub::prelude::*;
    /// let mut epub = EpubBook::default();
    /// epub.add_meta(EpubMetaData::default().with_attr("k", "v").with_text("text"));
    /// ```
    ///
    pub fn add_meta(&mut self, meta: EpubMetaData) {
        self.meta.push(meta);
    }

    pub fn meta(&self) -> &[EpubMetaData] {
        &self.meta
    }

    pub fn get_meta_mut(&mut self, index: usize) -> Option<&mut EpubMetaData> {
        self.meta.get_mut(index)
    }

    pub fn get_meta(&self, index: usize) -> Option<&EpubMetaData> {
        self.meta.get(index)
    }

    pub fn meta_len(&self) -> usize {
        self.meta.len()
    }

    pub(crate) fn set_reader(
        &mut self,
        reader: Arc<Mutex<Box<dyn EpubReaderTrait + Send + Sync>>>,
    ) {
        self.reader = Some(reader)
    }

    ///
    /// 添加目录
    ///
    #[inline]
    pub fn add_nav(&mut self, nav: EpubNav) {
        self.nav.push(nav);
    }

    pub fn add_assets(&mut self, mut assets: EpubAssets) {
        if let Some(r) = &self.reader {
            assets.reader = Some(Arc::clone(r));
        }
        self.assets.push(assets);
    }

    ///
    /// 查找章节
    ///
    /// [file_name] 不需要带有 EPUB 目录
    ///
    pub fn get_assets<T: AsRef<str>>(&self, file_name: T) -> Option<&EpubAssets> {
        self.assets
            .iter()
            .find(|s| s.file_name() == file_name.as_ref())
    }

    ///
    /// 查找章节
    ///
    /// [file_name] 不需要带有 EPUB 目录
    ///
    pub fn get_assets_mut<T: AsRef<str>>(&mut self, file_name: T) -> Option<&mut EpubAssets> {
        self.assets
            .iter_mut()
            .find(|s| s.file_name() == file_name.as_ref())
    }

    pub fn assets(&self) -> std::slice::Iter<'_, EpubAssets> {
        self.assets.iter()
    }

    pub fn assets_mut(&mut self) -> std::slice::IterMut<'_, EpubAssets> {
        self.assets.iter_mut()
    }

    pub fn remove_assets(&mut self, index: usize) -> EpubAssets {
        self.assets.remove(index)
    }

    pub fn add_chapter(&mut self, mut chap: EpubHtml) {
        if let Some(r) = &self.reader {
            chap.reader = Some(Arc::clone(r));
        }
        self.chapters.push(chap);
    }

    pub fn insert_chapter(&mut self, index: usize, mut chap: EpubHtml) {
        if let Some(r) = &self.reader {
            chap.reader = Some(Arc::clone(r));
        }
        self.chapters.insert(index, chap);
    }

    pub fn chapters_mut(&mut self) -> std::slice::IterMut<'_, EpubHtml> {
        self.chapters.iter_mut()
    }

    pub fn chapters(&self) -> std::slice::Iter<'_, EpubHtml> {
        self.chapters.iter()
    }

    pub fn remove_chapter(&mut self, index: usize) {
        self.chapters.remove(index);
    }

    ///
    /// 查找章节
    ///
    /// [file_name] 不需要带有 EPUB 目录
    ///
    pub fn get_chapter<T: AsRef<str>>(&self, file_name: T) -> Option<&EpubHtml> {
        self.chapters
            .iter()
            .find(|s| s.file_name() == file_name.as_ref())
    }

    ///
    /// 查找章节
    ///
    /// [file_name] 不需要带有 EPUB 目录
    ///
    pub fn get_chapter_mut<T: AsRef<str>>(&mut self, file_name: T) -> Option<&mut EpubHtml> {
        self.chapters
            .iter_mut()
            .find(|s| s.file_name() == file_name.as_ref())
    }

    pub fn set_version<T: AsRef<str>>(&mut self, version: T) {
        self.version.clear();
        self.version.push_str(version.as_ref());
    }

    pub fn version(&self) -> &str {
        self.version.as_ref()
    }

    /// 获取目录
    pub fn nav(&self) -> std::slice::Iter<'_, EpubNav> {
        self.nav.iter()
    }

    pub fn set_cover(&mut self, mut cover: EpubAssets) {
        if let Some(r) = &self.reader {
            cover.reader = Some(Arc::clone(r));
        }
        self.cover = Some(cover);
    }

    pub fn cover(&self) -> Option<&EpubAssets> {
        self.cover.as_ref()
    }

    pub fn cover_mut(&mut self) -> Option<&mut EpubAssets> {
        self.cover.as_mut()
    }

    pub fn cover_chapter(&self) -> Option<&EpubHtml> {
        self.cover_chapter.as_ref()
    }

    /// 读取完成后更新文章
    pub(crate) fn update_chapter(&mut self) {
        let f = flatten_nav(&self.nav);

        let mut map = HashMap::new();
        for (index, ele) in self.chapters.iter_mut().enumerate() {
            if let Some(v) = self.nav.iter().find(|f| f.file_name() == ele.file_name()) {
                ele.set_title(v.title());
            } else {
                // 如果 chapter 在 nav中不存在，有两种情况，一是cover之类的本身就不存在，二是epub3，在一个文件里使用id分章节
                let id_nav: Vec<&&EpubNav> = f
                    .iter()
                    .filter(|f| {
                        f.file_name().contains("#") && f.file_name().starts_with(ele.file_name())
                    })
                    .collect();
                if !id_nav.is_empty() {
                    // epub3,去除该 chap,重新填入
                    map.insert(index, id_nav);
                }
            }
        }
        // 修正章节
        let mut offset = 0;
        for (index, nav) in map {
            for ele in nav {
                let mut chap = EpubHtml::default()
                    .with_title(ele.title())
                    .with_file_name(ele.file_name());
                if let Some(r) = &self.reader {
                    chap.reader = Some(Arc::clone(r));
                }
                self.chapters.insert(index + offset, chap);
                offset += 1;
            }
        }
        if let Some(cover) = &mut self.cover_chapter {
            if let Some(r) = &self.reader {
                cover.reader = Some(Arc::clone(r));
            }
        }
    }

    pub(crate) fn update_assets(&mut self) {
        let version = self.version().to_string();
        for assets in self.assets_mut() {
            assets.with_version(&version);
        }
    }

    pub fn release_memory(&mut self) {
        self.reader = None;
        self.chapters.clear();
        self.assets.clear();
        self.nav.clear();
        self.meta.clear();
        self.cover = None;
        self.version = String::new();
    }

    #[cfg(feature = "cache")]
    pub fn cache<T: AsRef<std::path::Path>>(&self, file: T) -> IResult<()> {
        std::fs::write(file, serde_json::to_string(self).unwrap())?;
        Ok(())
    }

    /// 加载缓存
    #[cfg(feature = "cache")]
    pub fn load_from_cache<T: AsRef<std::path::Path>>(file: T) -> IResult<EpubBook> {
        let file = std::fs::File::open(file)?;
        let reader = std::io::BufReader::new(file);

        // Read the JSON contents of the file as an instance of `User`.
        let u: EpubBook = serde_json::from_reader(reader)?;

        // Return the `User`.
        Ok(u)
    }
}

/// 获取最低层级的目录
fn flatten_nav(nav: &[EpubNav]) -> Vec<&EpubNav> {
    let mut n = Vec::new();
    for ele in nav {
        if ele.child.is_empty() {
            n.push(ele);
        } else {
            n.append(&mut flatten_nav(&ele.child));
        }
    }
    n
}
pub(crate) trait EpubReaderTrait: Send + Sync {
    fn read(&mut self, book: &mut EpubBook) -> IResult<()>;
    ///
    /// file epub中的文件目录
    ///
    fn read_file(&mut self, file_name: &str) -> IResult<Vec<u8>>;

    ///
    /// file epub中的文件目录
    ///
    fn read_string(&mut self, file_name: &str) -> IResult<String>;

    ///
    /// file epub中的文件目录
    ///
    fn read_to_path(&mut self, file_name: &str, file_path: &str) -> IResult<()>;
}

#[cfg(test)]
mod tests {

    use crate::prelude::*;

    fn book() -> EpubBook {
        let mut book = EpubBook::default();

        // 添加文本资源文件

        let mut css = EpubAssets::default();
        css.set_file_name("style/1.css");
        css.set_data(String::from("ok").as_bytes().to_vec());

        book.add_assets(css);

        // 添加目录，注意目录和章节并无直接关联关系，需要自行维护保证导航到正确位置
        let mut n = EpubNav::default();
        n.set_title("作品说明");
        n.set_file_name("chaps/0.xhtml");

        let mut n1 = EpubNav::default();
        n1.set_title("第一卷");

        let mut n2 = EpubNav::default();
        n2.set_title("第一卷 第一章");
        n2.set_file_name("chaps/1.xhtml");

        let mut n3 = EpubNav::default();
        n3.set_title("第一卷 第二章");
        n3.set_file_name("chaps/2.xhtml");
        n1.push(n2);

        book.add_nav(n);
        book.add_nav(n1);
        book.set_version("2.0");
        // 添加章节
        let mut chap = EpubHtml::default();
        chap.set_file_name("chaps/0.xhtml");
        chap.set_title("标题1");
        // 章节的数据并不需要填入完整的html，只需要片段即可，输出时会结合其他数据拼接成完整的html
        chap.set_data(String::from("<p>章节内容html片段</p>").as_bytes().to_vec());

        book.add_chapter(chap);

        chap = EpubHtml::default();
        chap.set_file_name("chaps/1.xhtml");
        chap.set_title("标题2");
        chap.set_data(String::from("第一卷 第一章content").as_bytes().to_vec());

        book.add_chapter(chap);
        chap = EpubHtml::default();
        chap.set_file_name("chaps/2.xhtml");
        chap.set_title("标题2");
        chap.set_data(String::from("第一卷 第二章content").as_bytes().to_vec());

        book.add_chapter(chap);

        book.set_title("书名");
        book.set_creator("作者");
        book.set_identifier("id");
        book.set_description("desc");
        book.set_date("29939");
        book.set_subject("subject");
        book.set_format("format");
        book.set_publisher("publisher");
        book.set_contributor("contributor");
        // epub.cover = Some(EpubAssets::default());

        let mut cover = EpubAssets::default();
        cover.set_file_name("cover.jpg");

        let data = vec![2];
        cover.set_data(data);

        book.set_cover(cover);
        book
    }

    #[test]
    fn write_assets() {
        let mut book: EpubBook = book();

        // EpubWriter::write_to_file("file", &mut book).unwrap();
        let f = if std::path::Path::new("target").exists() {
            "target/write_assets.epub"
        } else {
            "../target/write_assets.epub"
        };
        EpubWriter::write_to_file(f, &mut book, true).unwrap();

        // EpubWriter::<std::fs::File>write_to_file("../target/test.epub", &mut book).expect("write error");
    }

    #[test]
    #[cfg(feature = "cache")]
    fn test_cache() {
        let mut book: EpubBook = book();
        let f = if std::path::Path::new("target").exists() {
            "target/cache.json"
        } else {
            "../target/cache.json"
        };
        book.cache(f).unwrap();

        let book2 = EpubBook::load_from_cache(f).unwrap();

        assert_eq!(book.chapters.len(), book2.chapters.len());
        assert_eq!(book.chapters[0]._data, book2.chapters[0]._data);
        assert_eq!(book.assets[0]._data, book2.assets[0]._data);
    }
}
