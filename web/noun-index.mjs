import {excludedWords} from '../vendor/jieba/filter.mjs';
const dictionaryExcluded=new Set(excludedWords.split(' '));
// Deliberately conservative suggestions, not a POS tagger. No text leaves the device.
const common=new Set(('自己 我们 你们 他们 她们 它们 什么 怎么 为什么 这个 那个 这些 那些 一个 一种 一些 一切 一样 一起 一直 已经 还是 只是 就是 不是 没有 不能 不会 可以 可能 应该 必须 需要 时候 时间 今天 昨天 明天 现在 刚才 然后 但是 因为 所以 如果 虽然 于是 终于 其实 突然 依然 仍然 当然 似乎 仿佛 觉得 知道 看见 看到 听见 听到 发现 想到 想起 认为 明白 开始 继续 结束 走来 走去 走进 走出 走到 回来 回去 回头 转身 抬头 低头 点头 摇头 微笑 说道 说话 问道 回答 告诉 声音 目光 眼睛 脸上 手中 心里 身上 面前 身后 旁边 里面 外面 上面 下面 前面 后面 东西 事情 问题 地方 世界 人们 大家 男人 女人 孩子 朋友 父亲 母亲 身体 脑袋 双手 手指 头发 房间 门口 桌子 椅子 窗外 天空 阳光 黑暗 白色 黑色 红色 城市 街道 道路 海面 港口 灯塔 信号 记录 检查 日志 钥匙 航程 航道 文稿 正文 章节 内容 文件 保存 编辑 阅读 第一 第二 第三 最后 只有 还有 所有 任何 每个 别人 对方 这样 那样 这么 那么 这里 那里 过来 过去 出来 进去 起身 站在 坐在 停在 推开 望向 看向 拿起 放下 离开 来到 进入 穿过 经过 远处 一声 一眼 一下 两个 三个 四个 十分 非常 特别 缓缓 轻轻 慢慢 默默 紧紧 不知 不禁 似的 一般 仿佛 立刻 马上 再次 重新 直接 是否 即使 不过 而且 并且 关于 通过 对于 为了 由于 随着 按照').split(' '));
const surname='赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗方俞任袁柳鲍史唐费薛雷贺倪汤滕殷罗毕郝安常傅卞齐康伍余元卜顾孟平黄穆萧尹姚邵汪祁毛禹狄米贝明臧计伏成戴宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路江童颜郭梅盛林钟徐邱骆高夏蔡田樊胡凌霍虞万柯管卢莫房裘缪干解应宗丁宣邓郁单杭洪包左石崔吉龚程邢裴陆荣翁荀羊甄封储靳汲邴糜井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾甘厉戎祖武符刘景詹束龙叶司韶黎薄印宿白怀蒲台鄂索咸籍赖卓蔺屠蒙池乔阴胥能苍双闻莘党翟谭贡劳姬申扶堵冉宰郦雍璩桑桂濮牛寿通边扈燕冀郏浦尚农温庄晏柴瞿阎连习艾鱼容向古易慎戈廖庾终暨居衡步耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚简饶曾关蒯相查后荆红游竺权逯盖益桓公';
let segmenter;
try{segmenter=new Intl.Segmenter('zh',{granularity:'word'});}catch{}
const compounds='欧阳 司马 上官 诸葛 夏侯 东方 皇甫 尉迟 公孙 慕容 长孙 南宫 司徒 司空 令狐 宇文 轩辕 百里 东郭 南郭 独孤 闻人 澹台 北冥 端木 钟离 太史 赫连 拓跋 呼延 羊舌 微生 淳于 颛孙 太叔 申屠 申公 漆雕 乐正 壤驷 公良 梁丘 左丘 第五 东门 西门 南门'.split(' ');
const han='[\\p{Script=Han}]';
const nameShape=new RegExp(`^(?:${compounds.join('|')})${han}{1,3}$|^[${surname}阿小老]${han}{1,3}$`,'u');
const forbidden=/[的着把被也就和与及或而但让给从得地这那它他她我你吗呢啊吧呀]/u;
const verbs='走入 走出 跟在 跟着 倚在 靠在 打趣 带来 带走 见过 碰见 渡过 早已 尚未 仍未 署名 签名 横亘 毗邻 坐落 挂着 迎来 出现 停留 行经 念着 读到 记载 记下 说道 问道 答道 喊道 回答 低语 叹息 反问 呢喃 嘀咕 值守 推开 走进 抬头 点头 停在 转身 俯身 起身 提着 拿着 看着 望着 站在 坐在 走到 走向 走过 赶到 拔出 拔剑 挥手 拒绝 答应 发现 觉得 认为 知道 记得 听见 看见 听到 看到 伸手 低头 沉默 微笑 大笑 笑道 冷笑 皱眉 摇头 举起 放下 拾起 拍了 递给 闭上 睁开 望向 看向 寄来 留下 消失 离开 回来 归来 等待 提醒 解释 追问 询问 责问 告诉 应道 道 说 问 答 喊 笑 把 将 的 与 和 没有 忽然 突然 已经 终于 正在 仍然 却 便 又 也 都 则 曾 先 才 会 要 能 不肯 不愿'.split(' ').sort((a,b)=>b.length-a.length).join('|');
const leftCues='名叫 叫作 叫做 称作 称为 唤作 自称 人称 昵称 绰号 代号 化名 姓名 名字是 名字叫 认出了 认出 遇见 遇到 叫住 看向 望向 跟随 询问 问起 提起 想起 想到 谈及 告别 轮到 交给 递给 让给 寄给 通知 邀请 拜访 等待 寻找 跟着 负责押送的人正是 正是 来自 前往 通往 抵达 抵近 途经 经过 离开 进入 返回 出自 加入 隶属 属于 绕过 圈出 取出 取下 带着 装着 拿出 举起 拿起 失踪的 位于 坐落于 到了 去了 去往 驶向 飞往 赶往 抵近 生于 住在 来到 路过 搬到 出生于 定居于 号称'.split(' ').sort((a,b)=>b.length-a.length).join('|');
const endings=`${verbs}|附近|之后|以前|以后|之前|时|后|这个名字|几个字|门前|位于|每年|派来|出发|归来|竟然|承担|保管|做了|(?:里|中|上|下|边|旁)(?=$|[^\\p{Script=Han}])`;
const suffixGroups={place:'山脉 群岛 平原 盆地 峡谷 高原 沙漠 半岛 大陆 码头 驿站 车站 港口 城 镇 村 港 岛 谷 山 河 湖 岭 关 渡 洲 郡 州 县 路 街 巷 桥 湾 堡 寺 原 领 坞',organization:'研究所 骑士团 事务所 委员会 商会 书院 议会 学宫 学院 学校 公司 集团 协会 公会 联盟 宗门 司 宗 门 盟 社 寺 阁 殿 宫',artifact:'航道 飞船 剑 铃 灯 印 卷 石 录 图 仪 镜 钥 珠 诀 舰 号'};
const suffixes=Object.entries(suffixGroups).flatMap(([kind,words])=>words.split(' ').map(suffix=>({kind,suffix}))).sort((a,b)=>b.suffix.length-a.suffix.length);
const typed=word=>suffixes.find(v=>word.length>v.suffix.length&&word.endsWith(v.suffix))?.kind;
// Characters typical of transliterated (音译) names. ICU has no entry for invented names and
// splits them into single characters, so maximal runs of these recur as whole words.
const translitChars='瑞盎珊阿埃艾爱安昂奥澳巴拜班邦保贝比彼毕宾波伯博布达戴丹德登迪蒂丁杜多厄恩尔法菲费芬佛弗福伏盖甘冈戈哥格根古圭哈海汉豪赫亨胡怀霍基吉加嘉贾杰卡凯坎柯科克肯库拉莱赖兰朗劳勒雷蕾黎里丽利莉林琳隆卢鲁伦罗洛马玛迈麦曼梅蒙米敏摩莫姆穆纳娜奈内尼妮纽努诺欧帕潘佩皮珀普齐奇琪乔切琴丘萨塞赛桑瑟森沙莎舍什施斯丝苏索塔泰坦汤特滕提图托瓦威韦维温沃乌伍西希锡辛休修雅亚扬耶伊依因英尤约泽扎詹兹仑汶讷仕奎贡';
const translitPlace='城镇村港岛谷山河湖岭洲郡州县街巷桥湾堡寺原',translitPlaceHead=new RegExp(`^[${translitChars}]{2,}[${translitPlace}]`,'u');
const translitRun=new RegExp(`[${translitChars}]{2,7}`,'gu'),translitOnly=new RegExp(`^[${translitChars}]+$`,'u');
// Function characters that do not occur inside invented names outside person context.
const stopChars=/[了着过的地得在是不没一个们这那哪什么我你您他她它己很太更最就都也还又再才把被让给对和与跟向从往到来去上下出进起回说看想找要会能可吗呢吧啊呀每些点前后边面中外间时候]/u;
const edgeTail=/[不点也就都又还便却才只要能说问笑把将被让给对跟和与的了着过在从向往到是死]+$/u,edgeHead=/^[在从向往到去是叫和与跟对把被给让由自]+/u;
const knownCache=new Map();
// A word ICU keeps as one dictionary segment is an everyday word (小溪、铁匠), not an invented name.
function known(word){if(!segmenter||/[·・⋅‧•]/.test(word))return false;let v=knownCache.get(word);if(v===undefined){const parts=[...segmenter.segment(word)];v=parts.length===1&&parts[0].isWordLike;if(knownCache.size>=20000)knownCache.clear();knownCache.set(word,v);}return v;}
const personal=sources=>sources.has('dot')||sources.has('subject')||sources.has('action')||sources.has('titled');
const boundary='(?:^|[\\s。！？；，：、“”「」《》()（）])';
const explicit=new RegExp(`(?:${leftCues}|签着|刻着|写着|署名|落款|叫|是|在|从|自|由)(${han}{2,12}?(?:[·・⋅‧•]${han}{1,10}?)?)(?=$|[\\s。，！？；：、“”「」《》]|${endings})`,'gu');
const subject=new RegExp(`${boundary}((?:${compounds.join('|')}|[${surname}阿小老])${han}{1,3}?)(?=${verbs}|${leftCues}|[，。：！？、]|$)`,'gu');
const actionSubject=new RegExp(`${boundary}(${han}{2,5}?)(?=说道|问道|回答|值守|推开|走进|抬头|点头|转身|俯身|低语|叹息|笑道|拔剑|挥手|提着|拿着|寄来|留下)`,'gu');
const titled=new RegExp(`(${han}{2,5}?)(?:先生|女士|姑娘|公子|小姐|师傅|师父|老师|教授|博士|将军|队长|殿下|陛下)(?=$|[^\\p{Script=Han}]|${verbs})`,'gu');
const dotName=new RegExp(`${han}{1,8}[·・⋅‧•]${han}{1,10}(?:[·・⋅‧•]${han}{1,10})?`,'gu');
const suffixPattern=new RegExp(`(${han}{1,12}?(?:${suffixes.map(s=>s.suffix).join('|')}))(?=$|[^\\p{Script=Han}]|${endings})`,'gu');
const namedContext=new RegExp(`(${han}{2,8})(?=这个名字|的名字|几个字)`,'gu');
const separators=new RegExp(`(?:${leftCues}|${verbs}|而|但|签着|刻着|写着|署名|落款|他们|她们|我们|有人|这片地方|地图上|这里|那里|那座|这座|一座|一片|到了|是|在|从|往|向|到|于|自|由|替)`,'gu');
function placeTail(word){
  const suffix=suffixes.find(x=>word.length>x.suffix.length&&word.endsWith(x.suffix))?.suffix;if(!suffix||word.length-suffix.length<4||nameShape.test(word))return word;
  const stem=word.slice(0,-suffix.length),run=stem.match(new RegExp(`[${translitChars}]{2,}$`,'u'))?.[0];if(run)return run+suffix;
  if(!segmenter)return word;let tail='';const parts=[...segmenter.segment(stem)];
  for(let i=parts.length-1;i>=0;i--){const p=parts[i].segment;if(p.length>1||stopChars.test(p)||!/^\p{Script=Han}$/u.test(p))break;tail=p+tail;}
  return tail?tail+suffix:word;
}
function trimPhrase(value){
  // Known dictionary words and plausible names preserve internal function
  // characters (都江堰、何有光). Otherwise remove the surrounding clause.
  value=value.replace(/^[了过着]/u,'').replace(/^(?:通往|前往|关于)(?=.{2})/u,'');
  if(value.length<=3||nameShape.test(value)||/[·・⋅‧•]/.test(value)||dictionaryExcluded.has(value))return value;
  let start=0;separators.lastIndex=0;
  for(const m of value.matchAll(separators))if(m.index+m[0].length<=value.length-2)start=m.index+m[0].length;
  return value.slice(start).replace(/^[了过着]/u,'');
}
const trailingContext=/(?:忽然|突然|已经|终于|正在|仍然|每年|每天|没有|附近|之前|之后).*$/u;
const clauseWords=/(?:吃饭|修理|重新|立刻|陆续|开门|望了|写下|核对|公布|穿过|收进|站到|新盖|一摞|两条|一间|几个|孩子们)/u;
const startsWithCue=new RegExp(`^(?:${leftCues})`,'u'),endsWithCue=new RegExp(`(?:${leftCues}|签着|刻着|写着|署名|落款)$`,'u'),strongAfter=/^(?:这个名字|的名字|几个字|寄来|说道|问道|答道|回答)/u;
const extraCommon=new Set('年轻人 老人 当地人 同伴 守卫 旅人 船长 向导 车夫 船夫 工匠 孩子们 母亲 父亲 邻居 队长 女孩 男孩 年轻人 小姑娘 年长者 村民 客人 大人 大家 众人 年轻人 海风 旧港 卷宗 回廊 行李 信件 文书 证物 墨迹 铜扣 城门 屋子 灯光 树叶 名单 木台 客栈 账目 公文 石阶 河岸 地图 纸条 墨水 地下水道 下一站 负责 商队 来信 日期 第一章 第二章 最后一段'.split(' '));
const rejectWord=word=>common.has(word)||extraCommon.has(word)||/^[一二三四五六七八九十百千万零两第]+[章节年月日时分]?$/.test(word);

