import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { WorkflowStore } from '../lib/store.js';
import { validateWorkflow } from '../lib/model.js';
import { MAX_BODY_BYTES, registerWorkflowRoutes, requestAllowed } from '../lib/index.js';

function fixture(name = 'Test workflow') {
  return validateWorkflow({ name, description: 'A portable workflow', parameters: [],
    steps: [{ title: 'Check', instruction: 'Check the result', tool: '', validation: 'Result is correct', onFailure: 'Stop and report' }],
    successCriteria: 'Checks pass' });
}
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-workflow-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return new WorkflowStore(directory);
}

test('save survives restart, preserves createdAt, increments revision, returns detached values', async t => {
  const store = await setup(t);
  assert.deepEqual(await store.list(), []);
  const [first] = await store.save(fixture());
  assert.match(first.id, /^[0-9a-f-]{36}$/);
  assert.equal(first.revision, 1);
  const [second] = await store.save({ ...first, name: 'Edited', createdAt: 'spoof' }, 1);
  assert.equal(second.createdAt, first.createdAt);
  assert.equal(second.revision, 2);
  second.name = 'External mutation';
  const restarted = new WorkflowStore(join(store.directory, '..'));
  assert.equal((await restarted.list())[0].name, 'Edited');
  assert.deepEqual(await readdir(store.directory), ['library.json']);
});

test('concurrent edits across store instances reject stale revisions and keep queue usable', async t => {
  const store = await setup(t);
  const other = new WorkflowStore(join(store.directory, '..'));
  const [initial] = await store.save(fixture());
  const results = await Promise.allSettled([
    store.save({ ...initial, name: 'First' }, 1),
    other.save({ ...initial, name: 'Second' }, 1),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  await assert.rejects(store.delete(initial.id, 1), { status: 409 });
  await assert.rejects(store.delete(initial.id), { status: 400 });
  assert.deepEqual(await store.delete(initial.id, 2), []);
});

test('import validates whole batch atomically and replaces colliding identities with fresh UUIDs', async t => {
  const store = await setup(t);
  const [initial] = await store.save(fixture());
  const before = await readFile(store.file, 'utf8');
  await assert.rejects(store.import([fixture('Valid'), { name: '' }]), { status: 400 });
  assert.equal(await readFile(store.file, 'utf8'), before);
  const result = await store.import([initial, initial]);
  assert.equal(result.length, 3);
  assert.equal(new Set(result.map(item => item.id)).size, 3);
  assert.equal(result[1].revision, 1);
  assert.equal(result[0].createdAt, initial.createdAt);
});

test('200-workflow cap is enforced without partial import or save', async t => {
  const store = await setup(t);
  await store.import(Array.from({ length: 199 }, (_, index) => fixture(`Workflow ${index}`)));
  await assert.rejects(store.import([fixture(), fixture()]), { status: 400 });
  assert.equal((await store.list()).length, 199);
  await store.save(fixture());
  await assert.rejects(store.save(fixture()), { status: 400 });
  assert.equal((await store.list()).length, 200);
});

test('corrupt persistence is not silently overwritten or exposed', async t => {
  const store = await setup(t);
  await store.save(fixture());
  await writeFile(store.file, '{broken secret/path');
  await assert.rejects(store.list(), { status: 500, message: 'Workflow library could not be read.' });
  await assert.rejects(store.save(fixture()), { status: 500 });
  assert.equal(await readFile(store.file, 'utf8'), '{broken secret/path');
});

function request(overrides = {}) {
  return { socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:52040' }, ...overrides };
}
test('authority validation requires loopback socket and exact host/port', () => {
  for (const remoteAddress of ['127.0.0.1', '127.2.3.4', '::1', '::ffff:127.0.0.1']) {
    for (const host of ['localhost:52040', '127.0.0.1:52040', '[::1]:52040']) {
      assert.equal(requestAllowed(request({ socket: { remoteAddress }, headers: { host } }), 52040), true);
    }
  }
  for (const host of ['localhost.evil:52040', 'localhost.:52040', '127.1:52040', '2130706433:52040', 'localhost:52041', 'localhost:052040', 'user@localhost:52040', 'localhost:52040/path']) {
    assert.equal(requestAllowed(request({ headers: { host } }), 52040), false, host);
  }
  assert.equal(requestAllowed(request({ socket: { remoteAddress: '192.168.1.1' } }), 52040), false);
  assert.equal(requestAllowed(request(), undefined), false);
});

async function harness(t, store) {
  let route;
  let disposed = false;
  const dispose = registerWorkflowRoutes({ webServer: { port: 52040, register(value) { route = value; return () => { disposed = true; }; } } }, store);
  t.after(dispose);
  assert.equal(route.kind, 'exact');
  assert.equal(route.path, '/api/workflow-library');
  return {
    dispose, get disposed() { return disposed; },
    async call({ method = 'GET', headers = {}, body, chunks } = {}) {
      const req = Readable.from(chunks ?? (body === undefined ? [] : [typeof body === 'string' ? body : JSON.stringify(body)]));
      req.method = method;
      req.socket = { remoteAddress: '127.0.0.1' };
      req.headers = { host: '127.0.0.1:52040', 'x-dsh-workflow': '1', ...headers };
      const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); this.writableEnded = true; } };
      await route.handler(req, response);
      return response;
    },
  };
}
const postHeaders = { origin: 'http://127.0.0.1:52040', 'content-type': 'application/json' };
test('route guards read headers, same origin, JSON, methods and clean errors', async t => {
  const store = await setup(t);
  const host = await harness(t, store);
  assert.equal((await host.call()).statusCode, 200);
  assert.equal((await host.call({ headers: { 'x-dsh-workflow': undefined } })).statusCode, 403);
  assert.equal((await host.call({ method: 'OPTIONS' })).statusCode, 405);
  for (const origin of [undefined, 'null', 'http://localhost:52040', 'http://127.0.0.1:52040/', 'https://127.0.0.1:52040', 'http://127.0.0.1:52040@evil.test']) {
    assert.equal((await host.call({ method: 'POST', headers: { ...postHeaders, origin }, body: {} })).statusCode, 403);
  }
  assert.equal((await host.call({ method: 'POST', headers: { ...postHeaders, 'content-type': 'text/plain' }, body: {} })).statusCode, 415);
  assert.equal((await host.call({ method: 'POST', headers: postHeaders, body: 'bad JSON' })).statusCode, 400);
  const saved = await host.call({ method: 'POST', headers: postHeaders, body: { action: 'save', workflow: fixture() } });
  assert.equal(saved.statusCode, 200);
  const [workflow] = saved.body.workflows;
  assert.equal((await host.call({ method: 'POST', headers: postHeaders, body: { action: 'save', workflow, expectedRevision: 99 } })).statusCode, 409);
  host.dispose();
  assert.equal(host.disposed, true);
  assert.equal((await host.call()).statusCode, 503);
});

test('body cap rejects both declared and streamed oversized requests', async t => {
  const host = await harness(t, await setup(t));
  for (const headers of [postHeaders, { ...postHeaders, 'content-length': String(MAX_BODY_BYTES + 1) }]) {
    const response = await host.call({ method: 'POST', headers, chunks: [Buffer.alloc(MAX_BODY_BYTES), Buffer.from('x')] });
    assert.equal(response.statusCode, 413);
  }
});

test('unexpected route failures never leak filesystem paths', async t => {
  const host = await harness(t, { list() { throw new Error('secret C:/profile/library.json'); } });
  const response = await host.call();
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: 'Workflow library operation failed.' });
});
