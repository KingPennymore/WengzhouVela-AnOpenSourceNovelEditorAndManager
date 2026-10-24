//! 简易的命令行程序，主要用来获取epub的元数据，暂不支持修改元数据
//!
//! tool -i file.epub get-cover 1.jpg
//!

mod cli;

use std::{env, fs::File};

use cli::arg::{Arg, ArgOption, OptionDef, OptionType};
use commands::{epub, mobi};
use iepub::prelude::*;

/// 支持的全局参数
fn create_option_def() -> Vec<OptionDef> {
    vec![
        OptionDef::create("i", "输入文件路径", OptionType::String, true),
        OptionDef::over(),
        // 日志输出
        OptionDef::create("l", "打开终端日志输出", OptionType::NoParamter, false),
    ]
}

mod commands {
    macro_rules! register_command {
        ($($cmd_type:ident),*) => {
            pub(crate) fn create_command_option_def() -> Vec<$crate::cli::arg::CommandOptionDef> {
                vec![
                $(
                $cmd_type::def(),
                )*
                ]

            }

            pub(crate) fn support_command() -> Vec<Box<dyn $crate::Command>> {
                vec![
                    $(
                        Box::<$cmd_type>::default(),
                    )*
                ]
            }
        };
    }
    pub(crate) mod epub {
        use crate::cli::command::epub::*;

        // 注册子命令
        register_command!(
            GetCover,
            BookInfoGetter,
            BookInfoSetter,
            NavScanner,
            GetImage,
            GetChapter,
            FormatConvert,
            Concat,
            Replace,
            Optimize
        );
    }
    pub(crate) mod mobi {
        use crate::cli::command::mobi::*;
        register_command!(
            BookInfoGetter,
            GetImage,
            GetCover,
            Unpack,
            FormatConvert,
            NavScanner,
            GetChapter,
            Replace
        );
    }
}

pub(crate) trait Command {
    ///
    /// 命令
    ///
    fn name(&self) -> String;

    ///
    /// 执行命令
    ///
    fn exec(&self, book: &mut Book, global_opts: &[ArgOption], opts: &[ArgOption], args: &[String]);

