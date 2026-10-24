//! 命令行参数解析
//!
//! 基本格式如下:
//! exec -C arg1 get-cover -o out.jpg
//!
//! exec代表可执行命令，也就是当前程序
//!
//! -C arg1 全局参数
//!
//! get-cover 子命令
//!
//! -o out.jpg 子命令参数
//!
//! 子命令及其参数可以有多个，将会同时执行
//!

use std::{fmt::Display, str::FromStr};

use crate::exec_err;

macro_rules! parse_err {
    ($($arg:tt)*) => {{
        #[cfg(not(test))]
        {
            eprintln!($($arg)*);
            std::process::exit(1);
        }
        #[cfg(test)]
        panic!($($arg)*);

    }};

}

#[derive(Debug, Default)]
pub(crate) struct ArgOption {
    pub(crate) key: String,
    pub(crate) value: Option<String>,
    /// array 时填充该值
    pub(crate) values: Option<Vec<String>>,
}
#[derive(Debug, Default)]
pub(crate) struct ArgOptionGroup {
    /// 子命令
    pub(crate) command: String,
    /// 子命令参数，指定以 - 开头的参数
    pub(crate) opts: Vec<ArgOption>,
    /// 直接接在子命令之后的
    ///
    /// 例如 get-cover 1.jpg
    ///
    /// 这个1.jpg 就属于 args
    pub(crate) args: Vec<String>,
}
#[derive(Debug, Default)]
pub(crate) struct Arg {
    /// 全局参数
    pub(crate) opts: Vec<ArgOption>,
    /// 子命令
    pub(crate) group: Vec<ArgOptionGroup>,
}

impl Arg {
    pub(crate) fn find_opt(&self, opt: &str) -> Option<&ArgOption> {
        self.opts.iter().find(|s| s.key == opt)
    }
}

#[derive(Debug)]
pub(crate) enum OptionType {
    /// 数组
    Array,
    /// 没有参数
    NoParamter,
    /// 文件路径
    String,
    /// 数字
    Number,
}

/// 支持的参数
#[derive(Debug)]
pub(crate) struct OptionDef {
    /// 参数名，例如 f 使用时 -f
    pub(crate) key: String,
    /// 参数类型，
    pub(crate) _type: OptionType,
    pub(crate) desc: String,
    /// 是否必需
    pub(crate) required: bool,
}

impl Display for OptionDef {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "-{:10} {}", self.key, self.desc)
    }
}

impl OptionDef {
    pub(crate) fn create<T: Into<String>>(key: T, desc: T, t: OptionType, required: bool) -> Self {
        OptionDef {
            key: key.into(),
            desc: desc.into(),
            _type: t,
            required,
        }
    }

    pub(crate) fn over() -> Self {
        OptionDef::create("y", "覆盖已存在文件", OptionType::NoParamter, false)
    }
}

#[derive(Debug, Default)]
pub(crate) struct CommandOptionDef {
    pub(crate) command: String,
    pub(crate) opts: Vec<OptionDef>,

    /// 是否支持args
    ///
    /// 0代表不支持
    /// -1代表支持无限个，此时这种子命令应该放到最后一个，否则可能导致后面的子命令被识别成该命令的args
    /// 其他数字代表支持的个数
    pub(crate) support_args: i32,

    pub(crate) desc: String,
}
impl std::fmt::Display for CommandOptionDef {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(f, "{:10} {}\n", self.command, self.desc)?;
        for ele in &self.opts {
            writeln!(f, "   {}", ele)?;
        }
        Ok(())
    }
}

// fn get_option_def(key: &str, def: &[OptionDef]) -> Option<OptionDef> {}

/// 处理字符串，去除可能存在的引号
fn trim_arg(value: &str) -> String {
    if value.starts_with('\"') && value.ends_with('\"') {
        return String::from(&value[1..value.len() - 1]);
    }
    if value.starts_with('\'') && value.ends_with('\'') {
        return String::from(&value[1..value.len() - 1]);
    }
    // 还有转义之类的，这里不考虑了，实在写不完了
    value.to_string()
}

