use quick_xml::events::BytesStart;
use quick_xml::XmlVersion;
use std::borrow::Cow;
use std::collections::VecDeque;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;
use std::{
    io::{Read, Seek},
    ops::Deref,
};

use super::core::EpubReaderTrait;
use crate::prelude::*;
macro_rules! invalid {
    ($x:tt) => {
        Err(IError::InvalidArchive(Cow::from($x)))
    };
    ($x:expr,$y:expr) => {
        $x.or(Err(IError::InvalidArchive(Cow::from($y))))?
    };
}

macro_rules! read_from_zip {
    ($m:ident,$x:expr) => {{
        // 读取 container.xml
        let mut file = invalid!($m.by_name($x), format!("{} not exist", $x));
        let mut content = String::new();
        invalid!(file.read_to_string(&mut content), "read err");
        content
    }};
}

fn get_opf_location(xml: &str) -> IResult<String> {
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;

    let mut reader = Reader::from_str(xml);
    // reader.config_mut().trim_text(true);
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Eof) => {
                return Ok(String::new());
            }
            Err(e) => {
                return Err(IError::Xml(e));
            }
            Ok(Event::Empty(e)) => {
                if e.name().as_ref() == b"rootfile" {
                    if let Ok(path) = e.try_get_attribute("full-path") {
                        return match path.map(|f| {
                            f.normalized_value(XmlVersion::Implicit1_0)
                                .map_or_else(|_| String::new(), |v| v.to_string())
                        }) {
                            Some(v) => Ok(v),
                            None => Err(IError::InvalidArchive(Cow::from("has no opf"))),
                        };
                    }
                }
            }
            _ => (),
        }
        buf.clear();
    }
}

fn create_meta(xml: &BytesStart) -> IResult<EpubMetaData> {
    let mut meta = EpubMetaData::default();

    for a in xml.attributes().flatten() {
        meta.push_attr(
            String::from_utf8(a.key.0.to_vec()).unwrap().as_str(),
            String::from_utf8(a.value.to_vec()).unwrap().as_str(),
        );
    }
    Ok(meta)
}

fn read_meta_xml(
    reader: &mut quick_xml::reader::Reader<&[u8]>,
    book: &mut EpubBook,
) -> IResult<()> {
    use quick_xml::events::Event;

    let mut reading_text = false;
    let mut text = String::new();
    let t_s = reader.config().trim_text_start;
    let t_e = reader.config().trim_text_end;
    reader.config_mut().trim_text(false);

    // 可能有多个时间，所以需要缓存，然后再分别处理
    let mut date_buf: Vec<(Option<String>, Option<String>)> = Vec::new();

    // 模拟 栈，记录当前的层级
    let mut parent: Vec<String> = vec!["package".to_string(), "metadata".to_string()];
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Eof) => {
                break;
            }
            Err(_e) => {
                return invalid!("err");
            }
            Ok(Event::Start(e)) => {
                let name = String::from_utf8(e.name().as_ref().to_vec()).map_err(IError::Utf8)?;

                if name == "meta" {
                    if parent.len() != 2 || parent[1] != "metadata" {
                        return invalid!("not valid opf meta");
                    } else {
                        let meta = create_meta(&e);
                        if let Ok(m) = meta {
                            book.add_meta(m);
                        }
                        parent.push("meta".to_string());
                    }
                } else if name == "dc:date" {
                    if let Some(event) =
                        e.try_get_attribute("opf:event")
                            .ok()
                            .and_then(|f| f)
                            .map(|f| {
                                f.normalized_value(XmlVersion::Implicit1_0)
                                    .map_or_else(|_| String::new(), |v| v.to_string())
                            })
                    {
                        date_buf.push((Some(event), None));
                    } else {
                        date_buf.push((None, None));
                    }
                } else if parent.len() != 2 || parent[1] != "metadata" {
                    return invalid!("not valid opf identifier");
                } else {
                    parent.push(name);
                }
            }
            Ok(Event::Empty(e)) => {
                if e.name().as_ref() == b"meta" {
                    if parent.len() != 2 || parent[1] != "metadata" {
                        return invalid!("not valid opf meta empty");
                    } else {
                        let meta = create_meta(&e);
                        if let Ok(m) = meta {
                            book.add_meta(m);
                        }
                    }
                }
            }
            Ok(Event::GeneralRef(e)) => {
                if reading_text {
                    let t = e.decode().map_err(IError::Encoding)?;
                    if t == "amp" {
                        text.push('&');
                    } else if t == "lt" {
                        text.push('<');
                    } else if t == "gt" {
                        text.push('>');
                    } else if t == "apos" {
                        text.push('\'');
                    } else if t == "quot" {
                        text.push('"');
                    }
                }
            }
            Ok(Event::Text(txt)) => {
                if !parent.is_empty() {
                    reading_text = true;
                    text.push_str(txt.decode().map_err(IError::Encoding)?.deref());
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8(e.name().as_ref().to_vec()).map_err(IError::Utf8)?;
                reading_text = false;

                match name.as_str() {
                    "meta" => {
                        if let Some(m) = book.get_meta_mut(book.meta_len() - 1) {
                            m.set_text(text.trim());
                        }
                    }
                    "dc:identifier" => {
                        book.set_identifier(text.trim());
                    }
                    "dc:title" => {
                        book.set_title(text.trim());
                    }
                    "dc:creator" => {
                        book.set_creator(text.trim());
                    }
                    "dc:description" => {
                        book.set_description(text.trim());
                    }
                    "dc:format" => {
                        book.set_format(text.trim());
                    }
                    "dc:publisher" => {
                        book.set_publisher(text.trim());
                    }
                    "dc:subject" => {
                        book.set_subject(text.trim());
                    }
                    "dc:contributor" => {
                        book.set_contributor(text.trim());
                    }
                    "dc:date" => {
                        if let Some(last_mut) = date_buf.last_mut() {
                            last_mut.1 = Some(text.trim().to_string());
                        }
                    }
                    _ => {}
                }
                text.clear();
                if name == "metadata" {
                    if parent.len() != 2 || parent[0] != "package" {
                        return invalid!("not valid opf metadata end");
                    }
                    break;
                }

                if !parent.is_empty() && parent[parent.len() - 1] == name {
                    parent.remove(parent.len() - 1);
                }
            }
            _ => {}
        }
    }

    // 处理时间
    for (event, value) in &date_buf {
        if let Some(event) = event {
            if event == "publication" {
                if let Some(value) = value {
                    book.set_date(value);
                }
            } else if event == "modification" {
                if let Some(value) = value {
                    book.set_last_modify(value);
                }
            }
        } else if let Some(value) = value {
            // 没有event的日期
            book.set_date(value);
        }
    }

    reader.config_mut().trim_text_start = t_s;
    reader.config_mut().trim_text_end = t_e;
    Ok(())
}

