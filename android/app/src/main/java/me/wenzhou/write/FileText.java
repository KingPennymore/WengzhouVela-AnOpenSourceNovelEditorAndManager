package me.wenzhou.write;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;

final class FileText {
    static final int MAX_BYTES = 8 * 1024 * 1024;

    static String decode(byte[] bytes) throws IOException {
        String encoding = "UTF-8";
        if (bytes.length >= 2 && (bytes[0] & 255) == 255 && (bytes[1] & 255) == 254) encoding = "UTF-16LE";
        else if (bytes.length >= 2 && (bytes[0] & 255) == 254 && (bytes[1] & 255) == 255) encoding = "UTF-16BE";
        String text;
        try { text = decode(bytes, encoding); }
        catch (CharacterCodingException failure) {
            if (!encoding.equals("UTF-8")) throw new IOException("无法读取此文本编码。");
            try { text = decode(bytes, "GB18030"); }
            catch (CharacterCodingException invalid) { throw new IOException("不支持此文本编码。"); }
        }
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch <= 31 && ch != '\t' && ch != '\n' && ch != '\r') throw new IOException("此文件包含二进制内容，不能作为文本打开。");
        }
        return text.startsWith("\uFEFF") ? text.substring(1) : text;
    }

    private static String decode(byte[] bytes, String encoding) throws CharacterCodingException {
        return Charset.forName(encoding).newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(bytes)).toString();
    }
}