/// 首先解析全局参数，为了获取输入文件，才能确认后面可以有哪些子命令
pub(crate) fn parse_global_arg(
    args: Vec<String>,
    option_def: Vec<OptionDef>,
) -> Result<(Arg, usize), String> {
    // #[inline]
    // fn get_current_opts<'a>(
    //     _current: Option<&'a OptionDef>
    // ) -> Option<&'a mut Vec<ArgOption>> {
    //     if current_command.is_some() {
    //         let index = arg.group.len() - 1;
    //         let g = &mut arg.group;
    //         let group = g.get_mut(index).unwrap();
    //         return Some(&mut group.opts);
    //     }
    //     Some(&mut arg.opts)
    // }

    let mut arg = Arg::default();

    let mut current: Option<&OptionDef> = None;
    for (index, ele) in args.iter().enumerate() {
        if let Some(key) = ele.strip_prefix('-') {
            if key == "h" {
                // 直接结束
                arg.opts.push(ArgOption {
                    key: key.to_string(),
                    value: None,
                    ..Default::default()
                });

                return Ok((arg, index));
            }

            // 一个参数
            current = option_def.iter().find(|s| s.key == key);
            if current.is_some() {
                if let OptionType::NoParamter = current.unwrap()._type {
                    // 没有参数，到此为止
                    current = None;
                }
                arg.opts.push(ArgOption {
                    key: key.to_string(),
                    value: None,
                    ..Default::default()
                })
            } else if ele == "-h" {
                arg.opts.push(ArgOption {
                    key: "h".to_string(),
                    value: None,
                    ..Default::default()
                });
                break;
            } else {
                parse_err!("unsupport args {}", ele);
            }
        } else if let Some(cu) = &mut current {
            // 某个参数的值
            // 解析当前的参数
            match cu._type {
                OptionType::String => {
                    arg.opts.last_mut().unwrap().value = Some(trim_arg(ele));
                }
                OptionType::Array => {
                    let v = arg.opts.last_mut().unwrap();

                    v.values.get_or_insert_with(Vec::new).push(trim_arg(ele));
                }
                OptionType::Number => {
                    if ele.parse::<isize>().is_ok() {
                        let v = arg.opts.last_mut().unwrap();
                        v.value = Some(trim_arg(ele));
                    } else {
                        parse_err!("opt -{} need a number, get {}", cu.key, ele);
                    }
                }
                _ => {}
            }
            current = None;
        } else {
            check_global_opts(&arg, &option_def[..]);
            // 可能是子命令，之后的暂不解析，等待后续流程
            return Ok((arg, index));
        }
    }
    check_global_opts(&arg, &option_def[..]);
    Ok((arg, args.len() - 1))
}

fn check_global_opts(arg: &Arg, option_def: &[OptionDef]) {
    // 确定是否有必需参数未填写
    let m = option_def
        .iter()
        .filter(|f| f.required)
        .find(|f| !arg.opts.iter().any(|m| m.key == f.key));
    if let Some(m) = m {
        parse_err!("global opts -{} not set", m.key);
    }

    // 是否有参数未正确填写
    for ele in &arg.opts {
        if let Some(m) = option_def.iter().find(|f| f.key == ele.key) {
            match m._type {
                OptionType::String => {
                    if ele.value.is_none() {
                        parse_err!("ops -{} must set value", m.key);
                    }
                }
                OptionType::Array => {
                    if ele.values.is_none() {
                        parse_err!("ops -{} must set value", m.key);
                    }
                }
                _ => {}
            }
        }
    }
}

