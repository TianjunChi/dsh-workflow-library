import test from 'node:test';
import assert from 'node:assert/strict';
import { inject, registerWorkflowRoutes } from '../lib/index.js';

function setup(t, connection) {
  let route;
  const calls = [];
  const store = Object.fromEntries(['list','save','delete','import'].map(name => [name, async () => {calls.push(name); return [];} ]));
  const dispose = registerWorkflowRoutes({connection, webServer:{port:52040, register(value){route=value;return ()=>{};}}},store);
  t.after(dispose);
  return {calls, async call(method='GET') {
    let bodyReads=0;
    const req={method,socket:{remoteAddress:'127.0.0.1'},headers:{host:'127.0.0.1:52040','x-dsh-workflow':'1',origin:'http://127.0.0.1:52040','content-type':'application/json'},on(){bodyReads++;throw Error('Body must not be read');}};
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.body=JSON.parse(value);this.writableEnded=true;}};
    await route.handler(req,res);
    return {req,res,bodyReads};
  }};
}

test('host connection is a required injected service',()=>assert.ok(inject.includes('connection')));
for (const status of [401,403]) {
  test(`host ${status} prevents all route access before body parsing or storage`,async t=>{
    let lastRequest, checks=0;
    const connection={requestRejection(req){assert.equal(this,connection);lastRequest=req;checks++;return status;}};
    const host=setup(t,connection);
    for(const method of ['GET','POST','OPTIONS','DELETE']) {
      const {req,res,bodyReads}=await host.call(method);
      assert.equal(lastRequest,req);
      assert.equal(res.statusCode,status);
      assert.deepEqual(res.body,{error:status===401?'Authentication required.':'Access denied.'});
      assert.equal(res.headers['cache-control'],'no-store');
      assert.equal(bodyReads,0);
    }
    assert.equal(checks,4);
    assert.deepEqual(host.calls,[]);
  });
}
test('host authentication failure throws safely without leaking details or accessing storage',async t=>{
  const host=setup(t,{requestRejection(){throw Error('secret credential');}});
  const {res}=await host.call();
  assert.equal(res.statusCode,500);
  assert.deepEqual(res.body,{error:'Workflow library operation failed.'});
  assert.deepEqual(host.calls,[]);
});
test('missing host connection fails closed',async t=>{
  const host=setup(t,undefined);
  assert.equal((await host.call()).res.statusCode,500);
  assert.deepEqual(host.calls,[]);
});
test('only host-approved request reaches storage',async t=>{
  let checked=false;
  const host=setup(t,{requestRejection(){checked=true;return undefined;}});
  const {res}=await host.call();
  assert.equal(checked,true);
  assert.equal(res.statusCode,200);
  assert.deepEqual(host.calls,['list']);
});
