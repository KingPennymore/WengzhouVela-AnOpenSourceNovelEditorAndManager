use crate::{
    common::{self, IError, IResult},
    mobi::{builder::MobiBuilder, core::MobiAssets, image::get_attr_value},
    prelude::{EpubBook, EpubBuilder, EpubHtml, EpubLink, EpubNav, LinkRel, MobiBook, MobiHtml, MobiNav},
};

fn to_epub_nav(mobi: &MobiNav, parent: &str) -> EpubNav {
    let mut n = EpubNav::default();
    n = n.with_title(mobi.title());
    n = n.with_file_name(format!("{parent}{}.xhtml", mobi.title).as_str());

    for ele in mobi.child() {
        n.push(to_epub_nav(
            ele,
            format!("{parent}{}/", mobi.title()).as_str(),
        ));
    }

    n
}

/// 找到章节对应的目录
/// 返回多个层级所属目录
fn get_mobi_chapter_nav<'a>(chap: &MobiHtml, nav: &'a [MobiNav]) -> Option<Vec<&'a MobiNav>> {
    for ele in nav {
        if ele.id() == chap.nav_id() {
            return Some(vec![ele]);
        }
        if let Some(mut v) = get_mobi_chapter_nav(chap, ele.child().as_slice()) {
            v.insert(0, ele);
            return Some(v);
        }
    }
    None
}

fn get_mobi_assets_file_name(a: &MobiAssets) -> String {
    format!("image/{}", a.file_name())
}

/// mobi 转 epub
///
/// # Examples
/// ```no_run
/// use iepub::prelude::*;
/// use iepub::prelude::adapter::mobi_to_epub;
///
/// let mut book = std::fs::File::open(std::path::PathBuf::from("example.mobi"))
/// .map_err(|e| IError::Io(e))
/// .and_then(|f| MobiReader::new(f))
/// .and_then(|mut f| f.load())
/// .unwrap();
///
/// let mut epub = mobi_to_epub(&mut book).unwrap();
/// EpubWriter::write_to_mem(&mut epub, true).unwrap();
/// ```
pub fn mobi_to_epub(mobi: &mut MobiBook) -> IResult<EpubBook> {
    let mut builder = EpubBuilder::new();

    // 添加图片
    for ele in mobi.assets_mut() {
        builder = builder.add_assets(
            get_mobi_assets_file_name(ele).as_str(),
            ele.data().unwrap().to_vec(),
        );
    }

    // 添加目录
    for n in mobi.nav() {
        builder = builder.custome_nav(true);
        builder = builder.add_nav(to_epub_nav(n, ""));
    }

    let assets = mobi.assets().as_slice();
    // 添加文本
    for chap in mobi.chapters() {
        let nav: Vec<&str> = get_mobi_chapter_nav(chap, mobi.nav().as_slice())
            .unwrap()
            .iter()
            .map(|f| f.title())
            .collect();

        builder = builder.add_chapter(
            EpubHtml::default()
                .with_title(chap.title())
                .with_file_name(format!("{}.xhtml", nav.join("/")).as_str())
                .with_data(convert_mobi_html_data(
                    nav.len() - 1,
                    chap.string_data().as_str(),
                    assets,
                )),
        );
    }

    // 封面
    if let Some(cover) = mobi.cover() {
        builder = builder.cover(cover.file_name(), cover.data().unwrap().to_vec());
    }
    // 元数据
    builder = builder
        .with_title(mobi.title())
        .with_identifier(mobi.identifier());

    if let Some(v) = mobi.contributor() {
        builder = builder.with_contributor(v);
    }
    if let Some(v) = mobi.creator() {
        builder = builder.with_creator(v);
    }
    if let Some(v) = mobi.description() {
        builder = builder.with_description(v);
    }
    if let Some(v) = mobi.date() {
        builder = builder.with_date(v);
    }
    if let Some(v) = mobi.format() {
        builder = builder.with_format(v);
    }
    if let Some(v) = mobi.last_modify() {
        builder = builder.with_last_modify(v);
    }
    if let Some(v) = mobi.publisher() {
        builder = builder.with_publisher(v);
    }
    if let Some(v) = mobi.subject() {
        builder = builder.with_subject(v);
    }

    builder.book()
}

