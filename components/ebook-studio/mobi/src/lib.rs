use base64::Engine;
use iepub::prelude::*;
use serde::Deserialize;

#[derive(Deserialize)]
struct Chapter { title: String, html: String }
#[derive(Deserialize)]
struct Asset { name: String, data: String }
#[derive(Deserialize)]
struct Book { title: String, author: String, identifier: String, description: String, chapters: Vec<Chapter>, assets: Vec<Asset>, cover: String }

fn convert(input: &[u8]) -> Result<Vec<u8>, String> {
    let book: Book = serde_json::from_slice(input).map_err(|e| e.to_string())?;
    let decode = |data: &str| base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string());
    let mut builder = MobiBuilder::default().with_title(book.title).with_creator(book.author)
        .with_identifier(book.identifier).with_description(book.description)
        .with_last_modify("2026-01-01T00:00:00Z").append_title(false).cover(decode(&book.cover)?);
    for (i, chapter) in book.chapters.into_iter().enumerate() {
        builder = builder.add_chapter(MobiHtml::new(i + 1).with_title(chapter.title).with_data(chapter.html.into_bytes()));
    }
    for asset in book.assets { builder = builder.add_assets(asset.name, decode(&asset.data)?); }
    builder.mem().map_err(|e| format!("{e:?}"))
}

#[unsafe(no_mangle)]
pub extern "C" fn studio_alloc(length: usize) -> *mut u8 {
    let bytes = vec![0u8; length].into_boxed_slice(); Box::into_raw(bytes) as *mut u8
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn studio_free(pointer: *mut u8, length: usize) { drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(pointer, length))); }
#[unsafe(no_mangle)]
pub unsafe extern "C" fn studio_convert(pointer: *const u8, length: usize) -> u64 {
    let input = std::slice::from_raw_parts(pointer, length);
    let output = match convert(input) {
        Ok(bytes) => { let mut result = vec![1]; result.extend(bytes); result },
        Err(error) => { let mut result = vec![0]; result.extend(error.as_bytes()); result }
    };
    let output = output.into_boxed_slice();
    let length = output.len();
    let pointer = Box::into_raw(output) as *mut u8;
    ((length as u64) << 32) | pointer as u64
}
