/**
 * IndexedDB persistence for one recoverable podcast render job plus its
 * audio segment Blobs. One active job at a time (R1 constraint).
 *
 * Database: vxpods-render
 *   store 'job'      — single record, key 'active'
 *   store 'segments' — records { jobId, segmentId, blob, createdAt },
 *                      keyPath [jobId, segmentId]
 */

import { AppError } from '../services/errors.js';
import { normalizeTtsModels } from '../domain/provider-config.js';
import { validateScript } from '../domain/podcast-script-schema.js';

const DB_NAME = 'vxpods-render';
const DB_VERSION = 1;
const JOB_STORE = 'job';
const SEGMENT_STORE = 'segments';
const ACTIVE_JOB_KEY = 'active';
export const RENDER_JOB_SCHEMA_VERSION = 2;
export const RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @typedef {Object} RenderJob
 * @property {number} schemaVersion
 * @property {string} id
 * @property {string} createdAt ISO timestamp
 * @property {string} updatedAt ISO timestamp
 * @property {object} script validated PodcastScript
 * @property {object} settings render settings (provider id, tts model, voices)
 * @property {Record<string, 'pending'|'active'|'completed'|'failed'>} segmentStates
 * @property {'rendering'|'cancelled'|'failed'|'ready'} status
 */

let dbPromise = null;

/**
 * @returns {Promise<IDBDatabase>}
 */
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(JOB_STORE)) {
        db.createObjectStore(JOB_STORE);
      }
      if (!db.objectStoreNames.contains(SEGMENT_STORE)) {
        const store = db.createObjectStore(SEGMENT_STORE, {
          keyPath: ['jobId', 'segmentId'],
        });
        store.createIndex('byJob', 'jobId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new AppError({
          kind: 'storage',
          message: 'Failed to open browser database.',
          retryable: false,
          status: undefined,
          cause: request.error,
        }),
      );
  });
  return dbPromise;
}

/**
 * @param {IDBTransactionMode} mode
 * @param {string[]} stores
 * @returns {Promise<IDBTransaction>}
 */
async function transaction(mode, stores) {
  const db = await openDb();
  return db.transaction(stores, mode);
}

/**
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(wrapStorageError(request.error));
  });
}

/**
 * @param {IDBTransaction} tx
 * @returns {Promise<void>}
 */
function txComplete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(wrapStorageError(tx.error));
    tx.onabort = () => reject(wrapStorageError(tx.error));
  });
}

/**
 * @param {unknown} err
 */
