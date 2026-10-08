import {excludedWords} from '../vendor/jieba/filter.mjs';
const dictionaryExcluded=new Set(excludedWords.split(' '));
// Deliberately conservative suggestions, not a POS tagger. No text leaves the device.
const common=new Set(('自己 我们 你们 他们 她们 它们 什么 怎么 为什么 这个 那个 这些 那些 一个 一种 一些 一切 一样 一起 一直 已经 还是 只是 就是 不是 没有 不能 不会 可以 可能 应该 必须 需要 时候 时间 今天 昨天 明天 现在 刚才 然后 但是 因为 所以 如果 虽然 于是 终于 其实 突然 依然 仍然 当然 似乎 仿佛 觉得 知道 看见 看到 听见 听到 发现 想到 想起 认为 明白 开始 继续 结束 走来 走去 走进 走出 走到 回来 回去 回头 转身 抬头 低头 点头 摇头 微笑 说道 说话 问道 回答 告诉 声音 目光 眼睛 脸上 手中 心里 身上 面前 身后 旁边 里面 外面 上面 下面 前面 后面 东西 事情 问题 地方 世界 人们 大家 男人 女人 孩子 朋友 父亲 母亲 身体 脑袋 双手 手指 头发 房间 门口 桌子 椅子 窗外 天空 阳光 黑暗 白色 黑色 红色 城市 街道 道路 海面 港口 灯塔 信号 记录 检查 日志 钥匙 航程 航道 文稿 正文 章节 内容 文件 保存 编辑 阅读 第一 第二 第三 最后 只有 还有 所有 任何 每个 别人 对方 这样 那样 这么 那么 这里 那里 过来 过去 出来 进去 起身 站在 坐在 停在 推开 望向 看向 拿起 放下 离开 来到 进入 穿过 经过 远处 一声 一眼 一下 两个 三个 四个 十分 非常 特别 缓缓 轻轻 慢慢 默默 紧紧 不知 不禁 似的 一般 仿佛 立刻 马上 再次 重新 直接 是否 即使 不过 而且 并且 关于 通过 对于 为了 由于 随着 按照').split(' '));
const functional=/[的了着过在把被将也都很就又和与及或而但是有让给向从到得地不没这那它他她我你吗呢啊吧呀]/;
const surname='赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗方俞任袁柳鲍史唐费薛雷贺倪汤滕殷罗毕郝安常傅卞齐康伍余元卜顾孟平黄穆萧尹姚邵汪祁毛禹狄米贝明臧计伏成戴宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路江童颜郭梅盛林钟徐邱骆高夏蔡田樊胡凌霍虞万柯管卢莫房裘缪干解应宗丁宣邓郁单杭洪包左石崔吉龚程邢裴陆荣翁荀羊甄封储靳汲邴糜井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾甘厉戎祖武符刘景詹束龙叶司韶黎薄印宿白怀蒲台鄂索咸籍赖卓蔺屠蒙池乔阴胥能苍双闻莘党翟谭贡劳姬申扶堵冉宰郦雍璩桑桂濮牛寿通边扈燕冀郏浦尚农温庄晏柴瞿阎连习艾鱼容向古易慎戈廖庾终暨居衡步耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚简饶曾关蒯相查后荆红游竺权逯盖益桓公';
const person=new RegExp('(?:^|[。！？；，：\\n“”「」]|(?:望向|看向|叫作|名叫|叫做|跟随|遇见|询问))([ '+surname+'][\\u4e00-\\u9fff]{1,2}?)(?=说|问|答|喊|道|笑|站|坐|走|推|望|看|停|抬|低|点|摇|拿|把|将|的|，|。|：)','g');
const actionName=/(?:^|[。！？；，：\n“”「」]|(?:望向|看向|名叫|叫作))([\u4e00-\u9fff]{2,4}?)(?=值守|说道|问道|回答|推开|走进|抬头|点头|停在|转身)/g;
const named=/(?<=望向|看向|名叫|叫作|叫做)([\u4e00-\u9fff]{2,4}?)(?=值守|说道|问道|回答|的|，|。|！|？|站|走|停)/g;
const singleStop=/[的了着过在把被将也都很就又和与及或而但是有让给向从到得地不没这那它他她我你吗呢啊吧呀说问答喊笑站坐走推望看停抬低点摇拿值守]/;
let segmenter;
try{segmenter=new Intl.Segmenter('zh',{granularity:'word'});}catch{}
export function extractNouns(text,coreFrom=0,coreTo=text.length){
  const result=new Map(),seen=new Set();
  const add=(word,index,strong=false)=>{if(index<coreFrom||index>=coreTo||word.length<2||word.length>8||common.has(word)||dictionaryExcluded.has(word)||functional.test(word)||!/^\p{Script=Han}+$/u.test(word))return;const prev=result.get(word);if(!prev&&result.size>=256)return;const key=index+':'+word;result.set(word,{count:(prev?.count||0)+(seen.has(key)?0:1),strong:strong||prev?.strong||false});seen.add(key);};
  for(const expression of [person,actionName,named]){expression.lastIndex=0;for(const m of text.matchAll(expression))add(m[1].trim(),m.index+m[0].length-m[1].length,true);}
  if(segmenter){const parts=[...segmenter.segment(text)];for(let i=0;i<parts.length;i++){const p=parts[i];if(!p.isWordLike||!/^\p{Script=Han}+$/u.test(p.segment))continue;
    if(p.segment.length>=2)add(p.segment,p.index,/(?:城|镇|村|港|岛|谷|山|河|湖|宗|派|阁|殿|宫|剑|舰|号)$/.test(p.segment));
    // ICU splits invented names into individual characters. Join only short runs.
    if(p.segment.length===1){if(singleStop.test(p.segment))continue;let word=p.segment,j=i+1;while(j<parts.length&&parts[j].isWordLike&&parts[j].segment.length===1&&/^\p{Script=Han}$/u.test(parts[j].segment)&&!singleStop.test(parts[j].segment)){word+=parts[j++].segment;}if(word.length<=6)add(word,p.index,/(?:城|镇|村|港|岛|谷|山|河|湖|宗|派|阁|殿|宫|剑|舰|号)$/.test(word));i=j-1;}
  }}
  return [...result];
}
export class NounIndex {
  constructor(){this.blocks=new Map();this.terms=new Map();}
  remove(id){for(const [word,value] of this.blocks.get(id)||[]){const total=this.terms.get(word);if(!total)continue;total.count-=value.count;total.strong-=Number(value.strong);if(total.count<=0)this.terms.delete(word);}this.blocks.delete(id);}
  put(id,text,from=0,to=text.length){this.remove(id);const entries=extractNouns(text,from,to),kept=[];for(const [word,value] of entries){const total=this.terms.get(word);if(!total&&this.terms.size>=30000)continue;this.terms.set(word,{count:(total?.count||0)+value.count,strong:(total?.strong||0)+Number(value.strong)});kept.push([word,value]);}this.blocks.set(id,kept);}
  candidates(){return [...this.terms].filter(([,v])=>v.strong>0||v.count>=2).sort((a,b)=>Number(b[1].strong>0)-Number(a[1].strong>0)||b[1].count-a[1].count||a[0].localeCompare(b[0])).slice(0,4096).map(([label,v])=>({label,count:v.count}));}
}