/// 解析子命令及参数
///
/// [args] 不带前面的全局参数
pub(crate) fn parse_command_arg(
    arg: &mut Arg,
    args: Vec<String>,
    command_option_def: Vec<CommandOptionDef>,
) {
    let mut current_command: Option<&CommandOptionDef> = None;
    let mut current: Option<&OptionDef> = None;
    for ele in args {
        if let Some(key) = ele.strip_prefix('-') {
            match current_command {
                None => {
                    parse_err!("error param location {}", ele);
                }

                Some(com) => {
                    // 查找参数表
                    current = com.opts.iter().find(|s| s.key == key);
                    match current {
                        Some(cu) => {
                            match cu._type {
                                OptionType::NoParamter => {
                                    if let Some(m) = arg
                                        .group
                                        .iter_mut()
                                        .find(|s| s.command == com.command)
                                        .map(|f| &mut f.opts)
                                    {
                                        m.push(ArgOption {
                                            key: key.to_string(),
                                            value: None,
                                            values: None,
                                        })
                                    }
                                    // 参数后面没有值了
                                    current = None;
                                }
                                _ => {
                                    if let Some(m) = arg
                                        .group
                                        .iter_mut()
                                        .find(|s| s.command == com.command)
                                        .map(|f| &mut f.opts)
                                    {
                                        if m.iter().all(|v| v.key != key) {
                                            // 支持 -v 1 -v 2 写法
                                            m.push(ArgOption {
                                                key: key.to_string(),
                                                value: None,
                                                values: None,
                                            })
                                        }
                                    }
                                }
                            }
                        }
                        None => {
                            // 子命令没有该参数
                            parse_err!("command {} has no param {}", com.command, ele);
                        }
                    }
                }
            }
        } else if let Some(cu) = &mut current {
            // 解析某个参数下的value
            match cu._type {
                OptionType::String => {
                    arg.group
                        .last_mut()
                        .and_then(|f| f.opts.last_mut())
                        .unwrap()
                        .value = Some(trim_arg(&ele));
                    // 普通参数解析完了，接下来应该是新的-参数了
                    current = None;
                }
                OptionType::Array => {
                    arg.group
                        .last_mut()
                        .and_then(|f| f.opts.last_mut())
                        .unwrap()
                        .values
                        .get_or_insert_with(Vec::new)
                        .push(trim_arg(&ele));
                }
                OptionType::Number => {
                    if ele.parse::<isize>().is_ok() {
                        arg.group
                            .last_mut()
                            .and_then(|f| f.opts.last_mut())
                            .unwrap()
                            .value = Some(trim_arg(&ele));
                    } else {
                        parse_err!("opt -{} need a number, get {}", cu.key, ele)
                    }
                }
                _ => {}
            }
        } else if current_command.map_or(0, |f| f.support_args) != 0 {
            // 此时代表解析到 不带- 参数，且当前有子命令
            // 该子命令支持 args
            let mut v: Option<&mut Vec<String>> = arg.group.last_mut().map(|f| f.args.as_mut());
            let support = current_command.unwrap().support_args;
            if support == -1 || v.as_ref().unwrap().len() < support as usize {
                v.as_mut().unwrap().push(ele);
            } else {
                // 装满了，子命令解析结束
                current_command = None;
            }
        } else {
            // 此时代表 解析到不带-参数，且当前没有子命令，所以只能是确认子命令
            current_command = command_option_def.iter().find(|f| f.command == ele);
            if current_command.is_none() {
                parse_err!("unsupport sub command {}", ele);
            }

            if let Some(cmd) = current_command {
                arg.group.push(ArgOptionGroup {
                    command: cmd.command.clone(),
                    opts: Vec::new(),
                    args: Vec::new(),
                })
            }
        }
    }

    // 校验必填参数
    check_command_opt(arg, &command_option_def);
}

/// 校验子命令必填参数
fn check_command_opt(arg: &Arg, command_option_def: &[CommandOptionDef]) {
    for ele in command_option_def {
        let c: Vec<&ArgOptionGroup> = arg
            .group
            .iter()
            .filter(|s| s.command == ele.command)
            .collect();
        if !c.is_empty() {
            for def in &ele.opts {
                if def.required && !c[0].opts.iter().any(|f| f.key == def.key) {
                    parse_err!("sub command {} need arg -{}", ele.command, def.key)
                }
            }
        }
    }
}

pub(crate) trait OptUtil {
    /// 是否有指定参数
    fn has_opt<T: AsRef<str>>(&self, opt: T) -> bool;

    /// 获取多个值
    fn get_values<T: AsRef<str>, V: FromStr>(&self, opt: T) -> Option<Vec<V>>;

