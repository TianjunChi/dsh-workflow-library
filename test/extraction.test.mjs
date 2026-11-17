import test from 'node:test';
import assert from 'node:assert/strict';
import {extractionMessages,buildExtractionPrompt} from '../lib/model.js';
const user=(seq,text)=>({type:'event',event:{seq,type:'user/message',surfaceOp:'append',data:{content:[{type:'text',text}]}}});
const assistant=(seq,text,extra={})=>({type:'event',event:{seq,type:'assistant/message',surfaceOp:'append',data:{message:{content:[{type:'text',text},{type:'reasoning',text:'private reasoning'}]},...extra}}});
test('only extracts visible durable message text in order',()=>{
 const messages=extractionMessages([user(1,'first'),{type:'transient'},assistant(2,'answer'),assistant(3,'interrupted',{interrupted:true}),{type:'event',event:{seq:4,type:'tool/result',data:{text:'secret tool'}}}]);
 assert.deepEqual(messages,[{id:'1',role:'user',text:'first'},{id:'2',role:'assistant',text:'answer'}]);
 assert.doesNotMatch(JSON.stringify(messages),/private reasoning|secret tool|interrupted/);
});
test('whole conversation includes all visible messages; selection excludes others',()=>{
 const messages=extractionMessages([user(1,'UNSELECTED_SECRET'),assistant(2,'SELECTED_TEXT')]);
 assert.match(buildExtractionPrompt(messages),/UNSELECTED_SECRET/);
 const partial=buildExtractionPrompt(messages,['2']);
 assert.match(partial,/SELECTED_TEXT/);assert.doesNotMatch(partial,/UNSELECTED_SECRET/);
 assert.match(partial,/不使用当前会话的其他内容/);
});
test('edited fragments replace original selected text, not append it',()=>{
 const messages=extractionMessages([user(1,'ORIGINAL_SECRET')]);
 const prompt=buildExtractionPrompt(messages,['1'],{'1':'KEPT_FRAGMENT'});
 assert.match(prompt,/KEPT_FRAGMENT/);assert.doesNotMatch(prompt,/ORIGINAL_SECRET/);
 assert.throws(()=>buildExtractionPrompt(messages,['1'],{'1':'   '}),/非空/);
 assert.throws(()=>buildExtractionPrompt(messages,[]),/至少选择/);
 assert.throws(()=>buildExtractionPrompt(messages,['unknown']),/至少选择/);
});
test('oversize sources rejected explicitly rather than silently truncated',()=>{
 assert.throws(()=>buildExtractionPrompt([{id:'1',role:'user',text:'a'.repeat(120001)}]),/不会自动截断/);
});
test('replacement assistant events and non-text blocks are excluded',()=>{
 const replacement=assistant(2,'replacement');replacement.event.surfaceOp={op:'replace',startSeq:1,endSeq:1};
 assert.deepEqual(extractionMessages([replacement,{type:'event',event:{seq:3,type:'user/message',data:{content:[{type:'image',url:'private'}]}}}]),[]);
});
