VelaPlugins.register('sample.sidebar.workbench',{
 activate(vela){
  let content=null;
  const refresh=()=>{
   if(!content)return;
   const context=vela.context.get();content.replaceChildren();
   if(context.kind!=='MAP'||context.mode!=='preview')return;
   const data=vela.planning.snapshot();
   if(!data?.points?.length){content.append(vela.ui.createElement('empty',{title:'没有信息点',text:'请在地图上添加地点。'}));return;}
   for(const point of data.points){const button=document.createElement('button');button.type='button';button.textContent=point.name||'未命名信息点';button.onclick=()=>vela.planning.navigate({id:point.id,collection:'markers'});content.append(button);}
  };
  const view=vela.ui.registerSidebarView({id:'points',title:'示例地点',icon:'pin',side:'right',documentKinds:['MAP'],modes:['preview'],mount({body}){content=vela.ui.createElement('list');body.append(content);refresh();return ()=>{content=null;};},onContextChange:refresh});
  vela.ui.addButton({id:'show',title:'示例地点',icon:'pin',location:'planning-toolbar',run:()=>view.show()});
  vela.commands.register({id:'count',title:'示例：后台统计',run:async()=>{const input=vela.planning.snapshot().points.map(point=>point.category||'未分类');const task=vela.tasks.runWorker({title:'统计信息点类别',path:'worker.js',input});const result=await task.result;vela.ui.toast(Object.entries(result).map(([name,count])=>name+'：'+count).join('，'));}});
 }
});
