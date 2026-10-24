use std::ops::Deref;

use super::common;
use crate::{common::get_media_type, prelude::*};
use quick_xml::events::Event;
use quick_xml::XmlVersion;

/// 生成html
pub(crate) fn to_html(chap: &mut EpubHtml, append_title: bool, dir: &Option<Direction>) -> String {
    let mut css = String::new();
    if let Some(links) = chap.links() {
        for ele in links {
            match &ele.rel {
                LinkRel::CSS => {
                    css.push_str(
                        format!(
                            "<link href=\"{}\" rel=\"stylesheet\" type=\"text/css\"/>",
                            ele.href
                        )
                        .as_str(),
                    );
                }
                LinkRel::OTHER(h) => {
                    css.push_str(format!("<link href=\"{}\" rel=\"{h}\"/>", ele.href).as_str());
                }
            }
        }
    }

    let cus_css = chap.css();
    if let Some(v) = cus_css {
        css.push_str(format!("\n<style type=\"text/css\">{}</style>", v).as_str());
    }
    let mut body = String::new();
    {
        body.insert_str(
            0,
            String::from_utf8(chap.data_mut().as_ref().unwrap().to_vec())
                .unwrap()
                .as_str(),
        );
        // 正文
    }
    let mut dir_s = String::new();
    if let Some(d) = &chap.direction {
        dir_s = format!(r#" dir="{d}""#);
    } else if let Some(d) = dir {
        dir_s = format!(r#" dir="{d}""#);
    }
    let lang = chap.lang.as_str();
    let title = escape_xml(chap.title());
    format!(
        r#"<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" epub:prefix="z3998: http://www.daisy.org/z3998/2012/vocab/structure/#" lang="{lang}" xml:lang="{lang}"{dir_s}>
  <head>
    <title>{title}</title>
{css}
</head>
  <body{}>
    {}
{body}
  </body>
</html>"#,
        chap.body_attribute
            .as_ref()
            .and_then(|f| String::from_utf8(f.clone()).ok())
            .unwrap_or_default(),
        if append_title {
            format!(r#"<h1 style="text-align: center">{}</h1>"#, title)
        } else {
            String::new()
        }
    )
}

fn to_nav_xml(nav: std::slice::Iter<EpubNav>) -> String {
    let mut xml = String::new();
    xml.push_str("<ul>");
    for ele in nav {
        if ele.child().len() == 0 {
            // 没有下一级
            xml.push_str(
                format!(
                    "<li><a href=\"{}\">{}</a></li>",
                    ele.file_name(),
                    escape_xml(ele.title()),
                )
                .as_str(),
            );
        } else {
            xml.push_str(
                format!(
                    "<li><a href=\"{}\">{}</a>{}</li>",
                    ele.child().as_slice()[0].file_name(),
                    escape_xml(ele.title()),
                    to_nav_xml(ele.child()).as_str()
                )
                .as_str(),
            );
        }
    }
    xml.push_str("</ul>");
    xml
}

/// 生成自定义的导航html
pub(crate) fn to_nav_html(
    book_title: &str,
    nav: std::slice::Iter<EpubNav>,
    lang: &str,
    dir: &Option<Direction>,
) -> String {
    let book_title = escape_xml(book_title);
    format!(
        r#"<?xml version='1.0' encoding='utf-8'?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="{lang}" xml:lang="{lang}"{}><head><title>{book_title}</title></head><body><nav epub:type="toc" id="id" role="doc-toc"><h2>{book_title}</h2>{}</nav></body></html>"#,
        if let Some(d) = dir {
            format!(r#" dir="{d}""#)
        } else {
            String::new()
        },
        to_nav_xml(nav)
    )
}

fn to_toc_xml_point(nav: std::slice::Iter<EpubNav>, parent: usize) -> String {
    let mut xml = String::new();
    for (index, ele) in nav.enumerate() {
        xml.push_str(format!("<navPoint id=\"{}-{}\">", parent, index).as_str());
        if ele.child().len() == 0 {
            xml.push_str(
                format!(
                    "<navLabel><text>{}</text></navLabel><content src=\"{}\"></content>",
                    escape_xml(ele.title()),
                    ele.file_name()
                )
                .as_str(),
            );
        } else {
            xml.push_str(
                format!(
                    "<navLabel><text>{}</text></navLabel><content src=\"{}\"></content>{}",
                    escape_xml(ele.title()),
                    ele.child().as_slice()[0].file_name(),
                    to_toc_xml_point(ele.child(), index).as_str()
                )
                .as_str(),
            );
        }
        xml.push_str("</navPoint>");
    }
    xml
}

/// 生成epub中的toc.ncx文件
pub(crate) fn to_toc_xml(book_title: &str, nav: std::slice::Iter<EpubNav>) -> String {
    let book_title = escape_xml(book_title);
    format!(
        r#"<?xml version='1.0' encoding='utf-8'?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta content="1394" name="dtb:uid"/><meta content="0" name="dtb:depth"/><meta content="0" name="dtb:totalPageCount"/><meta content="0" name="dtb:maxPageNumber"/></head><docTitle><text>{book_title}</text></docTitle><navMap>{}</navMap></ncx>"#,
        to_toc_xml_point(nav, 0)
    )
}

fn write_metadata(
    book: &EpubBook,
    generator: &str,
    xml: &mut quick_xml::Writer<std::io::Cursor<Vec<u8>>>,
) -> IResult<()> {
    use quick_xml::events::{BytesStart, BytesText, Event};

    // metadata
    let mut metadata = BytesStart::new("metadata");
    metadata.push_attribute(("xmlns:dc", "http://purl.org/dc/elements/1.1/"));
    metadata.push_attribute(("xmlns:opf", "http://www.idpf.org/2007/opf"));

    xml.write_event(Event::Start(metadata.borrow()))?;

    // metadata 内元素
    let now = book.last_modify().map_or_else(
        || crate::common::DateTimeFormater::default().default_format(),
        String::from,
    );

    xml.create_element("meta")
        .with_attribute(("property", "dcterms:modified"))
        .write_text_content(BytesText::new(now.as_str()))?;

    if let Some(v) = book.date() {
        xml.create_element("dc:date")
            .with_attribute(("id", "date"))
            .with_attribute(("opf:event", "publication"))
            .write_text_content(BytesText::new(v))?;
    }

    xml.create_element("meta")
        .with_attribute(("name", "generator"))
        .with_attribute(("content", generator))
        .write_empty()?;

    xml.create_element("dc:identifier")
        .with_attribute(("id", "id"))
        .write_text_content(BytesText::new(book.identifier()))?;
    xml.create_element("dc:title")
        .write_text_content(BytesText::new(book.title()))?;
    // xml
    // .create_element("dc:lang")
    // .write_text_content(BytesText::new(book.info.title.as_str()));
    if let Some(creator) = book.creator() {
        xml.create_element("dc:creator")
            .with_attribute(("id", "creator"))
            .write_text_content(BytesText::new(creator))?;
    }
    if let Some(desc) = book.description() {
        xml.create_element("dc:description")
            .write_text_content(BytesText::new(desc))?;

        xml.create_element("meta")
            .with_attribute(("property", "desc"))
            .write_text_content(BytesText::new(desc))?;
    }
    if book.cover().is_some() {
        xml.create_element("meta")
            .with_attribute(("name", "cover"))
            .with_attribute(("content", "cover-img"))
            .write_empty()?;
    }

    if let Some(v) = book.format() {
        xml.create_element("dc:format")
            .with_attribute(("id", "format"))
            .write_text_content(BytesText::new(v))?;
    }
    if let Some(v) = book.publisher() {
        xml.create_element("dc:publisher")
            .with_attribute(("id", "publisher"))
            .write_text_content(BytesText::new(v))?;
    }
    if let Some(v) = book.subject() {
        xml.create_element("dc:subject")
            .with_attribute(("id", "subject"))
            .write_text_content(BytesText::new(v))?;
    }
    if let Some(v) = book.contributor() {
        xml.create_element("dc:contributor")
            .with_attribute(("id", "contributor"))
            .write_text_content(BytesText::new(v))?;
    }

    // 自定义的meta
    for ele in book.meta() {
        let mut x = xml.create_element("meta");
        for (key, value) in ele.attrs() {
            x = x.with_attribute((key.as_str(), value.as_str()));
        }
        if let Some(t) = ele.text() {
            x.write_text_content(BytesText::new(t))?;
        } else {
            x.write_empty()?;
        }
    }

    xml.write_event(Event::End(metadata.to_end()))?;

    Ok(())
}

pub(crate) fn do_to_opf(book: &mut EpubBook, generator: &str) -> IResult<String> {
    let vue: Vec<u8> = Vec::new();
    let mut xml: quick_xml::Writer<std::io::Cursor<Vec<u8>>> =
        quick_xml::Writer::new(std::io::Cursor::new(vue));
    use quick_xml::events::*;

    xml.write_event(Event::Decl(BytesDecl::new("1.0", Some("utf-8"), None)))?;

    let mut html = BytesStart::new("package");
    html.push_attribute(("xmlns", "http://www.idpf.org/2007/opf"));
    html.push_attribute(("unique-identifier", "id"));
    html.push_attribute(("version", book.version()));
    html.push_attribute(("prefix", "rendition: http://www.idpf.org/vocab/rendition/#"));

    xml.write_event(Event::Start(html.borrow()))?;

    // 写入 metadata
    write_metadata(book, generator, &mut xml)?;

    // manifest
    let manifest = BytesStart::new("manifest");
    xml.write_event(Event::Start(manifest.borrow()))?;

    // manifest 内 item

    // toc
    xml.create_element("item")
        .with_attribute(("href", common::TOC.replace(common::EPUB, "").as_str()))
        .with_attribute(("id", "ncx"))
        .with_attribute(("media-type", "application/x-dtbncx+xml"))
        .write_empty()?;
    // nav
    xml.create_element("item")
        .with_attribute(("href", common::NAV.replace(common::EPUB, "").as_str()))
        .with_attribute(("id", "toc"))
        .with_attribute(("media-type", "application/xhtml+xml"))
        .with_attribute(("properties", "nav"))
        .write_empty()?;
    if let Some(cover) = book.cover() {
        xml.create_element("item")
            .with_attribute(("href", cover.file_name()))
            .with_attribute(("id", "cover-img"))
            .with_attribute(("media-type", get_media_type(cover.file_name()).as_str()))
            .with_attribute(("properties", "cover-image"))
            .write_empty()?;
        xml.create_element("item")
            .with_attribute(("href", common::COVER.replace(common::EPUB, "").as_str()))
            .with_attribute(("id", "cover"))
            .with_attribute(("media-type", "application/xhtml+xml"))
            .write_empty()?;
    }
    for (index, ele) in book.assets().enumerate() {
        xml.create_element("item")
            .with_attribute((
                "href",
                if ele.file_name().starts_with("/") {
                    &ele.file_name()[1..]
                } else {
                    ele.file_name()
                },
            ))
            .with_attribute(("id", format!("assets_{}", index).as_str()))
            .with_attribute(("media-type", get_media_type(ele.file_name()).as_str()))
            .write_empty()?;
    }

    for (index, ele) in book.chapters().enumerate() {
        xml.create_element("item")
            .with_attribute((
                "href",
                if ele.file_name().starts_with("/") {
                    &ele.file_name()[1..]
                } else {
                    ele.file_name()
                },
            ))
            .with_attribute(("id", format!("chap_{}", index).as_str()))
            .with_attribute(("media-type", "application/xhtml+xml"))
            .write_empty()?;
    }

    if let Some(cover) = book.cover_chapter() {
        xml.create_element("item")
            .with_attribute((
                "href",
                if cover.file_name().starts_with("/") {
                    &cover.file_name()[1..]
                } else {
                    cover.file_name()
                },
            ))
            .with_attribute(("id", "cover"))
            .with_attribute(("media-type", "application/xhtml+xml"))
            .write_empty()?;
    }

    xml.write_event(Event::End(manifest.to_end()))?;

    let mut spine = BytesStart::new("spine");
    spine.push_attribute(("toc", "ncx"));
    if let Some(dir) = &book.direction {
        spine.push_attribute(("page-progression-direction", format!("{dir}").as_str()));
    }
    xml.write_event(Event::Start(spine.borrow()))?;
    // 把封面放第一个 nav，导航第二个
    if let Some(_co) = book.cover_chapter() {
        xml.create_element("itemref")
            .with_attribute(("idref", "cover"))
            .write_empty()?;
    }
    xml.create_element("itemref")
        .with_attribute(("idref", "toc"))
        .write_empty()?;
    // spine 内的 itemref
    for (index, _ele) in book.chapters().enumerate() {
        xml.create_element("itemref")
            .with_attribute(("idref", format!("chap_{}", index).as_str()))
            .write_empty()?;
    }
    xml.write_event(Event::End(spine.to_end()))?;

    if let Some(c) = book.cover_chapter() {
        let guide = BytesStart::new("guide");
        xml.write_event(Event::Start(guide.borrow()))?;
        xml.create_element("reference")
            .with_attribute(("href", c.file_name()))
            .with_attribute(("title", c.title()))
            .with_attribute(("type", "cover"))
            .write_empty()?;
        xml.write_event(Event::End(guide.to_end()))?;
    }

    xml.write_event(Event::End(html.to_end()))?;

    match String::from_utf8(xml.into_inner().into_inner()) {
        Ok(v) => Ok(v),
        Err(e) => Err(IError::Utf8(e)),
    }
}

/// 生成OPF
pub(crate) fn to_opf(book: &mut EpubBook, generator: &str) -> String {
    do_to_opf(book, generator).unwrap_or_default()
}

pub(crate) struct HtmlInfo {
    pub(crate) title: String,
    pub(crate) content: Vec<u8>,
    pub(crate) language: Option<String>,
    pub(crate) direction: Option<Direction>,
    pub(crate) link: Vec<EpubLink>,
    pub(crate) style: Option<String>,
    pub(crate) body_attribute: Option<Vec<u8>>,
}

///
/// 解析html获取相关数据
///
pub(crate) fn get_html_info(html: &str, id: Option<&str>) -> IResult<HtmlInfo> {
    use quick_xml::reader::Reader;
    let mut lang = None;
    let mut direction = None;
    let mut title = String::new();
    let mut content = Vec::new();
    let mut link = Vec::new();

    let mut reader = Reader::from_str(html);
    reader.config_mut().trim_text(false);
    reader.config_mut().expand_empty_elements = true;
    reader.config_mut().check_end_names = false;
    let mut buf = Vec::new();
    let mut parent: Vec<&str> = Vec::new();
    let mut body_data: Option<Vec<u8>> = None;
    let mut body_attribute: Option<Vec<u8>> = None;
    let mut style = String::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Eof) => {
                break;
            }
            Err(e) => {
                return Err(IError::Xml(e));
            }
            Ok(Event::Start(body)) => match body.name().as_ref() {
                b"html" => {
                    parent.push("html");
                    // 尝试获取lang
                    if let Ok(href) = body.try_get_attribute("lang") {
                        if let Some(h) = href.map(|f| {
                            f.normalized_value(XmlVersion::Implicit1_0)
                                .map_or_else(|_| String::new(), |v| v.to_string())
                        }) {
                            lang = Some(h);
                        }
                    }
                    if let Ok(href) = body.try_get_attribute("xml:lang") {
                        if let Some(h) = href.map(|f| {
                            f.normalized_value(XmlVersion::Implicit1_0)
                                .map_or_else(|_| String::new(), |v| v.to_string())
                        }) {
                            lang = Some(h);
                        }
                    }
                    if let Ok(href) = body.try_get_attribute("dir") {
                        if let Some(h) = href.map(|f| {
                            f.normalized_value(XmlVersion::Implicit1_0)
                                .map_or_else(|_| String::new(), |v| v.to_string())
                        }) {
                            direction = Some(Direction::from(h))
                        }
                    }
                }
                b"head" => {
                    if parent.len() != 1 || parent[0] != "html" {
                        return Err(IError::Unknown);
                    }
                    parent.push("head");
                }
                b"style" => {
                    if parent.last().map(|f| f == &"head").unwrap_or(false) {
                        parent.push("style");
                    }
                }
                b"link" => {
                    if parent.last().map(|f| f == &"head").unwrap_or(false) {
                        // 读取link标签
                        if let Ok(href) = body.try_get_attribute("href") {
                            if let Some(h) = href.map(|f| {
                                f.normalized_value(XmlVersion::Implicit1_0)
                                    .map_or_else(|_| String::new(), |v| v.to_string())
                            }) {
                                let mut rel = LinkRel::CSS;

                                if let Ok(href) = body.try_get_attribute("rel") {
                                    if let Some(h) = href.map(|m| {
                                        m.normalized_value(XmlVersion::Implicit1_0)
                                            .map_or_else(|_| String::new(), |v| v.to_string())
                                    }) {
                                        if h != "stylesheet" {
                                            rel = LinkRel::OTHER(h);
                                        }
                                    }
                                }

                                link.push(EpubLink {
                                    rel,
                                    file_type: String::new(),
                                    href: h,
                                    data: Vec::new(),
                                });
                            }
                        }
                    }
                }
                b"title" => {
                    if parent.len() == 2 && parent[0] == "html" && parent[1] == "head" {
                        parent.push("title");
                    }
                }
                b"body" => {
                    let a = body.attributes_raw().to_vec();
                    if !a.is_empty() {
                        body_attribute = Some(a);
                    }
                    body_data = reader
                        .read_text(body.to_end().to_owned().name())
                        .map(|f| f.to_vec())
                        .map_err(IError::Xml)
                        .ok();
                    if body_data.is_some() {
                        break;
                    }
                }
                _ => {}
            },
            Ok(Event::End(e)) => match e.name().as_ref() {
                b"title" => {
                    if !parent.is_empty() {
                        parent.remove(parent.len() - 1);
                    }
                }
                b"head" => {
                    if !parent.is_empty() {
                        parent.remove(parent.len() - 1);
                    }
                }
                b"body" => {
                    if !parent.is_empty() {
                        parent.remove(parent.len() - 1);
                    }
                }
                b"html" => {
                    if !parent.is_empty() {
                        parent.remove(parent.len() - 1);
                    }
                }
                b"style" => {
                    if parent.last().map(|f| f == &"style").unwrap_or(false) {
                        parent.remove(parent.len() - 1);
                    }
                }
                _ => {}
            },
            Ok(Event::Text(e)) => {
                if parent.len() == 3 && parent[2] == "title" {
                    title.push_str(e.decode().map_err(IError::Encoding)?.deref());
                }
                if parent.last().map(|f| f == &"style").unwrap_or(false) {
                    // css 样式，应该不会有转义代码出现，就不考虑了
                    style.push_str(e.decode().map_err(IError::Encoding)?.deref());
                }
            }
            Ok(Event::GeneralRef(e)) => {
                if parent.len() == 3 && parent[2] == "title" {
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
            _ => {}
        }
    }
    if let Some(mut b) = body_data {
        if let Some(id) = id {
            // 重新读取数据
            content.append(&mut get_section_from_html(
                String::from_utf8(b).unwrap().as_str(),
                id,
            )?);
        } else {
            content.append(&mut b);
        }
    }
    Ok(HtmlInfo {
        title: title.trim().to_string(),
        content,
        language: lang,
        direction,
        link,
        style: if style.is_empty() {
            None
        } else {
            Some(style.trim().to_string())
        },
        body_attribute,
    })
}

/// epub3 将所有正文放到一个文件里，不同的section代表不同的章节
fn get_section_from_html(body: &str, id: &str) -> IResult<Vec<u8>> {
    use quick_xml::reader::Reader;

    let mut content = Vec::new();
    let mut reader = Reader::from_str(body);
    // reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Eof) => {
                break;
            }
            Err(e) => {
                return Err(IError::Xml(e));
            }
            Ok(Event::Start(body)) => {
                if body.name().as_ref() == b"section"
                    && body
                        .try_get_attribute("id")
                        .map_err(|_e| IError::Unknown)
                        .and_then(|f| f.ok_or(IError::Unknown))
                        .map(|f| {
                            f.normalized_value(XmlVersion::Implicit1_0)
                                .map_or_else(|_| String::new(), |v| v.to_string())
                        })
                        .map(|f| f == id)
                        .unwrap_or(false)
                {
                    let v = reader
                        .read_text(body.to_end().to_owned().name())
                        .map(|f| f.to_vec())
                        .map_err(IError::Xml)
                        .ok();

                    if let Some(mut v) = v {
                        content.append(&mut v);
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    Ok(content)
}

#[cfg(test)]
mod test {

    use super::{get_html_info, get_media_type, to_html, to_toc_xml};
    use super::{to_nav_html, to_opf};
    use crate::common::tests::download_zip_file;
    use crate::prelude::*;

    impl PartialEq<Direction> for Direction {
        fn eq(&self, other: &Direction) -> bool {
            match (self, other) {
                (Self::CUS(l0), Self::CUS(r0)) => l0 == r0,
                _ => core::mem::discriminant(self) == core::mem::discriminant(other),
            }
        }
    }

    impl PartialEq<Option<Direction>> for Direction {
        fn eq(&self, other: &Option<Direction>) -> bool {
            if let Some(o) = other {
                format!("{o}") == format!("{}", self)
            } else {
                false
            }
        }
    }

    #[test]
    fn test_to_html() {
        let mut t = EpubHtml::default();
        t.set_title("title");
        t.set_data(String::from("ok").as_bytes().to_vec());
        t.set_css("#id{width:10%}");
        t.set_language("zh");
        let link = EpubLink {
            href: String::from("href"),
            file_type: String::from("css"),
            rel: LinkRel::CSS,
            data: Vec::new(),
        };

        t.add_link(link);
        let html = to_html(&mut t, true, &None);

        println!("{}", html);

        assert_eq!(
            html,
            r###"<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" epub:prefix="z3998: http://www.daisy.org/z3998/2012/vocab/structure/#" lang="zh" xml:lang="zh">
  <head>
    <title>title</title>
<link href="href" rel="stylesheet" type="text/css"/>
<style type="text/css">#id{width:10%}</style>
</head>
  <body>
    <h1 style="text-align: center">title</h1>
ok
  </body>
</html>"###
        );

        // test dir
        t.set_direction(Direction::RTL);
        let html = to_html(&mut t, true, &None);

        println!("{}", html);

        assert_eq!(
            html,
            r###"<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" epub:prefix="z3998: http://www.daisy.org/z3998/2012/vocab/structure/#" lang="zh" xml:lang="zh" dir="rtl">
  <head>
    <title>title</title>
<link href="href" rel="stylesheet" type="text/css"/>
<style type="text/css">#id{width:10%}</style>
</head>
  <body>
    <h1 style="text-align: center">title</h1>
ok
  </body>
</html>"###
        );

        // 测试优先级
        t.set_direction(Direction::LTR);
        let html = to_html(&mut t, true, &Some(Direction::RTL));

        assert_eq!(
            html,
            r###"<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" epub:prefix="z3998: http://www.daisy.org/z3998/2012/vocab/structure/#" lang="zh" xml:lang="zh" dir="ltr">
  <head>
    <title>title</title>
<link href="href" rel="stylesheet" type="text/css"/>
<style type="text/css">#id{width:10%}</style>
</head>
  <body>
    <h1 style="text-align: center">title</h1>
ok
  </body>
</html>"###
        );

        // 测试link
        t.add_link(EpubLink {
            rel: LinkRel::OTHER("t".to_string()),
            file_type: "()".to_string(),
            href: "1.css".to_string(),
            data: Vec::new(),
        });
        let html = to_html(&mut t, true, &Some(Direction::RTL));

        assert_eq!(
            html,
            r###"<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" epub:prefix="z3998: http://www.daisy.org/z3998/2012/vocab/structure/#" lang="zh" xml:lang="zh" dir="ltr">
  <head>
    <title>title</title>
<link href="href" rel="stylesheet" type="text/css"/><link href="1.css" rel="t"/>
<style type="text/css">#id{width:10%}</style>
</head>
  <body>
    <h1 style="text-align: center">title</h1>
ok
  </body>
</html>"###
        );
        t.body_attribute = Some(" class=\"ok\"".as_bytes().to_vec());
        let html = to_html(&mut t, true, &Some(Direction::RTL));

        assert_eq!(
            html,
            r###"<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" epub:prefix="z3998: http://www.daisy.org/z3998/2012/vocab/structure/#" lang="zh" xml:lang="zh" dir="ltr">
  <head>
    <title>title</title>
<link href="href" rel="stylesheet" type="text/css"/><link href="1.css" rel="t"/>
<style type="text/css">#id{width:10%}</style>
</head>
  <body class="ok">
    <h1 style="text-align: center">title</h1>
ok
  </body>
</html>"###
        );
    }

    #[test]
    fn test_to_htm_escape() {
        let mut t = EpubHtml::default();
        t.set_title(r##"Test Title `~!@#$%^&*()_+ and []\{}| and ;':" and ,./<>?"##);
        t.set_data(String::from("ok").as_bytes().to_vec());
        t.set_css("#id{width:10%}");
        t.set_language("zh");
        let link = EpubLink {
            href: String::from("href"),
            file_type: String::from("css"),
            rel: LinkRel::CSS,
            data: Vec::new(),
        };

        t.add_link(link);
        let html = to_html(&mut t, true, &None);

        println!("{}", html);

        assert_eq!(
            html,
            r###"<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" epub:prefix="z3998: http://www.daisy.org/z3998/2012/vocab/structure/#" lang="zh" xml:lang="zh">
  <head>
    <title>Test Title `~!@#$%^&amp;*()_+ and []\{}| and ;&apos;:&quot; and ,./&lt;&gt;?</title>
<link href="href" rel="stylesheet" type="text/css"/>
<style type="text/css">#id{width:10%}</style>
</head>
  <body>
    <h1 style="text-align: center">Test Title `~!@#$%^&amp;*()_+ and []\{}| and ;&apos;:&quot; and ,./&lt;&gt;?</h1>
ok
  </body>
</html>"###
        );
    }

    #[test]
    fn test_to_nav_html() {
        let mut n = EpubNav::default();
        n.set_title("作品说明");
        n.set_file_name("file_name");

        let mut n1 = EpubNav::default();
        n1.set_title("第一卷");

        let mut n2 = EpubNav::default();
        n2.set_title("第一卷 第一章");
        n2.set_file_name("0.xhtml");

        let mut n3 = EpubNav::default();
        n3.set_title("第一卷 第二章");
        n3.set_file_name("1.xhtml");
        n1.push(n2);

        let nav = vec![n, n1];

        let html = to_nav_html("book_title", nav.iter(), "zh", &None);

        println!("{}", html);

        assert_eq!(
            r###"<?xml version='1.0' encoding='utf-8'?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh" xml:lang="zh"><head><title>book_title</title></head><body><nav epub:type="toc" id="id" role="doc-toc"><h2>book_title</h2><ul><li><a href="file_name">作品说明</a></li><li><a href="0.xhtml">第一卷</a><ul><li><a href="0.xhtml">第一卷 第一章</a></li></ul></li></ul></nav></body></html>"###,
            html
        );

        let html = to_nav_html("book_title", nav.iter(), "en", &Some(Direction::RTL));

        println!("{}", html);

        assert_eq!(
            r###"<?xml version='1.0' encoding='utf-8'?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en" dir="rtl"><head><title>book_title</title></head><body><nav epub:type="toc" id="id" role="doc-toc"><h2>book_title</h2><ul><li><a href="file_name">作品说明</a></li><li><a href="0.xhtml">第一卷</a><ul><li><a href="0.xhtml">第一卷 第一章</a></li></ul></li></ul></nav></body></html>"###,
            html
        );
    }

    #[test]
    fn test_to_nav_html_escape() {
        let mut n = EpubNav::default();
        n.set_title("Test Story `~!@#$%^&*()_+ and []\\{}| and ;':\" and ,./<>?");
        n.set_file_name("file_name");

        let mut n1 = EpubNav::default();
        n1.set_title("第一卷");

        let mut n2 = EpubNav::default();
        n2.set_title("第一卷 第一章");
        n2.set_file_name("0.xhtml");

        let mut n3 = EpubNav::default();
        n3.set_title("第一卷 第二章");
        n3.set_file_name("1.xhtml");
        n1.push(n2);

        let nav = vec![n, n1];

        let html = to_nav_html(
            "Test Story Title `~!@#$%^&*()_+ and []\\{}| and ;':\" and ,./<>?",
            nav.iter(),
            "zh",
            &None,
        );

        println!("{}", html);

        assert_eq!(
            r###"<?xml version='1.0' encoding='utf-8'?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh" xml:lang="zh"><head><title>Test Story Title `~!@#$%^&amp;*()_+ and []\{}| and ;&apos;:&quot; and ,./&lt;&gt;?</title></head><body><nav epub:type="toc" id="id" role="doc-toc"><h2>Test Story Title `~!@#$%^&amp;*()_+ and []\{}| and ;&apos;:&quot; and ,./&lt;&gt;?</h2><ul><li><a href="file_name">Test Story `~!@#$%^&amp;*()_+ and []\{}| and ;&apos;:&quot; and ,./&lt;&gt;?</a></li><li><a href="0.xhtml">第一卷</a><ul><li><a href="0.xhtml">第一卷 第一章</a></li></ul></li></ul></nav></body></html>"###,
            html
        );
    }

    #[test]
    fn test_to_toc_xml() {
        let mut n = EpubNav::default();
        n.set_title("作品说明");
        n.set_file_name("file_name");

        let mut n1 = EpubNav::default();
        n1.set_title("第一卷");

        let mut n2 = EpubNav::default();
        n2.set_title("第一卷 第一章");
        n2.set_file_name("0.xhtml");

        let mut n3 = EpubNav::default();
        n3.set_title("第一卷 第二章");
        n3.set_file_name("1.xhtml");
        n1.push(n2);

        let nav = vec![n, n1];

        let html = to_toc_xml("book_title", nav.iter());

        println!("{}", html);

        assert_eq!(
            r###"<?xml version='1.0' encoding='utf-8'?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta content="1394" name="dtb:uid"/><meta content="0" name="dtb:depth"/><meta content="0" name="dtb:totalPageCount"/><meta content="0" name="dtb:maxPageNumber"/></head><docTitle><text>book_title</text></docTitle><navMap><navPoint id="0-0"><navLabel><text>作品说明</text></navLabel><content src="file_name"></content></navPoint><navPoint id="0-1"><navLabel><text>第一卷</text></navLabel><content src="0.xhtml"></content><navPoint id="1-0"><navLabel><text>第一卷 第一章</text></navLabel><content src="0.xhtml"></content></navPoint></navPoint></navMap></ncx>"###,
            html
        );
    }

    #[test]
    fn test_to_toc_xml_escape() {
        let mut n = EpubNav::default();
        n.set_title("Test Story `~!@#$%^&*()_+ and []\\{}| and ;':\" and ,./<>?");
        n.set_file_name("file_name");

        let mut n1 = EpubNav::default();
        n1.set_title("第一卷");

        let mut n2 = EpubNav::default();
        n2.set_title("第一卷 第一章");
        n2.set_file_name("0.xhtml");

        let mut n3 = EpubNav::default();
        n3.set_title("第一卷 第二章");
        n3.set_file_name("1.xhtml");
        n1.push(n2);

        let nav = vec![n, n1];

        let html = to_toc_xml(
            "Test Story Title `~!@#$%^&*()_+ and []\\{}| and ;':\" and ,./<>?",
            nav.iter(),
        );

        println!("{}", html);

        assert_eq!(
            r###"<?xml version='1.0' encoding='utf-8'?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta content="1394" name="dtb:uid"/><meta content="0" name="dtb:depth"/><meta content="0" name="dtb:totalPageCount"/><meta content="0" name="dtb:maxPageNumber"/></head><docTitle><text>Test Story Title `~!@#$%^&amp;*()_+ and []\{}| and ;&apos;:&quot; and ,./&lt;&gt;?</text></docTitle><navMap><navPoint id="0-0"><navLabel><text>Test Story `~!@#$%^&amp;*()_+ and []\{}| and ;&apos;:&quot; and ,./&lt;&gt;?</text></navLabel><content src="file_name"></content></navPoint><navPoint id="0-1"><navLabel><text>第一卷</text></navLabel><content src="0.xhtml"></content><navPoint id="1-0"><navLabel><text>第一卷 第一章</text></navLabel><content src="0.xhtml"></content></navPoint></navPoint></navMap></ncx>"###,
            html
        );
    }

    #[test]
    fn test_to_opf() {
        let mut epub = EpubBook::default();

        epub.set_title("中文");
        epub.set_creator("作者");
        epub.set_date("29939");
        epub.set_version("3.0");
        epub.set_subject("subject");
        epub.set_format("format");
        epub.set_publisher("publisher");
        epub.set_contributor("contributor");
        epub.set_description("description");
        epub.set_identifier("identifier");

        let mut n = EpubNav::default();
        n.set_title("作品说明");
        n.set_file_name("file_name");

        let mut n1 = EpubNav::default();
        n1.set_title("第一卷");

        let mut n2 = EpubNav::default();
        n2.set_title("第一卷 第一章");
        n2.set_file_name("0.xhtml");

        let mut n3 = EpubNav::default();
        n3.set_title("第一卷 第二章");
        n3.set_file_name("/1.xhtml");
        n1.push(n2);

        epub.add_nav(n);
        epub.add_nav(n1);

        epub.add_assets(EpubAssets::default().with_file_name("1.png"));
        epub.add_assets(EpubAssets::default().with_file_name("/2.png"));

        epub.add_chapter(EpubHtml::default());

        epub.set_cover(EpubAssets::default());

        epub.add_meta(
            EpubMetaData::default()
                .with_attr("ok", "ov")
                .with_text("new"),
        );

        epub.set_date("2024-06-28T08:07:07UTC");
        epub.set_last_modify("2024-06-28T03:07:07UTC");

        let res = to_opf(&mut epub, "epub-rs");

        let ass: &str = r###"<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="id" version="3.0" prefix="rendition: http://www.idpf.org/vocab/rendition/#"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf"><meta property="dcterms:modified">2024-06-28T03:07:07UTC</meta><dc:date id="date" opf:event="publication">2024-06-28T08:07:07UTC</dc:date><meta name="generator" content="epub-rs"/><dc:identifier id="id">identifier</dc:identifier><dc:title>中文</dc:title><dc:creator id="creator">作者</dc:creator><dc:description>description</dc:description><meta property="desc">description</meta><meta name="cover" content="cover-img"/><dc:format id="format">format</dc:format><dc:publisher id="publisher">publisher</dc:publisher><dc:subject id="subject">subject</dc:subject><dc:contributor id="contributor">contributor</dc:contributor><meta ok="ov">new</meta></metadata><manifest><item href="toc.ncx" id="ncx" media-type="application/x-dtbncx+xml"/><item href="nav.xhtml" id="toc" media-type="application/xhtml+xml" properties="nav"/><item href="" id="cover-img" media-type="" properties="cover-image"/><item href="cover.xhtml" id="cover" media-type="application/xhtml+xml"/><item href="1.png" id="assets_0" media-type="image/png"/><item href="2.png" id="assets_1" media-type="image/png"/><item href="" id="chap_0" media-type="application/xhtml+xml"/></manifest><spine toc="ncx"><itemref idref="toc"/><itemref idref="chap_0"/></spine></package>"###;
        assert_eq!(ass, res.as_str());

        // direction
        epub.set_direction(Direction::RTL);

        let res = to_opf(&mut epub, "epub-rs");

        let ass: &str = r###"<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="id" version="3.0" prefix="rendition: http://www.idpf.org/vocab/rendition/#"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf"><meta property="dcterms:modified">2024-06-28T03:07:07UTC</meta><dc:date id="date" opf:event="publication">2024-06-28T08:07:07UTC</dc:date><meta name="generator" content="epub-rs"/><dc:identifier id="id">identifier</dc:identifier><dc:title>中文</dc:title><dc:creator id="creator">作者</dc:creator><dc:description>description</dc:description><meta property="desc">description</meta><meta name="cover" content="cover-img"/><dc:format id="format">format</dc:format><dc:publisher id="publisher">publisher</dc:publisher><dc:subject id="subject">subject</dc:subject><dc:contributor id="contributor">contributor</dc:contributor><meta ok="ov">new</meta></metadata><manifest><item href="toc.ncx" id="ncx" media-type="application/x-dtbncx+xml"/><item href="nav.xhtml" id="toc" media-type="application/xhtml+xml" properties="nav"/><item href="" id="cover-img" media-type="" properties="cover-image"/><item href="cover.xhtml" id="cover" media-type="application/xhtml+xml"/><item href="1.png" id="assets_0" media-type="image/png"/><item href="2.png" id="assets_1" media-type="image/png"/><item href="" id="chap_0" media-type="application/xhtml+xml"/></manifest><spine toc="ncx" page-progression-direction="rtl"><itemref idref="toc"/><itemref idref="chap_0"/></spine></package>"###;
        assert_eq!(ass, res.as_str());

        // test cover xhtml
        epub.cover_chapter = Some(
            EpubHtml::default()
                .with_title("封面")
                .with_file_name("1.xhtml"),
        );
        let res = to_opf(&mut epub, "epub-rs");

        let ass: &str = r###"<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="id" version="3.0" prefix="rendition: http://www.idpf.org/vocab/rendition/#"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf"><meta property="dcterms:modified">2024-06-28T03:07:07UTC</meta><dc:date id="date" opf:event="publication">2024-06-28T08:07:07UTC</dc:date><meta name="generator" content="epub-rs"/><dc:identifier id="id">identifier</dc:identifier><dc:title>中文</dc:title><dc:creator id="creator">作者</dc:creator><dc:description>description</dc:description><meta property="desc">description</meta><meta name="cover" content="cover-img"/><dc:format id="format">format</dc:format><dc:publisher id="publisher">publisher</dc:publisher><dc:subject id="subject">subject</dc:subject><dc:contributor id="contributor">contributor</dc:contributor><meta ok="ov">new</meta></metadata><manifest><item href="toc.ncx" id="ncx" media-type="application/x-dtbncx+xml"/><item href="nav.xhtml" id="toc" media-type="application/xhtml+xml" properties="nav"/><item href="" id="cover-img" media-type="" properties="cover-image"/><item href="cover.xhtml" id="cover" media-type="application/xhtml+xml"/><item href="1.png" id="assets_0" media-type="image/png"/><item href="2.png" id="assets_1" media-type="image/png"/><item href="" id="chap_0" media-type="application/xhtml+xml"/><item href="1.xhtml" id="cover" media-type="application/xhtml+xml"/></manifest><spine toc="ncx" page-progression-direction="rtl"><itemref idref="cover"/><itemref idref="toc"/><itemref idref="chap_0"/></spine><guide><reference href="1.xhtml" title="封面" type="cover"/></guide></package>"###;
        assert_eq!(ass, res.as_str());
    }

    #[test]
    fn test_get_media_type() {
        assert_eq!(
            String::from("application/javascript"),
            get_media_type("1.js")
        );
        assert_eq!(String::from("text/css"), get_media_type("1.css"));
        assert_eq!(
            String::from("application/xhtml+xml"),
            get_media_type("1.xhtml")
        );
        assert_eq!(String::from("image/jpeg"), get_media_type("1.jpeg"));
    }

    #[test]
    fn test_get_html_info() {
        let info = get_html_info(
            r"<html>
    <head><title> 测试标题 </title></head>
    <body>
    <p>段落1</p>ok
    </body>
         </html>",
            None,
        )
        .unwrap();

        assert_eq!(None, info.direction);
        assert_eq!(None, info.language);
        assert_eq!(r"测试标题", info.title);

        assert!(info.body_attribute.is_none());

        assert_eq!(
            r"
    <p>段落1</p>ok
    ",
            String::from_utf8(info.content).unwrap()
        );

        // 测试 epub3 格式
        let name = "EPUB/s04.xhtml";

        let html = std::fs::read_to_string(download_zip_file(name, "https://github.com/IDPF/epub3-samples/releases/download/20230704/childrens-literature.epub")).unwrap();

        let info = get_html_info(html.as_str(), Some("pgepubid00495")).unwrap();

        assert_eq!(3324, info.content.len());

        // 测试lang

        let info = get_html_info(
            r#"<html lang="zh" dir="rtl">
    <head><title> 测试标题 </title></head>
    <body>
    <p>段落1</p>ok
    </body>
         </html>"#,
            None,
        )
        .unwrap();

        assert_eq!("zh", info.language.unwrap());
        assert_eq!(Direction::RTL, info.direction);

        let info = get_html_info(
            r#"<html xml:lang="zh" dir="ltR">
    <head><title> 测试标题 </title></head>
    <body>
    <p>段落1</p>ok
    </body>
         </html>"#,
            None,
        )
        .unwrap();
        assert_eq!(Direction::LTR, info.direction);
        assert_eq!("zh", info.language.unwrap());

        let info = get_html_info(
            r#"<html xml:lang="en" lang="zh" dir="cis">
    <head><title> 测试标题 </title></head>
    <body>
    <p>段落1</p>ok
    </body>
         </html>"#,
            None,
        )
        .unwrap();
        assert_eq!(Direction::CUS("cis".to_string()), info.direction);
        assert_eq!("en", info.language.unwrap());
        // assert_ne!(None, chap.data());
        // assert_ne!(0, chap.data().unwrap().len());

        // 测试 escape

        let info = get_html_info(
            r#"<html xml:lang="zh" dir="ltR">
    <head><title> 测试标题 </title></head>
    <body>
    <p>段落1</p>ok
    </body>
         </html>"#,
            None,
        )
        .unwrap();
        assert_eq!(Direction::LTR, info.direction);
        assert_eq!("zh", info.language.unwrap());

        let info= get_html_info(
            r#"<html xml:lang="en" lang="zh" dir="cis">
    <head><title> Test Title `~!@#$%^&amp;*()_+ and []\{}| and2 ;&apos;:&quot; and3 ,./&lt;&gt;? </title></head>
    <body>
    <p>段落1</p>ok
    </body>
         </html>"#,
            None,
        )
        .unwrap();

        assert_eq!(
            r#"Test Title `~!@#$%^&*()_+ and []\{}| and2 ;':" and3 ,./<>?"#,
            info.title
        );

        // 测试 css link

        let info= get_html_info(
            r#"<html xml:lang="en" lang="zh" dir="cis">
    <head><title> Test Title `~!@#$%^&amp;*()_+ and []\{}| and2 ;&apos;:&quot; and3 ,./&lt;&gt;? </title><link rel="preconnect" href="https://avatars.githubusercontent.com"> 
    <link crossorigin="anonymous" media="all" rel="stylesheet" href="https://github.githubassets.com/assets/code-9c9b8dc61e74.css" /></head>
    <body>
    <p>段落1</p>ok
    </body>
         </html>"#,
            None,
        )
        .unwrap();

        assert_eq!(2, info.link.len());
        assert_eq!(LinkRel::OTHER("preconnect".to_string()), info.link[0].rel);
        assert_eq!(LinkRel::CSS, info.link[1].rel);

        assert_eq!(
            "https://github.githubassets.com/assets/code-9c9b8dc61e74.css",
            info.link[1].href
        );

        // 测试style

        let info= get_html_info(
            r#"<html xml:lang="en" lang="zh" dir="cis">
    <head><title> Test Title `~!@#$%^&amp;*()_+ and []\{}| and2 ;&apos;:&quot; and3 ,./&lt;&gt;? </title><link rel="preconnect" href="https://avatars.githubusercontent.com"> 
    <link crossorigin="anonymous" media="all" rel="stylesheet" href="https://github.githubassets.com/assets/code-9c9b8dc61e74.css" />
    <style>body{color: white;}</style
    </head>
    <body>
    <p>段落1</p>ok
    </body>
         </html>"#,
            None,
        )
        .unwrap();

        assert_eq!(2, info.link.len());
        assert_eq!(LinkRel::OTHER("preconnect".to_string()), info.link[0].rel);
        assert_eq!(LinkRel::CSS, info.link[1].rel);

        assert_eq!(
            "https://github.githubassets.com/assets/code-9c9b8dc61e74.css",
            info.link[1].href
        );
        assert_eq!("body{color: white;}", info.style.unwrap());

        // 测试body attribute

        let info= get_html_info(
            r#"<html xml:lang="en" lang="zh" dir="cis">
    <head><title> Test Title `~!@#$%^&amp;*()_+ and []\{}| and2 ;&apos;:&quot; and3 ,./&lt;&gt;? </title><link rel="preconnect" href="https://avatars.githubusercontent.com"> 
    <link crossorigin="anonymous" media="all" rel="stylesheet" href="https://github.githubassets.com/assets/code-9c9b8dc61e74.css" />
    <style>body{color: white;}</style
    </head>
    <body class="b">
    <p>段落1</p>ok
    </body>
         </html>"#,
            None,
        )
        .unwrap();

        assert_eq!(2, info.link.len());
        assert_eq!(LinkRel::OTHER("preconnect".to_string()), info.link[0].rel);
        assert_eq!(LinkRel::CSS, info.link[1].rel);

        assert_eq!(
            "https://github.githubassets.com/assets/code-9c9b8dc61e74.css",
            info.link[1].href
        );
        assert_eq!("body{color: white;}", info.style.unwrap());
        assert!(info.body_attribute.is_some());
        assert_eq!(b" class=\"b\"", info.body_attribute.unwrap().as_slice());
    }
}
