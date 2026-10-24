use crate::common::{ContentItem, ContentType, IError, IResult};
use quick_xml::{events::Event, reader::Reader, XmlVersion};

/// HTML 解析器
pub struct HtmlParser {
    /// 解析结果
    pub items: Vec<ContentItem>,
}

impl Default for HtmlParser {
    fn default() -> Self {
        Self::new()
    }
}

impl HtmlParser {
    pub fn new() -> Self {
        Self { items: Vec::new() }
    }

    /// 解析 HTML 字符串
    pub fn parse(&mut self, html: &str) -> IResult<()> {
        let mut reader = Reader::from_str(html);
        reader.config_mut().trim_text(false);
        reader.config_mut().expand_empty_elements = true;
        reader.config_mut().check_end_names = false;

        let mut buf = Vec::new();
        let mut stack: Vec<ContentItem> = Vec::new();
        let mut in_body = false;
        let mut has_body_tag = false;
        let mut depth: u32 = 0; // 用于跟踪标签深度

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Eof) => break,

                Ok(Event::Start(ref e)) => {
                    let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    depth += 1;

                    // 检查是否进入 body 标签
                    if tag_name.to_lowercase() == "body" {
                        in_body = true;
                        has_body_tag = true;
                        buf.clear();
                        continue;
                    }

                    // 如果没有 body 标签，且不是 html/head 标签，则开始解析
                    if !has_body_tag && depth > 0 {
                        let lower_tag = tag_name.to_lowercase();
                        if lower_tag != "html"
                            && lower_tag != "head"
                            && lower_tag != "meta"
                            && lower_tag != "title"
                            && lower_tag != "link"
                            && lower_tag != "style"
                        {
                            in_body = true;
                        }
                    }

                    // 只解析 body 内的内容或无 body 时的内容
                    if !in_body {
                        buf.clear();
                        continue;
                    }

                    let content_type = Self::tag_to_content_type(&tag_name);
                    let mut item = ContentItem::new(content_type);

                    // 提取属性
                    for attr in e.attributes().flatten() {
                        let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                        let value = attr
                            .normalized_value(XmlVersion::Implicit1_0)
                            .unwrap_or(std::borrow::Cow::Borrowed(""))
                            .to_string();
                        item.add_attribute(key, value);
                    }

                    stack.push(item);
                }

                Ok(Event::End(ref e)) => {
                    let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    depth = depth.saturating_sub(1);

                    // 检查是否离开 body 标签
                    if tag_name.to_lowercase() == "body" {
                        in_body = false;
                        buf.clear();
                        continue;
                    }

                    if !in_body {
                        buf.clear();
                        continue;
                    }

                    if let Some(item) = stack.pop() {
                        if let Some(parent) = stack.last_mut() {
                            parent.add_child(item);
                        } else {
                            self.items.push(item);
                        }
                    }
                }

                Ok(Event::Text(ref e)) => {
                    if in_body {
                        // 手动解码文本
                        let decoded = String::from_utf8_lossy(e.as_ref()).to_string();
                        if !decoded.trim().is_empty() {
                            if let Some(item) = stack.last_mut() {
                                item.add_text(&decoded);
                            } else {
                                // 如果没有父标签，创建一个文本节点
                                let mut text_item = ContentItem::new(ContentType::Text);
                                text_item.add_text(&decoded);
                                self.items.push(text_item);
                            }
                        }
                    }
                }

                Ok(Event::Empty(ref e)) => {
                    if !in_body {
                        buf.clear();
                        continue;
                    }

                    let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    let content_type = Self::tag_to_content_type(&tag_name);
                    let mut item = ContentItem::new(content_type);

                    // 提取属性 (对 img, br, hr 等自闭合标签很重要)
                    for attr in e.attributes().flatten() {
                        let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                        let value = attr
                            .normalized_value(XmlVersion::Implicit1_0)
                            .unwrap_or(std::borrow::Cow::Borrowed(""))
                            .to_string();
                        item.add_attribute(key, value);
                    }

                    if let Some(parent) = stack.last_mut() {
                        parent.add_child(item);
                    } else {
                        self.items.push(item);
                    }
                }

                Ok(Event::CData(ref e)) => {
                    if in_body {
                        let text = String::from_utf8_lossy(e.as_ref());
                        if let Some(item) = stack.last_mut() {
                            item.add_text(&text);
                        }
                    }
                }

                Err(e) => {
                    return Err(IError::Xml(e));
                }

