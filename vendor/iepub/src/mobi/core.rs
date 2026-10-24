cache_struct! {
    /// 章节信息，html片段
    #[derive(Debug)]
    pub struct MobiHtml {
        title: String,
        /// 唯一id，写入时需要 确保nav能正确指向章节，否则目录会错误
        pub(crate) id: usize,
        /// 可阅读的文本
        data: Vec<u8>,

        pub(crate) nav_id: usize,
    }
}
impl MobiHtml {
    pub fn new(id: usize) -> Self {
        Self {
            title: String::new(),
            id,
            data: Vec::new(),
            nav_id: 0,
        }
    }

    pub fn title(&self) -> &str {
        &self.title
    }
    pub fn data(&self) -> Option<&[u8]> {
        Some(self.data.as_slice())
    }

    pub fn string_data(&self) -> String {
        String::from_utf8(self.data.clone()).unwrap_or_else(|_e| String::new())
    }

    pub fn nav_id(&self) -> usize {
        self.nav_id
    }

    pub fn with_data(mut self, value: Vec<u8>) -> Self {
        self.data = value;
        self
    }

    pub fn set_data(&mut self, value: Vec<u8>) {
        self.data = value;
    }

    pub fn with_title<T: Into<String>>(mut self, value: T) -> Self {
        self.title = value.into();
        self
    }
}
cache_struct! {
#[derive(Debug, Clone)]
pub struct MobiNav {
    /// id，唯一
    pub(crate) id: usize,
    pub(crate) title: String,
    pub(crate) href: usize,
    pub(crate) children: Vec<MobiNav>,
    /// 写入时指向章节
    pub(crate) chap_id: usize,
}
}
impl MobiNav {
    pub fn title(&self) -> &str {
        &self.title
    }
    /// 读取时使用该方法
    pub fn default(id: usize) -> Self {
        Self {
            id,
            title: Default::default(),
            href: Default::default(),
            children: Default::default(),
            chap_id: 0,
        }
    }

    /// 写入时使用该方法
    pub fn new(id: usize, chap_id: usize) -> Self {
        Self {
            id,
            title: Default::default(),
            href: Default::default(),
            children: Default::default(),
            chap_id,
        }
    }

    pub fn id(&self) -> usize {
        self.id
    }

    pub fn child(&self) -> std::slice::Iter<'_, MobiNav> {
        self.children.iter()
    }

    pub fn with_chap_id(mut self, chap_id: usize) -> Self {
        self.chap_id = chap_id;
        self
    }

    pub fn with_title<T: Into<String>>(mut self, title: T) -> Self {
        self.title = title.into();
        self
    }

    pub fn add_child(&mut self, child: MobiNav) {
        self.children.push(child);
    }
}

/// 由于目录存在嵌套，所以需要拿到最底层的那级目录，这样才能准确的拆分文本
///
fn flatten_nav(nav: &[MobiNav]) -> Vec<&MobiNav> {
    let mut n = Vec::new();
    for ele in nav {
        if ele.children.is_empty() {
            n.push(ele);
        } else {
            n.append(&mut flatten_nav(&ele.children));
        }
    }
    n
}

/// 给nav设置对应的章节chap_id
fn set_nav_id(nav: &mut [MobiNav], nav_id: usize, chap_id: usize) -> bool {
    for ele in nav {
        if ele.id == nav_id {
            ele.chap_id = chap_id;
            return true;
        }

        if set_nav_id(&mut ele.children, nav_id, chap_id) {
            // 下级找到，当前也要设置
            ele.chap_id = chap_id;
            return true;
        }
    }
    false
}
cache_struct! {
#[derive(Debug)]
pub struct MobiAssets {
    pub(crate) _file_name: String,
    pub(crate) media_type: String,
    pub(crate) _data: Option<Vec<u8>>,
    pub(crate) recindex: usize,
}
}
impl MobiAssets {
    pub fn new(data: Vec<u8>) -> Self {
        MobiAssets {
            _file_name: String::new(),
            media_type: String::new(),
            _data: Some(data),
            recindex: 0,
        }
    }
    pub fn data(&self) -> Option<&[u8]> {
        self._data.as_deref()
    }
    pub fn file_name(&self) -> &str {
        &self._file_name
    }

