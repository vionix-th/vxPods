/**
 * Source segmentation. Splits long text into ordered chunks at paragraph,
 * then sentence, then hard character boundaries while preserving content
 * and order. Used when provider request-size limits require it.
 */

export const DEFAULT_MAX_CHUNK_CHARS = 4000;

/**
 * Split text into chunks no longer than maxChars (best effort).
 * @param {string} text
 * @param {number} [maxChars]
 * @returns {string[]} non-empty, trimmed chunks in original order
 */
export function splitIntoChunks(text, maxChars = DEFAULT_MAX_CHUNK_CHARS) {
  const source = String(text ?? '');
  if (source.trim() === '') return [];
  if (source.length <= maxChars) return [source];

  const paragraphs = source.split(/\n{2,}/);
  const chunks = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const piece = paragraph.trim();
    if (!piece) continue;
    if (piece.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      chunks.push(...splitLongParagraph(piece, maxChars));
      continue;
    }
    const candidate = current ? `${current}\n\n${piece}` : piece;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      chunks.push(current);
      current = piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * @param {string} paragraph non-empty, longer than maxChars
 * @param {number} maxChars
 * @returns {string[]}
 */
function splitLongParagraph(paragraph, maxChars) {
  const sentences = splitSentences(paragraph);
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;
    if (piece.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      chunks.push(...hardSplit(piece, maxChars));
      continue;
    }
    const candidate = current ? `${current} ${piece}` : piece;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      chunks.push(current);
      current = piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Naive sentence splitter: keeps trailing punctuation with the sentence.
 * @param {string} text
 * @returns {string[]}
 */
export function splitSentences(text) {
  const matches = String(text).match(/[^.!?…\n]+(?:[.!?…]+|\n|$)/g);
  if (!matches) return [text];
  return matches.filter((s) => s.trim() !== '');
}

/**
 * Last-resort split at whitespace near the limit.
 * @param {string} text
 * @param {number} maxChars
 * @returns {string[]}
 */
function hardSplit(text, maxChars) {
  const chunks = [];
  let rest = text;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(' ', maxChars);
    if (cut < maxChars * 0.5) cut = maxChars;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.filter((c) => c.length > 0);
}