/// 转换 mobi 的 html 文本，主要是处理其中的img标签，添加src属性
fn convert_mobi_html_data(indent: usize, data: &str, assets: &[MobiAssets]) -> Vec<u8> {
    let mut v: String = data.to_string();
    let indent = (0..indent).map(|_| "../").collect::<Vec<&str>>().join("");
    for ele in assets {
        let target = format!(
            r#"src="{}{}""#,
            if indent.is_empty() {
                "./"
            } else {
                indent.as_str()
            },
            get_mobi_assets_file_name(ele)
        );
        // 还有层级问题
        // 有可能误伤，但是暂时没有更好的办法
        v = v
            .replace(
                format!("recindex=\"{:05}\"", ele.recindex).as_str(),
                target.as_str(),
            )
            .replace(
                format!("recindex='{:05}'", ele.recindex).as_str(),
                target.as_str(),
            )
            .replace(
                format!("recindex={:05}", ele.recindex).as_str(),
                target.as_str(),
            );
    }

    v.into_bytes()
}

fn epub_nav_to_mobi_nav(
    nav: std::slice::Iter<EpubNav>,
    start: usize,
    chap: &[(MobiHtml, String)],
) -> Vec<MobiNav> {
    let mut res = Vec::new();
    for ele in nav.enumerate() {
        let mut n = MobiNav::default(ele.0 + start).with_title(ele.1.title());

        // 关联章节
        if let Some(id) = chap
            .iter()
            .find(|(_, file)| file == ele.1.file_name())
            .map(|f| f.0.id)
        {
            n.chap_id = id;
        }

        if ele.1.child().len() > 0 {
            let c = epub_nav_to_mobi_nav(ele.1.child(), ele.0 + start + 1, chap);
            for ele1 in c {
                n.add_child(ele1);
            }
        }
        res.push(n);
    }
    res
}

/// 处理图片地址，把可能存在的相对路径换成绝对路径
fn convert_epub_html_img(html: &[u8], path: &str) -> Vec<u8> {
    let current = crate::path::Path::system(path).pop();
    let v = |v| {
        let path = String::from_utf8(v).unwrap_or_default();
        // 修正路径
        let t = current.join(path.as_str());
        format!("'{}'", t.to_str()).as_bytes().to_vec()
    };
    let html = generate_text_img_xml(html, "img", "src", v);
    generate_text_img_xml(html.as_slice(), "image", "xlink:href", v)
}

/// 将epub中的css转化为inline属性
fn epub_css_inline(
    html: &[u8],
    css: &str,
    links: Option<std::slice::Iter<'_, EpubLink>>,
) -> Vec<u8> {
    let t = String::from_utf8(html.to_vec()).unwrap();

    let mut c = links
        .map(|f| f.filter(|h| matches!(h.rel, LinkRel::CSS)).flat_map(|h| h.data.clone()).collect())
        .and_then(|f| String::from_utf8(f).ok()).unwrap_or(String::new());
    c.push_str(css);

    if c.is_empty() || t.is_empty() {
        return html.to_vec();
    }

    if let Ok(inline_fragment) = css_inline::inline_fragment(t.as_str(), c.as_str()) {
        return inline_fragment.as_bytes().to_vec();
    }

    html.to_vec()
}

/// 修改xml片段中的img标签的src属性的路径
pub fn generate_text_img_xml<T: Fn(Vec<u8>) -> Vec<u8>>(
    html: &[u8],
    tag: &str,
    attr: &str,
    callback: T,
) -> Vec<u8> {
    let mut text = Vec::new();
    let mut index: usize = 0;
    let chars = html;
    let tag = format!("<{tag} ");
    let attr = format!(" {attr}=");
    let key = tag.as_bytes();

    while index < chars.len() {
        let mut now = chars[index];
        let mut j = 0;
        while j < key.len() {
            if now == key[j] {
                now = chars[index + j + 1];
            } else {
                break;
            }
            j += 1;
        }
        if j == key.len() {
            // 找到 img 标签，接下来查找 src 属性
            text.append(&mut key.to_vec());
            index += j;
            // 查找完后数据被分成三段，第一段 为开头到 src=，第二段是src=到value结束，第三段是value结束到之后
            // 第一段原样添加，第二段如果找到值替换recindex，没找到则原样添加，第三段继续循环

            let att = get_attr_value(&chars[index - 1..], &attr);
            if let Some(v) = att.0 {
                // 有src属性
                let start = att.1;
                for i in chars.iter().skip(index).take(start) {
                    text.push(*i);
                }
                index += start;
                text.append(&mut attr.as_bytes()[1..].to_vec());
                text.append(&mut callback(v));
                let len = att.2;
                index += len - 1;

                continue;
            }

            for i in index..(index + att.1) {
                if i < chars.len() {
                    text.push(chars[i]);
                }
            }
            index += att.1;
        } else {
            text.push(chars[index]);
            index += 1;
        }
    }

    text
}

