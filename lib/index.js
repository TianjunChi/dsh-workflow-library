import { BlockList, isIP } from 'node:net';
import { StoreError, WorkflowStore } from './store.js';

export const name = 'workflow-library';
export const inject = ['webServer', 'profileContext'];
export const ROUTE = '/api/workflow-library';
export const MAX_BODY_BYTES = 1024 * 1024;
const loopbacks = new BlockList();
loopbacks.addSubnet('127.0.0.0', 8, 'ipv4');
loopbacks.addAddress('::1', 'ipv6');

export function requestAllowed(req, port, protocol = 'http:') {
  const address = req.socket?.remoteAddress;
  const family = typeof address === 'string' ? isIP(address) : 0;
  if (!family || !loopbacks.check(address, family === 4 ? 'ipv4' : 'ipv6')) return false;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  const host = req.headers.host;
  const defaultPort = protocol === 'https:' ? 443 : 80;
  const hosts = ['localhost', '127.0.0.1', '[::1]'];
  if (!hosts.some(value => host === `${value}:${port}` || (port === defaultPort && host === value))) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  return true;
}
function sameOrigin(req, protocol) {
  // Raw equality rejects credentials, suffixes, paths, fragments and ambiguous URL normalization.
  const origin = req.headers.origin;
  const authority = new URL(`${protocol}//${req.headers.host}`).origin;
  return typeof origin === 'string' && origin === authority;
}
function sendJson(res, status, value) {
  if (res.destroyed || res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('cross-origin-resource-policy', 'same-origin');
  res.end(JSON.stringify(value));
}
function readJson(req, signal) {
  if (Number(req.headers['content-length']) > MAX_BODY_BYTES) {
    req.resume();
    return Promise.reject(new StoreError(413, 'Request body exceeds 1 MB.'));
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const cleanup = () => {
      req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onAbort);
      signal.removeEventListener('abort', onAbort);
    };
    const fail = error => { cleanup(); reject(error); };
    const onError = () => fail(new StoreError(400, 'Request body could not be read.'));
    const onAbort = () => fail(new StoreError(503, 'Workflow library unavailable.'));
    const onData = chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) { fail(new StoreError(413, 'Request body exceeds 1 MB.')); req.resume(); return; }
      chunks.push(buffer);
    };
    const onEnd = () => {
      cleanup();
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new StoreError(400, 'Invalid JSON request.')); }
    };
    req.on('data', onData); req.once('end', onEnd); req.once('error', onError); req.once('aborted', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

export function registerWorkflowRoutes(ctx, store = new WorkflowStore(ctx.profileContext.dir)) {
  const controller = new AbortController();
  const protocol = ctx.webServer.protocol ?? 'http:';
  const unregister = ctx.webServer.register({ kind: 'exact', path: ROUTE, handler: async (req, res) => {
    try {
      if (controller.signal.aborted) throw new StoreError(503, 'Workflow library unavailable.');
      if (!requestAllowed(req, ctx.webServer.port, protocol)) throw new StoreError(403, 'Local request required.');
      if (req.method === 'GET') {
        if (req.headers['x-dsh-workflow'] !== '1') throw new StoreError(403, 'Workflow request header required.');
        sendJson(res, 200, { workflows: await store.list() });
        return;
      }
      if (req.method !== 'POST') {
        res.setHeader('allow', 'GET, POST');
        throw new StoreError(405, 'Method not allowed.');
      }
      if (!sameOrigin(req, protocol)) throw new StoreError(403, 'Same-origin request required.');
      const contentType = req.headers['content-type'];
      if (typeof contentType !== 'string' || contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        throw new StoreError(415, 'Content-Type must be application/json.');
      }
      if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw new StoreError(415, 'Encoded request bodies are not supported.');
      const body = await readJson(req, controller.signal);
      if (controller.signal.aborted) throw new StoreError(503, 'Workflow library unavailable.');
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new StoreError(400, 'Invalid workflow request.');
      let workflows;
      switch (body.action) {
        case 'save': workflows = await store.save(body.workflow, body.expectedRevision); break;
        case 'delete': workflows = await store.delete(body.id, body.expectedRevision); break;
        case 'import': workflows = await store.import(body.workflows); break;
        default: throw new StoreError(400, 'Unknown workflow action.');
      }
      sendJson(res, 200, { workflows });
    } catch (error) {
      sendJson(res, error instanceof StoreError ? error.status : 500,
        { error: error instanceof StoreError ? error.message : 'Workflow library operation failed.' });
    }
  } });
  return () => { controller.abort(); unregister(); };
}

export function apply(ctx) {
  ctx.effect(() => registerWorkflowRoutes(ctx), 'workflow-library: routes');
}

export { WorkflowStore } from './store.js';
