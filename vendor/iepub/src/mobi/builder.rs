use std::path::Path;

use crate::common::{IError, IResult};

use super::{
    core::{MobiAssets, MobiBook, MobiHtml, MobiNav},
    writer::MobiWriter,
};

///
///
/// # Examples
/// ```rust
/// use iepub::prelude::*;
///
/// fn main() ->IResult<()>{
///     let v = MobiBuilder::default()
///         .with_title("书名")
///         .with_creator("作者")
///         .with_date("2024-03-14")
///         .with_description("一本好书")
///         .with_identifier("isbn")
///         .with_publisher("行星出版社")
///         .append_title(true)
///         .cover(Vec::new())
///         .add_chapter(MobiHtml::new(1).with_title("标题").with_data("<p>锻炼</p>".as_bytes().to_vec()))
///         // .file("builder.mobi")
///         .mem()
///         .unwrap();
///     Ok(())
/// }
/// ```
///
pub struct MobiBuilder {
    book: MobiBook,

    /// 是否自定义导航
    /// 默认为false
    custome_nav: bool,
    /// 生成文件时是否往头部追加标题
    /// 默认为true
    append_title: bool,
    nav: Vec<MobiNav>,
    /// 自动创建封面
    /// 默认为false
    auto_gen_cover: bool,
    /// 字体文件位置
    /// 用于生成封面图片
    font: Option<String>,
    /// 字体文件内容
    /// 用于生成封面图片
    font_byte: Option<Vec<u8>>,
}

impl Default for MobiBuilder {
    fn default() -> Self {
        Self::new()
    }
}

impl MobiBuilder {
    pub fn new() -> Self {
        MobiBuilder {
            book: MobiBook::default(),
            custome_nav: false,
            append_title: true,
            nav: Vec::new(),
            auto_gen_cover: false,
            font: None,
            font_byte: None,
        }
    }

    pub fn with_title<T: AsRef<str>>(mut self, title: T) -> Self {
        self.book.set_title(title);
        self
    }

    pub fn with_identifier<T: AsRef<str>>(mut self, identifier: T) -> Self {
        self.book.set_identifier(identifier);
        self
    }
    pub fn with_creator<T: AsRef<str>>(mut self, creator: T) -> Self {
        self.book.set_creator(creator);
        self
    }
    pub fn with_description<T: AsRef<str>>(mut self, description: T) -> Self {
        self.book.set_description(description.as_ref());
        self
    }
    pub fn with_contributor<T: AsRef<str>>(mut self, contributor: T) -> Self {
        self.book.set_contributor(contributor);
        self
    }
    pub fn with_date<T: AsRef<str>>(mut self, date: T) -> Self {
        self.book.set_date(date);
        self
    }
    pub fn with_format<T: AsRef<str>>(mut self, format: T) -> Self {
        self.book.set_format(format);
        self
    }
    pub fn with_publisher<T: AsRef<str>>(mut self, publisher: T) -> Self {
        self.book.set_publisher(publisher);
        self
    }
    pub fn with_subject<T: AsRef<str>>(mut self, subject: T) -> Self {
        self.book.set_subject(subject);
        self
    }

    pub fn with_last_modify<T: AsRef<str>>(mut self, last_modify: T) -> Self {
        self.book.set_last_modify(last_modify);
        self
    }

    pub fn custome_nav(mut self, value: bool) -> Self {
        self.custome_nav = value;
        self
    }

    pub fn append_title(mut self, value: bool) -> Self {
        self.append_title = value;
        self
    }

    /// 设置自动创建封面
    pub fn auto_gen_cover(mut self, value: bool) -> Self {
        self.auto_gen_cover = value;
        self
    }

    /// 设置字体文件路径
    pub fn with_font<T: Into<String>>(mut self, font_file: T) -> Self {
        self.font = Some(font_file.into());
        self
    }

    /// 设置字体文件内容
    pub fn with_font_bytes(mut self, font: Vec<u8>) -> Self {
        self.font_byte = Some(font);
        self
    }

    ///
    /// 添加资源文件
    /// [file_name] 可以随便填写，但是务必和章节里的img标签的src属性值保持一致，否则会导致图片不显示
    ///
    pub fn add_assets<T: AsRef<str>>(mut self, file_name: T, data: Vec<u8>) -> Self {
        self.book
            .add_assets(MobiAssets::new(data).with_file_name(file_name.as_ref()));
        self
    }

    ///
    /// 设置封面
    ///
    /// [data] 数据
    ///
    pub fn cover(mut self, data: Vec<u8>) -> Self {
        self.book.set_cover(MobiAssets::new(data));

        self
    }

    ///
    /// 添加文章
    ///
    /// 注意，将会按照文章添加顺序生成一个简易的目录页
    ///
    /// 如果需要更为复杂的自定义目录，需要调用 custome_nav(true) 方法
    ///
    /// chapter 里只需要填充实际内容的xml片段，不需要html、body等节点
    ///
    /// 同时如果xml中包含可阅读的标题，需要调用 append_title(false) 方法，否则会往头部添加标题标签
    ///
    ///
    pub fn add_chapter(mut self, chapter: MobiHtml) -> Self {
        self.book.add_chapter(chapter);
        self
    }

    ///
    /// 添加目录导航
    ///
    /// 注意每一个目录都应该调用 with_chap_id( mobiHtml#id ) 方法用来指向对应的章节，如果目录是父目录，那么指向第一个子目录指向的章节即可
    ///
    pub fn add_nav(mut self, nav: MobiNav) -> Self {
        self.nav.push(nav);
        self
    }