function wrapStorageError(err) {
  if (err instanceof AppError) return err;
  const quota =
    err instanceof DOMException &&
    (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
  return new AppError({
    kind: 'storage',
    message: quota
      ? 'Browser storage is full. Download or discard completed audio, then retry.'
      : 'Browser database operation failed.',
    retryable: false,
    status: undefined,
    cause: err,
  });
}

/**
 * Persist a new active job, replacing any existing one including segments.
 * Caller must obtain user confirmation before replacing recoverable work.
 * @param {RenderJob} job
 */
export async function saveJob(job) {
  const tx = await transaction('readwrite', [JOB_STORE, SEGMENT_STORE]);
  tx.objectStore(SEGMENT_STORE).clear();
  tx.objectStore(JOB_STORE).put(job, ACTIVE_JOB_KEY);
  await txComplete(tx);
}

/**
 * @returns {Promise<RenderJob | null>}
 */
export async function loadJob() {
  const tx = await transaction('readonly', [JOB_STORE]);
  const job = await requestPromise(tx.objectStore(JOB_STORE).get(ACTIVE_JOB_KEY));
  if (!job) return null;
  return validateRenderJob(job);
}

/**
 * Validate untrusted persisted recovery metadata before workflow code uses it.
 * Segment Blobs remain validated when decoded during assembly.
 * @param {unknown} value
 * @returns {RenderJob}
 */
export function validateRenderJob(value) {
  if (!isRecord(value)) throw invalidJob('Saved render data is damaged.');
  if (value.schemaVersion !== RENDER_JOB_SCHEMA_VERSION) {
    throw invalidJob('Saved render data uses an unsupported version.');
  }

  const scriptResult = validateScript(value.script);
  if (!scriptResult.valid) throw invalidJob('Saved render script is damaged.');
  if (!isRecord(value.settings)) throw invalidJob('Saved render settings are damaged.');
  const ttsModels = normalizeTtsModels([value.settings.ttsModel]);
  if (ttsModels.length !== 1) throw invalidJob('Saved TTS model is invalid.');

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const providerId = typeof value.settings.ttsProviderId === 'string'
    ? value.settings.ttsProviderId.trim()
    : '';
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : '';
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : '';
  const statuses = new Set(['rendering', 'cancelled', 'failed', 'ready']);
  if (!id || !providerId || !Number.isFinite(Date.parse(createdAt)) ||
      !Number.isFinite(Date.parse(updatedAt)) || !statuses.has(value.status)) {
    throw invalidJob('Saved render metadata is damaged.');
  }
  if (!isRecord(value.segmentStates)) throw invalidJob('Saved segment state is damaged.');

  const allowedSegmentStates = new Set(['pending', 'active', 'completed', 'failed']);
  const segmentIds = new Set(scriptResult.script.segments.map((segment) => segment.id));
  const persistedIds = Object.keys(value.segmentStates);
  if (persistedIds.length !== segmentIds.size ||
      persistedIds.some((segmentId) =>
        !segmentIds.has(segmentId) || !allowedSegmentStates.has(value.segmentStates[segmentId]))) {
    throw invalidJob('Saved segment state does not match the script.');
  }
  if (value.status === 'ready' && persistedIds.some((id) => value.segmentStates[id] !== 'completed')) {
    throw invalidJob('Saved render is marked ready but has incomplete segments.');
  }

  return /** @type {RenderJob} */ ({
    schemaVersion: RENDER_JOB_SCHEMA_VERSION,
    id,
    createdAt,
    updatedAt,
    script: scriptResult.script,
    settings: {
      ttsProviderId: providerId,
      ttsProviderName: typeof value.settings.ttsProviderName === 'string'
        ? value.settings.ttsProviderName
        : null,
      ttsModel: ttsModels[0],
    },
    segmentStates: Object.fromEntries(
      persistedIds.map((segmentId) => [segmentId, value.segmentStates[segmentId]]),
    ),
    status: value.status,
  });
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function invalidJob(message) {
  return new AppError({
    kind: 'storage',
    message: `${message} Discard it and start a new render.`,
    retryable: false,
    status: undefined,
  });
}

/**
 * Update mutable job fields, bumping updatedAt.
 * @param {RenderJob} job
 */
export async function updateJob(job) {
  const tx = await transaction('readwrite', [JOB_STORE]);
  tx.objectStore(JOB_STORE).put(
    { ...job, updatedAt: new Date().toISOString() },
    ACTIVE_JOB_KEY,
  );
  await txComplete(tx);
}

/**
 * Persist a completed segment Blob and mark it completed in the job record,
 * transactionally so job state never outlives its Blob.
 * @param {string} jobId
 * @param {string} segmentId
 * @param {Blob} blob
 * @param {RenderJob} job current in-memory job (mutated copy persisted)
 */
export async function saveSegment(jobId, segmentId, blob, job) {
  const tx = await transaction('readwrite', [JOB_STORE, SEGMENT_STORE]);
  tx.objectStore(SEGMENT_STORE).put({
    jobId,
    segmentId,
    blob,
    createdAt: new Date().toISOString(),
  });
  const nextJob = {
    ...job,
    segmentStates: { ...job.segmentStates, [segmentId]: 'completed' },
    updatedAt: new Date().toISOString(),
  };
  tx.objectStore(JOB_STORE).put(nextJob, ACTIVE_JOB_KEY);
  await txComplete(tx);
  return nextJob;
}

/**
 * Load all segment records for a job, ordered by segmentId.
 * @param {string} jobId
 * @returns {Promise<Array<{ segmentId: string, blob: Blob }>>}
 */
export async function getAllSegments(jobId) {
  const tx = await transaction('readonly', [SEGMENT_STORE]);
  const index = tx.objectStore(SEGMENT_STORE).index('byJob');
  const records = await requestPromise(index.getAll(jobId));
  return records
    .map((r) => ({ segmentId: r.segmentId, blob: r.blob }))
    .sort((a, b) => (a.segmentId < b.segmentId ? -1 : a.segmentId > b.segmentId ? 1 : 0));
}

/**
 * Remove the active job and every segment record.
 */
export async function deleteJob() {
  const tx = await transaction('readwrite', [JOB_STORE, SEGMENT_STORE]);
  tx.objectStore(JOB_STORE).delete(ACTIVE_JOB_KEY);
  tx.objectStore(SEGMENT_STORE).clear();
  await txComplete(tx);
}

/**
 * Remove recoverable data older than RECOVERY_TTL_MS, measured from the job's
 * last update (activity) timestamp.
 * @param {number} [now]
 * @returns {Promise<boolean>} true when a job was pruned
 */
export async function pruneExpired(now = Date.now()) {
  const job = await loadJob();
  if (!job) return false;
  const updated = Date.parse(job.updatedAt);
  if (!Number.isFinite(updated)) return false;
  if (now - updated >= RECOVERY_TTL_MS) {
    await deleteJob();
    return true;
  }
  return false;
}

/**
 * Test hook: drop the cached connection so fake-indexeddb can be swapped in.
 */
export function resetDbConnectionForTests() {
  if (dbPromise) {
    dbPromise.then((db) => db.close()).catch(() => {});
  }
  dbPromise = null;
}
