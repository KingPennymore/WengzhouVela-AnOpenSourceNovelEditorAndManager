import { asset } from '@kit.AssetStoreKit';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { util } from '@kit.ArkTS';
import { operationError } from './NativeErrors';

interface StoredAi { format: string; endpoint: string; key: string; }

// SECRET is limited to 1024 bytes. Only already encrypted bytes go into the asset's labels.
export class AiCredentialStore {
  private alias: Uint8Array;
  constructor(alias: Uint8Array) { this.alias = alias; }
  private labels(): asset.Tag[] {
    return [asset.Tag.DATA_LABEL_NORMAL_1, asset.Tag.DATA_LABEL_NORMAL_2, asset.Tag.DATA_LABEL_NORMAL_3, asset.Tag.DATA_LABEL_NORMAL_4,
      asset.Tag.DATA_LABEL_NORMAL_LOCAL_1, asset.Tag.DATA_LABEL_NORMAL_LOCAL_2, asset.Tag.DATA_LABEL_NORMAL_LOCAL_3, asset.Tag.DATA_LABEL_NORMAL_LOCAL_4];
  }
  private params(iv: Uint8Array, tag: Uint8Array): cryptoFramework.GcmParamsSpec {
    return { algName: 'GcmParamsSpec', iv: { data: iv }, authTag: { data: tag }, aad: { data: new util.TextEncoder().encodeInto('wenzhou.ai.v1') } };
  }
  async read(): Promise<string> {
    const query: asset.AssetMap = new Map(); query.set(asset.Tag.ALIAS, this.alias); query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
    try {
      const entries = await asset.query(query); if (!entries.length) return '';
      const entry = entries[0], secret = entry.get(asset.Tag.SECRET) as Uint8Array;
      if (secret.length !== 65 || secret[0] !== 1) throw new Error('invalid');
      const length = new DataView(secret.buffer, secret.byteOffset, secret.byteLength).getUint32(61, true);
      if (!length || length > 12 * 1024) throw new Error('invalid');
      const bytes = new Uint8Array(length), labels = this.labels();
      for (let offset = 0, index = 0; offset < length; offset += 2048, index++) {
        const part = entry.get(labels[index]) as Uint8Array;
        if (!part || part.length !== Math.min(2048, length - offset)) throw new Error('invalid');
        bytes.set(part, offset);
      }
      const key = await cryptoFramework.createSymKeyGenerator('AES256').convertKey({ data: secret.slice(1, 33) });
      const cipher = cryptoFramework.createCipher('AES256|GCM|PKCS7');
      await cipher.init(cryptoFramework.CryptoMode.DECRYPT_MODE, key, this.params(secret.slice(33, 45), secret.slice(45, 61)));
      const plain = await cipher.update({ data: bytes }); await cipher.doFinal(null);
      if (plain.data.length % 2) throw new Error('invalid');
      let text = ''; for (let i = 0; i < plain.data.length; i += 2) text += String.fromCharCode(plain.data[i] | plain.data[i + 1] << 8);
      const fields = text.split('\n'); if (fields.length !== 3) throw new Error('invalid');
      const value: StoredAi = { format: fields[0], endpoint: fields[1], key: fields[2] }; return JSON.stringify(value);
    } catch (error) { const failure = operationError(error as Object, 'credentials'); if (failure.code === 24000002) return ''; throw failure; }
  }
  async write(text: string): Promise<void> {
    try {
      const value = JSON.parse(text) as StoredAi;
      // UTF-16 preserves every accepted key and bounds the complete record below 10 KB.
      const packed = value.format + '\n' + value.endpoint + '\n' + value.key, plain = new Uint8Array(packed.length * 2);
      for (let i = 0; i < packed.length; i++) { const code = packed.charCodeAt(i); plain[i * 2] = code & 255; plain[i * 2 + 1] = code >>> 8; }
      const key = await cryptoFramework.createSymKeyGenerator('AES256').generateSymKey();
      const iv = cryptoFramework.createRandom().generateRandomSync(12).data;
      const cipher = cryptoFramework.createCipher('AES256|GCM|PKCS7');
      await cipher.init(cryptoFramework.CryptoMode.ENCRYPT_MODE, key, this.params(iv, new Uint8Array(16)));
      const encrypted = await cipher.update({ data: plain }), tag = await cipher.doFinal(null);
      if (!tag || tag.data.length !== 16 || encrypted.data.length > 12 * 1024) throw new Error('invalid');
      const secret = new Uint8Array(65); secret[0] = 1; secret.set(key.getEncoded().data, 1); secret.set(iv, 33); secret.set(tag.data, 45);
      new DataView(secret.buffer).setUint32(61, encrypted.data.length, true);
      const attributes: asset.AssetMap = new Map();
      attributes.set(asset.Tag.ALIAS, this.alias); attributes.set(asset.Tag.SECRET, secret);
      attributes.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_UNLOCKED);
      attributes.set(asset.Tag.CONFLICT_RESOLUTION, asset.ConflictResolution.OVERWRITE);
      const labels = this.labels();
      for (let offset = 0, index = 0; offset < encrypted.data.length; offset += 2048, index++) attributes.set(labels[index], encrypted.data.slice(offset, offset + 2048));
      await asset.add(attributes);
    } catch (error) { throw operationError(error as Object, 'credentials'); }
  }
  async clear(): Promise<void> {
    const query: asset.AssetMap = new Map(); query.set(asset.Tag.ALIAS, this.alias);
    try { await asset.remove(query); } catch (error) { const failure = operationError(error as Object, 'credentials'); if (failure.code !== 24000002) throw failure; }
  }
}