/// epub 转 mobi
///
/// # Examples
/// ```no_run
/// use iepub::prelude::*;
/// use iepub::prelude::adapter::epub_to_mobi;
/// use iepub::prelude::read_from_file;
///
/// let mut epub = read_from_file("example.epub").unwrap();
/// let mut mobi = epub_to_mobi(&mut epub).unwrap();
/// MobiWriter::new(std::fs::File::create("conver.mobi").unwrap())
/// .with_append_title(false)
/// .write(&mobi)
/// .unwrap();
/// ```
pub fn epub_to_mobi(epub: &mut EpubBook) -> IResult<MobiBook> {
    let mut builder = MobiBuilder::new()
        .with_title(epub.title())
        .with_identifier(epub.identifier());

    if let Some(v) = epub.contributor() {
        builder = builder.with_contributor(v);
    }
    if let Some(v) = epub.creator() {
        if v.contains(common::info::PROJECT_NAME) {
            builder = builder.with_creator(v);
        } else {
            builder = builder.with_creator(format!("{v} {}", common::info::PKG_NAME));
        }
    }
    if let Some(v) = epub.description() {
        builder = builder.with_description(v);
    }
    if let Some(v) = epub.date() {
        // 处理时间格式，2022-03-03 -> 2022-03-03T16:00:00+00:00
        if v.len() == 10 {
            builder = builder.with_date(format!("{v}T16:00:00+00:00"));
        } else {
            builder = builder.with_date(v);
        }
    }
    if let Some(v) = epub.format() {
        builder = builder.with_format(v);
    }
    if let Some(v) = epub.last_modify() {
        builder = builder.with_last_modify(v);
    }
    if let Some(v) = epub.publisher() {
        builder = builder.with_publisher(v);
    }
    if let Some(v) = epub.subject() {
        builder = builder.with_subject(v);
    }

    let chap = epub.chapters_mut();

    let chap_temp: Vec<(MobiHtml, String)> = chap
        .enumerate()
        .map(|(index, html)| {
            let file_name = html.file_name().to_string();
            (
                MobiHtml::new(index).with_title(html.title()).with_data(
                    html.data_mut()
                        .map(|v| convert_epub_html_img(v, file_name.as_str()))
                        .map(|v| {
                            epub_css_inline(v.as_slice(), html.css().unwrap_or(""), html.links())
                        })
                        // .unwrap_or_else(||Err(FromUtf8Error { bytes: Vec::n, error: e }))
                        .unwrap_or(Vec::new()),
                ),
                file_name,
            )
        })
        .collect();

    let nav = epub_nav_to_mobi_nav(epub.nav(), 0, &chap_temp);

    builder = builder.custome_nav(true);
    for ele in nav {
        builder = builder.add_nav(ele);
    }
    // 静态资源
    for ele in epub.assets_mut() {
        let data = ele.data_mut().ok_or(IError::Unknown)?.to_vec();
        if !ele.media_type.contains("font") {
            // 暂时不转换字体文件
            builder = builder.add_assets(ele.file_name(), data);
        }
    }
    // 添加文本
    for (html, _) in chap_temp {
        builder = builder.add_chapter(html);
    }

    if let Some(c) = epub.cover_mut() {
        builder = builder.cover(c.data_mut().ok_or(IError::Unknown)?.to_vec());
    }

    builder.book()
}

pub mod concat {
    use crate::{
        common::{get_css_content_url, get_media_type, IResult},
        path,
        prelude::{EpubAssets, EpubBook, EpubBuilder, EpubHtml, EpubLink, EpubNav},
    };
    use std::collections::{HashMap, HashSet};

    use super::generate_text_img_xml;

