use std::{
    cmp::min,
    collections::HashMap,
    io::{BufWriter, Seek, Write},
    path::Path,
};

use crate::{
    common::{IError, IResult},
    mobi::{
        image::generate_text_img_xml,
        nav::{find_chap_file_pos, generate_reader_nav_xml},
    },
};

use super::{
    common::{EXTHHeader, EXTHRecord, MOBIDOCHeader, MOBIHeader, PDBHeader, PDBRecordInfo},
    core::{MobiAssets, MobiBook},
    nav::generate_human_nav_xml,
};

trait WriteCount: Write {
    fn write_u16(&mut self, value: u16) -> std::io::Result<usize>;
    fn write_u32(&mut self, value: u32) -> std::io::Result<usize>;
    fn write_u64(&mut self, value: u64) -> std::io::Result<usize>;
    /// 写入指定字节数的空白，也就是0
    fn write_zero(&mut self, length: usize) -> std::io::Result<usize>;
}
impl<W: Write> WriteCount for W {
    fn write_u16(&mut self, value: u16) -> std::io::Result<usize> {
        let v: [u8; 2] = [(value >> 8) as u8, (value & 0xff) as u8];
        self.write(&v)
    }

    fn write_u32(&mut self, value: u32) -> std::io::Result<usize> {
        self.write_u16((value >> 16) as u16)?;
        self.write_u16((value & 0xffff) as u16)
    }

    fn write_u64(&mut self, value: u64) -> std::io::Result<usize> {
        self.write_u32((value >> 32) as u32)?;
        self.write_u32((value & 0xffffffff) as u32)
    }

    fn write_zero(&mut self, length: usize) -> std::io::Result<usize> {
        let v: Vec<u8> = (0..length).map(|_| 0).collect();
        self.write(&v)
    }
}
impl MOBIDOCHeader {
    fn write<T>(&self, writer: &mut T) -> IResult<()>
    where
        T: Write,
    {
        writer.write_u16(self.compression)?;

        writer.write_zero(2)?;
        writer.write_u32(self.length)?;
        writer.write_u16(self.record_count)?;
        writer.write_u16(self.record_size)?;
        writer.write_u32(0)?;

        Ok(())
    }
}
impl PDBRecordInfo {
    fn write<T>(&self, writer: &mut T) -> IResult<()>
    where
        T: Write,
    {
        writer.write_u32(self.offset)?;
        // 合并字节
        let mut v = self.unique_id;
        v |= (self.attribute as u32) << 24;
        writer.write_u32(v)?;

        Ok(())
    }
}

impl PDBHeader {
    fn write<T>(&self, writer: &mut T) -> IResult<()>
    where
        T: Write + Seek,
    {
        writer.write_all(&self.name)?;
        writer.write_u16(self.attribute)?;
        writer.write_u16(self.version)?;
        writer.write_u32(self.createion_date)?;
        writer.write_u32(self.modify_date)?;
        writer.write_u32(self.last_backup_date)?;
        writer.write_u32(self.modification_number)?;
        writer.write_u32(self.app_info_id)?;
        writer.write_u32(self.sort_info_id)?;

        let _ = writer.write("BOOKMOBI".as_bytes())?;

        // writer.write_u32(self._type)?;
        // writer.write_u32(self.creator)?;
        writer.write_u32(self.unique_id_seed)?;
        writer.write_u32(self.next_record_list_id)?;
        writer.write_u16(self.number_of_records)?;

        for ele in &self.record_info_list {
            ele.write(writer)?;
        }
        writer.write_zero(2)?;

        Ok(())
    }

    fn from(title: &str, record_info_list: Vec<PDBRecordInfo>) -> Self {
        let mut name = [0u8; 32];
        // 注意编码问题
        let t = title.as_bytes();
        for i in 0..name.len() {
            if i < t.len() {
                name[i] = t[i];
            }
        }

        #[cfg(not(target_arch = "wasm32"))]
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|v| v.as_secs())
            .unwrap_or(0) as u32;
        #[cfg(target_arch = "wasm32")]
        let now = 0; // The browser adapter has no native system clock.
        PDBHeader {
            name,
            attribute: 0,
            version: 6,
            createion_date: now,
            modify_date: now,
            last_backup_date: now,
            modification_number: 0,
            app_info_id: 0,
            sort_info_id: 0,
            _type: [0u8; 4],
            creator: [0u8; 4],
            unique_id_seed: ((2 * record_info_list.len()) - 1) as u32,
            next_record_list_id: 0,
            number_of_records: record_info_list.len() as u16,
            record_info_list,
        }
    }
}

