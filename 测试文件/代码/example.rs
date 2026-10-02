struct Chapter { title: String, words: usize }
fn main() { let chapter = Chapter { title: "Lighthouse".into(), words: 1200 }; println!("{}: {}", chapter.title, chapter.words); }
