// A throwaway release signing key for tests. Importing this first makes web/release-signing.mjs trust it in Node
// (the bundles get it through the __VELA_TEST_RELEASE_KEYS__ define of tests/source-app-server.mjs instead).
import {generateKeyPairSync,sign} from 'node:crypto';
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
export const testKey={id:'vela-test-key',spki:publicKey.export({type:'spki',format:'der'}).toString('base64')};
globalThis.__VELA_TEST_RELEASE_KEYS__=[testKey];
/** The .sig text for `data` (string or bytes), as scripts/release-signing.mjs writes it. */
export const signText=(data,{key=testKey.id}={})=>JSON.stringify({format:1,algorithm:'ECDSA-P256-SHA256',key,signature:sign('sha256',Buffer.from(data),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64')})+'\n';