impl MOBIHeader {
    fn write<T: Write + Seek>(
        &self,
        record0_start: u64,
        writer: &mut T,
        book: &MobiBook,
    ) -> IResult<()> {
        let start = writer.stream_position()?;
        writer.write_all("MOBI".as_bytes())?;
        writer.write_u32(self.header_len)?;
        writer.write_u32(self.mobi_type)?;
        writer.write_u32(self.text_encoding)?;
        writer.write_u32(self.unique_id)?;
        writer.write_u32(self.file_version)?;
        writer.write_u32(self.ortographic_index)?;
        writer.write_u32(self.inflection_index)?;
        writer.write_u32(self.index_names)?;
        writer.write_u32(self.index_keys)?;

        writer.write_u32(0xFFFFFFFF)?;
        writer.write_u32(0xFFFFFFFF)?;
        writer.write_u32(0xFFFFFFFF)?;
        writer.write_u32(0xFFFFFFFF)?;
        writer.write_u32(0xFFFFFFFF)?;
        writer.write_u32(0xFFFFFFFF)?;

        writer.write_u32(self.first_non_book_index)?;
        // exth 的length需要处理,写完exth后再回来更正这里的值
        let full_name_offset_index = writer.stream_position()?;
        writer.write_u32(self.full_name_offset)?;
        writer.write_u32(book.title().len() as u32)?;
        writer.write_u32(self.locale)?;
        writer.write_u32(self.input_language)?;
        writer.write_u32(self.output_language)?;
        writer.write_u32(self.min_version)?;
        writer.write_u32(self.first_image_index)?;
        writer.write_u32(self.huffman_record_offset)?;
        writer.write_u32(self.huffman_record_count)?;
        writer.write_u32(self.huffman_table_offset)?;
        writer.write_u32(self.huffman_table_length)?;
        writer.write_u32(self.exth_flags)?;
        writer.write_zero(32)?;
        writer.write_u32(self.drm_offset)?;
        writer.write_u32(self.drm_count)?;
        writer.write_u32(self.drm_size)?;
        writer.write_u32(self.drm_flags)?;
        writer.write_zero(12)?;
        writer.write_u16(self.first_content_record_number)?;
        writer.write_u16(self.last_content_record_number)?;
        writer.write_u32(1)?;
        writer.write_u32(self.fcis_record_number)?;
        writer.write_u32(1)?;
        writer.write_u32(self.flis_record_number)?;
        writer.write_u32(1)?;
        writer.write_zero(8)?;
        writer.write_u32(0xFFFFFFFF)?;
        writer.write_u32(self.first_compilation_data_section_count)?;
        writer.write_u32(self.number_of_compilation_data_sections)?;
        writer.write_u32(0xFFFFFFFF)?;
        writer.write_u32(self.extra_record_data_flags)?;
        writer.write_u32(self.indx_record_offset)?;

        // exth
        if self.exth_flags & 0x40 == 0x40 {
            EXTHHeader::from(book).write(writer)?;
        }

        let now = writer.stream_position()?;

        writer.seek(std::io::SeekFrom::Start(full_name_offset_index))?;
        writer.write_u32((now - record0_start) as u32)?;
        writer.seek(std::io::SeekFrom::Start(now))?;

        writer.write_all(book.title().as_bytes())?;
        // 添加 buffer，方便亚马逊添加加密信息
        writer.write_zero(1024 * 8)?;
        // 4字节对齐
        let now = writer.stream_position()?;
        if (now - start) % 4 != 0 {
            writer.write_zero(4 - ((now - start) % 4) as usize)?;
        }

        Ok(())
    }
}

