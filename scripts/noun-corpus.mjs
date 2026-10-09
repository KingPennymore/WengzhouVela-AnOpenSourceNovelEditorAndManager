import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

// Independent, deterministic fixtures. Neither extractor nor worker imports this file.
export function makeCorpus(seed=20261009,length=2_000_000,unit='characters'){
  let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const pick=list=>list[Math.floor(random()*list.length)],entities=[],known=new Set();
  const add=(name,kind,group)=>{if(known.has(name))return;known.add(name);entities.push({name,kind,group,occurrences:[]});};
  const surnames=[...'沈陆顾林江叶苏谢许程周温贺徐秦唐陈柳裴宁萧孟白钟宋夏季邵莫尹方闻任黎易何'];
  const compounds=['欧阳','司马','上官','诸葛','夏侯','东方','皇甫','尉迟','公孙','慕容','长孙','南宫'];
  const first=[...'知若怀清景映望照言思秋云夜星月昭锦令青淮雪棠听砚亦维明归向不无有'];
  const last=[...'微遥宁川岚舟衡棠霜尘珩澜灯野安弦墨言夏川辞羽笙秋雪松溪南北珂禾眠'];
  for(const name of ['李不言','何有光','林向晚','欧阳若水','司马长安','诸葛知秋','周小雨','谢听雪','沈知微','陆照川','星澜','阿岚','阿木','小满','白露','燕归来','云无心','柳如是','顾长风','艾莉娅·维斯','阿尔温·索恩','伊莎贝尔','阿斯特里昂','北冥有鱼'])add(name,'person','curated');
  while(entities.length<480){const i=entities.length;add(i%12===0?pick(['阿','小'])+pick(last):i%11===0?pick(['伊尔','塞拉','维尔','诺兰','洛恩','阿莲','艾尔温','伊莎','罗兰','卡洛','贝伦','艾莉娅'])+'·'+pick(['米斯','维恩','格林','艾尔','索伦','图兰']):pick(i%4===0?compounds:surnames)+pick(first)+(i%7===0?'':pick(last)),'person',i%4===0?'compound':'generated');}
  const roots=['霁月','沉星','雾隐','白榆','赤霄','流萤','听潮','栖鹤','青岚','玄枫','镜川','逐鹿','浮光','归雁','眠龙','苍梧','望舒','疏影','烛阴','雪霁','千帆','孤鸿','照夜','寒汀','金鳞','银浦','落霞','云渚','松隐','鹤鸣','空桑','丹砂'];
  const locations=['城','镇','村','港','岛','谷','山','河','湖','岭','关','渡','洲','郡','州','县','路','街','巷','桥','湾','堡','寺','山脉','群岛','平原','盆地','峡谷','码头','驿站'];
  for(const name of ['阿瓦隆','伊瑟拉','乌托邦','蓬莱','昆仑','不夜城','无忧谷','白鹿原','长安','洛阳','都江堰','张家界'])add(name,'place','curated');
  while(entities.filter(e=>e.kind==='place').length<320)add(pick(roots)+pick(locations),'place','generated');
  while(entities.filter(e=>e.kind==='organization').length<100)add(pick(roots)+pick(['商会','书院','研究所','骑士团','议会','学宫','司','宗','门','盟','社','寺']),'organization','generated');
  while(entities.filter(e=>e.kind==='artifact').length<100)add(pick(roots)+pick(['剑','铃','灯','印','卷','石','录','图','仪','镜','钥','珠']),'artifact','generated');
  // 20% appear exactly once, distributed across the full book instead of only its beginning.
  for(let i=0;i<entities.length;i++)entities[i].rare=i%5===0;
  const groups=Object.fromEntries(['person','place','organization','artifact'].map(k=>[k,entities.filter(e=>e.kind===k&&!e.rare)]));
  const common=[
    '雨沿着屋檐滴落。桌上的茶已经凉了，炉子里只剩下一点暗红的火。众人收好行李，把窗户重新关紧。',
    '这件事情没有看起来那么简单。他们已经走了很久，却还是没有发现新的线索。有人提议先回去休息，等明天再作打算。',
    '街上的店铺陆续开门，卖面包的人推着小车经过。她低头检查纸上的数字，发现日期和昨天的记录完全相同。',
    '风吹动了院子里的树叶，门外传来一阵脚步声。年轻人把书放回桌上，没有立刻回答，只是抬头望了望天空。',
    '船舱里堆着木箱和绳索，灯光照不到的地方一片漆黑。两名守卫轮流巡逻，偶尔低声交谈几句，又各自走开。',
    '晨光照进窗内，纸页上的墨迹早已干透。母亲叫孩子们吃饭，父亲还在修理门锁，邻居带来了一篮新鲜蔬菜。',
    '他们讨论了好几种办法，最终决定留下最简单的一种。旧地图需要重新绘制，损坏的零件也必须在出发之前换掉。',
    '湖面上起了薄雾，远处的山影渐渐模糊。几只鸟掠过水面，船夫撑着长篙，让小船慢慢靠近岸边。',
    '他在信里写下自己的疑问，又把最后一段划去。那些普通的日子原本没有什么不同，此刻回想起来，却处处藏着未曾留意的细节。',
    '夜色越来越深，屋外的声音终于安静下来。没有人愿意先睡，大家围坐在火边，把一路上遇到的事情重新说了一遍。'
  ];
  // Two template families exercise different contexts; both are development fixtures.
  const family=seed%2;
  const templates=family?{
    person:['{{x}}把旧信收进衣袋，随后踏上湿滑的石阶。','她在人群里认出了{{x}}，连忙让车夫停下。','值班簿上签着{{x}}的名字，墨迹还没有干。','“{{x}}，请等一等！”门口的人追了出来。','这封信是{{x}}寄来的，封口却被别人拆开过。','{{x}}没有说话，只将空杯倒扣在桌面上。','{{x}}与同伴核对账目，约好明早再见。','听到{{x}}这个名字时，她忽然停住了脚步。'],
    place:['马车抵达{{x}}时，城门上的灯刚刚点亮。','离开{{x}}以后，他们沿着旧驿道继续前行。','据说{{x}}附近曾有一条地下水道。','在{{x}}的那场雨，成了他日后最清晰的记忆。','他在地图上圈出{{x}}，又画了一条向北的线。','当地人把这片地方称作{{x}}。','通往{{x}}的路已经封闭，商队只好暂住。','{{x}}位于两条商路的交汇处，每到秋天就挤满来客。'],
    organization:['{{x}}派来了两名使者，带着新盖好的印章。','她加入{{x}}之后，便很少再回故乡。','这份卷宗出自{{x}}，纸张比普通公文厚一些。','{{x}}的来信被压在一摞报纸底下。'],
    artifact:['他取出{{x}}，小心放在铺着绒布的木台上。','关于{{x}}的记载只有三行，其余书页都已烧毁。','这件器物被称为{{x}}。','匣子里装着{{x}}，旁边还留着一张没有署名的纸条。']
  }:{
    person:['{{x}}提着风灯穿过回廊，鞋底没有发出声音。','负责押送的人正是{{x}}，大家对此并不意外。','“这是{{x}}留下的。”她轻轻合上了匣盖。','告别{{x}}后，旅人独自走向河岸。','{{x}}忽然俯身拾起那枚铜扣，神情变得凝重。','轮到{{x}}时，屋子里已经没有多少人了。','名单的末尾是{{x}}，字旁画着一个小小的圆圈。','她把位置让给{{x}}，自己站到门边等待。'],
    place:['向导说，下一站便是{{x}}。','他们绕过{{x}}，在天黑以前寻到了一间客栈。','粮车从{{x}}出发，沿途需要更换三次马匹。','{{x}}每年都有一次集市，四方的商人会带来不同口音。','石碑背面刻着{{x}}几个字，下面的年代已经难以辨认。','自{{x}}归来后，船长把全部航海日志锁进了柜子。','商队计划经过{{x}}，再转向更远的边境。','早在抵近{{x}}之前，众人就闻到了潮湿的泥土气息。'],
    organization:['来自{{x}}的文书没有说明缘由，只写着集合的日期。','大家在{{x}}门前等了半天，终于见到一位年长的先生。','他把证物交给{{x}}保管，自己继续追查那封信。','所有费用都由{{x}}承担，账目会在月底公布。'],
    artifact:['她随身带着{{x}}，从不肯借给旁人观看。','失踪的{{x}}竟然出现在这座仓库里。','他们谈及{{x}}时，总要先把门窗关紧。','工匠替{{x}}做了一个新的底座，旧底座仍摆在墙角。']
  };
  let text='',paragraph=0;const chunks=[],rare=entities.filter(e=>e.rare);let size=0,hanSize=0;
  const progress=()=>unit==='han'?hanSize:size;
  const append=(template,entity)=>{const at=template.indexOf('{{x}}'),value=at<0?template:template.replace('{{x}}',entity.name);if(entity)entity.occurrences.push(size+at);chunks.push(value+'\n');size+=value.length+1;hanSize+=(value.match(/\p{Script=Han}/gu)||[]).length;};
  // Introduce every non-rare entity, then let random encounters recur throughout the plot.
  for(const entity of entities.filter(e=>!e.rare))append(pick(templates[entity.kind]),entity);
  let rareIndex=0;
  while(progress()<length){
    if(paragraph%30===0)append(`第${paragraph/30+1}章 雨后的来信\n`);
    if(rareIndex<rare.length&&progress()>=length*(rareIndex+1)/(rare.length+1)){const entity=rare[rareIndex++];append(pick(templates[entity.kind]),entity);}
    const kind=pick(['person','person','place','place','organization','artifact']);append(pick(templates[kind]),pick(groups[kind]));
    append(pick(common));paragraph++;
  }
  text=chunks.join('');
  if(unit==='han'){let n=0;for(const match of text.matchAll(/\p{Script=Han}/gu))if(++n===length){text=text.slice(0,match.index+match[0].length);break;}}
  else text=text.slice(0,length);
  for(const entity of entities)entity.occurrences=entity.occurrences.filter(p=>p>=0&&p+entity.name.length<=text.length);
  return {text,gold:{seed,unit,length:text.length,hanLength:(text.match(/\p{Script=Han}/gu)||[]).length,sha256:createHash('sha256').update(text).digest('hex'),description:'合成中文冒险长文，实体占位符在生成时标注；20% 仅出现一次。候选测试不得读入此清单。',entities:entities.filter(e=>e.occurrences.length)}};
}
export async function writeCorpus(directory='test-results/noun-benchmark',seed=20261009,unit='characters'){
  await mkdir(directory,{recursive:true});const result=makeCorpus(seed,2_000_000,unit),name=seed+(unit==='han'?'-han':'');
  await writeFile(`${directory}/novel-${name}.txt`,result.text);await writeFile(`${directory}/gold-${name}.json`,JSON.stringify(result.gold,null,2));
  await writeFile(`${directory}/entities-${name}.csv`,'\uFEFF名称,类别,出现次数,首次位置\n'+result.gold.entities.map(e=>`${e.name},${e.kind},${e.occurrences.length},${e.occurrences[0]}`).join('\n'));
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const {gold}=await writeCorpus(process.argv[2],Number(process.argv[3])||20261009,process.argv[4]);console.log(JSON.stringify({seed:gold.seed,length:gold.length,hanLength:gold.hanLength,entities:gold.entities.length,sha256:gold.sha256}));}
