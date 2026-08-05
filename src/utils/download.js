/**
 * Download and filename helpers. Object URLs are created at UI boundaries and
 * revoked after the download is triggered or when replaced.
 */

/**
 * Produce a stable, filesystem-safe filename.
 * Keeps alphanumerics, dash, underscore, dot; collapses the rest to '-'.
 * @param {string} name
 * @param {string} extension without dot
 * @param {number} [maxLength]
 * @returns {string}
 */
export function sanitizeFilename(name, extension, maxLength = 80) {
  const base = String(name || 'vxpods-audio')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, maxLength)
    .toLowerCase();
  const safeBase = base || 'vxpods-audio';
  const safeExt = String(extension).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  return `${safeBase}.${safeExt}`;
}

/**
 * Trigger a browser download for a Blob. Revokes the object URL afterwards.
 * @param {Blob} blob
 * @param {string} filename already sanitized
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Download a JSON-serializable value.
 * @param {unknown} value
 * @param {string} filename already sanitized
 */
export function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json',
  });
  downloadBlob(blob, filename);
}