impl EXTHHeader {
    fn from(book: &MobiBook) -> Self {
        #[inline]
        fn gene(t: crate::mobi::common::EXTHRecordType, data: &str) -> EXTHRecord {
            let v = data.as_bytes();
            EXTHRecord {
                _type: t,
                len: (8 + v.len()) as u32,
                data: v.to_vec(),
            }
        }

        let mut record_list = Vec::new();

        record_list.push(gene(
            crate::mobi::common::EXTHRecordType::UpdatedTitle,
            book.title(),
        ));
        if let Some(v) = book.publisher() {
            record_list.push(gene(crate::mobi::common::EXTHRecordType::Publisher, v));
        }

        if let Some(v) = book.creator() {
            record_list.push(gene(crate::mobi::common::EXTHRecordType::Author, v));
        }

        if let Some(v) = book.description() {
            record_list.push(gene(crate::mobi::common::EXTHRecordType::Description, v));
        }

        record_list.push(gene(super::common::EXTHRecordType::Isbn, book.identifier()));

        if let Some(v) = book.subject() {
            record_list.push(gene(super::common::EXTHRecordType::Subject, v));
        }
        if let Some(v) = book.date() {
            record_list.push(gene(super::common::EXTHRecordType::PublishingDate, v));
        }
        if let Some(v) = book.contributor() {
            record_list.push(gene(super::common::EXTHRecordType::Contributor, v));
        }
        record_list.push(EXTHRecord {
            _type: super::common::EXTHRecordType::HasFakeCover,
            len: 12,
            data: [0, 0, 0, 0].to_vec(),
        });
        record_list.push(EXTHRecord {
            _type: super::common::EXTHRecordType::CreatorSoftware,
            len: 12,
            data: [0, 0, 0, 201].to_vec(),
        });
        record_list.push(EXTHRecord {
            _type: super::common::EXTHRecordType::CreatorMajorVersion,
            len: 12,
            data: [0, 0, 0, 1].to_vec(),
        });
        record_list.push(EXTHRecord {
            _type: super::common::EXTHRecordType::CreatorMinorVersion,
            len: 12,
            data: [0, 0, 0, 2].to_vec(),
        });
        record_list.push(EXTHRecord {
            _type: super::common::EXTHRecordType::CreatorBuildNumber,
            len: 12,
            data: [0, 0, 0b10000010, 0b00011011].to_vec(), // 33307
        });

        if book.cover().is_some() {
            let len = book.assets().len() as u32;
            record_list.push(EXTHRecord {
                _type: crate::mobi::common::EXTHRecordType::CoverOffset,
                len: 12,
                data: len.to_be_bytes().to_vec(), // 封面写到最后
            });
            record_list.push(EXTHRecord {
                _type: crate::mobi::common::EXTHRecordType::ThumbOffset,
                len: 12,
                data: len.to_be_bytes().to_vec(), // 封面写到最后
            });
        }

        EXTHHeader {
            len: 0,
            record_count: record_list.len() as u32,
            record_list,
        }
    }

    fn write<T: Write + Seek>(&self, writer: &mut T) -> IResult<usize> {
        let _ = writer.write("EXTH".as_bytes())?;
        let pos = writer.stream_position()?;
        writer.write_u32(self.len)?;

        writer.write_u32(self.record_list.len() as u32)?;

        for ele in &self.record_list {
            writer.write_u32(ele._type.code())?;
            writer.write_u32(ele.len)?;
            let _ = writer.write(&ele.data)?;
        }
        let n = writer.stream_position()?;

        // 填充 对齐
        if (n - pos) % 4 != 0 {
            writer.write_zero(4 - ((n - pos) % 4) as usize)?;
        }
        let now = writer.stream_position()?;

        writer.seek(std::io::SeekFrom::Start(pos))?;
        writer.write_u32((n - pos) as u32)?;

        writer.seek(std::io::SeekFrom::Start(now))?;

        Ok((n - pos) as usize)
    }
}

struct PDBRecord {
    index: usize,
    magic: Option<String>,
    data: Vec<u8>,
}
/// 从字节开头查找是否有合法的utf8字符，有一个即可返回true，即便后面的字节可能不合法
///
/// 假设一共五个字节，前三个字节为utf8，此时即可返回true，忽略后面的字节
///
pub(crate) fn decode_utf8_ignore(value: &[u8]) -> bool {
    if value.is_empty() {
        return false;
    }
    let mut tmp = &value[..1];

    while String::from_utf8(tmp.to_vec()).is_err() {
        if tmp.len() == value.len() {
            return false;
        }
        tmp = &value[..(tmp.len() + 1)];
    }
    true
}