export function extractNouns(text,coreFrom=0,coreTo=text.length){
  const result=new Map(),spans=[],seen=new Set();
  const add=(word,index,kind='',strong=false,source='segment')=>{
    word=word.replace(trailingContext,'');
    {const tail=word.replace(edgeTail,'');if(/[·・⋅‧•]/.test(word)&&tail.length>=3&&!/[·・⋅‧•]$/.test(tail))word=tail;}
    if(!/[·・⋅‧•]/.test(word)){const tail=word.replace(edgeTail,'');if(tail.length>=2)word=tail;const head=word.replace(edgeHead,'');if(head.length>=2&&(!nameShape.test(word)||nameShape.test(head)||translitOnly.test(head))){index+=word.length-head.length;word=head;}}
    if(index<coreFrom||index>=coreTo||word.length<2||word.length>24||rejectWord(word)||!/^[\p{Script=Han}·・⋅‧•]+$/u.test(word))return;
    if(clauseWords.test(word)||/[的着把被这那它他她我你]/u.test(word))return;
    if(startsWithCue.test(word))return;
    // Context can rescue real names containing common characters and dictionary words.
    if(!strong&&(forbidden.test(word)||dictionaryExcluded.has(word)))return;
    if(!strong&&!nameShape.test(word)&&!kind&&source!=='translit')return;
    if(strong&&(!kind||kind==='person')&&!nameShape.test(word)&&!/[·・⋅‧•]/.test(word)&&dictionaryExcluded.has(word))return;
    const suffix=suffixes.find(s=>word.endsWith(s.suffix))?.suffix||'';
    if(strong&&forbidden.test(suffix?word.slice(0,-suffix.length):word)&&!nameShape.test(word)&&!/[·・⋅‧•]/.test(word))return;
    if(strong){
      // A later context rule must not grow a partial match across another name.
      if(spans.some(s=>index<s.to&&index+word.length>s.from&&!(index>=s.from&&index+word.length<=s.to)&&!(index<=s.from&&index+word.length>=s.to)))return;
      if(spans.some(s=>index>=s.from&&index+word.length<=s.to&&word!==s.word))return;
      for(let i=spans.length-1;i>=0;i--){const s=spans[i];if(s.from>=index&&s.to<=index+word.length&&s.word!==word){const old=result.get(s.word);if(old&&--old.count<=0)result.delete(s.word);spans.splice(i,1);}}
    }
    const previous=result.get(word);if(!previous&&result.size>=512)return;
    const key=index+':'+word;if(seen.has(key)){if(previous){previous.sources.add(source);if(strong){previous.strong=true;previous.kind=kind||previous.kind;}}return;}seen.add(key);
    const left=text[index-1]||'^',right=text[index+word.length]||'$';
    const value=previous||{count:0,strong:false,kind:'',sources:new Set(),left:new Map(),right:new Map()};value.count++;value.strong||=strong;value.kind=kind||value.kind;value.sources.add(source);
    for(const [side,ch] of [[value.left,left],[value.right,right]])if(side.has(ch)||side.size<12)side.set(ch,(side.get(ch)||0)+1);result.set(word,value);
    if(strong)spans.push({from:index,to:index+word.length,word});
  };
  for(const m of text.matchAll(dotName)){const raw=m[0];let word=raw;const dot=raw.search(/[·・⋅‧•]/u);const head=raw.slice(0,dot),tail=raw.slice(dot+1);let start=0;separators.lastIndex=0;for(const cue of head.matchAll(separators))start=cue.index+cue[0].length;const end=tail.search(new RegExp(`这个名字|几个字|${endings}`,'u'));word=head.slice(start)+raw[dot]+(end<0?tail:tail.slice(0,end));if(word.startsWith(raw[dot])||word.endsWith(raw[dot]))continue;add(word,m.index+start,'person',true,'dot');}
  for(const expression of [subject,actionSubject,titled])for(const m of text.matchAll(expression)){const word=trimPhrase(m[1]),index=m.index+m[0].indexOf(word);if(expression===subject&&!nameShape.test(word))continue;if(spans.some(s=>index>=s.from&&index+word.length<=s.to))continue;const next=text[index+word.length]||'';add(word,index,'person',true,expression===titled?'titled':next==='的'?'possessive':expression!==subject?'action':!next||/[，。：！？、]/u.test(next)&&!(next==='，'&&/[“「]/u.test(text[index-1]||''))?'subject1':'subject');}
  for(const expression of [explicit,namedContext]){for(const m of text.matchAll(expression)){if(/[·・⋅‧•]/.test(m[1]))continue;const trimmed=trimPhrase(m[1]),word=trimmed.match(translitPlaceHead)?.[0]||trimmed,index=m.index+m[0].lastIndexOf(word);if(word.length<2)continue;const location=/前往|通往|抵达|抵近|途经|经过|离开|返回|圈出|位于|坐落于|称作|往|从|在/.test(m[0].slice(0,-m[1].length));const strongCue=expression===namedContext||endsWithCue.test(text.slice(Math.max(0,index-8),index))||strongAfter.test(text.slice(index+word.length,index+word.length+4));add(word,index,typed(word)||(nameShape.test(word)?'person':location?'place':''),true,strongCue?'cue':'cue1');}}
  for(const m of text.matchAll(suffixPattern)){const word=placeTail(trimPhrase(m[1])),index=m.index+m[1].length-word.length;if(spans.some(s=>index>=s.from&&index+word.length<=s.to))continue;add(word,index,typed(word),true,'suffix');}
  for(const m of text.matchAll(translitRun)){if(spans.some(s=>m.index<s.to&&m.index+m[0].length>s.from&&!(s.from===m.index&&s.to===m.index+m[0].length)))continue;add(m[0],m.index,'',false,'translit');const next=text[m.index+m[0].length];if(next&&translitPlace.includes(next))add(m[0]+next,m.index,'place',false,'suffix');}
  // Local segment combinations discover recurring invented words beyond the context rules.
  // Whole strong spans shield names from fragment suggestions (e.g. 欧阳 / 若水).
  if(segmenter){const parts=[...segmenter.segment(text)];for(let i=0;i<parts.length;i++){
    const p=parts[i];if(!p.isWordLike||!/^\p{Script=Han}+$/u.test(p.segment)||spans.some(s=>p.index>=s.from&&p.index<s.to))continue;
    let word='';for(let j=i;j<Math.min(parts.length,i+4);j++){const q=parts[j];if(!q.isWordLike||!/^\p{Script=Han}+$/u.test(q.segment)||rejectWord(q.segment)||forbidden.test(q.segment)||spans.some(s=>q.index>=s.from&&q.index<s.to))break;word+=q.segment;if(word.length>10)break;if(word.length>=2)add(word,p.index,typed(word),false);}
  }}
  return [...result].map(([word,v])=>[word,{...v,sources:[...v.sources],left:[...v.left],right:[...v.right]}]);
}
const numeral=/[一二三四五六七八九十百千两几数][排个只条张件座间位名把块片层道]/u;
// A candidate containing a frequent dictionary word is a phrase (喘息之机、准备好), not a name.
function commonPart(word){if(!segmenter)return false;return [...segmenter.segment(word)].some(p=>p.segment.length>=2&&p.segment!==word&&(dictionaryExcluded.has(p.segment)||common.has(p.segment)));}
// Global filter over the aggregated evidence of one word.
function accept(word,v){
  const src=v.sources,dotted=/[·・⋅‧•]/.test(word),person=personal(src),strongCue=src.has('cue');
  const suffix=suffixes.find(x=>word.length>x.suffix.length&&word.endsWith(x.suffix))?.suffix||'',stem=suffix?word.slice(0,-suffix.length):word;
  const translit=src.has('translit')&&(translitOnly.test(word)||v.extended),shaped=nameShape.test(word),compound=compounds.some(c=>word.startsWith(c));
  if(word.length<2||word.length>(dotted?20:7)||rejectWord(word))return false;
  if(dotted)return true;
  // Function characters only occur in pure transliterations or in surname-shaped names with person or naming context (李不言).
  if(stopChars.test(stem)&&!translit&&!((person||strongCue)&&shaped))return false;
  if(numeral.test(word))return false;
  if(!translit&&!person&&commonPart(suffix?stem:shaped?word.slice(compound?2:1):word))return false;
  if(shaped&&!compound&&!suffix&&word.length===3&&/[地声边里上下中大小处们时得]$/u.test(word)&&known(word.slice(0,2)))return false;
  // Everyday words need person context; dictionary words also pass when a naming or location cue repeats (前往长安).
  if((dictionaryExcluded.has(word)||known(word)&&!person&&!(translit&&v.count>=3))&&!(strongCue&&v.cueCount>=2))return false;
  const typedOk=suffix&&(src.has('suffix')||strongCue||src.has('cue1')),weakShaped=(src.has('cue1')||src.has('subject1'))&&shaped&&word.length>=3&&word.length<=4;
  const precise=weakShaped||person&&word.length<=4||strongCue&&word.length<=4||typedOk&&stem.length>=2&&word.length<=6||translit&&word.length>=3;
  if(v.count<2&&!precise)return false;
  if(!person&&!typedOk&&!translit&&!strongCue&&!weakShaped)return v.count>=3&&v.left.size>=2&&v.right.size>=2&&shaped;
  return true;
}
function dominant(side,share){let total=0,best='',n=0;for(const [ch,c] of side){total+=c;if(c>n){n=c;best=ch;}}return total>=2&&n/total>=share&&/^\p{Script=Han}$/u.test(best)?best:'';}
function bridged(word,v){if(!v.sources.has('translit')||personal(v.sources)||v.sources.has('cue'))return false;const l=dominant(v.left,.5),r=dominant(v.right,.5);return Boolean(l&&known(l+word[0])||r&&known(word.at(-1)+r));}
// A run whose neighbour on one side is nearly always the same character is part of a longer word (柯戈德 → 柯戈德尾).
function extend(word,v){
  if(!v.sources.has('translit')||word.length>=7)return word;
  const side=map=>{let total=0;for(const c of map.values())total+=c;const best=total>=3&&dominant(map,.75);return best&&!stopChars.test(best)&&!edgeTail.test(best)&&!translitChars.includes(best)?best:'';};
  return side(v.left)+word+side(v.right);
}
export class NounIndex {
  constructor(){this.blocks=new Map();this.terms=new Map();this.cached=null;}
  remove(id){this.cached=null;for(const [word,v] of this.blocks.get(id)||[]){const total=this.terms.get(word);if(!total)continue;total.count-=v.count;total.strong-=Number(v.strong);for(const source of v.sources){const n=total.sources.get(source)-1;if(n>0)total.sources.set(source,n);else total.sources.delete(source);}for(const side of ['left','right'])for(const [ch,c] of v[side]){const n=total[side].get(ch)-c;if(n>0)total[side].set(ch,n);else total[side].delete(ch);}if(total.count<=0)this.terms.delete(word);}this.blocks.delete(id);}
  put(id,text,from=0,to=text.length){this.remove(id);const entries=extractNouns(text,from,to),kept=[];for(const [word,v] of entries){let total=this.terms.get(word);if(!total&&this.terms.size>=30000)continue;if(!total){total={count:0,strong:0,kind:v.kind,sources:new Map(),left:new Map(),right:new Map()};this.terms.set(word,total);}total.count+=v.count;total.strong+=Number(v.strong);total.kind=v.kind||total.kind;for(const source of v.sources)total.sources.set(source,(total.sources.get(source)||0)+1);for(const side of ['left','right'])for(const [ch,c] of v[side])total[side].set(ch,(total[side].get(ch)||0)+c);kept.push([word,v]);}this.blocks.set(id,kept);}
  candidates(){if(this.cached)return this.cached;
    const picked=new Map();
    for(const [word,v] of this.terms){if(bridged(word,v))continue;const label=extend(word,v),sources=new Set(v.sources.keys());if(label!==word)sources.add('translit');const value={...v,sources,cueCount:v.sources.get('cue')||0,extended:label!==word};if(!accept(label,value))continue;const old=picked.get(label);if(!old||value.count>old.count)picked.set(label,{...value,label});}
    const rank=v=>Number(v.strong>0||personal(v.sources));
    // Prefer the stem when a longer form is mostly the stem plus a following word (珀莱人、德里兰王国).
    for(const [word,v] of picked){if(personal(v.sources)||typed(word))continue;for(let k=1;k<word.length;k++){const a=k>=2&&picked.get(word.slice(0,k)),b=k===1&&word.length-k>=2&&picked.get(word.slice(k));if(a&&a.count>=2*v.count||b&&b.count>=2*v.count){picked.delete(word);break;}}}
    // Fragments of an accepted longer name are not separate suggestions (阿德里 / 阿德里蒙).
    for(const [word,v] of [...picked])for(let a=0;a<word.length;a++)for(let b=a+2;b<=word.length;b++){if(a===0&&b===word.length)continue;const sub=word.slice(a,b),s=picked.get(sub);if(s&&!personal(s.sources)&&!(s.strong>0)&&s.count<=v.count)picked.delete(sub);}
    this.cached=[...picked.values()].sort((a,b)=>rank(b)-rank(a)||b.count-a.count||a.label.localeCompare(b.label)).slice(0,4096).map(v=>({label:v.label,count:v.count,kind:v.kind||'noun'}));return this.cached;
  }
}
