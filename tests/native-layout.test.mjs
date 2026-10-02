import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
const compiled=await build({entryPoints:['entry/src/main/ets/services/Runtime.ets'],bundle:true,write:false,platform:'node',format:'cjs',loader:{'.ets':'ts'},plugins:[{name:'sdk-window-fixture',setup(plugin){plugin.onResolve({filter:/^@kit\./},args=>({path:args.path,namespace:'kit'}));plugin.onLoad({filter:/.*/,namespace:'kit'},args=>({contents:`module.exports=globalThis.sdk[${JSON.stringify(args.path)}]`}));}}]});
function fixture(){
  const warnings=[],scripts=[],properties=[];let ready=true;
  const sdk={'@kit.ArkUI':{window:{AvoidAreaType:{TYPE_NAVIGATION_INDICATOR:3}}},'@kit.PerformanceAnalysisKit':{hilog:{warn:(...args)=>warnings.push(args)}},'@kit.ArkWeb':{}};
  const module={exports:{}};new vm.Script(compiled.outputFiles[0].text).runInContext(vm.createContext({sdk,module,exports:module.exports}));const Runtime=module.exports.Runtime;
  Runtime.mainWindow={getUIContext:()=>({px2vp:value=>value/2.5}),getWindowAvoidArea:()=>{if(!ready)throw new Error('window not ready');return {bottomRect:{height:55}};},setWindowBackgroundColor:color=>properties.push({background:color}),setWindowSystemBarProperties:async value=>properties.push(value)};
  Runtime.controller={runJavaScript:async script=>scripts.push(script)};
  return {Runtime,warnings,scripts,properties,setReady:value=>ready=value};
}
test('原生底部避让按窗口密度转换，顶部由 ArkUI 避让，窗口暂不可用时保留上次结果',()=>{
  const f=fixture();f.Runtime.updateInsets();assert.deepEqual(JSON.parse(f.Runtime.readEnvironment()),{platform:'harmonyos',dark:false,top:0,bottom:22,left:0,right:0});assert.ok(f.scripts[0].includes('"bottom":22'));
  f.setReady(false);f.Runtime.updateInsets();assert.equal(JSON.parse(f.Runtime.readEnvironment()).bottom,22);assert.equal(f.warnings.length,1);
});
test('系统主题通知与窗口配色分离，手动外观不会改变系统深浅状态',async()=>{
  const f=fixture();f.Runtime.updateSystemTheme(true);await f.Runtime.applyAppearance(false);
  assert.equal(JSON.parse(f.Runtime.readEnvironment()).dark,true);assert.ok(f.scripts[0].includes('"dark":true'));assert.equal(f.properties[0].background,'#eef3ef');assert.equal(f.properties[1].navigationBarColor,'#00000000');assert.equal(f.properties[1].statusBarContentColor,'#28372f');
});
