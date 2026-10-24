use std::path::Path;

fn main() {
    let out_path = std::env::var("OUT_DIR").expect("OUT_DIR not found");
    let m = format!(
        r##"
   pub const PROJECT_NAME :&str = r#"{}"#;
   pub const PKG_VERSION :&str = r#"{}"#;
   pub const PKG_NAME: &str = r#"{0}-{1}"#;
   "##,
        std::env::var("CARGO_PKG_NAME").expect("CARGO_PKG_NAME not found"),
        std::env::var("CARGO_PKG_VERSION").expect("CARGO_PKG_VERSION not found"),
    );

    let path = Path::new(out_path.as_str()).join("version.rs");
    std::fs::write(path, m).expect("write version fail");
    println!("cargo:rerun-if-env-changed=CARGO_PKG_NAME");
    println!("cargo:rerun-if-env-changed=CARGO_PKG_VERSION");
}
