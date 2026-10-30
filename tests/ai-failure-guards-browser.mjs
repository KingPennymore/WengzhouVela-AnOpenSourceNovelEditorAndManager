import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { launchBrowser } from './browser-launch.mjs';
const browser = await launchBrowser();
const stubPlugin = (path, source) => ({
  name: 'ai-port',
  setup(b) {
    b.onResolve({ filter: path }, () => ({ path: 'mock', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: source, loader: 'js' }));
  },
});
try {
  const page = await browser.newPage();
  await page.setContent('<div id="editor"></div>');
  const panel = await build({
    stdin: {
      contents: `import {createAiAssistant} from './web/ai-panel.mjs';window.calls=0;window.assistant=createAiAssistant({workspace:{settings:{ai:{enabled:true}}},pageName:'write',home:false,isPreview:false,current:()=>({id:'b'}),documentKind:()=> 'TXT',locked:()=>false});assistant.update();`,
      resolveDir: process.cwd(),
    },
    plugins: [
      stubPlugin(
        /ai-client\.mjs$/,
        `export const aiComplete=async()=>{},aiModelFor=()=>'model';export const aiSettings=()=>({suggestions:{},models:{}}),aiReady=()=>false,subscribeAiActivity=()=>{};export async function aiStatus(){window.calls++;throw Error('credential failed');}`,
      ),
    ],
    bundle: true,
    write: false,
    format: 'iife',
  });
  await page.addScriptTag({ content: panel.outputFiles[0].text });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => calls), 1);
  await page.evaluate(() => assistant.update());
  assert.equal(await page.evaluate(() => calls), 1);
  await page.evaluate(() => assistant.refreshStatus());
  assert.equal(await page.evaluate(() => calls), 2);
  const client = await build({
    stdin: {
      contents: `import {aiComplete} from './web/ai-client.mjs';window.ops=[];window.run=()=>aiComplete({documents:[],settings:{ai:{enabled:true,consented:true,format:'openai',endpoint:'https://example.com/v1',models:{extract:'model'}}}},{purpose:'extract',system:'',messages:[{role:'user',content:'text'}]});`,
      resolveDir: process.cwd(),
    },
    plugins: [
      stubPlugin(
        /platform\.mjs$/,
        `export const native=true;export async function transport(op,data){window.ops.push(data.action);if(data.action==='status')return {saved:true,format:'openai',endpoint:'https://example.com/v1'};if(data.action==='request')throw Error('deadline');return true;}`,
      ),
    ],
    bundle: true,
    write: false,
    format: 'iife',
  });
  await page.addScriptTag({ content: client.outputFiles[0].text });
  assert.equal(
    await page.evaluate(() =>
      run().then(
        () => '',
        (e) => e.message,
      ),
    ),
    'deadline',
  );
  assert.deepEqual(await page.evaluate(() => ops), ['status', 'request', 'cancel']);
  console.log('PASS credential failure has bounded retries; rejected native request is cancelled');
  await page.close();
} finally {
  await browser.close();
}