    /// 获取单个值
    fn get_value<T: AsRef<str>, V: FromStr>(&self, opt: T) -> Option<V>;

    /// 获取单个值
    fn get_value_or_default<T: AsRef<str>, V: FromStr>(&self, opt: T, default: V) -> V;
}

impl OptUtil for &[ArgOption] {
    fn has_opt<T: AsRef<str>>(&self, opt: T) -> bool {
        self.iter()
            .find(|s| s.key == opt.as_ref())
            .is_some_and(|_| true)
    }

    fn get_values<T: AsRef<str>, V: FromStr>(&self, opt: T) -> Option<Vec<V>> {
        self.iter()
            .find(|f| f.key == opt.as_ref())
            .and_then(|f| f.values.clone())
            .map(|f| {
                f.iter()
                    .map(|v| {
                        V::from_str(v.as_str())
                            .unwrap_or_else(|_e| exec_err!("{v} type is not support"))
                    })
                    .collect::<Vec<V>>()
            })
    }

    fn get_value<T: AsRef<str>, V: FromStr>(&self, opt: T) -> Option<V> {
        self.iter()
            .find(|f| f.key == opt.as_ref())
            .and_then(|f| f.value.clone())
            .and_then(|f| f.parse::<V>().ok())
    }

    fn get_value_or_default<T: AsRef<str>, V: FromStr>(&self, opt: T, default: V) -> V {
        self.get_value(opt).unwrap_or(default)
    }
}

#[cfg(test)]
mod tests {
    use crate::cli::arg::{OptUtil, OptionType};

    use super::{parse_command_arg, parse_global_arg, Arg, CommandOptionDef, OptionDef};
    fn create_option_def() -> Vec<OptionDef> {
        vec![
            OptionDef::create("i", "输入文件，epub", OptionType::String, true),
            OptionDef::over(),
            // 日志输出
            OptionDef::create("l", "打开终端日志输出", OptionType::NoParamter, false),
        ]
    }

    #[test]
    fn test_parse_global_args() {
        let args = ["-l", "-i", "弹丸论破雾切 - 北山猛邦.epub", "nav"]
            .iter()
            .map(|f| f.to_string())
            .collect();

        let arg = parse_global_arg(args, create_option_def()).unwrap();

        println!("arg={:?}", arg);

        assert_eq!(2, arg.0.opts.len());
        assert_eq!("i", arg.0.opts.last().unwrap().key);
        assert_eq!(
            "弹丸论破雾切 - 北山猛邦.epub",
            arg.0.opts.last().as_ref().unwrap().value.as_ref().unwrap()
        );
    }

    ///
    /// 必填参数未设置
    ///
    #[test]
    #[should_panic(expected = "global opts -i not set")]
    fn test_pase_global_check() {
        let args = ["-l", "nav"].iter().map(|f| f.to_string()).collect();
        let _ = parse_global_arg(args, create_option_def()).unwrap();
    }
    ///
    /// 参数未正确设置
    ///
    #[test]
    #[should_panic(expected = "ops -i must set value")]
    fn test_pase_global_check2() {
        let args = ["-l", "-i"].iter().map(|f| f.to_string()).collect();
        let (arg, _) = parse_global_arg(args, create_option_def()).unwrap();
        println!("{:?}", arg);
    }

    #[test]
    fn test_parse_command() {
        let mut arg = Arg::default();
        let mut args = ["get-info", "-all"].iter().map(|f| f.to_string()).collect();
        let mut command_option_def = vec![CommandOptionDef {
            command: "get-info".to_string(),
            opts: vec![OptionDef {
                key: "all".to_string(),
                _type: OptionType::NoParamter,
                desc: "St".to_string(),
                required: false,
            }],
            support_args: 0,
            ..Default::default()
        }];
        parse_command_arg(&mut arg, args, command_option_def);
        println!("{:?}", arg.group);
        assert_eq!(1, arg.group.len());
        assert_eq!(1, arg.group.first().unwrap().opts.len());

        command_option_def = vec![CommandOptionDef {
            command: "get-info".to_string(),
            opts: vec![
                OptionDef {
                    key: "all".to_string(),
                    _type: OptionType::NoParamter,
                    desc: "St".to_string(),
                    required: false,
                },
                OptionDef {
                    key: "demo".to_string(),
                    _type: OptionType::String,
                    desc: "St".to_string(),
                    required: false,
                },
            ],
            support_args: 0,
            ..Default::default()
        }];

        args = ["get-info", "-all", "-demo", "h"]
            .iter()
            .map(|f| f.to_string())
            .collect();
        arg = Arg::default();

        parse_command_arg(&mut arg, args, command_option_def);
        println!("{:?}", arg.group);
        assert_eq!(1, arg.group.len());
        assert_eq!(2, arg.group.first().unwrap().opts.len());
        assert_eq!(
            "h",
            arg.group
                .first()
                .as_ref()
                .unwrap()
                .opts
                .last()
                .as_ref()
                .unwrap()
                .value
                .as_ref()
                .unwrap()
        );
    }