                _ => {}
            }

            buf.clear();
        }

        // 处理未关闭的标签
        while let Some(item) = stack.pop() {
            if let Some(parent) = stack.last_mut() {
                parent.add_child(item);
            } else {
                self.items.push(item);
            }
        }

        Ok(())
    }

    /// 将 HTML 标签名转换为内容类型
    fn tag_to_content_type(tag: &str) -> ContentType {
        match tag.to_lowercase().as_str() {
            "p" => ContentType::Paragraph,
            "h1" => ContentType::Heading(1),
            "h2" => ContentType::Heading(2),
            "h3" => ContentType::Heading(3),
            "h4" => ContentType::Heading(4),
            "h5" => ContentType::Heading(5),
            "h6" => ContentType::Heading(6),
            "img" => ContentType::Image,
            "a" => ContentType::Link,
            "li" => ContentType::ListItem,
            "blockquote" => ContentType::BlockQuote,
            "pre" | "code" => ContentType::CodeBlock,
            "hr" => ContentType::HorizontalRule,
            _ => ContentType::Other(tag.to_string()),
        }
    }

    /// 提取所有段落文本
    pub fn extract_paragraphs(&self) -> Vec<String> {
        let mut paragraphs = Vec::new();
        self.extract_paragraphs_recursive(&self.items, &mut paragraphs);
        paragraphs
    }

    fn extract_paragraphs_recursive(&self, items: &[ContentItem], result: &mut Vec<String>) {
        for item in items {
            if let ContentType::Paragraph = item.content_type {
                if !item.text.trim().is_empty() {
                    result.push(item.text.trim().to_string());
                }
            }
            // 递归处理子元素
            self.extract_paragraphs_recursive(&item.children, result);
        }
    }

    /// 提取所有标题
    pub fn extract_headings(&self) -> Vec<(u8, String)> {
        let mut headings = Vec::new();
        self.extract_headings_recursive(&self.items, &mut headings);
        headings
    }

    fn extract_headings_recursive(&self, items: &[ContentItem], result: &mut Vec<(u8, String)>) {
        for item in items {
            if let ContentType::Heading(level) = item.content_type {
                if !item.text.trim().is_empty() {
                    result.push((level, item.text.trim().to_string()));
                }
            }
            // 递归处理子元素
            self.extract_headings_recursive(&item.children, result);
        }
    }

    /// 提取所有图片链接
    pub fn extract_images(&self) -> Vec<String> {
        let mut images = Vec::new();
        self.extract_images_recursive(&self.items, &mut images);
        images
    }

    fn extract_images_recursive(&self, items: &[ContentItem], result: &mut Vec<String>) {
        for item in items {
            if let ContentType::Image = item.content_type {
                for (key, value) in &item.attributes {
                    if key.to_lowercase() == "src" {
                        result.push(value.clone());
                        break;
                    }
                }
            }
            // 递归处理子元素
            self.extract_images_recursive(&item.children, result);
        }
    }

    /// 获取纯文本内容
    pub fn extract_plain_text(&self) -> String {
        let mut text = String::new();
        self.extract_text_recursive(&self.items, &mut text);
        text
    }

    fn extract_text_recursive(&self, items: &[ContentItem], result: &mut String) {
        for item in items {
            if !item.text.is_empty() {
                result.push_str(item.text.trim());
                result.push(' ');
            }
            // 递归处理子元素
            self.extract_text_recursive(&item.children, result);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_html_without_body_tag() {
        // 测试没有 body 标签的 HTML 片段
        let html = r#"<div class="center"><span>171</span></div>
<h3>INTRODUCTORY</h3>
<p>The difficulties of classification are very apparent here.</p>
<p>Another paragraph with some text.</p>"#;

        let mut parser = HtmlParser::new();
        parser.parse(html).unwrap();

        println!("解析到 {} 个顶层元素", parser.items.len());
        assert!(parser.items.len() > 0, "应该解析到至少一个元素");

        let paragraphs = parser.extract_paragraphs();
        println!("提取到 {} 个段落", paragraphs.len());
        assert_eq!(paragraphs.len(), 2, "应该提取到 2 个段落");

        let headings = parser.extract_headings();
        println!("提取到 {} 个标题", headings.len());
        assert_eq!(headings.len(), 1, "应该提取到 1 个标题");
        assert_eq!(headings[0].0, 3, "标题级别应该是 3");
        assert_eq!(headings[0].1, "INTRODUCTORY", "标题内容应该是 INTRODUCTORY");
    }

    #[test]
    fn test_parse_html_with_body_tag() {
        // 测试有 body 标签的 HTML
        let html = r#"<html>
<body>
<h1>章节标题</h1>
<p>这是第一段内容。</p>
</body>
</html>"#;

        let mut parser = HtmlParser::new();
        parser.parse(html).unwrap();

        assert!(parser.items.len() > 0);

        let paragraphs = parser.extract_paragraphs();
        assert_eq!(paragraphs.len(), 1);

        let headings = parser.extract_headings();
        assert_eq!(headings.len(), 1);
        assert_eq!(headings[0].0, 1);
    }
}
