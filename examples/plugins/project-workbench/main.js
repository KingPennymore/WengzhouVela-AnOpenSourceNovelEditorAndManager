(() => {
  const id = 'sample.vela.project-workbench';
  let page, api, handle, task, stopWatch, snapshotId, stopped = false;
  acode.setPluginInit(id, async () => {
    api = acode.require('vela');
    const Page = acode.require('page');
    page = new Page('项目接口示例');
    const root = page.body;
    root.innerHTML = '<div style="max-width:860px;margin:auto;padding:20px"><h2>项目工作台</h2><p>示例只操作授权的工作区；新建的数据文件默认不进入阅读清单。</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button data-action="current">当前工作区</button><button data-action="create">新建示例工程</button><button data-action="seed">创建数据文件</button><button data-action="import">导入素材</button><button data-action="zip">导入 ZIP</button><button data-action="snapshot">保存快照</button><button data-action="export">导出 ZIP</button><button data-action="preview">独立试演</button><button data-action="cancel">取消任务</button><button data-action="close">关闭</button></div><pre role="status" style="white-space:pre-wrap"></pre><ul></ul></div>';
    const status = root.querySelector('[role=status]'), list = root.querySelector('ul');
    const log = value => { if (!stopped) status.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); };
    const refresh = async () => {
      if (!handle || stopped) return;
      handle = await api.workspace.open({ workspaceId: handle.id });
      const result = await api.fs.list({ workspaceId: handle.id, path: '', recursive: true, limit: 1000 });
      list.replaceChildren();
      for (const file of result.entries) {
        const item = document.createElement('li'), button = document.createElement('button');
        button.textContent = file.path + (file.kind === 'directory' ? '/' : ' · ' + file.mime);
        button.disabled = !file.textEditable;
        button.onclick = () => api.documents.open({workspaceId: handle.id, path: file.path, expectedRevision: file.revision}).catch(log);
        item.append(button); list.append(item);
      }
    };
    const use = async project => {
      if (!project) throw new Error('当前文稿不属于 .vela 工作区，请先创建示例工程。');
      handle = project; stopWatch?.();
      stopWatch = api.fs.watch({workspaceId: handle.id}, event => { log(event); refresh().catch(log); });
      await refresh(); log(handle);
    };
    const run = async next => { if (task) throw new Error('请先等待或取消当前任务。'); task = next; const unsubscribe = task.onProgress(log); try { const value = await task.result; log(value); await refresh(); return value; } finally { unsubscribe(); task = null; } };
    root.onclick = async event => {
      const action = event.target.closest('[data-action]')?.dataset.action; if (!action) return;
      try {
        if (action === 'close') return page.close();
        if (action === 'cancel') return task?.cancel();
        if (action === 'current') return await use(await api.workspace.current());
        if (action === 'create') return await use(await api.workspace.create({name: '插件示例工程'}));
        if (!handle) throw new Error('请先选择当前工作区或创建示例工程。');
        handle = await api.workspace.open({workspaceId: handle.id});
        if (action === 'seed') {
          const value = await api.fs.applyBatch({workspaceId: handle.id, expectedWorkspaceRevision: handle.revision, idempotencyKey: crypto.randomUUID(), label: '示例数据', changes: [
            {kind: 'mkdir', path: '空目录'},
            {kind: 'writeText', path: '角色.csv', text: 'id,name\nhero,主角\n', expectedRevision: null},
            {kind: 'writeText', path: '对白.json', text: JSON.stringify({schema: 1, scenes: [{id: 'start', speaker: 'hero', text: '启航。'}]}, null, 2), expectedRevision: null}
          ]}); log(value); return await refresh();
        }
        if (action === 'import') {
          const picked = await api.io.pickFiles({multiple: true, accept: ['image/*','audio/*','video/*']}); if (picked.cancelled) return;
          return await run(api.io.importFiles({workspaceId: handle.id, expectedWorkspaceRevision: handle.revision, selections: picked.selections.map(s => ({token: s.token, targetPath: '素材/' + s.name})), collision: 'rename'}));
        }
        const caps = await api.getCapabilities();
        if (action === 'zip') {
          if (!caps.features.archives) throw new Error('此平台不支持 ZIP。');
          const picked = await api.io.pickFiles({multiple: false, accept: ['.zip']}); if (picked.cancelled) return;
          const archive = await run(api.io.inspectArchive({selectionToken: picked.selections[0].token}));
          return await run(api.io.importArchive({workspaceId: handle.id, archiveToken: archive.archiveToken, targetDirectory: '导入项目', expectedWorkspaceRevision: handle.revision, collision: 'error'}));
        }
        if (action === 'snapshot') { const value = await run(api.snapshots.create({workspaceId: handle.id, expectedWorkspaceRevision: handle.revision, label: '工作台快照', includeRoots: ['']})); snapshotId = value.snapshotId; return; }
        if (!snapshotId) throw new Error('请先保存快照。');
        if (action === 'export') {
          if (!caps.features.archives) throw new Error('此平台不支持 ZIP。');
          return await run(api.io.exportArchive({snapshotId, root: '', paths: ['角色.csv','对白.json'], suggestedName: '示例数据.zip'}));
        }
        if (action === 'preview') {
          if (!caps.features.independentPreview) throw new Error('移动端请在插件页面内显示素材；独立试演仅在 Windows 提供。');
          log(await api.preview.open({snapshotId, runtime: {pluginAsset: 'preview.html'}, contentRoot: '', initialState: {title: handle.name}, network: 'none'}));
        }
      } catch (cause) { log((cause.code ? cause.code + '：' : '') + cause.message); }
    };
    page.onBeforeClose(async () => { if (task) await task.cancel(); return true; });
    page.onHide(() => log('工作台已隐藏；再次打开可继续操作。'));
    acode.require('commands').addCommand({name: id + '.open', description: '打开项目接口示例', exec: () => page.show()});
    api.dispose(() => { stopped = true; stopWatch?.(); });
  });
  acode.setPluginUnmount(id, async () => { stopped = true; stopWatch?.(); await task?.cancel(); page?.destroy(); });
})();