/// 创建一个text_record的原始数据
///
/// 返回4096长度的 text，和可能为0的额外字节，二者相加为完整的utf-8
fn create_text_record(index: usize, text: &[u8]) -> (Vec<u8>, Vec<u8>, usize) {
    let record_size = 4096;
    let pos = index;
    let next_pos = min(pos + record_size, text.len());
    let n_index = next_pos;
    let mut extra = 0;

    // 首先从4096开始往前查找，直到凑齐一个合法的utf8字符，注意此时可能包含不合法的字符

    let mut last: Vec<u8> = Vec::new();
    while !decode_utf8_ignore(&last) {
        let size = last.len() + 1;
        last.insert(0, text[next_pos - size]);
    }
    // 此时 last 应该包含一个合法的utf8字符，以及可能存在的被中途截断的utf8字节

    if String::from_utf8(last.clone()).is_err() {
        // 后面有半截字符，需要往后解析，直到字节合法
        let prev = last.len();
        let mut next = next_pos;
        loop {
            last.push(text[next]);

            if String::from_utf8(last.clone()).is_ok() {
                extra = last.len() - prev;
                break;
            }
            // 不用考虑数组越界
            next += 1;
        }
    }

    let data = text[pos..next_pos].to_vec();
    let mut overleap = Vec::new();
    for i in 0..extra {
        overleap.push(text[data.len() + pos + i]);
    }
    (data, overleap, n_index)
}
///
/// # Examples
/// ```no_run
/// use iepub::prelude::MobiWriter;
/// let fs = std::fs::OpenOptions::new()
/// .write(true)
/// .truncate(true)
/// .create(true)
/// .open("out.mobi")
/// .unwrap();
/// MobiWriter::new(fs);
/// ```
///
pub struct MobiWriter<T: Write + Seek> {
    inner: BufWriter<T>,
    /// 压缩方式，默认不压缩
    compression: u16,
    /// 是否添加标题，默认true
    append_title: bool,
    /// 首行缩进字符，默认0，不缩进
    ident: usize,
}

impl MobiWriter<std::fs::File> {
    /// 写入文件
    pub fn write_to_file<P: AsRef<Path>>(
        file: P,
        book: &MobiBook,
        append_title: bool,
    ) -> IResult<()> {
        Self::write_to_file_with_ident(file, book, append_title, 0)
    }

    /// 写入文件
    pub fn write_to_file_with_ident<P: AsRef<Path>>(
        file: P,
        book: &MobiBook,
        append_title: bool,
        ident: usize,
    ) -> IResult<()> {
        std::fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(file)
            .map_err(IError::Io)
            .map(|f| {
                MobiWriter::new(f)
                    .with_ident(ident)
                    .with_append_title(append_title)
            })
            // .map_or_else(|e| Err(IError::Io(e)), |f| MobiWriter::new(f))
            .and_then(|mut w| w.write(book))
    }
}

impl MobiWriter<std::io::Cursor<Vec<u8>>> {
    /// 写入内存
    pub fn write_to_mem(book: &MobiBook, append_title: bool) -> IResult<Vec<u8>> {
        Self::write_to_mem_with_ident(book, append_title, 0)
    }

    /// 写入内存
    pub fn write_to_mem_with_ident(
        book: &MobiBook,
        append_title: bool,
        ident: usize,
    ) -> IResult<Vec<u8>> {
        let mut v = std::io::Cursor::new(Vec::new());
        MobiWriter::new(&mut v)
            .with_ident(ident)
            .with_append_title(append_title)
            .write(book)?;

        Ok(v.into_inner())
    }
}

impl<T: Write + Seek> MobiWriter<T> {
    ///
    /// # Examples
    /// ```no_run
    /// use iepub::prelude::MobiWriter;
    /// let fs = std::fs::OpenOptions::new()
    /// .write(true)
    /// .truncate(true)
    /// .create(true)
    /// .open("out.mobi")
    /// .unwrap();
    /// let mut w = MobiWriter::new(fs);
    /// ```
    ///
    pub fn new(value: T) -> Self {
        MobiWriter {
            inner: BufWriter::new(value),
            compression: 1,
            append_title: true,
            ident: 0,
        }
    }

    pub fn set_append_title(&mut self, value: bool) {
        self.append_title = value;
    }

    pub fn with_append_title(mut self, value: bool) -> Self {
        self.set_append_title(value);
        self
    }

