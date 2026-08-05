/**
 * Audio worker: encodes transferred PCM buffers into MP3 bytes.
 * Receives channel ArrayBuffers (transferred, not copied).
 */

import { Mp3Encoder } from '@breezystack/lamejs';

const KBPS = 128;
const BLOCK = 1152;

self.onmessage = (event) => {
  const { channels, sampleRate, channelCount, length } = event.data || {};
  try {
    if (!Array.isArray(channels) || channels.length === 0 || !length) {
      throw new Error('invalid PCM payload');
    }
    const numChannels = Math.min(2, channelCount || channels.length);
    const pcm = channels.map((buf) => new Int16Array(buf));
    const encoder = new Mp3Encoder(numChannels, sampleRate, KBPS);
    const parts = [];
    for (let i = 0; i < length; i += BLOCK) {
      const l = pcm[0].subarray(i, i + BLOCK);
      const r = numChannels === 2 ? pcm[1].subarray(i, i + BLOCK) : undefined;
      const encoded = numChannels === 2 ? encoder.encodeBuffer(l, r) : encoder.encodeBuffer(l);
      if (encoded.length > 0) parts.push(new Int8Array(encoded));
      if (i % (BLOCK * 100) === 0) {
        self.postMessage({ type: 'progress', encoded: i, total: length });
      }
    }
    const tail = encoder.flush();
    if (tail.length > 0) parts.push(new Int8Array(tail));
    const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      out.set(new Uint8Array(part.buffer, part.byteOffset, part.byteLength), offset);
      offset += part.byteLength;
    }
    self.postMessage({ type: 'done', mp3: out.buffer }, [out.buffer]);
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'encoding failed',
    });
  }
};