    pub fn with_file_name<T: Into<String>>(mut self, file_name: T) -> Self {
        self._file_name = file_name.into();
        self
    }
}
cache_struct! {
#[derive(Debug, Default)]
pub struct MobiBook {
    info: crate::common::BookInfo,
    /// 上次修改时间
    last_modify: Option<String>,
    /// 电子书创建者信息
    generator: Option<String>,
    /// 章节
    chapters: Vec<MobiHtml>,
    /// 封面
    cover: Option<MobiAssets>,
    /// 所有图片
    images: Vec<MobiAssets>,
    /// 目录
    nav: Vec<MobiNav>,
}
}
impl MobiBook {
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

    pub fn set_title<T: AsRef<str>>(&mut self, title: T) {
        self.info.title.clear();
        self.info.title.push_str(title.as_ref());
    }
    pub fn title(&self) -> &str {
        self.info.title.as_str()
    }
    pub fn with_title<T: AsRef<str>>(mut self, title: T) -> Self {
        self.set_title(title);
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
        self.set_identifier(identifier);
        self
    }

    pub fn set_cover(&mut self, cover: MobiAssets) {
        self.cover = Some(cover);
    }

    pub fn cover(&self) -> Option<&MobiAssets> {
        self.cover.as_ref()
    }

    pub fn cover_mut(&mut self) -> Option<&mut MobiAssets> {
        self.cover.as_mut()
    }
    pub fn assets_mut(&mut self) -> std::slice::IterMut<'_, MobiAssets> {
        self.images.iter_mut()
    }

    pub fn assets(&self) -> std::slice::Iter<'_, MobiAssets> {
        self.images.iter()
    }

    pub fn add_assets(&mut self, asset: MobiAssets) {
        self.images.push(asset)
    }

    pub fn remove_assets(&mut self, index: usize) {
        self.images.remove(index);
    }

    pub fn chapters_mut(&mut self) -> std::slice::IterMut<'_, MobiHtml> {
        self.chapters.iter_mut()
    }

    ///
    /// 查找章节
    ///
    ///
    pub fn get_chapter_mut(&mut self, nav_id: usize) -> Option<&mut MobiHtml> {
        self.chapters.iter_mut().find(|s| s.nav_id() == nav_id)
    }

    pub fn chapters(&self) -> std::slice::Iter<'_, MobiHtml> {
        self.chapters.iter()
    }

    pub fn add_chapter(&mut self, chap: MobiHtml) {
        self.chapters.push(chap);
    }

    pub fn remove_chapter(&mut self, index: usize) {
        self.chapters.remove(index);
    }

    pub fn nav(&self) -> std::slice::Iter<'_, MobiNav> {
        self.nav.iter()
    }

    pub fn add_nav(&mut self, value: MobiNav) {
        self.nav.push(value);
    }

    #[cfg(feature = "cache")]
    pub fn cache<T: AsRef<std::path::Path>>(&self, file: T) -> IResult<()> {
        std::fs::write(file, serde_json::to_string(self).unwrap())?;
        Ok(())
    }

    /// 加载缓存
    #[cfg(feature = "cache")]
    pub fn load_from_cache<T: AsRef<std::path::Path>>(file: T) -> IResult<MobiBook> {
        let file = std::fs::File::open(file)?;
        let reader = std::io::BufReader::new(file);

        // Read the JSON contents of the file as an instance of `User`.
        let u: MobiBook = serde_json::from_reader(reader)?;

        // Return the `User`.
        Ok(u)
    }
}

use std::{
    fmt::Debug,
    io::{Read, Seek},
    sync::atomic::AtomicUsize,
};

use crate::{cache_struct, common::IResult};

use super::{common::do_time_format, reader::MobiReader};

