/** Environment-neutral MP3 encoding loop shared by worker and fallback. */

export const MP3_TARGET_KBPS = 128;
export const MP3_BLOCK_SAMPLES = 1152;
const PROGRESS_BLOCKS = 100;

/** @param {Float32Array} input */
export function floatToInt16(input) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

/**
 * @param {Object} args
 * @param {new (channels: number, sampleRate: number, kbps: number) => { encodeBuffer: Function, flush: Function }} args.Encoder
 * @param {Int16Array[]} args.channels
 * @param {number} args.sampleRate
 * @param {(encodedSamples: number, totalSamples: number) => void} [args.onProgress]
 * @returns {Uint8Array}
 */
export function encodeMp3Bytes({ Encoder, channels, sampleRate, onProgress }) {
  if (!Array.isArray(channels) || channels.length === 0 || channels[0].length === 0) {
    throw new Error('MP3 encoding requires non-empty PCM channels.');
  }
  const channelCount = Math.min(2, channels.length);
  const left = channels[0];
  const right = channelCount === 2 ? channels[1] : left;
  if (right.length !== left.length) throw new Error('MP3 channel lengths differ.');

  const encoder = new Encoder(channelCount, sampleRate, MP3_TARGET_KBPS);
  const parts = [];
  for (let offset = 0; offset < left.length; offset += MP3_BLOCK_SAMPLES) {
    const leftBlock = left.subarray(offset, offset + MP3_BLOCK_SAMPLES);
    const rightBlock = channelCount === 2
      ? right.subarray(offset, offset + MP3_BLOCK_SAMPLES)
      : undefined;
    const encoded = channelCount === 2
      ? encoder.encodeBuffer(leftBlock, rightBlock)
      : encoder.encodeBuffer(leftBlock);
    if (encoded.length > 0) parts.push(new Uint8Array(encoded));
    const blockIndex = Math.floor(offset / MP3_BLOCK_SAMPLES);
    if (onProgress && (blockIndex % PROGRESS_BLOCKS === 0 || offset + MP3_BLOCK_SAMPLES >= left.length)) {
      onProgress(Math.min(offset + MP3_BLOCK_SAMPLES, left.length), left.length);
    }
  }
  const tail = encoder.flush();
  if (tail.length > 0) parts.push(new Uint8Array(tail));

  const byteLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(byteLength);
  let outputOffset = 0;
  for (const part of parts) {
    output.set(part, outputOffset);
    outputOffset += part.byteLength;
  }
  return output;
}