    /// 测试子命令必填参数
    #[test]
    #[should_panic(expected = "sub command get-info need arg -all")]
    fn test_parse_command_requird() {
        let mut arg = Arg::default();
        let args = ["get-info", "-all"].iter().map(|f| f.to_string()).collect();
        let command_option_def = vec![CommandOptionDef {
            command: "get-info".to_string(),
            opts: vec![OptionDef {
                key: "all".to_string(),
                _type: OptionType::NoParamter,
                desc: "St".to_string(),
                required: true,
            }],
            support_args: 0,
            ..Default::default()
        }];
        parse_command_arg(&mut arg, args, command_option_def);

        // 必填但未填
        let mut arg = Arg::default();
        let args = ["get-info"].iter().map(|f| f.to_string()).collect();
        let command_option_def = vec![CommandOptionDef {
            command: "get-info".to_string(),
            opts: vec![OptionDef {
                key: "all".to_string(),
                _type: OptionType::NoParamter,
                desc: "St".to_string(),
                required: true,
            }],
            support_args: 0,
            ..Default::default()
        }];
        parse_command_arg(&mut arg, args, command_option_def);
    }

    /// 测试子命令数字参数
    #[test]
    #[should_panic(expected = "opt -all need a number, get 302k")]
    fn test_parse_command_number() {
        let mut arg = Arg::default();
        let args = ["get-info", "-all", "43"]
            .iter()
            .map(|f| f.to_string())
            .collect();
        let command_option_def = vec![CommandOptionDef {
            command: "get-info".to_string(),
            opts: vec![OptionDef {
                key: "all".to_string(),
                _type: OptionType::Number,
                desc: "St".to_string(),
                required: true,
            }],
            support_args: 0,
            ..Default::default()
        }];
        parse_command_arg(&mut arg, args, command_option_def);

        // 错误数字
        let mut arg = Arg::default();
        let args = ["get-info", "-all", "302k"]
            .iter()
            .map(|f| f.to_string())
            .collect();
        let command_option_def = vec![CommandOptionDef {
            command: "get-info".to_string(),
            opts: vec![OptionDef {
                key: "all".to_string(),
                _type: OptionType::Number,
                desc: "St".to_string(),
                required: true,
            }],
            support_args: 0,
            ..Default::default()
        }];
        parse_command_arg(&mut arg, args, command_option_def);
    }

