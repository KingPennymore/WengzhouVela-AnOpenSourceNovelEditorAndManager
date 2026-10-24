//!
//! 实现封面图片的自动生成
//!
use crate::common::IResult;

#[cfg(feature = "cover")]
mod text_width {
    use ab_glyph::PxScale;
    use image::{GenericImageView, RgbImage, Rgba};

    pub struct ImageCrop {
        pub original: RgbImage,
    }

    impl ImageCrop {
        pub fn new(text: &str, width: u32, height: u32, font: &impl ab_glyph::Font) -> ImageCrop {
            let mut img = RgbImage::new(width, height);
            // 绘制白色文字
            imageproc::drawing::draw_text_mut(
                &mut img,
                image::Rgb([255u8, 255u8, 255u8]),
                0,
                0,
                PxScale {
                    x: width as f32,
                    y: height as f32,
                },
                font,
                text,
            );
            ImageCrop { original: img }
        }

        pub fn text_width(&self) -> (u32, u32) {
            let (width, height) = self.original.dimensions();
            let mut left_x = 0;
            let mut right_x = 0;
            #[inline]
            fn is_not_black(pixel: &image::Rgb<u8>) -> bool {
                pixel[0] != 0 && pixel[1] != 0 && pixel[2] != 0
            }
            for x in 0..width {
                for y in 0..height {
                    let pixel = self.original.get_pixel(x, y);
                    if is_not_black(pixel) {
                        if left_x == 0 {
                            left_x = x;
                        }
                        if x >= right_x {
                            right_x = x;
                        }
                    }
                }
            }
            if right_x == left_x {
                panic!("找不到文字，可能是字体中不包含该文字");
            }
            (right_x - left_x, left_x)
        }
    }
    #[cfg(test)]
    mod tests {

        use super::ImageCrop;

        #[test]
        fn test() {
            let f = if std::path::Path::new("target").exists() {
                "target/SourceHanSansSC-Bold.otf"
            } else {
                "../target/SourceHanSansSC-Bold.otf"
            };
            let font = std::fs::read(f).unwrap_or_else( |_|{
             let s: Vec<u8> = crate::common::tests::get_req_mem("https://github.com/adobe-fonts/source-han-serif/raw/refs/heads/release/SubsetOTF/CN/SourceHanSerifCN-Bold.otf");

                let _ = std::fs::write(f, s.clone());
                s
            });
            let font = ab_glyph::FontRef::try_from_slice(&font).unwrap();

            let img = ImageCrop::new("的", 70, 120, &font);
            let mut f = std::fs::File::create(if std::path::Path::new("target").exists() {
                "target/single.jpeg"
            } else {
                "../target/single.jpeg"
            })
            .unwrap();
            img.original
                .write_to(&mut f, image::ImageFormat::Jpeg)
                .unwrap();

            println!("real_width {}", img.text_width().0);
        }
    }
}

/// 生成封面图片
#[cfg(feature = "cover")]
pub(crate) fn gen_cover(book_name: &str, font: &[u8]) -> IResult<Vec<u8>> {
    use ab_glyph::{FontRef, PxScale};
    use image::RgbImage;
    use text_width::ImageCrop;

    let width = 150;
    let height = 240;
    let margin = 5;

    let text = book_name;

    let mut img = RgbImage::new(width, height);

    let row_count;
    let col_count;

    if text.chars().count() % 3 == 0 {
        col_count = 3;
        row_count = (text.chars().count() / 3) as u32;
    } else if text.chars().count() % 2 == 0 {
        col_count = 2;
        row_count = (text.chars().count() / 2) as u32;
    } else {
        // 其他情况，每行三个字
        col_count = 3.min(text.chars().count()) as u32;
        row_count = 1.max((text.chars().count() as f32 / col_count as f32).ceil() as u32);
    }

    // 计算一个字可以使用的高度和宽度
    let use_width = (width - margin * 2) / col_count;
    let use_height = (height - margin * 2) / row_count;
    let sc = PxScale {
        x: use_width as f32,
        y: use_height as f32,
    };
    let font = FontRef::try_from_slice(font).unwrap();

    for row in 0..row_count {
        for col in 0..col_count {
            let t = match text.chars().nth((row * col_count + col) as usize) {
                Some(v) => v.to_string(),
                None => break,
            };
            // 获取文字实际的宽度
            let crop = ImageCrop::new(t.as_str(), use_width, 120, &font);
            let (real_width, begin_x) = crop.text_width();
            let mut x = ((use_width - real_width) / 2) as i32;
            x -= begin_x as i32;
            x += margin as i32;
            x += (col * use_width) as i32;
            imageproc::drawing::draw_text_mut(
                &mut img,
                image::Rgb([255u8, 255u8, 255u8]),
                x,
                (margin + row * use_height) as i32,
                sc,
                &font,
                t.as_str(),
            );
        }
    }

    let mut buf = std::io::Cursor::new(Vec::new());

    img.write_to(&mut buf, image::ImageFormat::Jpeg).unwrap();

    Ok(buf.into_inner())
}

#[cfg(not(feature = "cover"))]
pub(crate) fn gen_cover(_book_name: &str, _font: &[u8]) -> IResult<Vec<u8>> {
    panic!("自动封面需要启用 cover features")
}

#[cfg(all(test, feature = "cover"))]
mod tests {

    #[test]
    fn test_wqy() {
        let z = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc";

        if !std::fs::metadata(z).map_or(false, |_| true) {
            return;
        }
        println!("test sub overflow");
        let font = std::fs::read(z).unwrap();
        let m = super::gen_cover("测试括号（2024测试全集）", &font).unwrap();
        std::fs::write(
            if std::path::Path::new("target").exists() {
                "target/cover5.jpeg"
            } else {
                "../target/cover5.jpeg"
            },
            m,
        )
        .unwrap();
    }

    #[test]
    fn test_gen_cover() {
        let f = if std::path::Path::new("target").exists() {
            "target/SourceHanSansSC-Bold.otf"
        } else {
            "../target/SourceHanSansSC-Bold.otf"
        };
        let font = std::fs::read(f).unwrap_or_else( |_|{
             let s: Vec<u8> = crate::common::tests::get_req_mem("https://github.com/adobe-fonts/source-han-serif/raw/refs/heads/release/SubsetOTF/CN/SourceHanSerifCN-Bold.otf");

                let _ = std::fs::write(f, s.clone());
                s
        });

        let m = super::gen_cover("书名", &font).unwrap();
        std::fs::write(
            if std::path::Path::new("target").exists() {
                "target/cover.jpeg"
            } else {
                "../target/cover.jpeg"
            },
            m,
        )
        .unwrap();

        let m = super::gen_cover("每一个字都不同用来测试", &font).unwrap();
        std::fs::write(
            if std::path::Path::new("target").exists() {
                "target/cover2.jpeg"
            } else {
                "../target/cover2.jpeg"
            },
            m,
        )
        .unwrap();
        let m = super::gen_cover("的", &font).unwrap();
        std::fs::write(
            if std::path::Path::new("target").exists() {
                "target/cover3.jpeg"
            } else {
                "../target/cover3.jpeg"
            },
            m,
        )
        .unwrap();

        let m = super::gen_cover("大字", &font).unwrap();
        std::fs::write(
            if std::path::Path::new("target").exists() {
                "target/cover4.jpeg"
            } else {
                "../target/cover4.jpeg"
            },
            m,
        )
        .unwrap();
    }
}
