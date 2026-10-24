use std::borrow::Cow;

use crate::common::{IError, IResult};

pub(crate) struct Cover(pub Vec<u8>);

impl Cover {
    pub(crate) fn write(&mut self, file: &str) -> std::io::Result<()> {
        let image = &mut self.0;

        std::fs::write(format!("{}.{}", file, get_suffix(image)), image)?;
        Ok(())
    }
    pub(crate) fn get_file_name(&self) -> String {
        let image = &self.0;
        format!("cover.{}", get_suffix(image))
    }
}

pub(crate) fn get_suffix(image: &[u8]) -> String {
    let mut suffix = "jpe";

    if b"JFIF" == &image[6..10] {
        suffix = "jpeg";
    } else if b"PNG" == &image[1..4] {
        suffix = "png";
    } else if b"GIF" == &image[0..3] {
        suffix = "gif";
    } else if b"WEBP" == &image[8..12] {
        suffix = "webp";
    }
    suffix.to_string()
}

/// 从html中获取所有的img recindex以及文件名
pub(crate) fn read_image_recindex_from_html(html: &[u8]) -> IResult<Vec<usize>> {
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;

    let mut reader = Reader::from_reader(std::io::Cursor::new(html));
    reader.config_mut().trim_text(true);
    reader.config_mut().expand_empty_elements = true;

    let mut res = Vec::new();

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8(e.name().as_ref().to_vec())
                    .map_err(|_| IError::InvalidArchive(Cow::from("not a img")))?;

                if name == "img" {
                    let recindex = e.get_recindex();
                    if let Some(index) = recindex {
                        res.push(index);
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

    Ok(res)
}

/// 修改xml片段中的img标签的src属性为recindex
pub(crate) fn generate_text_img_xml(html: &str, assets: &[String]) -> Vec<u8> {
    let mut text = Vec::new();
    let mut index: usize = 0;
    let chars = html.as_bytes();

    let key = b"<img ";

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

            let att = get_attr_value(&chars[index..], "src=");
            if let Some(v) = att.0 {
                // 有src属性
                let start = att.1;
                for i in chars.iter().skip(index).take(start) {
                    text.push(*i);
                }
                index += start + 1;
                // 查找对应的 assets
                let len = att.2;
                let path = String::from_utf8(v).unwrap();
                let p = path.as_str();
                let ass = assets.iter().enumerate().find(|(_, v)| v == &p);
                if let Some(ass) = ass {
                    // 有对应的src，则去除src值，然后加入recindex
                    text.append(&mut format!("recindex='{}'", ass.0 + 1).as_bytes().to_vec());

                    index += len - 1;
                } else {
                    // 如果没有，则继续原样添加
                     for i in chars.iter().take(index + len).skip(index - 1)  {
                        text.push(*i);
                    }
                    index += len;
                }
                continue;
            }

            for i in chars.iter().skip(index).take(att.1) {
                text.push(*i);
            }
            index += att.1;
        } else {
            text.push(chars[index]);
            index += 1;
        }
    }

    text
}

/// 获取xml中的 attr value,
///
/// [attr] 应该是开始标签结束之后的字节，也就是第-1个字节应该是空格，后面允许有结束符等等
/// [key] 属性名，需要以=结尾
///
/// # Returns
///
/// 假设查找src属性，传入[src=]
///
/// 如果没有src或者xml不合法，返回(None,读取结束位置,0)
///
/// 如果有src，返回(data,src开始位置，整个src的长度)，例如 [p=1 src="1.jpg"], data是1.jpg，开始位置是4,长度是11
///
pub(crate) fn get_attr_value(attr: &[u8], key: &str) -> (Option<Vec<u8>>, usize, usize) {
    let mut index = 0;
    let mut s = 0;
    let key = key.as_bytes();

    let mut quo: u8 = 0;

    while index < attr.len() {
        let mut now = attr[index];
        if now == 0x27 || now == 0x22 {
            // 单双引号
            if quo == now {
                quo = 0;
            } else {
                quo = now;
            }
        }

        if (now == 0x2f || now == 0x3e) && quo == 0 {
            // 读到了结束符/>,未被引号包裹的情况下认为结束了
            return (None, index, 0);
        }

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
            // 找到 属性
            s = index - key.len();
            break;
        }
        index += 1;
    }
    if index == attr.len() {
        return (None, index, 0);
    }
    let mut now = attr[index];
    let mut len = key.len();
    // key 已经对上了，现在 取值
    let mut except: Vec<u8> = vec![0x20, 0x2f, 0x3e]; // 默认期待空格 / > 三个字符
    if now == 0x27 {
        // 单引号
        except = vec![0x27];
        index += 1;
        len += 2; // 因为结束符成对出现，所以+2
    } else if now == 0x22 {
        // 双引号
        except = vec![0x22];
        index += 1;
        len += 2;
    }

    let mut res = Vec::new();
    while index < attr.len() {
        now = attr[index];
        if now == 0x20 {
            // 读取到 空格 有两种情况，如果前面有引号，那么允许存在，如果没有引号，视为结束符
            if except.len() == 1 {
                res.push(now);
                len += 1;
            } else {
                break;
            }
        } else if now == 0x27 || now == 0x22 {
            break;
        } else if now == 0x2f {
            // 读取到 / 有两种情况，如果前面有引号，那么允许存在，如果没有引号，视为结束符
            if except.len() == 1 {
                res.push(now);
                len += 1;
            } else {
                break;
            }
        } else if now == 0x3e {
            // >
            break;
        } else {
            res.push(now);
            len += 1;
        }
        index += 1;
    }
    if index == attr.len() {
        // 已经读取完了，这种情况是不允许的，因为必须有结束标签
        return (None, index, 0);
    }

    if !except.contains(&now) {
        // 没有需要结束符，也是不正确的
        return (None, index, 0);
    }

    (Some(res), s, len)
}