    /// 测试多参数
    #[test]
    fn test_array() {
        let mut arg = Arg::default();
        let args = ["get-info", "-all", "43", "48"]
            .iter()
            .map(|f| f.to_string())
            .collect();
        let command_option_def = vec![CommandOptionDef {
            command: "get-info".to_string(),
            opts: vec![OptionDef {
                key: "all".to_string(),
                _type: OptionType::Array,
                desc: "St".to_string(),
                required: true,
            }],
            support_args: 0,
            ..Default::default()
        }];
        parse_command_arg(&mut arg, args, command_option_def);

        let v = arg
            .group
            .iter()
            .find(|f| f.command == "get-info")
            .map(|f| f.opts.as_slice())
            .unwrap();

        let s: Vec<String> = v.get_values("all").unwrap();
        assert_eq!(2, s.len());
        assert_eq!("43", s[0]);
        assert_eq!("48", s[1]);

        let mut arg = Arg::default();
        let args = ["get-info", "-all", "43", "-all", "48"]
            .iter()
            .map(|f| f.to_string())
            .collect();
        let command_option_def = vec![CommandOptionDef {
            command: "get-info".to_string(),
            opts: vec![OptionDef {
                key: "all".to_string(),
                _type: OptionType::Array,
                desc: "St".to_string(),
                required: true,
            }],
            support_args: 0,
            ..Default::default()
        }];
        parse_command_arg(&mut arg, args, command_option_def);

        let v = arg
            .group
            .iter()
            .find(|f| f.command == "get-info")
            .map(|f| f.opts.as_slice())
            .unwrap();

        let s: Vec<String> = v.get_values("all").unwrap();
        assert_eq!(2, s.len());
        assert_eq!("43", s[0]);
        assert_eq!("48", s[1]);
    }
}

// pub(crate) fn parse_arg(
//     args: Vec<String>,
//     option_def: Vec<OptionDef>,
//     command_option_def: Vec<CommandOptionDef>,
// ) -> Result<Arg, String> {
//     let mut arg = Arg::default();

//     let mut current: Option<&OptionDef> = None;
//     let mut current_command: Option<&CommandOptionDef> = None;
//     for ele in args {
//         if let Some(key) = ele.strip_prefix('-') {
//             // 子命令参数
//             if let Some(cc) = current_command {
//                 // 解析子命令的参数
//                 let key = &ele[1..];
//                 // 参数，需要判断
//                 current = cc.opts.iter().find(|s| s.key == key);

//                 if current.is_some() {
//                     let index = arg.group.len() - 1;
//                     let group = arg.group.get_mut(index).unwrap();
//                     if let OptionType::NoParamter = current.unwrap()._type {
//                         // 没有参数，到此为止
//                         current = None;
//                     }

//                     group.opts.push(ArgOption {
//                         key: key.to_string(),
//                         value: None,
//                         ..Default::default()
//                     })
//                 } else {
//                     if ele == "-h" {
//                         let _ =
//                             get_current_opts(&mut arg, current, current_command).is_some_and(|f| {
//                                 f.push(ArgOption {
//                                     key: "h".to_string(),
//                                     value: None,
//                                     ..Default::default()
//                                 });
//                                 true
//                             });
//                         continue;
//                     }
//                     parse_err!(
//                         "unsupport args {} for command {}",
//                         ele,
//                         current_command.unwrap().command
//                     );
//                 }
//                 continue;
//             }

//             // 全局参数，需要判断
//             current = option_def.iter().find(|s| s.key == key);
//             if current.is_some() {
//                 if let OptionType::NoParamter = current.unwrap()._type {
//                     // 没有参数，到此为止
//                     current = None;
//                 }
//                 arg.opts.push(ArgOption {
//                     key: key.to_string(),
//                     value: None,
//                     ..Default::default()
//                 })
//             } else if ele == "-h" {
//                 if ele == "-h" {
//                     let _ = get_current_opts(&mut arg, current, current_command).is_some_and(|f| {
//                         f.push(ArgOption {
//                             key: "h".to_string(),
//                             value: None,
//                             ..Default::default()
//                         });
//                         true
//                     });
//                     continue;
//                 }
//             } else {
//                 parse_err!("unsupport args {}", ele);
//             }
//         } else if current.is_some() {
//             // 解析当前的参数
//             match current.unwrap()._type {
//                 OptionType::String => {
//                     let v = get_current_opts(&mut arg, current, current_command);
//                     if let Some(rv) = v {
//                         let index = rv.len() - 1;
//                         rv.get_mut(index).unwrap().value = Some(trim_arg(ele));
//                     }
//                 }
//                 OptionType::Array => {
//                     let v = get_current_opts(&mut arg, current, current_command);
//                     if let Some(rv) = v {
//                         let index = rv.len() - 1;
//                         if rv.get_mut(index).unwrap().values.is_none() {
//                             rv.get_mut(index).unwrap().values = Some(vec![trim_arg(ele)]);
//                         } else {
//                             rv.get_mut(index)
//                                 .unwrap()
//                                 .values
//                                 .as_mut()
//                                 .unwrap()
//                                 .push(trim_arg(ele));
//                         }
//                     }
//                 }
//                 _ => {}
//             }
//             current = None;
//         } else if current_command.map_or_else(|| false, |com| com.support_args != 0) {
//             // 正在解析子命令，且子命令支持arg
//             let index = arg.group.len() - 1;
//             let group = arg.group.get_mut(index).unwrap();
//             if (group.args.len() as i32) == current_command.unwrap().support_args {
//                 parse_err!(
//                     "arg count mush less than {}",
//                     current_command.unwrap().support_args
//                 )
//             }

