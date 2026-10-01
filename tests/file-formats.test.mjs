import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeFileText} from '../web/file-text.mjs';
import {csvDelimiter,parseCsv,writeCsv} from '../web/csv.mjs';
import {fileName,fileKind,documentKind} from '../web/model.mjs';
test('CSV、HTML、Markdown 的大小写扩展名及显式类型不会变成其他文件类型',()=>{
  for(const [name,kind] of [['数据.CSV','CSV'],['网页.HTML','HTML'],['网页.HTM','HTML'],['正文.MARKDOWN','MD'],['正文.mdown','MD'],['正文.mkd','MD'],['data.json','TXT']]){assert.equal(fileName(name),name);assert.equal(fileKind(name),kind);}
  assert.equal(documentKind({name:'网页.txt',kind:'HTML'}),'HTML');
});
test('UTF-8、UTF-16 和 GB18030 中文文本可打开，二进制被拒绝',()=>{
  const text='中文,HTML';assert.equal(decodeFileText(new TextEncoder().encode(text)),text);
  assert.equal(decodeFileText(new Uint8Array(Buffer.concat([Buffer.from([255,254]),Buffer.from(text,'utf16le')]))),text);
  assert.equal(decodeFileText(new Uint8Array([0xD6,0xD0,0xCE,0xC4])),'中文');assert.throws(()=>decodeFileText(new Uint8Array([0,255,0,1])),/二进制|encoded/);
});
test('Excel sep 指令、分号和 Tab 分隔可识别，编辑保留分隔符与多行单元格',()=>{
  for(const delimiter of [',',';','\t']){
    const rows=[['姓名','备注'],['中文','换行\n含分隔'+delimiter+'符号']];const text='sep='+delimiter+'\r\n'+writeCsv(rows,delimiter);
    assert.equal(csvDelimiter(text),delimiter);assert.deepEqual(parseCsv(text),rows);
  }
  assert.deepEqual(parseCsv('姓名;金额\n甲;1,25'),[['姓名','金额'],['甲','1,25']]);
});
