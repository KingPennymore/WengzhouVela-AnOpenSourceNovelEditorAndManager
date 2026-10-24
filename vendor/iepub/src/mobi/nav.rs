use std::borrow::Cow;
use std::collections::HashMap;
use std::io::Cursor;
use std::ops::Deref;
use std::sync::atomic::{AtomicUsize, Ordering};

use quick_xml::events::{BytesStart, Event};
use quick_xml::reader::Reader;

use super::core::MobiNav;
use crate::common::{IError, IResult};

trait VecExt<T> {
    /// 从后开始计算，例如0获取最后一个元素，1获取倒数第二个元素
    fn rget(&mut self, r_index: usize) -> Option<&mut T>;
}

impl<T> VecExt<T> for Vec<T> {
    fn rget(&mut self, r_index: usize) -> Option<&mut T> {
        if self.is_empty() {
            return None;
        }

        let index = self.len() - r_index - 1;
        self.get_mut(index)
    }
}
/// 读取目录导航，要求参数只包括目录部分
pub(crate) fn read_nav_xml(xml: Vec<u8>, id: &mut AtomicUsize) -> IResult<Vec<MobiNav>> {
    let mut reader = Reader::from_reader(std::io::Cursor::new(xml));
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut parent = Vec::new();
    let mut nav: Vec<MobiNav> = Vec::new();
    let mut now: Option<MobiNav> = None;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8(e.name().as_ref().to_vec()).map_err(|_| {
                    std::io::Error::new(std::io::ErrorKind::InvalidInput, "not a tagx")
                })?;

                if name == "a" {
                    // 这里的上一级应该只有 p, 上一级是 blockquote 的情况 在text的时候交给其他方法处理了
                    let pa = &parent[parent.len() - 1];
                    if pa == "p" {
                        let mut n = MobiNav::default(id.fetch_add(1, Ordering::SeqCst));
                        if let Some(pos) = e.get_file_pos() {
                            n.href = pos;
                        }
                        now = Some(n);
                    } else if pa == "blockquote" {
                        // 直接读到这里，说明没有二级目录，直接就是一级目录，所以需要
                        let mut n = MobiNav::default(id.fetch_add(1, Ordering::SeqCst));
                        if let Some(pos) = e.get_file_pos() {
                            n.href = pos;
                        }
                        now = Some(n);
                    }
                }
                parent.push(name);
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8(e.name().as_ref().to_vec()).map_err(|_| {
                    std::io::Error::new(std::io::ErrorKind::InvalidInput, "not a tagx")
                })?;
                parent.pop();
                if name == "a" && now.is_some() {
                    // 如果a标签内容为空或者只有空白， text不会被触发，只有end
                    let pa = &parent[parent.len() - 1];
                    if pa == "p" {
                        // 读取这一卷下的目录
                        let has_more = read_blockquote(&mut reader, now.as_mut().unwrap(), id)?;
                        nav.push(now.clone().unwrap());
                        now = None;

                        if has_more {
                            parent.push("p".to_string());
                        } else {
                            // 没有东西，直接结束
                            return Ok(nav);
                        }
                    } else if pa == "blockquote" {
                        nav.push(now.unwrap());
                        now = None;
                    }
                }
            }
            Ok(Event::Text(e)) => {
                if parent.last_mut().unwrap_or(&mut "".to_string()) == "a" {
                    let mut temp = String::new();
                    // 添加目录，
                    let ppa = parent.rget(1).unwrap_or(&mut temp);
                    if ppa == "p" {
                        // 新的一卷

                        if now.is_some() {
                            now.as_mut().unwrap().title = match e.decode() {
                                Ok(v) => v.deref().to_string(),
                                Err(e) => return Err(crate::common::IError::Encoding(e)),
                            };

                            // 读取这一卷下的目录
                            let has_more = read_blockquote(&mut reader, now.as_mut().unwrap(), id)?;
                            nav.push(now.clone().unwrap());
                            now = None;

                            if has_more {
                                parent.push("p".to_string());
                            } else {
                                // 没有东西，直接结束
                                return Ok(nav);
                            }
                        }
                    } else if ppa == "blockquote" {
                        // 一级目录
                        if now.is_some() {
                            now.as_mut().unwrap().title = match e.decode() {
                                Ok(v) => v.deref().to_string(),
                                Err(e) => return Err(crate::common::IError::Encoding(e)),
                            };
                            nav.push(now.unwrap());
                            now = None;

                            let mut temp = MobiNav::default(0);
                            let has_more = read_blockquote(&mut reader, &mut temp, id)?;
                            for ele in temp.children {
                                nav.push(ele);
                            }

                            if has_more {
                                parent.push("p".to_string());
                            } else {
                                // 没有东西，直接结束
                                return Ok(nav);
                            }
                        }
                    }
                }
            }

            Ok(Event::Eof) => {
                break;
            }
            Err(_) => {
                break;
            }
            _ => (),
        }
    }
    Ok(nav)
}