    fn gen_nav(&mut self) {
        if self.custome_nav {
            for ele in &mut self.nav {
                self.book.add_nav(ele.clone());
            }
        } else {
            let mut id = 0;
            // 生成简单目录
            let mut nav: Vec<MobiNav> = Vec::new();
            for (index, ele) in self.book.chapters_mut().enumerate() {
                id += 1;
                ele.nav_id = id;
                // 不能一次循环直接添加，因为会出现重复借用
                nav.push(
                    MobiNav::default(id)
                        .with_chap_id(ele.id)
                        .with_title(format!("{}. {}", index + 1, ele.title())),
                );
            }

            for ele in nav {
                self.book.add_nav(ele);
            }
        }
    }

    fn gen_last_modify(&mut self) {
        if self.book.last_modify().is_none() {
            self.book
                .set_last_modify(crate::common::DateTimeFormater::default().default_format());
        }
    }

    fn gen_cover(&mut self) -> IResult<()> {
        if self.auto_gen_cover && self.book.cover().is_none() {
            let font_bytes = match self.font_byte.clone() {
                Some(v) => v,
                None => self
                    .font
                    .as_ref()
                    .and_then(|f| std::fs::read(f.as_str()).ok())
                    .unwrap_or_default(),
            };
            if font_bytes.is_empty() {
                return Err(IError::Cover("no font set".to_string()));
            }
            let c = crate::cover::gen_cover(self.book.title(), &font_bytes)?;
            self.book.set_cover(MobiAssets::new(c));
        } else if self.book.cover().is_none() {
            return Err(IError::Cover("mobi must have the cover".to_string()));
        }
        Ok(())
    }
    ///
    /// 返回实例，将会消耗构造器所有权
    ///
    ///
    pub fn book(mut self) -> IResult<MobiBook> {
        self.gen_last_modify();
        self.gen_nav();
        self.gen_cover()?;
        Ok(self.book)
    }

    ///
    /// 输出到文件
    ///
    pub fn file<T: AsRef<Path>>(mut self, file: T) -> IResult<()> {
        self.gen_last_modify();
        self.gen_nav();
        self.gen_cover()?;

        let fs = std::fs::OpenOptions::new()
            .write(true)
            .truncate(true)
            .create(true)
            .open(file)?;

        MobiWriter::new(fs)
            .with_append_title(self.append_title)
            .write(&self.book)
    }

    ///
    /// 输出到内存
    ///
    pub fn mem(mut self) -> IResult<Vec<u8>> {
        self.gen_last_modify();
        self.gen_nav();
        self.gen_cover()?;

        let mut out = std::io::Cursor::new(Vec::new());
        MobiWriter::new(&mut out)
            .with_append_title(self.append_title)
            .write(&self.book)?;
        Ok(out.into_inner())
    }

    #[cfg(feature = "cache")]
    pub fn cache<T: AsRef<std::path::Path>>(&self, file: T) -> IResult<()> {
        std::fs::write(file, serde_json::to_string(&self.book).unwrap())?;
        Ok(())
    }

    /// 加载缓存
    #[cfg(feature = "cache")]
    pub fn load_from_cache<T: AsRef<std::path::Path>>(file: T) -> IResult<MobiBuilder> {
        let file = std::fs::File::open(file)?;
        let reader = std::io::BufReader::new(file);

        // Read the JSON contents of the file as an instance of `User`.
        let u: MobiBook = serde_json::from_reader(reader)?;
        let mut builder = Self::new();
        builder.book = u;
        // Return the `User`.
        Ok(builder)
    }
}

#[cfg(test)]
mod tests {
    use crate::prelude::{MobiHtml, MobiReader};

    use super::MobiBuilder;

    fn assert_vec(v1: &[u8], v2: &[u8]) {
        if v1.len() != v2.len() {
            assert!(true);
        }

        for (index, ele) in v1.iter().enumerate() {
            if ele != &v2[index] {
                assert!(true);
            }
        }
    }

    #[test]
    #[ignore = "temp"]
    fn test() {
        let img = crate::common::tests::get_req_mem(
            "https://www.rust-lang.org/static/images/user-logos/yelp.png",
        );
        let img2 = crate::common::tests::get_req_mem("https://blog.rust-lang.org/images/2024-05-17-enabling-rust-lld-on-linux/ripgrep-comparison.png");

        let v = MobiBuilder::default()
            .with_title("书名")
            .with_creator("作者")
            .with_date("2024-03-14")
            .with_description("一本好书")
            .with_identifier("isbn")
            .with_publisher("行星出版社")
            .append_title(true)
            .custome_nav(false)
            .add_chapter(
                MobiHtml::new(1)
                    .with_title("标题")
                    .with_data("<p>锻炼</p><img src='1.jpg'/>".as_bytes().to_vec()),
            )
            .add_assets("1.jpg", img.clone())
            .cover(img2.clone())
            // .file("builder.mobi")
            .mem()
            .unwrap();

        let book = MobiReader::new(std::io::Cursor::new(v))
            .unwrap()
            .load()
            .unwrap();

        assert_eq!("书名", book.title());
        assert_eq!("作者", book.creator().unwrap());
        assert_eq!(1, book.nav().len());
        assert_eq!(
            r#"<h1 style="text-align: center">标题></h1><p>锻炼</p><img recindex='0'/>"#,
            book.chapters().next().unwrap().string_data()
        );

        assert_eq!(1, book.assets().len());
        assert_vec(&img, &book.assets().next().unwrap().data().unwrap());
        assert_vec(&img2, &book.cover().unwrap().data().unwrap());

        assert_eq!(1, book.nav().len());
        assert_eq!("标题", book.nav().next().unwrap().title());
    }
}
