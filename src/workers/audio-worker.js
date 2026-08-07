/**
 * Audio worker: encodes transferred PCM buffers into MP3 bytes.
 * Receives channel ArrayBuffers (transferred, not copied).
 */

import { Mp3Encoder } from '@breezystack/lamejs';
import { encodeMp3Bytes } from '../audio/mp3-core.js';

self.onmessage = (event) => {
  const { channels, sampleRate, channelCount, length } = event.data || {};
  try {
    if (!Array.isArray(channels) || channels.length === 0 || !length) {
      throw new Error('invalid PCM payload');
    }
    const count = Math.min(2, channelCount || channels.length);
    const pcm = channels.slice(0, count).map((buffer) => new Int16Array(buffer));
    const out = encodeMp3Bytes({
      Encoder: Mp3Encoder,
      channels: pcm,
      sampleRate,
      onProgress: (encoded, total) => self.postMessage({ type: 'progress', encoded, total }),
    });
    self.postMessage({ type: 'done', mp3: out.buffer }, [out.buffer]);
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'encoding failed',
    });
  }
};