/// 从xml中获取封面页
fn read_guide_xml(
    reader: &mut quick_xml::reader::Reader<&[u8]>,
    book: &mut EpubBook,
) -> IResult<()> {
    use quick_xml::events::Event;
    // 模拟 栈，记录当前的层级
    let _parent: Vec<String> = vec!["package".to_string(), "metadata".to_string()];
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                if e.name().as_ref() == b"reference" {
                    // <reference href="cover.xhtml" title="cover" type="cover"/>
                    // 读取封面页的时候，不一定已经获取到了章节
                    if let Some(_t) = e
                        .try_get_attribute("type")
                        .ok()
                        .and_then(|f| f)
                        .map(|f| {
                            f.normalized_value(XmlVersion::Implicit1_0)
                                .map_or_else(|_| String::new(), |v| v.to_string())
                        })
                        .filter(|f| f == "cover")
                    {
                        if let Some(href) =
                            e.try_get_attribute("href").ok().and_then(|f| f).map(|f| {
                                f.normalized_value(XmlVersion::Implicit1_0)
                                    .map_or_else(|_| String::new(), |v| v.to_string())
                            })
                        {
                            book.cover_chapter = Some(EpubHtml::default().with_file_name(href));
                        }
                        break;
                    }
                }
            }
            Ok(Event::Empty(e)) => {
                match e.name().as_ref() {
                    b"reference" => {
                        // <reference href="cover.xhtml" title="cover" type="cover"/>
                        // 读取封面页的时候，不一定已经获取到了章节

                        if let Some(_t) = e
                            .try_get_attribute("type")
                            .ok()
                            .and_then(|f| f)
                            .map(|f| {
                                f.normalized_value(XmlVersion::Implicit1_0)
                                    .map_or_else(|_| String::new(), |v| v.to_string())
                            })
                            .filter(|f| f == "cover")
                        {
                            if let Some(href) =
                                e.try_get_attribute("href").ok().and_then(|f| f).map(|f| {
                                    f.normalized_value(XmlVersion::Implicit1_0)
                                        .map_or_else(|_| String::new(), |v| v.to_string())
                                })
                            {
                                book.cover_chapter = Some(EpubHtml::default().with_file_name(href));
                            }
                            break;
                        }
                    }
                    _ => {
                        // invalid!("item err")
                    }
                }
            }
            Ok(Event::End(e)) => {
                if e.name().as_ref() == b"guide" {
                    break;
                }
            }

            Ok(Event::Eof) => {
                break;
            }
            Err(_e) => {
                return invalid!("err");
            }
            _ => {
                break;
            }
        }
    }
    Ok(())
}

