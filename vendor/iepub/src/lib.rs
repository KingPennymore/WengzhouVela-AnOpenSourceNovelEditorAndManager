#![allow(unused)]
#![allow(dead_code)]
#![allow(clippy::needless_range_loop)]
extern crate iepub_derive;
#[cfg(feature = "epub")]
mod adapter;
mod common;
mod cover;
#[cfg(feature = "epub")]
mod epub;
mod mobi;
pub mod parser;
pub mod path;
pub use crate::common::ContentItem;
pub use crate::common::ContentType;
pub use crate::common::DateTimeFormater;

pub mod prelude {
    pub use crate::common::IError;
    pub use crate::common::IResult;

    pub use crate::common::escape_xml;

    #[cfg(feature = "epub")]
    pub use crate::epub::builder::EpubBuilder;
    #[cfg(feature = "epub")]
    pub use crate::epub::common::LinkRel;
    #[cfg(feature = "epub")]
    pub use crate::epub::core::Direction;
    #[cfg(feature = "epub")]
    pub use crate::epub::core::EpubAssets;
    #[cfg(feature = "epub")]
    pub use crate::epub::core::EpubBook;
    #[cfg(feature = "epub")]
    pub use crate::epub::core::EpubHtml;
    #[cfg(feature = "epub")]
    pub use crate::epub::core::EpubLink;
    #[cfg(feature = "epub")]
    pub use crate::epub::core::EpubMetaData;
    #[cfg(feature = "epub")]
    pub use crate::epub::core::EpubNav;
    #[cfg(feature = "epub")]
    pub use crate::epub::reader::read_from_file;
    #[cfg(feature = "epub")]
    pub use crate::epub::reader::read_from_vec;
    #[cfg(feature = "epub")]
    pub use crate::epub::writer::EpubWriter;

    #[cfg(feature = "epub")]
    pub mod appender {
        #[cfg(feature = "epub")]
        pub use crate::epub::appender::write_metadata;
    }

    pub use crate::mobi::builder::MobiBuilder;
    pub use crate::mobi::core::MobiBook;
    pub use crate::mobi::core::MobiHtml;
    pub use crate::mobi::core::MobiNav;
    pub use crate::mobi::reader::MobiReader;
    pub use crate::mobi::writer::MobiWriter;

    pub mod check {
        #[cfg(feature = "epub")]
        pub use crate::epub::reader::is_epub;
        pub use crate::mobi::reader::is_mobi;
    }

    #[cfg(feature = "epub")]
    pub mod adapter {
        pub use crate::adapter::core::concat::add_into_epub;
        pub use crate::adapter::core::epub_to_mobi;
        pub use crate::adapter::core::mobi_to_epub;
    }
}

#[cfg(feature = "epub")]
pub mod internal {
    pub use crate::adapter::core::generate_text_img_xml;
    pub use crate::common::get_css_content_url;
}
