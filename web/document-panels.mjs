// Keep tab/file/folder nodes alive across metadata refreshes. Event handlers are
// delegated by the host; folder expansion, focus and scroll stay on these nodes.
const contents=new WeakMap();
const key=node=>node.matches('.workspace-folder')?'folder:'+node.querySelector('summary')?.dataset.folder:
  node.matches('.document-tab')?'tab:'+node.querySelector('[data-tab]')?.dataset.tab:
  node.matches('.doc-item')?'file:'+(node.querySelector('[data-doc]')?.dataset.doc||node.querySelector('[data-path-menu]')?.dataset.pathMenu):null;

function reconcile(root,children){
  const old=new Map([...root.children].map(node=>[key(node),node]).filter(([id])=>id!==null));
  let before=root.firstElementChild;
  const live=new Set();
  for(const next of children){
    const id=key(next),node=id!==null&&old.get(id)||next;
    if(node!==next){
      node.className=next.className;
      if(node.matches('.workspace-folder')){
        const summary=node.firstElementChild,desired=next.firstElementChild;
        if(summary.outerHTML!==desired.outerHTML)summary.replaceWith(desired.cloneNode(true));
        reconcile(node,[node.firstElementChild,...[...next.children].slice(1)]);
      }else{if((contents.get(node)??node.innerHTML)!==next.innerHTML)node.innerHTML=next.innerHTML;contents.set(node,next.innerHTML);}
      if(next.hasAttribute('title'))node.title=next.title;else node.removeAttribute('title');
    }else contents.set(node,node.innerHTML);
    if(node!==before)root.insertBefore(node,before);
    before=node.nextElementSibling;live.add(node);
  }
  for(const node of [...root.children])if(!live.has(node))node.remove();
}

export function reconcilePanel(root,html){
  const template=document.createElement('template');template.innerHTML=html;
  reconcile(root,[...template.content.children]);
}

// Cache only the last text per document; edited text invalidates it immediately.
export function textInfoCache(count){
  const entries=new WeakMap();
  return doc=>{let entry=entries.get(doc);if(!entry||entry.text!==doc.text){entry={text:doc.text};entries.set(doc,entry);}return {
    count:()=>entry.count??(entry.count=count(entry.text)),
    includes:query=>(entry.lower??=entry.text.toLowerCase()).includes(query)
  };};
}