    fn clone_epub_nav(
        nav: &EpubNav,
        new_file_name: &mut HashMap<String, String>,
        len: usize,
    ) -> (EpubNav, usize) {
        let mut len = len;
        let mut new_nav = EpubNav::default().with_title(nav.title());

        if let Some(nt) = new_file_name.get(nav.file_name()) {
            new_nav.set_file_name(nt.as_str());
        } else {
            let nt = format!("text/{:05}.xhtml", len);
            new_nav.set_file_name(nt.as_str());
            new_file_name.insert(nav.file_name().to_string(), nt);
            len += 1;
        }

        for ele in nav.child() {
            let (nav, l) = clone_epub_nav(ele, new_file_name, len);
            len += l;
            new_nav.push(nav);
        }
        (new_nav, len)
    }

    /// 替换html文本中的资源文件
    /// [data] html数据
    /// [asset_map] asset路径新旧映射
    /// [old_chapter_file] 章节文件旧目录
    /// [new_chapter_file] 章节文件新目录
    fn replace_html_assets(
        data: &[u8],
        asset_map: &HashMap<String, String>,
        old_chapter_file: String,
        new_chapter_file: &str,
    ) -> Vec<u8> {
        let callback = |v| {
            // 根据旧的src，转换成文件路径，再找到对应的新的文件路径，再转换成新的src
            String::from_utf8(v)
                .ok()
                .map(|f| {
                    path::Path::system(old_chapter_file.as_str())
                        .pop()
                        .join(f.as_str())
                        .to_str()
                })
                .and_then(|f| asset_map.get(f.as_str()))
                .map(|f| {
                    format!(
                        r#""{}""#,
                        crate::path::Path::system(new_chapter_file)
                            .pop()
                            .releative(f.as_str())
                    )
                    .as_bytes()
                    .to_vec()
                })
                .unwrap_or_default()
        };
        let data = generate_text_img_xml(data, "img", "src", callback);
        generate_text_img_xml(data.as_slice(), "image", "xlink:href", callback)
    }

