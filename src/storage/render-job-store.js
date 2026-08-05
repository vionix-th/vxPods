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

const DB_NAME = 'vxpods-render';
const DB_VERSION = 1;
const JOB_STORE = 'job';
const SEGMENT_STORE = 'segments';
const ACTIVE_JOB_KEY = 'active';
export const RENDER_JOB_SCHEMA_VERSION = 1;
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
  if (!job || job.schemaVersion !== RENDER_JOB_SCHEMA_VERSION) return null;
  return job;
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
 * Load one segment Blob.
 * @param {string} jobId
 * @param {string} segmentId
 * @returns {Promise<Blob | null>}
 */
export async function getSegment(jobId, segmentId) {
  const tx = await transaction('readonly', [SEGMENT_STORE]);
  const record = await requestPromise(tx.objectStore(SEGMENT_STORE).get([jobId, segmentId]));
  return record?.blob ?? null;
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