fn read_spine_xml(
    reader: &mut quick_xml::reader::Reader<&[u8]>,
    book: &mut EpubBook,
    assets: &mut Vec<EpubAssets>,
) -> IResult<()> {
    use quick_xml::events::Event;

    // 模拟 栈，记录当前的层级
    let _parent: Vec<String> = vec!["package".to_string(), "metadata".to_string()];
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::End(e)) => {
                if e.name().as_ref() == b"spine" {
                    // 写入书本
                    for ele in assets.iter() {
                        if ele.id() == "toc" && !ele.file_name().contains(".xhtml") {
                            continue;
                        }
                        book.add_assets(ele.clone());
                    }
                    break;
                }
            }

            Ok(Event::Empty(e)) => {
                if e.name().as_ref() == b"itemref" {
                    if let Ok(href) = e.try_get_attribute("idref") {
                        if let Some(h) = href.map(|f| {
                            f.normalized_value(XmlVersion::Implicit1_0)
                                .map_or_else(|_| String::new(), |v| v.to_string())
                        }) {
                            let xhtml = assets
                                .iter()
                                .enumerate()
                                .find(|(_index, s)| s.id() == h.as_str());
                            if let Some((index, xh)) = xhtml {
                                book.add_chapter(
                                    EpubHtml::default().with_file_name(xh.file_name()),
                                );
                                if !xh.id().eq_ignore_ascii_case("toc")
                                    && xh.file_name().contains(".xhtml")
                                {
                                    assets.remove(index);
                                }
                            }
                        }
                    }
                }
            }

            _ => {
                break;
            }
        }
    }

    Ok(())
}
///
/// 获取所有文件信息
///
fn read_manifest_xml(
    reader: &mut quick_xml::reader::Reader<&[u8]>,
    book: &mut EpubBook,
    assets: &mut Vec<EpubAssets>,
) -> IResult<()> {
    use quick_xml::events::Event;
    // 模拟 栈，记录当前的层级
    let _parent: Vec<String> = vec!["package".to_string(), "metadata".to_string()];
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::End(_e)) => {
                break;
            }
            Ok(Event::Empty(e)) => {
                match e.name().as_ref() {
                    b"item" => {
                        let mut a = EpubAssets::default();
                        let mut is_cover = false;
                        for attr in e.attributes().flatten() {
                            match attr.key.as_ref() {
                                b"href" => {
                                    let h = attr
                                        .normalized_value(XmlVersion::Implicit1_0)
                                        .unwrap_or_default()
                                        .to_string();
                                    a.set_file_name(h.as_str());
                                }
                                b"id" => {
                                    let h = attr
                                        .normalized_value(XmlVersion::Implicit1_0)
                                        .unwrap_or_default()
                                        .to_string();
                                    if h.eq_ignore_ascii_case("cover") {
                                        is_cover = true;
                                    }
                                    a.set_id(h.as_str());
                                }
                                b"media-type" => {
                                    let h = attr
                                        .normalized_value(XmlVersion::Implicit1_0)
                                        .unwrap_or_default()
                                        .to_string();
                                    a.media_type = h;
                                }
                                b"properties" => {
                                    let h = attr
                                        .normalized_value(XmlVersion::Implicit1_0)
                                        .unwrap_or_default()
                                        .to_string();
                                    if h.split_whitespace().any(|s| s == "cover-image") {
                                        is_cover = true;
                                    }
                                }
                                _ => {}
                            }
                        }

                        if is_cover {
                            let href = a.file_name();
                            if href.ends_with(".xhtml") || href.ends_with(".html") {
                                book.cover_chapter = Some(EpubHtml::default().with_file_name(href));
                            } else if a.media_type.starts_with("image/") {
                                book.set_cover(a.clone());
                            }
                        }
                        assets.push(a);
                    }
                    _ => {
                        // invalid!("item err")
                    }
                }
            }
            _ => {}
        }
    }
    Ok(())
}

fn read_opf_xml(xml: &str, book: &mut EpubBook) -> IResult<()> {
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;

    let mut reader = Reader::from_str(xml);
    let config = reader.config_mut();
    config.trim_text(true);

    let mut buf = Vec::new();
    // 模拟 栈，记录当前的层级
    let mut parent: Vec<String> = Vec::new();
    let mut assets: Vec<EpubAssets> = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Eof) => {
                break;
            }
            Err(_e) => {
                return invalid!("err");
            }
            Ok(Event::Start(e)) => match e.name().as_ref() {
                b"package" => {
                    parent.push("package".to_string());
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"version" {
                            let ver = attr
                                .normalized_value(XmlVersion::Implicit1_0)?
                                .trim()
                                .to_string();
                            if !ver.is_empty() {
                                book.set_version(&ver);
                            } else {
                                book.set_version("2.0");
                            }
                        }
                    }
                }
                b"metadata" => {
                    if parent.len() != 1 || parent[0] != "package" {
                        return invalid!("not valid opf metadata");
                    } else {
                        parent.push("metadata".to_string());
                    }
                    read_meta_xml(&mut reader, book)?;
                }
                b"manifest" => {
                    read_manifest_xml(&mut reader, book, &mut assets)?;
                }
                b"spine" => {
                    read_spine_xml(&mut reader, book, &mut assets)?;
                }
                b"guide" => {
                    read_guide_xml(&mut reader, book)?;
                }
                _ => {}
            },
            Ok(Event::Empty(_e)) => {}
            Ok(Event::Text(_txt)) => {}
            Ok(Event::End(e)) => {
                if e.name().as_ref() == b"package" {
                    if parent.len() == 1 && parent[0] == "package" {
                    } else {
                        // xml错误
                    }
                    // parent.remove(to_string());
                }
            }
            _ => {}
        }
        buf.clear();
    }

    let mut last_modify = None;
    let mut cover = None;
    let mut generator = None;
    {
        // 解析meta，获取部分关键数据
        for i in 0..book.meta_len() {
            if let Some(meta) = book.get_meta(i) {
                {
                    if let Some(value) = meta.get_attr("name") {
                        if value == "cover" {
                            // 可能是封面
                            if let Some(content) = meta.get_attr("content") {
                                // 对应的封面的id

                                // 查找封面
                                for ele in book.assets() {
                                    if ele.id() == content {
                                        // 封面
                                        cover = Some(ele.clone());
                                        // book.set_cover(ele.clone());
                                        break;
                                    }
                                }
                            }
                        } else if value == "generator" {
                            // 电子书创建者
                            // 可能是封面
                            if let Some(content) = meta.get_attr("content") {
                                generator = Some(content.clone());
                            }
                        }
                    }
                }
                {
                    if let Some(pro) = meta.get_attr("property") {
                        if pro == "dcterms:modified" && meta.text().is_some() {
                            last_modify = Some(meta.text().unwrap().to_string());
                        }
                    }
                }
            }
        }
    }

    if let Some(l) = last_modify {
        book.set_last_modify(l.as_str());
    }
    if let Some(co) = cover {
        book.set_cover(co);
    }
    if let Some(g) = generator {
        book.set_generator(g.as_str());
    }

    // 处理toc文件
    if let Some((index, _)) = book
        .assets()
        .enumerate()
        .find(|f| f.1.id() == "toc" || f.1.id() == "ncx")
    {
        let toc = book.remove_assets(index);
        book.set_toc(toc);
    }

    Ok(())
}

