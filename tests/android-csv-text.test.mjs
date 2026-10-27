import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const java = name => process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', name) : name;
const compiler = spawnSync(java('javac'), ['-version'], { encoding: 'utf8', windowsHide: true });
test('Android text decoding preserves CSV/TSV BOM and CRLF without changing other formats', { skip: compiler.error ? 'JDK is unavailable' : false }, () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-csv-java-'));
  try {
    const probe = path.join(folder, 'CsvBomProbe.java');
    fs.writeFileSync(probe, String.raw`package me.wenzhou.write;
import java.nio.charset.StandardCharsets;
public class CsvBomProbe {
    private static void equal(String expected, String actual) {
        if (!expected.equals(actual)) throw new AssertionError("Text round trip failed");
    }
    public static void main(String[] args) throws Exception {
        String text = "\uFEFF姓名,备注\r\n甲,原文\r\n";
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        equal(text, FileText.decode(bytes, "人物.CSV"));
        equal(text, FileText.decode(bytes, "数据.TSV"));
        equal(text.substring(1), FileText.decode(bytes, "正文.txt"));
        equal(text.substring(1), FileText.decode(bytes));
        equal(text, FileText.decode(text.getBytes(StandardCharsets.UTF_16LE), "人物.csv"));
        equal(text.substring(1), FileText.decode(text.substring(1).getBytes(StandardCharsets.UTF_8), "人物.csv"));
    }
}`);
    const compiled = spawnSync(java('javac'), ['-encoding', 'UTF-8', '-d', folder, 'android/app/src/main/java/me/wenzhou/write/FileText.java', probe], { encoding: 'utf8', windowsHide: true });
    assert.equal(compiled.status, 0, compiled.stderr || compiled.error?.message);
    const result = spawnSync(java('java'), ['-cp', folder, 'me.wenzhou.write.CsvBomProbe'], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  } finally {
    assert.equal(path.dirname(folder), os.tmpdir());
    assert.ok(path.basename(folder).startsWith('vela-csv-java-'));
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
