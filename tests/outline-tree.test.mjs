import test from 'node:test';
import assert from 'node:assert/strict';
import {createOutline,outlineText} from '../web/outline.mjs';
import {addNode,moveNode,indentNode,removeNode} from '../web/outline-tree.mjs';
import {outlinePositions} from '../web/outline-graph.mjs';
test('tree moves reject cycles and support indent, outdent and subtree deletion',()=>{const v=createOutline(),a=addNode(v,v.root),b=addNode(v,a);assert.ok(indentNode(v,b));assert.deepEqual(v.nodes[a].children,[b]);assert.equal(moveNode(v,a,b),false);assert.ok(indentNode(v,b,true));assert.deepEqual(v.nodes[v.root].children,[a,b]);assert.equal(removeNode(v,v.root),false);moveNode(v,b,a);v.edges=[{id:'e',from:a,to:b}];removeNode(v,a);assert.equal(v.nodes[b],undefined);assert.deepEqual(v.edges,[]);assert.doesNotThrow(()=>outlineText(v));});
test('graph auto layout is deterministic and preserves dragged positions',()=>{const v=createOutline(),a=addNode(v,v.root);assert.deepEqual(outlinePositions(v),outlinePositions(v));v.nodes[a].layout={x:-34,y:78,future:2};assert.deepEqual(outlinePositions(v)[a],v.nodes[a].layout);});