fn read_nav_point_xml(
    reader: &mut quick_xml::reader::Reader<&[u8]>,
    nav: &mut EpubNav,
) -> IResult<()> {
    use quick_xml::events::Event;

    let mut buf = Vec::new();
    // 模拟 栈，记录当前的层级
    let mut parent: Vec<String> = Vec::new();
    let mut title = String::new();

    // 因为文本会被拆分，所以不能trim，否则可能导致在中间的空格被trim掉
    let t_s = reader.config().trim_text_start;
    let t_e = reader.config().trim_text_end;
    reader.config_mut().trim_text(false);

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Eof) => {
                break;
            }
            Ok(Event::Start(e)) => match e.name().as_ref() {
                b"navLabel" => {
                    parent.push("navLavel".to_string());
                }
                b"text" => {
                    parent.push("text".to_string());
                }
                b"content" => {
                    if let Ok(src) = e.try_get_attribute("src") {
                        if let Some(h) = src.map(|f| {
                            f.normalized_value(XmlVersion::Implicit1_0)
                                .map_or_else(|_| String::new(), |v| v.to_string())
                        }) {
                            nav.set_file_name(&h);
                        }
                    }
                }
                b"navPoint" => {
                    // 套娃了
                    let mut n = EpubNav::default();
                    read_nav_point_xml(reader, &mut n)?;
                    nav.push(n);
                }
                _ => {}
            },
            Ok(Event::End(e)) => {
                let name = String::from_utf8(e.name().as_ref().to_vec()).map_err(IError::Utf8)?;

                if name == "navPoint" {
                    break;
                }
                if parent.last().map(|f| f == "text").unwrap_or(false) {
                    nav.set_title(title.trim());
                    title.clear();
                }
                if !parent.is_empty() && parent[parent.len() - 1] == name {
                    parent.remove(parent.len() - 1);
                }
            }
            Ok(Event::Text(e)) => {
                if parent.last().map(|f| f == "text").unwrap_or(false) {
                    // quick_xml 0.38.0 之后，对于被转义后的xml文本，会把文本拆成多段
                    title.push_str(e.decode().map_err(IError::Encoding)?.deref());
                }
            }
            Ok(Event::GeneralRef(e)) => {
                // 当文本中出现 &amp;之类的转义时，amp会被放到这里
                if parent.last().map(|f| f == "text").unwrap_or(false) {
                    let t = e.decode().map_err(IError::Encoding)?;
                    if t == "amp" {
                        title.push('&');
                    } else if t == "lt" {
                        title.push('<');
                    } else if t == "gt" {
                        title.push('>');
                    } else if t == "apos" {
                        title.push('\'');
                    } else if t == "quot" {
                        title.push('"');
                    }
                }
            }
            Err(_e) => {
                return invalid!("err");
            }
            _ => {}
        }
    }
    reader.config_mut().trim_text_start = t_s;
    reader.config_mut().trim_text_end = t_e;
    Ok(())
}

fn read_nav_xml(xml: &str, book: &mut EpubBook) -> IResult<()> {
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;

    let mut reader = Reader::from_str(xml);
    let config = reader.config_mut();
    config.trim_text(true);
    config.expand_empty_elements = true;

    let mut buf = Vec::new();
    // 模拟 栈，记录当前的层级
    let mut parent: Vec<String> = Vec::new();
    let mut assets: Vec<EpubNav> = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Eof) => {
                break;
            }
            Err(_e) => {
                return invalid!("err");
            }
            Ok(Event::Start(e)) => match e.name().as_ref() {
                b"ncx" => {
                    parent.push("ncx".to_string());
                }
                b"navMap" => {
                    if parent.len() != 1 || parent[0] != "ncx" {
                        return invalid!("err nav 1");
                    }
                    parent.push("navMap".to_string());
                }
                b"navPoint" => {
                    if parent.len() != 2 || parent[1] != "navMap" {
                        return invalid!("err nav 2");
                    }
                    let mut nav = EpubNav::default();
                    read_nav_point_xml(&mut reader, &mut nav)?;
                    assets.push(nav);
                }
                _ => {}
            },
            Ok(Event::End(e)) => {
                let name = String::from_utf8(e.name().as_ref().to_vec()).map_err(IError::Utf8)?;

                if name == "navMap" {
                    break;
                }

                if !parent.is_empty() && parent[parent.len() - 1] == name {
                    parent.remove(parent.len() - 1);
                }
            }
            _ => {}
        }
    }
    for ele in assets {
        book.add_nav(ele);
    }
    Ok(())
}

fn read_nav_xhtml(xhtml: &str, root_path: String, book: &mut EpubBook) -> IResult<()> {
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;

    let mut reader = Reader::from_str(xhtml);
    reader.config_mut().trim_text(true);
    let mut stack: VecDeque<Vec<EpubNav>> = VecDeque::new();
    let mut items = Vec::new();
    let mut current_item = None;
    let mut in_toc_nav = false;
    let mut buffer = String::new();
    let mut in_label = false;
    loop {
        match reader.read_event()? {
            Event::Start(e) => match e.name().as_ref() {
                b"nav" if has_epub_type(&e, "toc") => in_toc_nav = true,
                b"ol" if in_toc_nav => stack.push_back(Vec::new()),
                b"li" if in_toc_nav => current_item = Some(EpubNav::default()),
                b"a" if in_toc_nav => {
                    if let Some(href) = e
                        .attributes()
                        .find(|a| a.as_ref().map(|a| a.key.0 == b"href").unwrap_or(false))
                    {
                        let mut href = String::from_utf8_lossy(&href.unwrap().value).to_string();
                        if !href.starts_with(&root_path) {
                            href = format!("{}{}", root_path, href);
                        }
                        current_item.as_mut().unwrap().set_file_name(&href);
                    }
                }
                b"span" => {
                    if let Some(class) = e
                        .attributes()
                        .find(|a| a.as_ref().map(|a| a.key.0 == b"class").unwrap_or(false))
                    {
                        if class
                            .as_ref()
                            .map(|a| &*a.value == b"toc-label")
                            .unwrap_or(false)
                        {
                            in_label = true
                        }
                    }
                }
                _ => (),
            },
            Event::Text(e) => {
                let text = e.decode().map_err(IError::Encoding)?;
                if in_label {
                    buffer.push_str(&text);
                }
            }
            Event::End(e) => match e.name().as_ref() {
                b"nav" => in_toc_nav = false,
                b"ol" => {
                    if let Some(children) = stack.pop_back() {
                        if let Some(last) = stack.back_mut() {
                            for item in children {
                                last.last_mut().unwrap().push(item);
                            }
                        } else {
                            items = children;
                        }
                    }
                }
                b"li" => {
                    if let Some(item) = current_item.take() {
                        if let Some(children) = stack.back_mut() {
                            children.push(item);
                        } else {
                            items.push(item);
                        }
                    }
                }
                b"span" => {
                    if in_label {
                        current_item.as_mut().unwrap().set_title(buffer.trim());
                        buffer.clear();
                        in_label = false;
                    }
                }
                _ => (),
            },
            Event::Eof => break,
            _ => (),
        }
    }
    for nav in items {
        book.add_nav(nav);
    }
    Ok(())
}