    // fn def()->arg::CommandOptionDef;
}
#[allow(clippy::upper_case_acronyms)]
pub(crate) enum Book<'a> {
    EPUB(&'a mut EpubBook),
    MOBI(&'a mut MobiBook),
}

/// 检查文件类型
///
/// [return] 0 epub 1 mobi,None 没有指定文件参数
fn check_input_type(arg: &Arg) -> Option<(usize, String)> {
    let check_method: Vec<fn(&mut File) -> IResult<bool>> = vec![
        iepub::prelude::check::is_epub,
        iepub::prelude::check::is_mobi,
    ];

    if let Some(opt) = arg.find_opt("i") {
        let path = opt.value.as_ref().unwrap().as_str();
        msg!("opening file {}", path);
        let v = std::fs::File::open(path);
        if let Err(e) = v {
            exec_err!("open file err: {}", e);
        }
        let mut fs = v.unwrap();

        for (index, ele) in check_method.iter().enumerate() {
            if ele(&mut fs).unwrap_or(false) {
                return Some((index, path.to_string()));
            }
        }
        exec_err!("unsupport file format");
    }

    None
}
#[allow(dead_code)]
mod info {
    include!(concat!(env!("OUT_DIR"), "/version.rs"));
}
fn print_useage(arg: &Arg, exe_file_name: &str) -> bool {
    if arg.find_opt("h").is_some() {
        println!(
            "Usage: {} [options...] [command] [command options...] ",
            exe_file_name
        );

        println!(
            "Example: {} -i input.epub get-cover out.jpg\n",
            exe_file_name
        );
        for ele in create_option_def() {
            println!("{}", ele);
        }
        println!("\nsupported sub command for epub:\n");
        for ele in commands::epub::create_command_option_def() {
            println!("{}", ele);
        }

        println!("\nsupported sub command for mobi:\n");
        for ele in commands::mobi::create_command_option_def() {
            println!("{}", ele);
        }
        println!("version: {}", info::PKG_VERSION);
        return true;
    }
    false
}

fn main() {
    let mut s: Vec<String> = env::args().collect();
    let exe_file_name = s.remove(0); //把第一个参数去掉

    let (mut arg, index) = cli::arg::parse_global_arg(s, create_option_def()).unwrap();

    // 设置日志
    cli::log::set_enable_log(arg.find_opt("l").is_some());

    if print_useage(&arg, &exe_file_name) {
        return;
    }

    let input_type = check_input_type(&arg);

    if input_type.is_none() {
        exec_err!("has no file, please use -i <file>");
    }
    if let Some((input_type, _)) = input_type {
        // 解析参数
        // 解析后续参数
        cli::arg::parse_command_arg(
            &mut arg,
            env::args().skip(index + 1).map(|f| f.to_string()).collect(),
            if input_type == 0 {
                epub::create_command_option_def()
            } else {
                mobi::create_command_option_def()
            },
        );
    }
    let (res, path) = input_type.unwrap();
    // 打开文件并执行
    if res == 0 {
        // epub
        match read_from_file(path.as_str()) {
            Ok(mut book) => {
                exec_epub(&arg, &mut book, exe_file_name.as_str());
            }
            Err(e) => {
                exec_err!("err: {}", e);
            }
        }
    } else if res == 1 {
        // mobi
        match iepub::prelude::MobiReader::new(std::fs::File::open(path).unwrap_or_else(|s| {
            exec_err!("err: {}", s);
        }))
        .and_then(|mut f| f.load())
        {
            Ok(mut book) => {
                exec_mobi(&arg, &mut book, exe_file_name.as_str());
            }
            Err(e) => {
                exec_err!("err: {}", e);
            }
        }
    }
}

fn exec_epub(arg: &Arg, book: &mut EpubBook, exe_file_name: &str) {
    let global_opts = arg.opts.as_slice();

    let commands = commands::epub::support_command();
    // 执行 command
    for ele in &arg.group {
        let m = commands.iter().find(|s| s.name() == ele.command);
        if let Some(com) = m {
            if ele.opts.iter().any(|s| s.key == "h") {
                if let Some(def) = commands::epub::create_command_option_def()
                    .iter()
                    .find(|s| s.command == com.name())
                {
                    println!(
                        "Usage: {} {} {}",
                        exe_file_name,
                        com.name(),
                        if def.support_args != 0 {
                            "[file_path]"
                        } else {
                            ""
                        }
                    );
                    for ele in &def.opts {
                        println!("-{:10} {}", ele.key, ele.desc);
                    }
                }

                continue;
            }
            com.exec(&mut Book::EPUB(book), global_opts, &ele.opts, &ele.args);
        }
    }
}

fn exec_mobi(arg: &Arg, book: &mut MobiBook, exe_file_name: &str) {
    let global_opts = arg.opts.as_slice();

    let commands = commands::mobi::support_command();

    // 执行 command
    for ele in &arg.group {
        let m = commands.iter().find(|s| s.name() == ele.command);
        if let Some(com) = m {
            if ele.opts.iter().any(|s| s.key == "h") {
                if let Some(def) = commands::mobi::create_command_option_def()
                    .iter()
                    .find(|s| s.command == com.name())
                {
                    println!(
                        "Usage: {} {} {}",
                        exe_file_name,
                        com.name(),
                        if def.support_args != 0 {
                            "[file_path]"
                        } else {
                            ""
                        }
                    );
                    for ele in &def.opts {
                        println!("-{:10} {}", ele.key, ele.desc);
                    }
                }

                continue;
            }
            com.exec(&mut Book::MOBI(book), global_opts, &ele.opts, &ele.args);
        }
    }
}