    pub fn add_into_epub(
        builder: EpubBuilder,
        epub: &mut EpubBook,
        len: usize,
        asset_len: usize,
        skip: usize,
        parent_nav_title: Option<String>,
        exclude: &[String],
    ) -> IResult<(EpubBuilder, usize, usize)> {
        let mut len = len;
        let mut asset_len = asset_len;
        let mut builder = builder;
        let mut new_file_name = HashMap::new();
        let mut new_asset_file_name = HashMap::new();
        // 图片也要重新编号
        let mut assets = Vec::new();

        for ele in epub.assets_mut() {
            let me = get_media_type(ele.file_name());
            if me.is_empty() {
                continue;
            }
            let prefix = {
                if me.contains("image") {
                    "image"
                } else if me.contains("font") {
                    "font"
                } else if me.contains("css") {
                    "css"
                } else {
                    "other"
                }
            };
            let f = ele
                .data_mut()
                .map(|f| f.to_vec())
                .unwrap_or_else(|| panic!("{} not exist", ele.file_name()));
            asset_len += 1;

            let sufix = ele.file_name().find('.').unwrap_or(0);
            let sufix = &ele.file_name()[(sufix + 1)..];
            let nn = format!("{prefix}/{}.{}", asset_len, sufix);
            if me.contains("text/css") {
                assets.push(
                    EpubAssets::default()
                        .with_file_name(nn.as_str())
                        .with_data(f),
                );
            } else {
                builder = builder.add_assets(nn.as_str(), f);
            }
            new_asset_file_name.insert(ele.file_name().to_string(), nn);
        }

        // 替换css文件中的引用，因为asset 顺序不固定，所以只有读取完所有asset后再处理
        for mut ele in assets {
            if let Some(d) = ele.data_mut() {
                if let Ok(css) = String::from_utf8(d.to_vec()) {
                    let url = get_css_content_url(css.as_str());

                    let mut n_css = css.clone();
                    for u in url {
                        let old = crate::path::Path::system(ele.file_name())
                            .pop()
                            .join(u)
                            .to_str();
                        if let Some(new_filename) = new_asset_file_name.get(old.as_str()) {
                            n_css = n_css.replace(
                                u,
                                crate::path::Path::system(ele.file_name())
                                    .releative(new_filename.as_str())
                                    .as_str(),
                            );
                        }
                    }
                    builder = builder.add_assets(ele.file_name(), n_css.as_bytes().to_vec());
                }
            }
        }

        let mut rm = HashSet::new();
        let mut new_nav = Vec::new();
        // 文件名需要重新编号，所以目录也要变一下
        for (index, ele) in epub.nav().enumerate() {
            let (nav, l) = clone_epub_nav(ele, &mut new_file_name, len);
            len = l;
            if index < skip || exclude.contains(&ele.title().to_string()) {
                rm.insert(ele.file_name().to_string());
                continue;
            }
            new_nav.push(nav);
        }
        // len += 1;
        if let Some(cc) = epub.cover_chapter() {
            // 文件名编号在后面，但是目录里在前面
            let (nav, l) = clone_epub_nav(
                &EpubNav::default()
                    .with_file_name(cc.file_name())
                    .with_title(cc.title()),
                &mut new_file_name,
                len,
            );

            len = l;
            new_nav.insert(0, nav);
        } else if let Some(cc) = epub.cover() {
            // 只有封面
            let (nav, l) = clone_epub_nav(
                &EpubNav::default()
                    .with_file_name(format!("{}.xhtml", cc.file_name()))
                    .with_title("封面"),
                &mut new_file_name,
                len,
            );
            len = l;
            new_nav.insert(0, nav);
        }

        if !new_nav.is_empty() {
            if let Some(t) = &parent_nav_title {
                let mut v = EpubNav::default()
                    .with_file_name(new_nav[0].file_name())
                    .with_title(t);
                for ele in new_nav {
                    v.push(ele);
                }
                builder = builder.add_nav(v);
            } else {
                for ele in new_nav {
                    builder = builder.add_nav(ele);
                }
            }
        }

        // 添加一个封面页
        if let Some(cc) = epub.cover_chapter() {
            if let Some(nf) = new_file_name.get(cc.file_name()) {
                epub.insert_chapter(0, cc.clone().with_file_name(nf));
                len += 1;
            }
        } else if let Some(cover) = epub.cover() {
            let old = format!("{}.xhtml", cover.file_name());
            let nc = crate::path::Path::system(old.as_str())
                .pop()
                .releative(cover.file_name());
            epub.insert_chapter(
                0,
                EpubHtml::default()
                    .with_file_name(old.as_str())
                    .with_title("封面")
                    .with_data(
                        format!(
                            r#"<div style="width:100%;text-align:center;"><img src="{}"/></div>"#,
                            nc
                        )
                        .as_bytes()
                        .to_vec(),
                    ),
            );
            len += 1;
        }

        for ele in epub.chapters_mut() {
            if rm.contains(ele.file_name()) {
                continue;
            }
            let old = ele.file_name().to_string();
            let v = if let Some(v) = new_file_name.get(ele.file_name()) {
                v.to_string()
            } else {
                len += 1;
                format!("text/{:05}.xhtml", len)
            };

            let mut new_html = EpubHtml::default()
                .with_file_name(v.as_str())
                .with_title(ele.title())
                .with_data(replace_html_assets(
                    ele.data_mut().unwrap(),
                    &new_asset_file_name,
                    old.to_string(),
                    v.as_str(),
                ));
            new_html.body_attribute = ele.body_attribute.clone();

            for ele in ele.links().unwrap_or_default() {
                // link 也需要调整引用路径
                let link_ab = path::Path::system(old.as_str())
                    .pop()
                    .join(ele.href.as_str())
                    .to_str();
                if let Some(n) = new_asset_file_name.get(link_ab.as_str()) {
                    // 替换路径
                    new_html.add_link(EpubLink {
                        rel: ele.rel.clone(),
                        file_type: ele.file_type.clone(),
                        href: crate::path::Path::system(v.as_str())
                            .pop()
                            .releative(n.as_str()),
                        data: Vec::new()
                    });
                }
            }
            if let Some(css) = ele.css() {
                new_html.set_css(css);
            }
            builder = builder.add_chapter(new_html);
        }

        Ok((builder, len, asset_len))
    }

    #[cfg(test)]
    mod tests {
        use std::collections::HashMap;

        use crate::prelude::{adapter::add_into_epub, EpubBuilder, EpubHtml, EpubNav};

        use super::replace_html_assets;

        #[test]
        fn test_replace_html_img_src() {
            let asset_map = HashMap::from([("2.png".to_string(), "384.png".to_string())]);
            let old_chapter_file = "3.xhtml";
            let new_chapter_file = "n.xhtml";
            let html = r#"<p>测试<img src="2.png"></p>"#;
            let res = replace_html_assets(
                html.as_bytes(),
                &asset_map,
                old_chapter_file.to_string(),
                new_chapter_file,
            );
            assert_eq!(
                r#"<p>测试<img src="384.png"></p>"#,
                String::from_utf8(res).unwrap().as_str()
            );
        }

