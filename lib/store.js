import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateWorkflow } from './model.js';

export const MAX_WORKFLOWS = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Shared by instances in this host, including overlapping plugin generations.
const queues = new Map();
export class StoreError extends Error {
  constructor(status, message) { super(message); this.name = 'StoreError'; this.status = status; }
}
function invalid() { return new StoreError(400, 'Invalid workflow request.'); }
function portable(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const { id, revision, createdAt, updatedAt, ...definition } = value;
  try { return structuredClone(validateWorkflow(definition)); }
  catch { throw invalid(); }
}
function validRevision(value) { return Number.isSafeInteger(value) && value >= 1; }
function checkRevision(actual, expected) {
  if (!validRevision(expected)) throw invalid();
  if (actual !== expected) throw new StoreError(409, 'Workflow changed. Reload before trying again.');
}

export class WorkflowStore {
  constructor(profileDir) {
    this.directory = resolve(profileDir, 'workflow-library');
    this.file = join(this.directory, 'library.json');
  }
  #serial(operation) {
    const pending = (queues.get(this.file) ?? Promise.resolve()).then(operation);
    const tail = pending.catch(() => {});
    queues.set(this.file, tail);
    void tail.then(() => { if (queues.get(this.file) === tail) queues.delete(this.file); });
    return pending;
  }
  async #read() {
    let text;
    try { text = await readFile(this.file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    try {
      const data = JSON.parse(text);
      if (data.version !== 1 || !Array.isArray(data.workflows) || data.workflows.length > MAX_WORKFLOWS) throw invalid();
      const ids = new Set();
      return data.workflows.map(value => {
        if (!value || !UUID.test(value.id) || ids.has(value.id) || !validRevision(value.revision)
          || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
          || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw invalid();
        ids.add(value.id);
        return { ...portable(value), id: value.id, revision: value.revision, createdAt: value.createdAt, updatedAt: value.updatedAt };
      });
    } catch { throw new StoreError(500, 'Workflow library could not be read.'); }
  }
  async #write(workflows) {
    await mkdir(this.directory, { recursive: true });
    const temporary = join(this.directory, `.library-${randomUUID()}.tmp`);
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ version: 1, workflows }, null, 2) + '\n', 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, this.file);
    } finally {
      await handle?.close().catch(() => {});
      await unlink(temporary).catch(() => {});
    }
  }
  list() { return this.#serial(() => this.#read()); }
  async save(value, expectedRevision) {
    const definition = portable(value);
    const id = value.id;
    if (id !== undefined && (typeof id !== 'string' || !UUID.test(id))) throw invalid();
    if (id === undefined && expectedRevision !== undefined) throw invalid();
    return this.#serial(async () => {
      const workflows = await this.#read();
      const now = new Date().toISOString();
      if (id !== undefined) {
        const index = workflows.findIndex(item => item.id === id);
        if (index === -1) throw new StoreError(409, 'Workflow no longer exists. Reload before trying again.');
        const previous = workflows[index];
        checkRevision(previous.revision, expectedRevision);
        if (previous.revision === Number.MAX_SAFE_INTEGER) throw new StoreError(409, 'Workflow revision limit reached.');
        workflows[index] = { ...definition, id, revision: previous.revision + 1, createdAt: previous.createdAt, updatedAt: now };
      } else {
        if (workflows.length >= MAX_WORKFLOWS) throw new StoreError(400, 'Workflow library limit is 200.');
        workflows.push({ ...definition, id: randomUUID(), revision: 1, createdAt: now, updatedAt: now });
      }
      await this.#write(workflows);
      return workflows;
    });
  }
  async delete(id, expectedRevision) {
    if (typeof id !== 'string' || !UUID.test(id)) throw invalid();
    return this.#serial(async () => {
      const workflows = await this.#read();
      const index = workflows.findIndex(item => item.id === id);
      if (index === -1) throw new StoreError(409, 'Workflow no longer exists. Reload before trying again.');
      checkRevision(workflows[index].revision, expectedRevision);
      workflows.splice(index, 1);
      await this.#write(workflows);
      return workflows;
    });
  }
  async import(values) {
    if (!Array.isArray(values) || values.length === 0 || values.length > MAX_WORKFLOWS) throw invalid();
    // Validate every entry before reading or writing any persisted state.
    const definitions = values.map(portable);
    return this.#serial(async () => {
      const workflows = await this.#read();
      if (workflows.length + definitions.length > MAX_WORKFLOWS) throw new StoreError(400, 'Workflow library limit is 200.');
      const now = new Date().toISOString();
      const ids = new Set(workflows.map(item => item.id));
      for (const definition of definitions) {
        let id;
        do { id = randomUUID(); } while (ids.has(id));
        ids.add(id);
        workflows.push({ ...definition, id, revision: 1, createdAt: now, updatedAt: now });
      }
      await this.#write(workflows);
      return workflows;
    });
  }
}