//             group.args.push(trim_arg(ele));
//         } else {
//             // 可能是子命令
//             current_command = command_option_def.iter().find(|f| f.command == ele);
//             if current_command.is_some() {
//                 arg.group.push(ArgOptionGroup {
//                     command: ele,
//                     opts: Vec::new(),
//                     args: Vec::new(),
//                 })
//             } else {
//                 parse_err!("unsupported command or arg {}", ele);
//             }
//         }
//     }

//     // 校验参数
//     if !arg.opts.iter().any(|f| f.key == "h") {
//         for ele in &option_def {
//             if ele.required {
//                 let a = arg.opts.iter().find(|s| s.key == ele.key);
//                 match a {
//                     None => {
//                         parse_err!("grobal arg -{} is required", ele.key);
//                     }
//                     Some(_) => match ele._type {
//                         OptionType::Array => {
//                             if !a
//                                 .unwrap()
//                                 .values
//                                 .as_ref()
//                                 .map(|f| !f.is_empty())
//                                 .unwrap_or(false)
//                             {
//                                 parse_err!("grobal arg -{} value is required", ele.key);
//                             }
//                         }
//                         OptionType::String => {
//                             if a.unwrap().value.as_ref().is_none() {
//                                 parse_err!("grobal arg -{} value is required", ele.key);
//                             }
//                         }
//                         _ => {}
//                     },
//                 }
//             }
//         }
//     }

//     for ele in &command_option_def {
//         let group = arg.group.iter().find(|f| f.command == ele.command);
//         if group.is_none() {
//             continue;
//         }
//         if group.unwrap().opts.iter().any(|f| f.key == "h") {
//             continue;
//         }

//         for opt in &ele.opts {
//             if opt.required {
//                 let a = group.unwrap().opts.iter().find(|s| s.key == opt.key);
//                 match a {
//                     Some(_) => match opt._type {
//                         OptionType::Array => {
//                             if !a
//                                 .unwrap()
//                                 .values
//                                 .as_ref()
//                                 .map(|f| !f.is_empty())
//                                 .unwrap_or(false)
//                             {
//                                 parse_err!(
//                                     "command {} arg -{} value is required",
//                                     ele.command,
//                                     opt.key
//                                 );
//                             }
//                         }
//                         OptionType::String => {
//                             if a.unwrap().value.is_none() {
//                                 parse_err!(
//                                     "command {} arg -{} value is required",
//                                     ele.command,
//                                     opt.key
//                                 );
//                             }
//                         }
//                         _ => {}
//                     },
//                     None => {
//                         parse_err!("command {} arg -{} is required", ele.command, opt.key);
//                     }
//                 }
//             }
//         }
//     }

//     Ok(arg)
// }

// #[cfg(test)]
// mod tests {
//     use crate::{
//         arg::{self, OptionDef, OptionType},
//         command::{BookInfoGetter, GetChapter, GetCover, NavScanner},
//     };

//     use super::parse_arg;