trait AttrExt {
    fn get_recindex(&self) -> Option<usize>;
}

impl<'a> AttrExt for quick_xml::events::BytesStart<'a> {
    fn get_recindex(&self) -> Option<usize> {
        let attr = self.attributes_raw();
        let mut index = 0;
        let key = b"recindex=";

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
    use super::{generate_text_img_xml, get_attr_value};

    #[test]
    fn test_get_attr_value() {
        let v = get_attr_value(
            r#"align="baseline"></img>"#.as_bytes().to_vec().as_slice(),
            "src=",
        );
        // 没有 src，返回结束符的位置
        assert_eq!(None, v.0);
        assert_eq!(16, v.1);
        assert_eq!(0, v.2);

        let v = get_attr_value(
            r#"align="baselineds" src="1.jpg"></img>"#.as_bytes().to_vec().as_slice(),
            "src=",
        );
        // 有 src，返回src=的位置
        assert_eq!(19, v.1);
        assert_eq!("1.jpg", String::from_utf8(v.0.unwrap()).unwrap());
        assert_eq!(11, v.2);

        let v = get_attr_value(
            r#"align="baselineds" src=1.jpg sd></img>"#.as_bytes().to_vec().as_slice(),
            "src=",
        );
        // 有 src，返回src=的位置
        assert_eq!(19, v.1);
        assert_eq!("1.jpg", String::from_utf8(v.0.unwrap()).unwrap());
        assert_eq!(9, v.2);

        let v = get_attr_value(
            r#"src=1.jpg sd></img>"#.as_bytes().to_vec().as_slice(),
            "src=",
        );
        // 有 src，返回src=的位置
        assert_eq!(0, v.1);
        assert_eq!("1.jpg", String::from_utf8(v.0.unwrap()).unwrap());
        assert_eq!(9, v.2);

        let v = get_attr_value(
            r#"src="3/4.jpg" sd></img>"#.as_bytes().to_vec().as_slice(),
            "src=",
        );
        // 有 src，返回src=的位置
        assert_eq!(0, v.1);
        assert_eq!("3/4.jpg", String::from_utf8(v.0.unwrap()).unwrap());
        assert_eq!(13, v.2);

        let html = r#" class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86275.jpg' src="../temp/2356/images/www.bilinovel.com/2356/0/86275.jpg"/><img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86276.jpg' src="../temp/2356/images/www.bilinovel.com/2356/0/86276.jpg"/><img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86277.jpg' src="../temp/2356/images/www.bilinovel.com/2356/0/86277.jpg"/><img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86278.jpg' src="../temp/2356/images/www.bilinovel.com/2356/0/86278.jpg"/><img class="imagecontent lazyload" data-src='https://img3.readpai.com/2/2356/121744/86279.jpg' src="../temp/2356/images/www.bilinovel.com/2356/0/86279.jpg"/>"#;
        let v = get_attr_value(html.as_bytes().to_vec().as_slice(), " src=");
        assert_eq!(90, v.1);
        assert_eq!(
            "../temp/2356/images/www.bilinovel.com/2356/0/86275.jpg",
            String::from_utf8(v.0.unwrap()).unwrap()
        );
        assert_eq!(61, v.2);
    }

    #[test]
    fn test_generate_text_img_xml() {
        // 没有img
        let html = r#"<p height="1em" width="0pt"></p>"#;

        let assets = vec!["1.jpg".to_string()];

        let v = generate_text_img_xml(html, &assets);
        assert_eq!(html, String::from_utf8(v).unwrap());

        // 没有src
        let html = r#"<p height="1em" width="0pt"><img align="baseline"></img></p>"#;

        let assets = vec!["1.jpg".to_string()];

        let v = generate_text_img_xml(html, &assets);
        assert_eq!(html, String::from_utf8(v).unwrap());

        // 有src，没有图片
        let html = r#"<p height="1em" width="0pt"><img align="baseline" src="1.jpg"></img></p>"#;

        let assets = vec!["2.jpg".to_string()];

        let v = generate_text_img_xml(html, &assets);
        assert_eq!(html, String::from_utf8(v).unwrap());

        // 有对应图片

        let html = r#"<p height="1em" width="0pt"><img align="baseline" src="2.jpg"></img></p>"#;

        let assets = vec!["2.jpg".to_string()];

        let v = generate_text_img_xml(html, &assets);
        assert_eq!(
            html.replace(r#"src="2.jpg""#, "recindex='1'"),
            String::from_utf8(v).unwrap()
        );

        let html =
            r#"<p height="1em" width="0pt"><img align="baseline" src="2.jpg" h=3></img></p>"#;

        let assets = vec!["2.jpg".to_string()];

        let v = generate_text_img_xml(html, &assets);
        assert_eq!(
            html.replace(r#"src="2.jpg""#, "recindex='1'"),
            String::from_utf8(v).unwrap()
        );

        let html = r#"<h1 style="text-align: center">标题></h1><p>锻炼</p><img src='2.jpg' />"#;

        let assets = vec!["2.jpg".to_string()];

        let v = generate_text_img_xml(html, &assets);
        assert_eq!(
            html.replace(r#"src='2.jpg'"#, "recindex='1'"),
            String::from_utf8(v).unwrap()
        );

        let html = r#"<p>锻炼</p><img src='1.jpg'/>"#;

        let assets = vec!["1.jpg".to_string()];

        let v = generate_text_img_xml(html, &assets);
        assert_eq!(
            html.replace(r#"src='1.jpg'"#, "recindex='1'"),
            String::from_utf8(v).unwrap()
        );
    }
}
