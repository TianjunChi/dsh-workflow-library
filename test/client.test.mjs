import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('built client registers native launcher and overlay and cleans up',async()=>{
 const code=await readFile(new URL('../lib/client.js',import.meta.url),'utf8');
 let plugin,removed=false;const slots=[],effects=[];
 const React={createElement:(...args)=>args};
 const context={window:{__ModuleLoader__:{load:entry=>{assert.equal(entry.id,'@monster_harryc/dsh-workflow-library');plugin=entry.factory(name=>{assert.equal(name,'react');return React;});}}},AbortController,document:{createElement:()=>({remove(){removed=true;}}),head:{appendChild(){}}}};
 vm.runInNewContext(code,context);
 assert.deepEqual(Array.from(plugin.inject),['slots','sessions','uiWorkspace']);
 plugin.apply({effect:fn=>effects.push(fn()),slots:{inject:(_name,fn)=>fn(),register:(spec,component)=>{slots.push({spec,component});}},sessions:{},uiWorkspace:{}});
 assert.deepEqual(slots.map(s=>s.spec.name),['sidebar.footer.action','shell.overlay']);
 assert.equal(slots[0].component()[0],'button');
 for(const dispose of effects)dispose?.();assert.equal(removed,true);
});