fn has_epub_type(e: &BytesStart, value: &str) -> bool {
    e.attributes().any(|a| {
        if let Ok(attr) = a {
            attr.key.0 == b"epub:type" && &*attr.value == value.as_bytes()
        } else {
            false
        }
    })
}

#[derive(Debug, Clone)]
struct EpubReader<T: Read + Seek> {
    inner: zip::ZipArchive<T>,
}

impl<T: Read + Seek> Drop for EpubReader<T> {
    fn drop(&mut self) {}
}

impl<T: Read + Seek> EpubReader<T> {
    pub fn new(value: T) -> IResult<Self> {
        let r = zip::ZipArchive::new(value)?;
        Ok(EpubReader { inner: r })
    }
}

impl<T: Read + Seek + Sync + Send> EpubReaderTrait for EpubReader<T> {
    fn read(&mut self, book: &mut EpubBook) -> IResult<()> {
        let reader = &mut self.inner;

        {
            // 判断文件格式
            let content = read_from_zip!(reader, "mimetype");

            if content != "application/epub+zip" {
                return invalid!("not a epub file");
            }
        }

        {
            let content = read_from_zip!(reader, "META-INF/container.xml");

            let opf_path = get_opf_location(content.as_str());
            if let Ok(path) = opf_path {
                let pp = crate::path::Path::system(path.as_str());
                if pp.level_count() != 1 {
                    book.prefix.push_str(pp.pop().to_str().as_str());
                }
                let opf = read_from_zip!(reader, path.as_str());
                read_opf_xml(opf.as_str(), book)?;

                {
                    // 读取导航
                    if let Some(toc) = book.toc() {
                        let t = crate::path::Path::system(path.as_str())
                            .pop()
                            .join(toc.file_name())
                            .to_str();

                        if reader.by_name(t.as_str()).is_ok() {
                            let content = read_from_zip!(reader, t.as_str());
                            if toc.file_name().contains(".xhtml") {
                                let root = toc
                                    .file_name()
                                    .rfind("/")
                                    .map(|f| {
                                        toc.file_name()
                                            .get(..(f + 1))
                                            .unwrap_or_default()
                                            .to_string()
                                    })
                                    .unwrap_or_default();
                                read_nav_xhtml(content.as_str(), root, book)?;
                            } else {
                                read_nav_xml(content.as_str(), book)?;
                            }
                        }
                    }
                }
            }
        }
        // 从封面页获取封面
        {
            if let Some(co) = &mut book.cover_chapter {
                co.read_data(self);
                // let _ = co.data_mut().unwrap(); // 死锁，因为是不可重入锁
            }
            if let Some(co) = book
                .cover_chapter
                .as_ref()
                .filter(|_| book.cover().is_none())
                .as_mut()
                .and_then(|co| co.data().map(|s| (s, co.file_name())))
            {
                // 查找第一个img标签，然后找到对应的文件
                if let Some(cover) = get_img_src(co.0, "img", "src")
                    .or_else(|| get_img_src(co.0, "image", "xlink:href"))
                    .or_else(|| get_img_src(co.0, "image", "href"))
                    .and_then(|f| String::from_utf8(f).ok())
                    .map(|src| crate::path::Path::system(co.1).pop().join(src).to_str())
                    .and_then(|img| book.assets().find(|f| f.file_name() == img.as_str()))
                {
                    book.set_cover((*cover).clone());
                }
            }
        }
        book.update_chapter();
        book.update_assets();

        Ok(())
    }

    fn read_file(&mut self, file_name: &str) -> IResult<Vec<u8>> {
        let mut file = self
            .inner
            .by_name(file_name)
            .or(Err(IError::FileNotFound))?;
        let mut content = Vec::new();
        invalid!(file.read_to_end(&mut content), "read err");
        Ok(content)
    }

    fn read_string(&mut self, file_name: &str) -> IResult<String> {
        let mut file = self
            .inner
            .by_name(file_name)
            .or(Err(IError::FileNotFound))?;
        let mut content = String::new();
        invalid!(file.read_to_string(&mut content), "read err");
        Ok(content)
    }

    fn read_to_path(&mut self, file_name: &str, file_path: &str) -> IResult<()> {
        let mut file = self
            .inner
            .by_name(file_name)
            .or(Err(IError::FileNotFound))?;
        let output_file = File::create(file_path)?;
        let mut writer = BufWriter::new(output_file);
        let mut buffer = [0u8; 16384];
        loop {
            let bytes_read = file.read(&mut buffer)?;
            if bytes_read == 0 {
                break;
            }
            writer.write_all(&buffer[..bytes_read])?;
        }
        Ok(())
    }
}

