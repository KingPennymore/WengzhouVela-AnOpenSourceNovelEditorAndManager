//! 修改现有epub文件，目前仅支持修改元数据
//!
//!
use std::path::Path;

use super::{
    common,
    html::{to_opf, to_toc_xml},
    writer::{self, EpubWriterTrait},
};
use crate::prelude::*;

/// 修改电子书元数据
///
/// [file] 原文件路径
///
pub fn write_metadata<P: AsRef<Path> + ?Sized>(file: &P, book: &mut EpubBook) -> IResult<()> {
    let dir = std::env::temp_dir();
    let temp_file = dir.join(format!("{}.update.epub", std::process::id()));
    {
        let mut reader = zip::ZipArchive::new(std::fs::File::open(file)?)?;
        let mut fs = std::fs::OpenOptions::new()
            .create_new(true)
            .truncate(true)
            .write(true)
            .open(temp_file.display().to_string().as_str())?;
        let mut writer = writer::EpubWriter::new(&mut fs);
        let index = reader.index_for_name(common::OPF).unwrap_or(usize::MAX);
        let index2 = reader.index_for_name(common::TOC).unwrap_or(usize::MAX);

        // 首先写入元数据文件
        writer.write_file(
            common::OPF,
            to_opf(book, crate::common::info::PKG_NAME).as_bytes(),
        )?;

        // toc文件也需要重写一份
        writer.write_file(common::TOC, to_toc_xml(book.title(), book.nav()).as_bytes())?;

        // 遍历其他文件

        for i in 0..reader.len() {
            if i == index || i == index2 {
                continue;
            }
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored)
                .unix_permissions(0o755);
            let mut f = reader.by_index(i)?;
            writer.inner.start_file(f.name(), options)?;
            std::io::copy(&mut f, &mut writer.inner)?;
        }
    }

    // 替换原始文件
    std::fs::remove_file(file)?;
    let mut from = std::fs::File::open(&temp_file)?;
    let mut to = std::fs::File::options()
        .write(true)
        .truncate(true)
        .create(true)
        .open(file)?;
    // 降级到copy
    std::io::copy(&mut from, &mut to)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::write_metadata;
    use crate::prelude::*;
    #[test]
    fn test_appender() {
        #[inline]
        fn create_book() -> EpubBuilder {
            EpubBuilder::new()
                .with_title("书名")
                .with_format("f书名")
                .with_creator("作者")
                .with_date("2024-03-14")
                .with_description("一本好书")
                .with_identifier("isbn")
                .with_publisher("行星出版社")
                .with_direction(Direction::LTR)
                .with_last_modify("last_modify")
                .add_assets("style.css", "ok".as_bytes().to_vec())
                .add_chapter(
                    EpubHtml::default()
                        .with_title("ok")
                        .with_file_name("0.xhtml")
                        .with_data("html".as_bytes().to_vec()),
                )
        }
        let _ = std::fs::remove_file("temp.epub");

        create_book().file("temp.epub").unwrap();

        let mut book = create_book().book().unwrap();
        book.set_title("修改后的名字");
        write_metadata("temp.epub", &mut book).unwrap();

        let nb = read_from_file("temp.epub").unwrap();

        assert_eq!(book.title(), nb.title());
        let _ = std::fs::remove_file("temp.epub");
    }
}