//     /// 支持的全局参数
//     fn create_option_def() -> Vec<OptionDef> {
//         vec![
//             OptionDef {
//                 key: String::from("i"),
//                 _type: OptionType::String,
//                 desc: "输入文件，epub".to_string(),
//                 required: false,
//             },
//             OptionDef {
//                 // 覆盖文件
//                 key: String::from("y"),
//                 _type: OptionType::NoParamter,
//                 desc: "全局覆盖输出文件选项".to_string(),
//                 required: false,
//             },
//             OptionDef {
//                 // 日志输出
//                 key: String::from("l"),
//                 _type: OptionType::NoParamter,
//                 desc: "打开终端日志输出".to_string(),
//                 required: false,
//             },
//         ]
//     }
//     /// 支持的子命令
//     fn create_command_option_def() -> Vec<arg::CommandOptionDef> {
//         vec![
//             GetCover::def(),
//             BookInfoGetter::def(),
//             NavScanner::def(),
//             GetChapter::def(),
//         ]
//     }

//     #[test]
//     fn test_parse_args() {
//         let mut m = format!(
//             "{:?}",
//             parse_arg(
//                 vec![
//                     "-i".to_string(),
//                     "fis".to_string(),
//                     "get-cover".to_string(),
//                     "cover.jpg".to_string()
//                 ],
//                 create_option_def(),
//                 create_command_option_def()
//             )
//             .unwrap()
//         );
//         assert_eq!(
//             r#"Arg { opts: [ArgOption { key: "i", value: Some("fis"), values: None }], group: [ArgOptionGroup { command: "get-cover", opts: [], args: ["cover.jpg"] }] }"#,
//             m
//         );

//         m = format!(
//             "{:?}",
//             parse_arg(
//                 vec![
//                     "-i".to_string(),
//                     "fis".to_string(),
//                     "get-cover".to_string(),
//                     "cover.jpg".to_string(),
//                     "get-cover".to_string(),
//                     "cover.jpg".to_string(),
//                 ],
//                 create_option_def(),
//                 create_command_option_def()
//             )
//             .unwrap()
//         );

//         assert_eq!(
//             "Arg { opts: [ArgOption { key: \"i\", value: Some(\"fis\"), values: None }], group: [ArgOptionGroup { command: \"get-cover\", opts: [], args: [\"cover.jpg\", \"get-cover\", \"cover.jpg\"] }] }"
//             ,m
//         );

//         m = format!(
//             "{:?}",
//             parse_arg(
//                 vec![
//                     "get-cover".to_string(),
//                     "cover.jpg".to_string(),
//                     "cover.jpg".to_string(),
//                 ],
//                 create_option_def(),
//                 create_command_option_def()
//             )
//             .unwrap()
//         );

//         assert_eq!(
//             "Arg { opts: [], group: [ArgOptionGroup { command: \"get-cover\", opts: [], args: [\"cover.jpg\", \"cover.jpg\"] }] }"
//             ,m
//         );

//         m = format!(
//             "{:?}",
//             parse_arg(
//                 vec![
//                     "get-cover".to_string(),
//                     "-y".to_string(),
//                     "cover.jpg".to_string(),
//                 ],
//                 create_option_def(),
//                 create_command_option_def()
//             )
//             .unwrap()
//         );
//         assert_eq!(
//             "Arg { opts: [], group: [ArgOptionGroup { command: \"get-cover\", opts: [ArgOption { key: \"y\", value: None, values: None }], args: [\"cover.jpg\"] }] }"
//             ,m
//         );

//         m = format!(
//             "{:?}",
//             parse_arg(
//                 vec!["-h".to_string(),],
//                 create_option_def(),
//                 create_command_option_def()
//             )
//             .unwrap()
//         );

//         assert_eq!(
//             "Arg { opts: [ArgOption { key: \"h\", value: None, values: None }], group: [] }",
//             m
//         );

//         m = format!(
//             "{:?}",
//             parse_arg(
//                 vec![
//                     "-l",
//                     "-i",
//                     "/app/魔女之旅.epub",
//                     "get-info",
//                     "-title",
//                     "-author",
//                     "-title",
//                     "-isbn",
//                     "-publisher",
//                     "nav",
//                     "-s",
//                     "get-chapter",
//                     "-c",
//                     "022.第二十一卷/0290.xhtml",
//                     "-b"
//                 ]
//                 .iter()
//                 .map(|f| f.to_string())
//                 .collect(),
//                 create_option_def(),
//                 create_command_option_def()
//             )
//             .unwrap()
//         );

//         println!("m={:?}", m);
//     }
// }