/// 记录目录对应的filepos标签所在的索引，后续生成完章节后，需要回来修改属性
pub(crate) struct NavFilePos {
    pub(crate) index: usize,
    /// 占位符长度
    pub(crate) length: usize,
    /// 对应的nav id
    id: usize,
    /// 对应的章节id
    pub(crate) chap_id: usize,
    pub(crate) child: Vec<NavFilePos>,
}

/// 查找 章节 对应的filepos 索引
pub(crate) fn find_chap_file_pos(pos: &[NavFilePos], chap_id: usize) -> Vec<&NavFilePos> {
    let mut res = Vec::new();
    for ele in pos {
        if ele.chap_id == chap_id {
            res.push(ele);
        }
        res.append(&mut find_chap_file_pos(&ele.child, chap_id));
    }

    res
}

fn generate_human_nav_item_xml(start: usize, nav: &[MobiNav]) -> (Vec<u8>, Vec<NavFilePos>) {
    let mut text = Vec::new();
    let mut pos = Vec::new();
    for (index, ele) in nav.iter().enumerate() {
        text.append(
            &mut format!(r#"<li value="{index}" height="0pt" width="0pt"><a filepos="#)
                .as_bytes()
                .to_vec(),
        );
        let len = 10;
        let mut file_pos = NavFilePos {
            index: start + text.len(),
            length: len,
            id: ele.id(),
            child: Vec::new(),
            chap_id: ele.chap_id,
        };
        let mut title = ele.title();
        if title.is_empty() {
            // 如果没有title的话，读取xml的时候这个章节就读不到了
            title = "&#x20;"
        }
        text.append(
            &mut format!(r#"{:0width$}>{}</a>"#, 0, title, width = len)
                .as_bytes()
                .to_vec(),
        );

        if ele.child().len() > 0 {
            text.append(&mut r#"<ol height="0pt" width="0pt">"#.as_bytes().to_vec());

            let (mut n_text, f) =
                generate_human_nav_item_xml(start + text.len(), ele.child().as_slice());
            text.append(&mut n_text);
            file_pos.child = f;

            text.append(&mut r#"</ol>"#.as_bytes().to_vec());
        }

        text.append(&mut "</li>".as_bytes().to_vec());

        pos.push(file_pos);
    }

    (text, pos)
}

/// 用于开头的目录导航
pub(crate) fn generate_human_nav_xml(
    start: usize,
    nav: &[MobiNav],
    title: &str,
) -> (Vec<u8>, Vec<NavFilePos>) {
    let mut text = Vec::new();
    text.append(&mut format!(r#"<p height="1em" width="0pt"><font size="6"><b>{title}</b></font></p><div height="1em"></div><ol width="0pt">"#).as_bytes().to_vec());

    let (mut n_text, pos) = generate_human_nav_item_xml(start + text.len(), nav);
    text.append(&mut n_text);
    text.append(&mut "</ol>".as_bytes().to_vec());

    (text, pos)
}

fn generate_reader_nav_item_xml(
    _start: usize,
    nav: &[MobiNav],
    pos_value: &HashMap<usize, usize>,
) -> Vec<u8> {
    let mut text = Vec::new();
    let len = 10;
    for ele in nav {
        if ele.child().len() == 0 {
            let t = format!(
                r#"<blockquote height="0pt" width="0pt"><a filepos={:0width$}>{}</a></blockquote>"#,
                pos_value.get(&ele.chap_id).unwrap_or(&0),
                ele.title(),
                width = len
            );
            text.append(&mut t.as_bytes().to_vec());
        } else {
            let mut title = ele.title();
            if title.is_empty() {
                // 如果没有title的话，读取xml的时候这个章节就读不到了
                title = "&#x20;"
            }
            let t = format!(
                r#"<p height="1em" width="-19pt"><a filepos={:0width$}>{}</a></p>"#,
                pos_value.get(&ele.chap_id).unwrap_or(&0),
                title,
                width = len
            );
            text.append(&mut t.as_bytes().to_vec());

            let mut n_text =
                generate_reader_nav_item_xml(_start + text.len(), ele.child().as_slice(), pos_value);
            text.append(&mut n_text);
        }
    }
    text
}

/// 生成结尾的给阅读器的目录xml
pub(crate) fn generate_reader_nav_xml(
    start: usize,
    nav: &[MobiNav],
    pos_value: &HashMap<usize, usize>,
) -> Vec<u8> {
    let mut text = Vec::new();
    text.append(&mut r#"<p height="1em" width="0pt" align="center"><font size="7"><b>Table of Contents</b></font></p>"#.to_string().as_bytes().to_vec());

    let mut n_text = generate_reader_nav_item_xml(text.len() + start, nav, pos_value);

    text.append(&mut n_text);

    text
}

fn read_blockquote(
    reader: &mut Reader<Cursor<Vec<u8>>>,
    parent: &mut MobiNav,
    id: &mut AtomicUsize,
) -> IResult<bool> {
    let mut buf = Vec::new();

    let mut now: Option<MobiNav> = None;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8(e.name().as_ref().to_vec())?;

                if name == "a" {
                    now = Some(MobiNav::default(id.fetch_add(1, Ordering::SeqCst)));

                    // quick_xml 不支持 unquoted 的属性值解析，所以只能想办法自己来了
                    if let Some(pos) = e.get_file_pos() {
                        now.as_mut().unwrap().href = pos;
                    }
                } else if name == "p" {
                    // 读取到p，说明后面还有东西
                    return Ok(true);
                }
            }
            Ok(Event::Text(e)) => {
                if let Some(n) = &mut now {
                    n.title = match e.decode() {
                        Ok(v) => v.deref().to_string(),
                        Err(_) => return Err(IError::InvalidArchive(Cow::from("xml error"))),
                    };
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8(e.name().as_ref().to_vec())?;
                if name == "a" {
                    if let Some(n) = now {
                        parent.children.push(n);
                        now = None;
                    }
                }
            }
            Ok(Event::Eof) => {
                break;
            }
            Err(e) => {
                return Err(IError::Xml(e));
            }
            _ => (),
        }
    }

    // 读取完了

    Ok(false)
}

/// 获取目录部分的filepos
pub(crate) fn read_guide_filepos(html: &[u8]) -> IResult<Option<usize>> {
    let mut reader = Reader::from_reader(std::io::Cursor::new(html));
    reader.config_mut().trim_text(true);
    reader.config_mut().expand_empty_elements = true;

    let mut buf = Vec::new();
    let mut parent = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8(e.name().as_ref().to_vec())?;
                if name == "reference"
                    && parent.last_mut().unwrap_or(&mut "".to_string()) == "guide"
                    && parent.rget(1).unwrap_or(&mut "".to_string()) == "head"
                    && parent.rget(2).unwrap_or(&mut "".to_string()) == "html"
                {
                    return Ok(e.get_file_pos());
                }
                if name == "body" {
                    return Ok(None);
                }

                parent.push(name);
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8(e.name().as_ref().to_vec())?;

                if name == "head" || name == "body" {
                    return Ok(None);
                }

                parent.pop();
            }
            Ok(Event::Eof) => {
                break;
            }
            Err(e) => {
                return Err(IError::Xml(e));
            }
            _ => (),
        }
    }
    Ok(None)
}

trait FilePosAttr {
    fn get_file_pos(&self) -> Option<usize>;
}

impl<'a> FilePosAttr for BytesStart<'a> {
    fn get_file_pos(&self) -> Option<usize> {
        let attr = self.attributes_raw();
        let mut index = 0;
        let key = b"filepos=";

        while index < attr.len() {
            let mut now = attr[index];

            let mut j = 0;
            while j < key.len() {
                if now == key[j] {
                    index += 1;
                    now = attr[index];
                } else {
                    break;
                }
                j += 1;
            }

            if j == key.len() {
                // key 已经对上了，现在 取值
                let mut except: u8 = 0x20; // 默认期待空格
                if now == 0x27 {
                    // 单引号
                    except = 0x27;
                    index += 1;
                } else if now == 0x22 {
                    // 双引号
                    except = 0x22;
                    index += 1;
                } else if (0x30..=0x39).contains(&now) {
                    // 数字0-9
                } else {
                    // 其他不允许，这里就直接结束掉
                    return None;
                }

                let mut res: usize = 0;
                while index < attr.len() {
                    now = attr[index];
                    if (0x30..=0x39).contains(&now) {
                        // 数字0-9
                        res *= 10;
                        res += (now - 0x30) as usize;
                    } else if now == 0x20 || now == 0x27 || now == 0x22 {
                        break;
                    } else {
                        return None;
                    }
                    index += 1;
                }
                if except == 0x20 {
                    // 期待空格
                    if index == attr.len() {
                        // 已经读取完了，允许该情况
                        return Some(res);
                    }
                }

                if index == attr.len() || attr[index] != except {
                    // 该有的字符没有出现
                    return None;
                }
                return Some(res);
            }
            index += 1;
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        sync::atomic::{AtomicBool, AtomicUsize},
    };

    use quick_xml::events::BytesStart;

    use crate::{
        mobi::nav::{
            generate_human_nav_xml, generate_reader_nav_xml, read_guide_filepos, FilePosAttr,
        },
        prelude::MobiNav,
    };

    use super::read_nav_xml;

    #[test]
    fn test_file_pos_attr() {
        assert_eq!(
            5452,
            BytesStart::from_content(" filepos=0000005452", 0)
                .get_file_pos()
                .unwrap()
        );
        assert_eq!(
            5452,
            BytesStart::from_content(" filepos=0000005452 ", 0)
                .get_file_pos()
                .unwrap()
        );
        assert_eq!(
            5452,
            BytesStart::from_content(r#" filepos="0000005452""#, 0)
                .get_file_pos()
                .unwrap()
        );
        assert_eq!(
            5452,
            BytesStart::from_content(r#" filepos='0000005452'"#, 0)
                .get_file_pos()
                .unwrap()
        );
        assert_eq!(
            None,
            BytesStart::from_content(r#" filepos=d0000005452"#, 0).get_file_pos()
        );
        assert_eq!(
            None,
            BytesStart::from_content(r#" filepos='0000005452"#, 0).get_file_pos()
        );
        assert_eq!(
            None,
            BytesStart::from_content(r#" filepos=0000005452'"#, 0).get_file_pos()
        );
        assert_eq!(
            None,
            BytesStart::from_content(r#" filepos=0000005452d"#, 0).get_file_pos()
        );
        assert_eq!(
            None,
            BytesStart::from_content(r#" filepos=0000005452""#, 0).get_file_pos()
        );
    }

    #[test]
    fn test_xml() {
        let xml = r#"<p height="1em" width="0pt" align="center">
            <font size="7">
                <b>Table of Contents</b>
            </font>
        </p>
        <p height="1em" width="-19pt">
            <a filepos=0000005452>第一卷 天狼星天文台杀人事件</a>
        </p>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000005452>插图</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000007756>第一章 天狼星天文台杀人事件1</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000052866>第二章 黑之挑战</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000081943>第三章 天狼星天文台杀人事件2</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000166276>第四章 黑之挑战2</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000167797>第五章 天狼星天文台杀人事件3</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000216154>第六章 黑之挑战2</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000237334>第七章 日常篇</a>
        </blockquote>
        <p height="0pt" width="-19pt">
            <a filepos=0000289516>第二卷 诺曼兹旅馆侦探竞拍事件</a>
        </p>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000289516>插图</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000290113>第一章 日常篇</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000349393>第二章 侦探入城（castling※）</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000400306>第三章 侦探的黑色死亡（Painted Black）</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000441113>第四章 侦探与杀人魔（massacre auction）</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000518392>第五章 侦探的奏鸣曲（Detective Sonata）</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000592850>第六章 献给侦探的供物（Anti-Mystery）</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000651372>第七章 侦探穿越迷雾（Perfect Plan）</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000718427>第八章 失乐（Lost）</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000765870>第九章 （非）日常篇</a>
        </blockquote>
        <p height="0pt" width="-19pt">
            <a filepos=0000789456>第三卷 密室十二宫</a>
        </p>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000789456>插图</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000790035>第一章 少年与伯爵</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000867888>第二章 来历不明（GHOST IN THE MIRROR）</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000933533>第三章 密室十二宫</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000971827>第四章 门后的亡灵</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0001076047>第五章 非日常篇</a>
        </blockquote>
        <p height="0pt" width="-19pt">
            <a filepos=0001110274>第四卷</a>
        </p>
        <blockquote height="0pt" width="0pt">
            <a filepos=0001110274>插图</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0001110837>第一章 日常篇</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0001180103>第二章 复杀离奇(一)</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0001287564>第二章 复杀离奇(二)</a>
        </blockquote>
        <p height="0pt" width="-19pt">
            <a filepos=0001419529>第五卷</a>
        </p>
        <blockquote height="0pt" width="0pt">
            <a filepos=0001419529>插图</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0001422562>第一章 生存喧嚣(一)</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0001558611>第一章 生存喧嚣(二)</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0001623807>第二章 非日常篇</a>
        </blockquote>
        <p height="0pt" width="-19pt">
            <a filepos=0001704193>第六卷</a>
        </p>
        <blockquote height="0pt" width="0pt">
            <a filepos=0001704193>插图</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0001706086>第一章 Shoot down the angel</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0001822233>第二章 Demonic virtuoso</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0001861546>第三章 farewell, my sweetheart</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0001981433>第四章 Life is what you make it</a>
        </blockquote>
        <p height="0pt" width="-19pt">
            <a filepos=0002000476>第七卷</a>
        </p>
        <blockquote height="0pt" width="0pt">
            <a filepos=0002000476>插图</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0002002771>第一章 最后之敌</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0002078627>第二章 深不见底的黑</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0002185529>第三章 无尽之白</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0002268219>第四章 五月雨结</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0002350322>第五章 雾切响子</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0002385378>后记</a>
        </blockquote>"#
            .to_string()
            .as_bytes()
            .to_vec();
        let mut id = AtomicUsize::new(0);

        let mut nav = read_nav_xml(xml, &mut id).unwrap();

        println!("{:?}", nav);

        for ele in &nav {
            println!("{}", ele.title);
        }

        assert_eq!(7, nav.len());
        assert_eq!("第一卷 天狼星天文台杀人事件", nav[0].title);
        assert_eq!(5452, nav[0].href);

        assert_eq!(8, nav[0].children.len());

        assert_eq!("第七卷", nav.last_mut().unwrap().title);
        assert_eq!(
            "后记",
            nav.last_mut().unwrap().children.last_mut().unwrap().title
        );
    }

    #[test]
    fn test_no_level_xml() {
        let mut id = AtomicUsize::new(0);

        let xml = r#"<p height="1em" width="0pt" align="center"><font size="7"><b>Table of Contents</b></font></p><blockquote height="0pt" width="0pt"><a filepos=0000000297>标题</a></blockquote>"#;

        let n = read_nav_xml(xml.as_bytes().to_vec(), &mut id).unwrap();

        assert_eq!(1, n.len());
        assert_eq!("标题", n[0].title);
        assert_eq!(297, n[0].href);

        let xml = r#"<p height="1em" width="0pt" align="center"><font size="7"><b>Table of Contents</b></font></p><blockquote height="0pt" width="0pt"><a filepos=0000000297>标题</a></blockquote><blockquote height="0pt" width="0pt"><a filepos=0000000298>标题2</a></blockquote>"#;

        let n = read_nav_xml(xml.as_bytes().to_vec(), &mut id).unwrap();

        assert_eq!(2, n.len());
        assert_eq!("标题", n[0].title);
        assert_eq!(297, n[0].href);

        assert_eq!("标题2", n[1].title);
        assert_eq!(298, n[1].href);
    }

    #[test]
    fn test_empty_xml() {
        let mut id = AtomicUsize::new(0);
        // let xml = "<p height=\"1em\" width=\"0pt\" align=\"center\"><font size=\"7\"><b>Table of Contents</b></font></p><blockquote height=\"0pt\" width=\"0pt\"><a filepos=0000000303>&#x20;</a></blockquote>";

        // let n = read_nav_xml(xml.as_bytes().to_vec()).unwrap();

        // assert_eq!(1, n.len());
        // assert_eq!(" ", n[0].title());

        let xml = "<p height=\"1em\" width=\"0pt\" align=\"center\"><font size=\"7\"><b>Table of Contents</b></font></p><blockquote height=\"0pt\" width=\"0pt\"><a filepos=0000000303></a></blockquote>";

        let n = read_nav_xml(xml.as_bytes().to_vec(), &mut id).unwrap();

        assert_eq!(1, n.len());
        assert_eq!("", n[0].title());

        let xml = r#"<p height="1em" width="0pt" align="center">
            <font size="7">
                <b>Table of Contents</b>
            </font>
        </p>
        <p height="1em" width="-19pt">
            <a filepos=0000005452>第一卷 天狼星天文台杀人事件</a>
        </p>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000005452></a>
        </blockquote>"#;
        let n = read_nav_xml(xml.as_bytes().to_vec(), &mut id).unwrap();

        assert_eq!(1, n.len());
        assert_eq!("第一卷 天狼星天文台杀人事件", n[0].title());

        assert_eq!(1, n[0].child().len());
        assert_eq!("", n[0].child().next().unwrap().title());

        let xml = r#"<p height="1em" width="0pt" align="center">
        <font size="7">
            <b>Table of Contents</b>
        </font>
    </p>
    <p height="1em" width="-19pt">
        <a filepos=0000005452></a>
    </p>
    <blockquote height="0pt" width="0pt">
        <a filepos=0000005452></a>
    </blockquote>"#;
        let n = read_nav_xml(xml.as_bytes().to_vec(), &mut id).unwrap();

        assert_eq!(1, n.len());
        assert_eq!("", n[0].title());

        assert_eq!(1, n[0].child().len());
        assert_eq!("", n[0].child().next().unwrap().title());
    }

    #[test]
    fn test_mix_level_xml() {
        let xml = r#"<p height="1em" width="0pt" align="center"><font size="7"><b>Table of Contents</b></font></p><blockquote height="0pt" width="0pt"><a filepos=0000000297>标题</a></blockquote><blockquote height="0pt" width="0pt"><a filepos=0000000297>标题2</a></blockquote><p height="1em" width="-19pt">
            <a filepos=0000005452>第一卷 天狼星天文台杀人事件</a>
        </p>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000005452>插图</a>
        </blockquote>
        <blockquote height="0pt" width="0pt">
            <a filepos=0000007756>第一章 天狼星天文台杀人事件1</a>
        </blockquote>"#;
        let mut id = AtomicUsize::new(1);
        let n = read_nav_xml(xml.as_bytes().to_vec(), &mut id).unwrap();

        assert_eq!(3, n.len());
        assert_eq!("标题", n[0].title);
        assert_eq!(297, n[0].href);

        assert_eq!("第一卷 天狼星天文台杀人事件", n[2].title);
        assert_eq!(2, n[2].children.len());
        assert_eq!("第一章 天狼星天文台杀人事件1", n[2].children[1].title);
        assert_eq!(7756, n[2].children[1].href);
    }
    #[test]
    fn test_read_guide_filepos() {
        let mut html = r#"<html>
    <head>
        <guide>
            <reference type="toc" title="Table of Contents" filepos=0002387139 />
        </guide>
    </head>
    <body></body></html>"#;

        assert_eq!(
            2387139,
            read_guide_filepos(html.as_bytes()).unwrap().unwrap()
        );
        html = r#"<html>
    <head>
        <guides>
            <reference type="toc" title="Table of Contents" filepos=0002387139 />
        </guides>
    </head>
    <body></body></html>"#;
        assert_eq!(None, read_guide_filepos(html.as_bytes()).unwrap());

        html = r#"<html>
    <head>
        <guide>
            <resference type="toc" title="Table of Contents" filepos=0002387139 />
        </guide>
    </head>
    <body></body></html>"#;
        assert_eq!(None, read_guide_filepos(html.as_bytes()).unwrap());
    }

    #[test]
    fn test_generate_human_nav_xml() {
        let nav = vec![
            MobiNav {
                id: 1,
                title: "第一卷".to_string(),
                href: 1,
                chap_id: 0,
                children: vec![
                    MobiNav {
                        id: 2,
                        title: "第一卷第一章".to_string(),
                        href: 1,
                        children: Vec::new(),
                        chap_id: 0,
                    },
                    MobiNav {
                        id: 3,
                        title: "第一卷第2章".to_string(),
                        href: 1,
                        children: Vec::new(),
                        chap_id: 0,
                    },
                ],
            },
            MobiNav {
                id: 4,
                title: "第2卷".to_string(),
                href: 1,
                children: Vec::new(),
                chap_id: 0,
            },
        ];

        let (text, pos) = generate_human_nav_xml(0, nav.as_slice(), "测试标题");

        assert_eq!(
            r#"<p height="1em" width="0pt"><font size="6"><b>测试标题</b></font></p><div height="1em"></div><ol width="0pt"><li value="0" height="0pt" width="0pt"><a filepos=0000000000>第一卷</a><ol height="0pt" width="0pt"><li value="0" height="0pt" width="0pt"><a filepos=0000000000>第一卷第一章</a></li><li value="1" height="0pt" width="0pt"><a filepos=0000000000>第一卷第2章</a></li></ol></li><li value="1" height="0pt" width="0pt"><a filepos=0000000000>第2卷</a></li></ol>"#,
            String::from_utf8(text).unwrap()
        );
        assert_eq!(163, pos[0].index);
        assert_eq!(266, pos[0].child[0].index);
    }

    #[test]
    fn test_generate_reader_nav_xml() {
        let nav = vec![
            MobiNav {
                id: 1,
                title: "第一卷".to_string(),
                href: 1,
                chap_id: 1,
                children: vec![
                    MobiNav {
                        id: 2,
                        title: "第一卷第一章".to_string(),
                        href: 1,
                        children: Vec::new(),
                        chap_id: 2,
                    },
                    MobiNav {
                        id: 3,
                        title: "第一卷第2章".to_string(),
                        href: 1,
                        children: Vec::new(),
                        chap_id: 3,
                    },
                ],
            },
            MobiNav {
                id: 4,
                title: "第2卷".to_string(),
                href: 1,
                children: Vec::new(),
                chap_id: 4,
            },
        ];
        let mut pos_value: HashMap<usize, usize> = HashMap::new();

        pos_value.insert(1, 54);
        pos_value.insert(2, 55);
        pos_value.insert(3, 56);
        pos_value.insert(4, 57);

        let text = generate_reader_nav_xml(0, nav.as_slice(), &pos_value);

        assert_eq!(
            r#"<p height="1em" width="0pt" align="center"><font size="7"><b>Table of Contents</b></font></p><p height="1em" width="-19pt"><a filepos=0000000054>第一卷</a></p><blockquote height="0pt" width="0pt"><a filepos=0000000055>第一卷第一章</a></blockquote><blockquote height="0pt" width="0pt"><a filepos=0000000056>第一卷第2章</a></blockquote><blockquote height="0pt" width="0pt"><a filepos=0000000057>第2卷</a></blockquote>"#,
            String::from_utf8(text).unwrap()
        );
    }
}
