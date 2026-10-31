// Keep tab/file/folder nodes alive across metadata refreshes. Event handlers are
// delegated by the host; folder expansion, focus and scroll stay on these nodes.
const contents=new WeakMap();
const key=node=>node.matches('.workspace-folder')?'folder:'+node.querySelector('summary')?.dataset.folder:
  node.matches('.document-tab')?'tab:'+node.querySelector('[data-tab]')?.dataset.tab:
  node.matches('.doc-item')?'file:'+(node.querySelector('[data-doc]')?.dataset.doc||node.querySelector('[data-path-menu]')?.dataset.pathMenu):null;

// Same element tree: copy attributes and leaf text in place so buttons (and their focus) survive, e.g. a tab
// becoming active. A different tree is reported so the caller rebuilds it.
const sameTree=(a,b)=>a.nodeName===b.nodeName&&(a.nodeType!==1||!a.firstElementChild&&!b.firstElementChild||a.children.length===b.children.length&&a.childNodes.length===b.childNodes.length&&[...a.childNodes].every((child,i)=>sameTree(child,b.childNodes[i])));
function copy(a,b){
  if(a.nodeType===3){if(a.nodeValue!==b.nodeValue)a.nodeValue=b.nodeValue;return;}
  if(a.nodeType!==1)return;
  for(const {name} of [...a.attributes])if(!b.hasAttribute(name))a.removeAttribute(name);
  for(const {name,value} of [...b.attributes])if(a.getAttribute(name)!==value)a.setAttribute(name,value);
  if(!a.firstElementChild&&!b.firstElementChild){if(a.textContent!==b.textContent)a.textContent=b.textContent;return;}
  [...a.childNodes].forEach((child,i)=>copy(child,b.childNodes[i]));
}
function patch(node,next){
  if(node.childNodes.length!==next.childNodes.length||![...node.childNodes].every((child,i)=>sameTree(child,next.childNodes[i])))return false;
  [...node.childNodes].forEach((child,i)=>copy(child,next.childNodes[i]));
  return true;
}

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
      }else{if((contents.get(node)??node.innerHTML)!==next.innerHTML&&!patch(node,next))node.innerHTML=next.innerHTML;contents.set(node,next.innerHTML);}
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