/// 获取img的src值
pub(crate) fn get_img_src(html: &[u8], tag: &str, attribute: &str) -> Option<Vec<u8>> {
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;

    let mut reader = Reader::from_reader(html);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                if e.name().as_ref().eq_ignore_ascii_case(tag.as_bytes()) {
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref().eq_ignore_ascii_case(attribute.as_bytes()) {
                            return Some(attr.value.to_vec());
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    None
}

///
/// 从内存读取epub
///
pub fn read_from_vec(data: Vec<u8>) -> IResult<EpubBook> {
    read_from_reader(std::io::Cursor::new(data))
}

///
/// 从文件读取epub
///
pub fn read_from_file<P: AsRef<Path>>(file: P) -> IResult<EpubBook> {
    read_from_reader(std::fs::File::open(file)?)
}

///
/// 从任意reader读取epub
///
pub fn read_from_reader<T: Read + Seek + Sync + Send + 'static>(value: T) -> IResult<EpubBook> {
    let reader = EpubReader::new(value)?;
    let mut book = EpubBook::default();
    let re: std::sync::Arc<std::sync::Mutex<Box<dyn EpubReaderTrait + Sync + Send>>> =
        std::sync::Arc::new(std::sync::Mutex::new(Box::new(reader)));
    book.set_reader(std::sync::Arc::clone(&re));

    re.lock().unwrap().read(&mut book)?;
    Ok(book)
}

/// 判断是否是epub文件
pub fn is_epub<T: Read>(value: &mut T) -> IResult<bool> {
    let mut v = Vec::new();
    value.take(4).read_to_end(&mut v)?;
    let magic: [u8; 4] = [0x50, 0x4B, 0x03, 0x04];
    Ok(v == magic)
}

#[cfg(test)]
mod tests {
    use crate::{
        common::tests::download_epub_file,
        epub::reader::{get_img_src, read_meta_xml},
        prelude::*,
    };

    use super::{is_epub, read_nav_xml};

    #[test]
    fn test_is_epub() {
        let mut magic: [u8; 4] = [0x50, 0x4B, 0x03, 0x04];

        assert_eq!(true, is_epub(&mut std::io::Cursor::new(magic)).unwrap());

        magic = [0x50, 0x4B, 0x03, 0x03];
        assert_eq!(false, is_epub(&mut std::io::Cursor::new(magic)).unwrap());

        let n_magic: [u8; 3] = [0x50, 0x4B, 0x03];
        assert_eq!(false, is_epub(&mut std::io::Cursor::new(n_magic)).unwrap());

        let n2_magic: [u8; 5] = [0x50, 0x4B, 0x03, 0x04, 0x05];
        assert_eq!(true, is_epub(&mut std::io::Cursor::new(n2_magic)).unwrap());

        let empty = [0u8; 32];
        assert_eq!(false, is_epub(&mut std::io::Cursor::new(empty)).unwrap());

        let null = [0u8; 0];
        assert_eq!(false, is_epub(&mut std::io::Cursor::new(null)).unwrap());
    }

    #[test]
    fn test_reader() {
        #[inline]
        fn create_book() -> EpubBuilder {
            EpubBuilder::new()
                .with_title("书名")
                .with_version("2.0")
                .with_format("f书名")
                .with_creator("作者")
                .with_date("2024-03-14")
                .with_description("一本好书")
                .with_identifier("isbn")
                .with_publisher("行星出版社")
                .with_last_modify("last_modify")
                .add_assets("style.css", "ok".as_bytes().to_vec())
                .add_chapter(
                    EpubHtml::default()
                        .with_title("ok")
                        .with_file_name("0.xhtml")
                        .with_data("html".as_bytes().to_vec()),
                )
        }

        let data = create_book().mem().unwrap();

        let book = read_from_vec(data);
        let mut nb = book.unwrap();
        println!("\n{}", nb);
        let mut b = create_book().book().unwrap();
        assert_eq!(b.title(), nb.title());
        assert_eq!(b.date(), nb.date());
        assert_eq!(b.creator(), nb.creator());
        assert_eq!(b.description(), nb.description());
        assert_eq!(b.contributor(), nb.contributor());
        assert_eq!(b.format(), nb.format());
        assert_eq!(b.subject(), nb.subject());
        assert_eq!(b.publisher(), nb.publisher());
        assert_eq!(b.identifier(), nb.identifier());
        assert_eq!(b.last_modify(), nb.last_modify());

        println!("version = {}", b.version());

        // 多出来的一个是导航 nav.xhtml
        assert_eq!(b.assets().len() + 1, nb.assets().len());
        // 多出来的一个是导航 nav.xhtml
        assert_eq!(b.chapters().len() + 1, nb.chapters().len());
        assert_ne!(0, b.assets_mut().next().unwrap().data_mut().unwrap().len());

        // 读取html
        let chapter = nb.get_chapter_mut("0.xhtml");
        // assert_ne!(None, chapter);
        assert!(chapter.is_some());

        if let Some(c) = chapter {
            //body data
            let data = c.data_mut();
            assert!(data.is_some());
            let d = String::from_utf8(data.unwrap().to_vec()).unwrap();
            println!("d [{}]", d);
            assert_eq!(
                r#"
    <h1 style="text-align: center">ok</h1>
html
  "#,
                d
            );

            //raw_data
            let raw_data = c.raw_data();
            assert!(raw_data.is_some());
        }

        for a in nb.assets_mut() {
            println!(
                "ass=[{}]",
                String::from_utf8(a.data_mut().unwrap().to_vec()).unwrap()
            );
        }

        println!("nav ={:?}", nb.nav());
        assert_eq!(1, nb.nav().len());
        assert_eq!("0.xhtml", nb.nav().as_slice()[0].file_name());

        // println!("{}",c.data().map(|f|String::from_utf8(f.to_vec())).unwrap().unwrap());
    }

    #[test]
    fn test_read_empty_toc() {
        let xml = r#"<?xml version='1.0' encoding='utf-8'?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta content="1394" name="dtb:uid"/><meta content="0" name="dtb:depth"/><meta content="0" name="dtb:totalPageCount"/><meta content="0" name="dtb:maxPageNumber"/></head><docTitle><text>book_title</text></docTitle><navMap><navPoint id="0-0"><navLabel><text></text></navLabel><content src="0.xhtml"></content><navPoint id="0-0"><navLabel><text></text></navLabel><content src="0.xhtml"></content></navPoint></navPoint></navMap></ncx>"#;
        let mut book = EpubBook::default();
        let _ = read_nav_xml(xml, &mut book).unwrap();

        let n = book.nav().as_slice();

        assert_eq!(1, n.len());
        assert_eq!("", n[0].title());
        assert_eq!(1, n[0].child().len());
        assert_eq!("", n[0].child().as_slice()[0].title());
    }

    #[test]
    fn test_no_oebps_prefix_path() {
        use crate::common::tests::download_zip_file;
        // 测试不同的toc.ncx文件位置
        // 相关文件没有存放在 OEBPS 目录内
        let name = "epub-book.epub";

        let mut book = read_from_file(
            download_zip_file(
                name,
                "https://github.com/user-attachments/files/19544787/epub-book.epub.zip",
            )
            .as_str(),
        )
        .unwrap();

        let nav = book.nav().as_slice();

        assert_ne!(0, nav.len());
        assert_ne!("", nav[0].title());
        let mut chap = book.chapters();
        assert!(chap.next().is_some());
        chap.next();
        chap.next();

        assert_ne!("", chap.next().unwrap().title());
        assert_ne!(None, book.chapters_mut().next().unwrap().data_mut());
    }

    #[test]
    fn test_read_epub3() {
        let name = "../target/epub3.epub";
        let url = "https://github.com/IDPF/epub3-samples/releases/download/20230704/childrens-literature.epub";
        download_epub_file(name, url);

        let mut book = read_from_file(name).unwrap();

        let nav = book.nav().as_slice();

        assert_ne!(0, nav.len());
        assert_ne!("", nav[0].title());
        println!(
            "title = {:?}",
            book.chapters_mut()
                .map(|f| format!("{}-{}", f.title(), f.file_name()))
                .collect::<Vec<String>>()
        );

        let mut chap = book.chapters_mut();
        assert_eq!(23, chap.len());
        assert_eq!(75, chap.next().unwrap().data_mut().unwrap().len());

        // println!("{}", String::from_utf8( chap.next().unwrap().data().unwrap().to_vec()).unwrap());
        println!("title = {}", chap.next().unwrap().title());
        println!("title = {}", chap.next().unwrap().title());

        let nt = chap.next().unwrap();
        println!("nt = {}", nt.title());
        assert_eq!(9343, nt.data_mut().unwrap().to_vec().len());

        for i in chap {
            if let Some(p) = i.parser() {
                assert_ne!(0, p.extract_plain_text().len());
            }
        }
        assert!(book.get_chapter("s04.xhtml#pgepubid00536").is_some());
        // assert!(chap.next().is_some());
        // chap.next();
        // chap.next();
        // assert_ne!("", chap.next().unwrap().title());
        // assert_ne!(None, book.chapters_mut().next().unwrap().data());
    }

    /// 测试使用xhtml格式存储目录的 epub3
    #[test]
    fn test_read_epub3_toc_xhtml() {
        let name = "../target/epub3/xhtml.epub";
        download_epub_file(name, "https://github.com/IDPF/epub3-samples/releases/download/20230704/cc-shared-culture.epub");

        let mut epub = read_from_file(name).unwrap();

        assert_ne!(0, epub.nav().len());
        assert_ne!(0, epub.chapters().len());
        assert_ne!(
            0,
            String::from_utf8(
                epub.chapters_mut()
                    .next()
                    .unwrap()
                    .data_mut()
                    .unwrap()
                    .to_vec()
            )
            .unwrap()
            .len()
        );
    }
    /// 测试epub3的读取资源文件
    #[test]
    fn test_read_epub3_assets() {
        let name = "../target/epub3.epub";
        let url = "https://github.com/IDPF/epub3-samples/releases/download/20230704/childrens-literature.epub";
        download_epub_file(name, url);

        let mut book = read_from_file(name).unwrap();
        assert_ne!(0, book.assets().len());
        for ele in book.assets_mut() {
            assert_ne!(0, ele.data_mut().unwrap().len());
        }
    }

    #[test]
    fn test_read_escaped() {
        let f = if std::path::Path::new("target").exists() {
            "target/es.epub"
        } else {
            "../target/es.epub"
        };

        EpubBuilder::default()
            .with_title("Test Story `~!@#$%^&*()_+ and []\\{}| and ;':\" and ,./<>?")
            .with_creator("Test Creator `~!@#$%^&*()_+ and []\\{}| and ;':\" and ,./<>?")
            .with_date("2024-03-14")
            .with_description("Test Description `~!@#$%^&*()_+ and []\\{}| and ;':\" and ,./<>?")
            .with_identifier("isbn")
            .with_publisher("Test Publisher `~!@#$%^&*()_+ and []\\{}| and ;':\" and ,./<>?")
            .add_chapter(
                EpubHtml::default()
                    .with_file_name("0.xml")
                    .with_title("Test Title `~!@#$%^&*()_+ and []\\{}| and2 ;':\" and3 ,./<>?")
                    .with_data("<p>Test Content </p>".as_bytes().to_vec()),
            )
            .add_assets("1.css", "p{color:red}".as_bytes().to_vec())
            .metadata("s", "d")
            .metadata("h", "m")
            .file(f)
            .unwrap();
        let book = read_from_file(f).unwrap();
        assert_eq!(1, book.nav().len());
        assert_eq!(
            "1. Test Title `~!@#$%^&*()_+ and []\\{}| and2 ;':\" and3 ,./<>?",
            book.nav().next().unwrap().title()
        );

        assert_eq!(
            "Test Story `~!@#$%^&*()_+ and []\\{}| and ;':\" and ,./<>?",
            book.title()
        );
        assert_eq!(
            "Test Publisher `~!@#$%^&*()_+ and []\\{}| and ;':\" and ,./<>?",
            book.publisher().unwrap()
        );
    }

    #[test]
    fn test_read_meta_xml() {
        let xml = r##"<meta property="dcterms:modified">2025-10-18T06:23:37Z</meta>
        <dc:date id="date">2024-03-14</dc:date>
        <meta name="generator" content="iepub-1.2.0"/>
        <dc:identifier id="id">isbn</dc:identifier>
        <dc:title>Test Story `~!@#$%^&amp;*()_+ and []\{}| and ;&apos;:&quot; and ,./&lt;&gt;?</dc:title>
        <dc:creator id="creator">Test Creator `~!@#$%^&amp;*()_+ and []\{}| and ;&apos;:&quot; and ,./&lt;&gt;?</dc:creator>
        <dc:description>Test Description `~!@#$%^&amp;*()_+ and []\{}| and ;&apos;:&quot; and ,./&lt;&gt;?</dc:description>
        <meta property="desc">Test Description `~!@#$%^&amp;*()_+ and []\{}| and ;&apos;:&quot; and ,./&lt;&gt;?</meta>
        <dc:publisher id="publisher">Test Publisher `~!@#$%^&amp;*()_+ and []\{}| and ;&apos;:&quot; and ,./&lt;&gt;?</dc:publisher>
        <meta s="d"/>
        <meta h="m"/>"##;

        let mut book = EpubBook::default();
        let mut reader = quick_xml::Reader::from_str(xml);
        reader.config_mut().trim_text(true);
        read_meta_xml(&mut reader, &mut book).unwrap();
        assert_eq!(
            book.title(),
            r#"Test Story `~!@#$%^&*()_+ and []\{}| and ;':" and ,./<>?"#
        );
        assert_eq!(
            book.creator().unwrap(),
            r#"Test Creator `~!@#$%^&*()_+ and []\{}| and ;':" and ,./<>?"#
        );
        assert_eq!(
            book.description().unwrap(),
            r#"Test Description `~!@#$%^&*()_+ and []\{}| and ;':" and ,./<>?"#
        );
        assert_eq!(
            book.publisher().unwrap(),
            r#"Test Publisher `~!@#$%^&*()_+ and []\{}| and ;':" and ,./<>?"#
        );
    }

    #[test]
    fn test_get_img_src() {
        let html = r#"<div class="center" style="margin: 3.5em 0 0 0;">
        <div class="illus duokan-image-single" style="text-align: center; padding: 0pt; margin: 0pt;">
            <svg xmlns="http://www.w3.org/2000/svg" height="100%" preserveAspectRatio="xMidYMid meet" version="1.1" viewBox="0 0 567 799" width="100%" xmlns:xlink="http://www.w3.org/1999/xlink">
                <image height="799" width="567" xlink:href="../Images/cover.jpg"/>
            </svg>
        </div>
    </div>"#;
        let s = get_img_src(html.as_bytes(), "image", "xlink:href");
        assert_ne!(None, s);
        println!("{}", String::from_utf8(s.unwrap()).unwrap());

        let html = r#"<div class="center" style="margin: 3.5em 0 0 0;">
        <div class="illus duokan-image-single" style="text-align: center; padding: 0pt; margin: 0pt;">
            <svg xmlns="http://www.w3.org/2000/svg" height="100%" preserveAspectRatio="xMidYMid meet" version="1.1" viewBox="0 0 567 799" width="100%" xmlns:xlink="http://www.w3.org/1999/xlink">
                <imagexlink:href="../Images/cover.jpg"/>
            </svg>
        </div>
    </div>"#;
        let s = get_img_src(html.as_bytes(), "image", "xlink:href");
        assert_eq!(None, s);
    }

    #[test]
    fn test_read_cover_from_guide() {
        let name = if std::path::Path::new("target").exists() {
            "target/cover_from_guide.epub"
        } else {
            "../target/cover_from_guide.epub"
        };
        let url = "https://github.com/user-attachments/files/23620295/05.zip";
        download_epub_file(name, url);

        let book = read_from_file(name).unwrap();
        assert!(book.cover().is_some());
    }

    ///
    /// toc.ncx 不再作为assets的一部分，也就不对调用方公开了
    ///
    #[test]
    fn test_remove_toc_from_assets() {
        let name = if std::path::Path::new("target").exists() {
            "target/cover_from_guide.epub"
        } else {
            "../target/cover_from_guide.epub"
        };
        let url = "https://github.com/user-attachments/files/23620295/05.zip";
        download_epub_file(name, url);

        let book = read_from_file(name).unwrap();

        assert!(book.toc().is_some());

        assert!(!book.assets().any(|f| f.id() == "toc" || f.id() == "ncx"));
        assert_eq!(10, book.nav().len());
    }
}
