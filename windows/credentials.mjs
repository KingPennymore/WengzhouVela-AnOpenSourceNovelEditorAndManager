import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {atomic} from './storage.mjs';

export function createCredentials(base,safeStorage){
  const fileFor=provider=>path.join(base,provider.startsWith('gitea:')?'gitea-'+createHash('sha256').update(provider).digest('hex')+'-token.dat':provider==='ai'?'ai-token.dat':provider==='gitee'?'gitee-token.dat':'github-token.dat');return {
    read:(provider='github')=>{const file=fileFor(provider);if(!fs.existsSync(file))return '';if(!safeStorage.isEncryptionAvailable())throw new Error('Windows 安全凭据存储不可用。');return safeStorage.decryptString(fs.readFileSync(file));},
    write:(token,provider='github')=>{const file=fileFor(provider);if(!safeStorage.isEncryptionAvailable())throw new Error('Windows 安全凭据存储不可用。');atomic(file,safeStorage.encryptString(token));},
    clear:(provider='github')=>{const file=fileFor(provider);if(fs.existsSync(file))fs.unlinkSync(file);}
  };
}