        #[test]
        fn concat_epub() {
            let mut nav = EpubNav::default()
                .with_title("1.")
                .with_file_name("1/1.xhtml");
            nav.push(
                EpubNav::default()
                    .with_title("1.1")
                    .with_file_name("1/1.xhtml"),
            );
            let mut builder = EpubBuilder::new()
                .custome_nav(true)
                .with_title("测试合并")
                .with_creator("作者")
                .add_nav(nav)
                .add_nav(
                    EpubNav::default()
                        .with_title("2.")
                        .with_file_name("1/2.xhtml"),
                )
                .add_chapter(
                    EpubHtml::default()
                        .with_file_name("1/1.xhtml")
                        .with_title("1.")
                        .with_data(b"<p>1.</p>".to_vec()),
                )
                .add_chapter(
                    EpubHtml::default()
                        .with_file_name("1/2.xhtml")
                        .with_title("2.")
                        .with_data(b"<p>2.</p>".to_vec()),
                );
            let mut book1 = builder.book().unwrap();
            // book2
            let mut nav = EpubNav::default()
                .with_title("3.")
                .with_file_name("2/1.xhtml");
            nav.push(
                EpubNav::default()
                    .with_title("3.1")
                    .with_file_name("2/1.xhtml"),
            );
            let mut builder = EpubBuilder::new()
                .custome_nav(true)
                .with_title("测试合并2")
                .with_creator("作者2")
                .add_nav(nav)
                .add_nav(
                    EpubNav::default()
                        .with_title("3.")
                        .with_file_name("2/2.xhtml"),
                )
                .add_chapter(
                    EpubHtml::default()
                        .with_file_name("2/1.xhtml")
                        .with_title("333.")
                        .with_data(b"<p>333.</p>".to_vec()),
                )
                .add_chapter(
                    EpubHtml::default()
                        .with_file_name("2/2.xhtml")
                        .with_title("2.")
                        .with_data(b"<p>2.</p>".to_vec()),
                );
            let mut book2 = builder.book().unwrap();

            let mut builder = EpubBuilder::default();
            let (mut builder, len, a_len) =
                add_into_epub(builder, &mut book1, 0, 0, 0, None, &[]).unwrap();

            let (mut builder, len, a_len) =
                add_into_epub(builder, &mut book2, len, a_len, 0, None, &[]).unwrap();

            let b = builder.book().unwrap();

            println!("{:?}", b.nav());
            println!("{:?}", b.chapters());

            assert_eq!(
                b.nav().as_slice()[0].file_name(),
                b.chapters().next().unwrap().file_name()
            );
        }
    }
}
#[cfg(test)]
mod tests {
    use super::{convert_mobi_html_data, epub_to_mobi, mobi_to_epub};
    use crate::{
        adapter::core::convert_epub_html_img,
        common::IError,
        mobi::core::MobiAssets,
        prelude::{read_from_file, EpubBuilder, EpubHtml, EpubWriter, MobiReader, MobiWriter},
    };

    #[test]
    #[ignore = "dan.mobi"]
    fn test_convert() {
        let mut book = std::env::current_dir()
            .ok()
            .map(|f| f.join("../dan.mobi"))
            .map_or(Err(std::io::Error::other("error")), |f| {
                std::fs::File::open(f)
            })
            .map_err(|_| IError::Unknown)
            .and_then(|f| MobiReader::new(f))
            .and_then(|mut f| f.load())
            .unwrap();

        let mut epub = mobi_to_epub(&mut book).unwrap();
        EpubWriter::write_to_mem(&mut epub, true).unwrap();
        // epub.write("convert.epub").unwrap();
    }

    #[test]
    #[cfg(feature = "no_nav")]
    fn test_convert_no_nav() {
        use crate::common::tests::download_zip_file;
        let name = "convert.mobi";

        let mut mobi = MobiReader::new(
            std::fs::File::open(download_zip_file(
                name,
                "https://github.com/user-attachments/files/18818424/convert.mobi.zip",
            ))
            .unwrap(),
        )
        .unwrap();

        let mut book = mobi.load().unwrap();

        assert_eq!(188, book.chapters().len());
        let mut epub = mobi_to_epub(&mut book).unwrap();

        assert_eq!(188, epub.chapters().len());
        assert_eq!(Some("1"), epub.chapters().next().map(|f| f.title()));

        EpubWriter::write_to_mem(&mut epub, false).unwrap();
    }