impl<T: Read + Seek> MobiReader<T> {
    pub fn load(&mut self) -> IResult<MobiBook> {
        let meta = self.read_meta_data()?;

        let mut chapters = Vec::new();
        let sec = self.load_text()?;

        let mut nav = self.read_nav_from_text(&sec[..])?;

        // 根据目录拆分文本
        let id: AtomicUsize = AtomicUsize::new(0);
        if let Some(n) = &nav {
            chapters.append(
                &mut flatten_nav(n)
                    .iter()
                    .map(|f| (sec.iter().find(|m| m.end > f.href), f))
                    .filter(|s| s.0.is_some())
                    .map(|f| (f.0.unwrap(), f.1))
                    .map(|(sec, nav)| MobiHtml {
                        id: id.fetch_add(1, std::sync::atomic::Ordering::Release),
                        nav_id: nav.id,
                        title: nav.title.clone(),
                        data: sec.data.as_bytes().to_vec(),
                    })
                    .collect(),
            );
            // 将 chap_id 赋予 nav
            if let Some(nav) = &mut nav {
                for ele in &chapters {
                    let _ = set_nav_id(nav, ele.nav_id, ele.id);
                }
            }
        } else if cfg!(feature = "no_nav") {
            let mut t_nav = Vec::new();
            for (index, s) in sec.iter().enumerate() {
                let html = MobiHtml {
                    id: id.fetch_add(1, std::sync::atomic::Ordering::Release),
                    nav_id: index,
                    title: format!("{}", index + 1),
                    data: s.data.as_bytes().to_vec(),
                };
                t_nav.push(MobiNav::new(index, html.id).with_title(html.title()));
                chapters.push(html);
            }
            nav = Some(t_nav);
        } else {
            return Err(crate::common::IError::NoNav(
                r#"book has no nav, enable feature "no_nav" to generate nav"#,
            ));
        }

        let cover = self.read_cover()?;

        let c = meta.contributor.clone();

        Ok(MobiBook {
            info: meta,
            last_modify: Some(do_time_format(self.pdb_header.modify_date)),
            generator: c,
            chapters,
            cover: cover.map(|f| MobiAssets {
                _file_name: f.get_file_name(),
                media_type: String::new(),
                _data: Some(f.0),
                recindex: 0,
            }),
            images: self.read_all_image()?,
            nav: nav.unwrap_or_else(Vec::new),
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::common::tests::download_zip_file;
    use crate::mobi::reader::MobiReader;

    #[test]
    fn test_load() {
        let name = "3252.mobi";

        let path = std::env::current_dir().unwrap().join(download_zip_file(
            name,
            "https://github.com/user-attachments/files/18904584/3252.zip",
        ));
        println!("path = {}", path.display());
        let mut mobi =
            MobiReader::new(std::fs::File::open(path.to_str().unwrap()).unwrap()).unwrap();

        let book = mobi.load().unwrap();

        println!("{:?}", book.info);

        println!("======");

        assert_eq!(24, book.chapters.len());

        println!("======");

        assert_eq!(1, book.images.len());
        println!("======");
        for ele in &book.chapters {
            println!("{} {}", ele.title, ele.nav_id);
        }
        println!("======");
        println!("{:?}", book.nav);
    }

    #[test]
    #[cfg(feature = "cache")]
    fn test_cache() {
        use crate::prelude::MobiBook;

        let name = "3252.mobi";

        let path = std::env::current_dir().unwrap().join(download_zip_file(
            name,
            "https://github.com/user-attachments/files/18904584/3252.zip",
        ));
        let mut mobi =
            MobiReader::new(std::fs::File::open(path.to_str().unwrap()).unwrap()).unwrap();
        let f = if std::path::Path::new("target").exists() {
            "target/cache-mobi.json"
        } else {
            "../target/cache-mobi.json"
        };
        let book = mobi.load().unwrap();

        book.cache(f).unwrap();

        let book2 = MobiBook::load_from_cache(f).unwrap();

        assert_eq!(book.chapters.len(), book2.chapters.len());
        assert_eq!(book.chapters[0].data, book2.chapters[0].data);
        assert_eq!(book.images[0]._data, book2.images[0]._data);
    }

    #[test]
    #[cfg(feature = "no_nav")]
    fn test_no_nav() {
        let name = "convert.mobi";

        let mut mobi = MobiReader::new(
            std::fs::File::open(download_zip_file(
                name,
                "https://github.com/user-attachments/files/18818424/convert.mobi.zip",
            ))
            .unwrap(),
        )
        .unwrap();

        let book = mobi.load().unwrap();

        println!("{:?}", book.info);

        assert_eq!(188, book.chapters.len());
    }

    #[test]
    #[cfg(not(feature = "no_nav"))]
    #[should_panic(
        expected = r#"called `Result::unwrap()` on an `Err` value: NoNav("book has no nav, enable feature \"no_nav\" to generate nav")"#
    )]
    fn test_no_nav() {
        let name = "convert.mobi";

        let path = std::env::current_dir().unwrap().join(download_zip_file(
            name,
            "https://github.com/user-attachments/files/18818424/convert.mobi.zip",
        ));
        let mut mobi =
            MobiReader::new(std::fs::File::open(path.to_str().unwrap()).unwrap()).unwrap();

        let book = mobi.load().unwrap();

        println!("{:?}", book.info);

        assert_eq!(188, book.chapters.len());
    }
}
