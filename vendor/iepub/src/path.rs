//! 解析路径
//! 不需要访问文件系统，支持相对和绝对路径
//!
#[derive(Clone)]
pub struct Path {
    /// 逐级路径
    paths: Vec<String>,
    /// 分隔符
    sep: String,
}

impl Path {
    /// 基于操作系统解析路径
    pub fn system<T: AsRef<str>>(path: T) -> Self {
        #[cfg(target_os = "windows")]
        let sep = "\\";
        #[cfg(not(target_os = "windows"))]
        let sep = "/";
        // let v = path.split(sep);
        // for ele in v {
        //     paths.push(ele.to_string());
        // }

        Self {
            paths: Vec::new(),
            sep: sep.to_string(),
        }
        .join(path)
    }

    pub fn join<T: AsRef<str>>(&self, path: T) -> Self {
        let mut s = self.clone();

        let v = path.as_ref().split(s.sep.as_str());
        for ele in v {
            if ele == ".." {
                s.paths.pop();
            } else if ele == "." {
            } else if ele == "~" {
                // 因为在windows上正确处理 homedir 需要引入三方库，所以暂时就不实现了
                // s.paths.push(self.home.clone());
            } else {
                s.paths.push(ele.to_string());
            }
        }
        s
    }

    /// 当前目录有多少级
    pub fn level_count(&self) -> usize {
        #[cfg(target_os = "windows")]
        let sep = "\\";
        #[cfg(not(target_os = "windows"))]
        let sep = "/";
        self.paths
            .iter()
            .filter(|f| !f.trim().is_empty() && f.as_str() != sep)
            .count()
    }

    pub fn to_str(&self) -> String {
        // if self.is_absolute {
        //     format!("/{}",self.paths.join(&self.sep))
        // }else{
        self.paths.join(&self.sep)
        // }
    }
    pub fn pop(&self) -> Self {
        let mut s = self.clone();
        s.paths.pop();
        s
    }

    /// 从当前路径出发，获取能够指向target的路径
    /// 例如当前路径是 1/2，需要访问 4/5.png 输出应该是 ../../4/5.png
    ///
    /// # Warn
    /// 当前路径应该是一个目录，且不能以 / 结尾
    pub fn releative<T: AsRef<str>>(&self, target: T) -> String {
        // 首先往上走到根目录，然后再往下，如果没有分叉就不添加路径

        let mut target = Self::system(target);
        let mut out = Vec::new();

        out.append(&mut vec!["..".to_string(); self.paths.len()]);
        out.append(&mut target.paths);

        out.join(&self.sep)
    }
}

#[cfg(test)]
mod tests {
    use super::Path;

    #[test]
    fn test() {
        let mut path = Path::system("/ok");
        path = path.join("1");

        assert_eq!("/ok/1", path.to_str());
        assert_eq!(2, path.level_count());

        let mut path = Path::system("/ok");
        assert_eq!(1, path.level_count());

        path = path.join("../1");

        assert_eq!(1, path.level_count());
        assert_eq!("/1", path.to_str());

        let mut path = Path::system("res");
        path = path.join("../1");

        assert_eq!("1", path.to_str());
    }

    #[test]
    fn test_releative_path() {
        assert_eq!("../../4/5.png", Path::system("1/2").releative("4/5.png"));
        assert_eq!("../../4/5.png", Path::system("4/2").releative("4/5.png"));
        assert_eq!(
            "../../4/5/6.png",
            Path::system("4/2").releative("4/5/6.png")
        );
        assert_eq!("../4/5/6.png", Path::system("2").releative("4/5/6.png"));
    }
}