    #[test]
    fn test_epub_to_mobi() {
        let img = crate::common::tests::get_req_mem(
            "https://www.rust-lang.org/static/images/user-logos/yelp.png",
        );
        let img2 = crate::common::tests::get_req_mem("https://blog.rust-lang.org/images/2024-05-17-enabling-rust-lld-on-linux/ripgrep-comparison.png");

        let mut epub = EpubBuilder::default()
            .with_title("书名")
            .with_creator("作者")
            .with_date("2024-03-14")
            .with_description("一本好书")
            .with_identifier("isbn")
            .with_publisher("行星出版社")
            .add_chapter(
                EpubHtml::default()
                    .with_title("测试标题")
                    .with_file_name("1/0.xhtml")
                    .with_data(
                        "<p>锻炼</p><img src='../1.jpg'/>"
                            .to_string()
                            .as_bytes()
                            .to_vec(),
                    ),
            )
            .add_assets("1.jpg", img.clone())
            .cover("cover.jpg", img2.clone())
            .book()
            .unwrap();

        let mobi = epub_to_mobi(&mut epub).unwrap();
        let mut v = std::io::Cursor::new(Vec::new());
        MobiWriter::new(&mut v)
            .with_append_title(false)
            .write(&mobi)
            .unwrap();

        let n_mobi = MobiReader::new(&mut v).unwrap().load().unwrap();

        assert_eq!(epub.title(), n_mobi.title());
        assert_eq!(epub.description(), n_mobi.description());

        assert_eq!(epub.chapters().len(), mobi.chapters().len());
        assert_eq!(epub.chapters().len(), n_mobi.chapters().len());
        assert_eq!(epub.assets().len(), n_mobi.assets().len());
    }

    #[test]
    fn test_convert_html_img() {
        let data = r#"<h1>插图</h1>
<p height="1em" width="0pt" align="center"><font size="7"><b>第六卷</b></font></p><p height="1em" width="0pt" align="center"><font size="6"><b>插图</b></font></p><p height="1em" width="0pt"> <img recindex="00055" align="baseline" width="1086" height="1526"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129720.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00018" align="baseline" width="600" height="800"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129721.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00056" align="baseline" width="600" height="800"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129722.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00019" align="baseline" width="580" height="799"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129723.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00061" align="baseline" width="800" height="600"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129724.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00024" align="baseline" width="759" height="451"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129725.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00062" align="baseline" width="800" height="600"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129726.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00025" align="baseline" width="600" height="800"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129727.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00063" align="baseline" width="500" height="666"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129728.jpg"> </a> </p>"#;

        let assets = vec![
            MobiAssets {
                _file_name: "1.jpg".to_string(),
                media_type: String::new(),
                _data: None,
                recindex: 55,
            },
            MobiAssets {
                _file_name: "2.jpg".to_string(),
                media_type: String::new(),
                _data: None,
                recindex: 56,
            },
        ];

        let r = convert_mobi_html_data(2, data, &assets);

        assert_eq!(
            String::from_utf8(r).unwrap(),
            r#"<h1>插图</h1>
<p height="1em" width="0pt" align="center"><font size="7"><b>第六卷</b></font></p><p height="1em" width="0pt" align="center"><font size="6"><b>插图</b></font></p><p height="1em" width="0pt"> <img src="../../image/1.jpg" align="baseline" width="1086" height="1526"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129720.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00018" align="baseline" width="600" height="800"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129721.jpg"> </a> </p><p height="3pt" width="0pt"> <img src="../../image/2.jpg" align="baseline" width="600" height="800"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129722.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00019" align="baseline" width="580" height="799"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129723.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00061" align="baseline" width="800" height="600"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129724.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00024" align="baseline" width="759" height="451"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129725.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00062" align="baseline" width="800" height="600"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129726.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00025" align="baseline" width="600" height="800"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129727.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00063" align="baseline" width="500" height="666"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129728.jpg"> </a> </p>"#
        );

        let r = convert_mobi_html_data(0, data, &assets);

        assert_eq!(
            String::from_utf8(r).unwrap(),
            r#"<h1>插图</h1>
<p height="1em" width="0pt" align="center"><font size="7"><b>第六卷</b></font></p><p height="1em" width="0pt" align="center"><font size="6"><b>插图</b></font></p><p height="1em" width="0pt"> <img src="./image/1.jpg" align="baseline" width="1086" height="1526"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129720.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00018" align="baseline" width="600" height="800"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129721.jpg"> </a> </p><p height="3pt" width="0pt"> <img src="./image/2.jpg" align="baseline" width="600" height="800"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129722.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00019" align="baseline" width="580" height="799"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129723.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00061" align="baseline" width="800" height="600"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129724.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00024" align="baseline" width="759" height="451"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129725.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00062" align="baseline" width="800" height="600"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129726.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00025" align="baseline" width="600" height="800"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129727.jpg"> </a> </p><p height="3pt" width="0pt"> <img recindex="00063" align="baseline" width="500" height="666"></img><a href="https://pic.wenku8.com/pictures/1/1946/105571/129728.jpg"> </a> </p>"#
        );
    }

