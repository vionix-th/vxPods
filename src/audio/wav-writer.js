/**
 * WAV (RIFF/WAVE) writer for 16-bit PCM data. Pure functions, no DOM.
 */

/**
 * Encode PCM samples into a WAV file byte sequence.
 * @param {Object} args
 * @param {Float32Array[] | Int16Array[]} args.channels channel sample arrays,
 *   each of identical length. Float input is clamped to [-1, 1].
 * @param {number} args.sampleRate
 * @param {'float32'|'int16'} [args.inputFormat] defaults by array type
 * @returns {Uint8Array} complete RIFF/WAVE file
 */
export function encodeWavPcm16({ channels, sampleRate, inputFormat }) {
  if (!Array.isArray(channels) || channels.length === 0) {
    throw new Error('encodeWavPcm16: at least one channel required');
  }
  const numChannels = channels.length;
  const length = channels[0].length;
  for (const ch of channels) {
    if (ch.length !== length) {
      throw new Error('encodeWavPcm16: channel lengths differ');
    }
  }
  const bytesPerSample = 2;
  const dataSize = length * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      const sample = channels[ch][i];
      const int16 =
        channels[ch] instanceof Int16Array || inputFormat === 'int16'
          ? sample
          : floatToInt16(sample);
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }
  return new Uint8Array(buffer);
}

/**
 * Convenience wrapper returning a Blob.
 * @param {Parameters<typeof encodeWavPcm16>[0]} args
 * @returns {Blob}
 */
export function wavBlob(args) {
  return new Blob([encodeWavPcm16(args)], { type: 'audio/wav' });
}

/**
 * @param {number} sample
 * @returns {number}
 */
function floatToInt16(sample) {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

/**
 * @param {DataView} view
 * @param {number} offset
 * @param {string} text
 */
function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