    pub fn set_ident(&mut self, value: usize) {
        self.ident = value;
    }

    pub fn with_ident(mut self, value: usize) -> Self {
        self.set_ident(value);
        self
    }

    fn generate_image_record(&self, assets: &[MobiAssets]) -> Vec<PDBRecord> {
        // 应该处理一下图片的
        assets
            .iter()
            .flat_map(|f| f.data())
            .enumerate()
            .map(|(index, f)| PDBRecord {
                index,
                magic: None,
                data: f.to_vec(),
            })
            .collect()
    }

    /// 序列化章节
    ///
    /// 补充html标签，修改img属性等
    fn seriable_text_html(&self, book: &MobiBook) -> Vec<u8> {
        let mut text: Vec<u8> = Vec::new();
        text.append(
            &mut r#"<html><head><guide><reference type="toc" title="Table of Contents" filepos="#
                .as_bytes()
                .to_vec(),
        );
        let toc_pos = text.len();
        let toc_pos_len = 10;
        text.append(
            &mut format!(
                r#"{:0width$} /></guide></head><body>"#,
                0,
                width = toc_pos_len
            )
            .as_bytes()
            .to_vec(),
        );

        let mut pos = Vec::new();
        let nav = book.nav().as_slice();
        if !nav.is_empty() {
            // 添加目录html片段
            let (mut n_text, n_pos) = generate_human_nav_xml(text.len(), nav, book.title());
            pos = n_pos;
            text.append(&mut n_text);
        }
        #[inline]
        fn add_break(text: &mut Vec<u8>) {
            text.append(&mut "<mbp:pagebreak/>".as_bytes().to_vec());
        }
        let mut pos_value = HashMap::new();
        // 输出每个章节文本
        for ele in book.chapters() {
            // 修改对应的filepos
            // 可能有多个

            let pos = find_chap_file_pos(&pos, ele.id);
            for p in pos {
                pos_value.insert(ele.id, text.len());

                let pos_format = format!("{:0width$}", text.len(), width = p.length);
                for (i, v) in pos_format.as_bytes().iter().enumerate() {
                    text[p.index + i] = *v;
                }
            }

            add_break(&mut text);
            let mut v = generate_text_img_xml(
                self.html_p_ident(ele.data()).as_str(),
                &book
                    .assets()
                    .map(|f| f.file_name().to_string())
                    .collect::<Vec<String>>(),
            );
            if self.append_title && !ele.title().is_empty() {
                text.append(
                    &mut format!(r#"<h1 style="text-align: center">{}</h1>"#, ele.title())
                        .as_bytes()
                        .to_vec(),
                );
            }
            text.append(&mut v);
        }
        add_break(&mut text);
        // 添加结尾的目录，这部分应该是给阅读器看的

        let nav = book.nav().as_slice();
        if !nav.is_empty() {
            let p = text.len();
            let mut n_text = generate_reader_nav_xml(p, nav, &pos_value);
            text.append(&mut n_text);
            add_break(&mut text);
            // 修改 目录 定位

            let pos_format = format!("{:0width$}", p, width = toc_pos_len);
            for (i, v) in pos_format.as_bytes().iter().enumerate() {
                text[toc_pos + i] = *v;
            }
        }

        text.append(&mut "</body></html>".as_bytes().to_vec());
        text
    }

    fn html_p_ident(&self, v: Option<&[u8]>) -> String {
        if let Some(v) = v {
            let text = String::from_utf8(v.to_vec()).unwrap_or_else(|_e| String::new());
            // text.replace(from, to)
            if self.ident == 0 {
                text
            } else {
                let v = format!(r#"<p width="{}em">"#, self.ident);
                text.replace("<p ", v.as_str()).replace("<p>", v.as_str())
            }
        } else {
            String::new()
        }
    }

    /// text record
    ///
    /// record,text_length,last_text_record_idx,first_non_text_record_idx
    ///
    fn genrate_text_record(&self, text: Vec<u8>) -> (Vec<PDBRecord>, usize, usize, usize) {
        // 暂时不实行压缩

        let mut res = Vec::new();
        // 因为直接将 字节 按4096一组截取，可能出现某个编码被中间截断

        // 从尾部往前 一个字节 一个字节的连接后 按utf8解码，最后可能得情况就是字节分两组，一是一个完整编码，二是半截编码，
        let mut all_text_len = 0;
        let mut index = 0;
        while index < text.len() {
            let (data, _over, n_index) = create_text_record(index, &text);
            // 先不加尾巴
            // data.append(&mut over);
            // data.push(len as u8);
            index = n_index;

            all_text_len += data.len();
            res.push(PDBRecord {
                index: res.len(),
                magic: None,
                data,
            });
        }

        // 填充间隙，确保总的字节数需要是4的倍数
        let last_text_record_idx = res.len();
        let mut first_non_text_record_idx = res.len() + 1;
        if all_text_len % 4 != 0 {
            res.push(PDBRecord {
                index: last_text_record_idx,
                magic: None,
                data: (0..(all_text_len % 4)).map(|_| 0).collect(),
            });
            first_non_text_record_idx += 1;
        }

        (
            res,
            text.len(),
            last_text_record_idx,
            first_non_text_record_idx,
        )
    }

    /// 添加结尾字节
    fn write_uncrossable_breaks(_text: Vec<PDBRecord>) -> Vec<PDBRecord> {
        todo!()
    }

    fn write_header(
        &mut self,
        book: &MobiBook,
        record_info_list: Vec<PDBRecordInfo>,
    ) -> IResult<()> {
        let s = PDBHeader::from(book.title(), record_info_list);

        s.write(&mut self.inner)
    }

    fn write_record0(
        &mut self,
        book: &MobiBook,
        text_length: usize,
        last_text_record_idx: usize,
        first_non_text_record_idx: usize,
    ) -> IResult<(usize, usize)> {
        let mobidoc_header = MOBIDOCHeader {
            compression: self.compression,
            length: text_length as u32,
            record_count: last_text_record_idx as u16,
            record_size: 4096,
            position: 0,
            encrypt_type: 0,
        };

        let start: u64 = self.inner.stream_position()?;

        mobidoc_header.write(&mut self.inner)?;

        let mobi_header = MOBIHeader {
            header_len: 0xe8,
            mobi_type: 2,
            text_encoding: 65001,
            unique_id: 98,
            file_version: 6,
            ortographic_index: 0xFFFFFFFF,
            inflection_index: 0xFFFFFFFF,
            index_names: 0xFFFFFFFF,
            index_keys: 0xFFFFFFFF,
            extra_index: [0u32; 6],
            first_non_book_index: first_non_text_record_idx as u32,
            full_name_offset: 0,
            full_name_length: book.title().len() as u32,
            locale: 9,
            input_language: 0,
            output_language: 0,
            min_version: 6,
            first_image_index: first_non_text_record_idx as u32,
            huffman_record_offset: 0,
            huffman_record_count: 0,
            huffman_table_offset: 0,
            huffman_table_length: 0,
            exth_flags: 0x40,
            drm_offset: 0xffffffff,
            drm_count: 0xffffffff,
            drm_size: 0,
            drm_flags: 0,
            first_content_record_number: 1,
            last_content_record_number: last_text_record_idx as u16,
            fcis_record_number: (last_text_record_idx + 2) as u32,
            flis_record_number: (last_text_record_idx + 1) as u32,
            first_compilation_data_section_count: 0,
            number_of_compilation_data_sections: 0xffffffff,
            extra_record_data_flags: 0, // 实在搞不懂这个尾巴要怎么加，干脆就不加了
            indx_record_offset: 0xffffffff,
        };
        mobi_header.write(start, &mut self.inner, book)?;
        let end = self.inner.stream_position()?;

        Ok((start as usize, end as usize))
    }

    pub fn write(&mut self, book: &MobiBook) -> IResult<()> {
        // 将数据拆分record,然后可以直接写入

        // record 构成为 record0(mobiheader)、image record、text record、index record(toc)

        let mut record_info_list: Vec<PDBRecordInfo> = Vec::new();

        let (text, text_length, last_text_record_idx, first_non_text_record_idx) =
            self.genrate_text_record(self.seriable_text_html(book));
        let mut assets = Vec::new();

        assets.append(&mut self.generate_image_record(book.assets().as_slice()));
        if let Some(cover) = book.cover() {
            // 封面始终保持在最后一个，因为assets里可能已经包括了一份cover，在生成文本的时候recindex是按照book.assets()的顺序，放最后才能不打乱顺序
            assets.push(PDBRecord {
                index: assets.len() + text.len(),
                magic: None,
                data: cover.data().as_ref().unwrap().to_vec(),
            });
        }
        // 使用空数据占位，后续再来修改offset

        record_info_list.append(
            &mut (0..(text.len() + assets.len() + 3 + 1))
                .map(|s| PDBRecordInfo {
                    offset: 0,
                    attribute: 0,
                    unique_id: (s * 2) as u32,
                })
                .collect(),
        );

        self.write_header(book, record_info_list.clone())?;

        let (start, _end) = self.write_record0(
            book,
            text_length,
            last_text_record_idx,
            first_non_text_record_idx,
        )?;

        record_info_list[0].offset = start as u32;
        let mut index = 1;
        // 写入 text
        for ele in text {
            record_info_list[index].offset = self.inner.stream_position()? as u32;
            index += 1;
            self.inner.write_all(&ele.data)?;
        }

        // 写入image
        for ele in assets {
            record_info_list[index].offset = self.inner.stream_position()? as u32;
            index += 1;
            self.inner.write_all(&ele.data)?;
        }
        // 添加FCIS和FLIS
        record_info_list[index].offset = self.inner.stream_position()? as u32;
        index += 1;

        self.inner.write_all(b"FLIS\0\0\0\x08\0A\0\0\0\0\0\0\xff\xff\xff\xff\0\x01\0\x03\0\0\0\x03\0\0\0\x01\xff\xff\xff\xff")?;

        record_info_list[index].offset = self.inner.stream_position()? as u32;
        index += 1;
        self.inner.write_all(&fcis(text_length as u32))?;

        // 还有个EOF;EOF用于确定最后一个有意义的record的边界
        record_info_list[index].offset = self.inner.stream_position()? as u32;
        self.inner.write_all(b"\xE9\x8E\x0D\x0A")?;

        // 重新写入offset
        self.inner.seek(std::io::SeekFrom::Start(78))?;
        for ele in &record_info_list {
            ele.write(&mut self.inner)?;
        }

        Ok(())
    }
}
fn fcis(text_length: u32) -> Vec<u8> {
    let mut fcis = Vec::new();

    // 添加固定字节序列
    fcis.extend_from_slice(b"FCIS\x00\x00\x00\x14\x00\x00\x00\x10\x00\x00\x00\x01\x00\x00\x00\x00");

    // 添加大端序的text_length
    fcis.extend_from_slice(&(text_length).to_be_bytes());

    // 添加剩余的固定字节序列
    fcis.extend_from_slice(
        b"\x00\x00\x00\x00\x00\x00\x00\x20\x00\x00\x00\x08\x00\x01\x00\x01\x00\x00\x00\x00",
    );

    fcis
}
#[cfg(test)]
mod tests {

    use crate::{mobi::writer::decode_utf8_ignore, prelude::MobiReader};

    use super::MobiWriter;

    #[test]
    #[should_panic]
    fn test_utf8() {
        let v = "中文".as_bytes();

        println!("v.{}", v.len());

        assert_eq!(true, decode_utf8_ignore(v));

        let mut m = v.to_vec();
        m.push("中文".as_bytes()[0]);
        assert_eq!(true, decode_utf8_ignore(&m));

        println!("{}", String::from_utf8(m).unwrap());
    }

    #[test]
    #[ignore = "dan.mobi"]
    fn test_write() {
        {
            let fs = std::fs::OpenOptions::new()
                .write(true)
                .truncate(true)
                .create(true)
                .open("demo.mobi")
                .unwrap();

            let mut w = MobiWriter::new(fs);

            let path = std::env::current_dir().unwrap().join("../dan.mobi");
            let mut mobi =
                MobiReader::new(std::fs::File::open(path.to_str().unwrap()).unwrap()).unwrap();

            let book = mobi.load().unwrap();

            w.write(&book).unwrap();
        }
        {
            // let mut fs = std::fs::OpenOptions::new()
            //     .read(true)
            //     .open("demo.mobi")
            //     .unwrap();
            // fs.seek(std::io::SeekFrom::Start(5336 + 16)).unwrap();
            // let h = MOBIHeader::load(&mut fs).unwrap();

            // assert_eq!(3, h.extra_record_data_flags);
        }
    }
}