    #[test]
    fn test_convert_epub_html_img() {
        // let html = r#"<img src="../ok.jpg"/>"#;
        // let v = convert_epub_html_img(html.to_string(), "/parent1/parent.xhtml");

        // println!("{}", v);

        // let html = r#"<img data-src="3.jpg" src="../ok.jpg"/>"#;
        // let v = convert_epub_html_img(html.to_string(), "/parent1/parent.xhtml");

        // println!("{}", v);

        // let html = r#" class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86275.jpg' src="../temp/2356/images/www.bilinovel.com/2356/0/86275.jpg"/><img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86276.jpg' src="../temp/2356/images/www.bilinovel.com/2356/0/86276.jpg"/><img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86277.jpg' src="../temp/2356/images/www.bilinovel.com/2356/0/86277.jpg"/><img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86278.jpg' src="../temp/2356/images/www.bilinovel.com/2356/0/86278.jpg"/><img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86279.jpg' src="../temp/2356/images/www.bilinovel.com/2356/0/86279.jpg"/>"#;
        //         let v = get_attr_value(html.as_bytes().to_vec().as_slice(), " src=");

        //         assert_ne!(None,v.0);
        //         assert_eq!(91,v.1);

        let html = r#"<img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86275.jpg' src="../temp/2356/images/www.bilinovel.com/2356/0/86275.jpg"/><img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86276.jpg' src="../temp/2356/images/www.bilinovel.com/2356/0/86276.jpg"/><img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86277.jpg' src="../temp/2356/images/www.bilinovel.com/2356/0/86277.jpg"/><img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86278.jpg' src="../temp/2356/images/www.bilinovel.com/2356/0/86278.jpg"/><img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86279.jpg' src="../temp/2356/images/www.bilinovel.com/2356/0/86279.jpg"/>
</div>
  </body></html>"#;
        let v = convert_epub_html_img(html.as_bytes(), "/parent1/parent.xhtml");

        println!("{}", String::from_utf8(v.clone()).unwrap());
        assert_eq!(
            r#"<img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86275.jpg' src='/temp/2356/images/www.bilinovel.com/2356/0/86275.jpg'/><img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86276.jpg' src='/temp/2356/images/www.bilinovel.com/2356/0/86276.jpg'/><img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86277.jpg' src='/temp/2356/images/www.bilinovel.com/2356/0/86277.jpg'/><img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86278.jpg' src='/temp/2356/images/www.bilinovel.com/2356/0/86278.jpg'/><img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86279.jpg' src='/temp/2356/images/www.bilinovel.com/2356/0/86279.jpg'/>
</div>
  </body></html>"#,
            String::from_utf8(v).unwrap()
        );
    }

    /**
     * epub转mobi 不包括字体文件
     */
    #[test]
    fn test_no_font() {
        let name = if std::path::Path::new("target").exists() {
            "target/cover_from_guide.epub"
        } else {
            "../target/cover_from_guide.epub"
        };
        let url = "https://github.com/user-attachments/files/23620295/05.zip";
        crate::common::tests::download_epub_file(name, url);

        let mut epub = read_from_file(name).unwrap();

        let mobi = epub_to_mobi(&mut epub).unwrap();

        assert_eq!(
            0,
            mobi.assets()
                .filter(|f| f.file_name().contains("ttf"))
                .count()
        );
    }
}
