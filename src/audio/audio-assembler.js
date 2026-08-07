/**
 * Ordered audio assembly. Pure sample-level operations; decoding of
 * provider bytes happens at the caller boundary (Web Audio API).
 */

/**
 * @typedef {Object} PcmSegment
 * @property {Float32Array[]} channels channel arrays of identical length
 * @property {number} [pauseAfterMs] silence appended after this segment
 */

/**
 * Concatenate segments in order with silence gaps. Pure and deterministic.
 * All segments must already share sample rate and channel count.
 *
 * @param {PcmSegment[]} segments
 * @param {number} sampleRate
 * @returns {{ channels: Float32Array[], sampleRate: number, totalSamples: number }}
 */
export function assembleSegments(segments, sampleRate) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('assembleSegments: no segments');
  }
  const numChannels = segments[0].channels.length;
  let totalSamples = 0;
  for (const segment of segments) {
    if (segment.channels.length !== numChannels) {
      throw new Error('assembleSegments: channel count mismatch');
    }
    totalSamples += segment.channels[0].length;
    totalSamples += pauseSamples(segment.pauseAfterMs, sampleRate);
  }
  const channels = [];
  for (let ch = 0; ch < numChannels; ch += 1) {
    channels.push(new Float32Array(totalSamples));
  }
  let offset = 0;
  for (const segment of segments) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      channels[ch].set(segment.channels[ch], offset);
    }
    offset += segment.channels[0].length;
    offset += pauseSamples(segment.pauseAfterMs, sampleRate);
  }
  return { channels, sampleRate, totalSamples };
}

/**
 * @param {number | undefined} pauseMs
 * @param {number} sampleRate
 * @returns {number}
 */
function pauseSamples(pauseMs, sampleRate) {
  const ms = Number(pauseMs);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round((ms / 1000) * sampleRate);
}

let sharedAudioContext = null;

/**
 * Decode provider audio bytes into PCM channel arrays at a target sample rate.
 * Uses OfflineAudioContext so output rate is exact and resampling is
 * consistent across browsers.
 *
 * @param {ArrayBuffer} bytes
 * @param {number} [targetSampleRate]
 * @returns {Promise<{ channels: Float32Array[], sampleRate: number }>}
 */
export async function decodeToPcm(bytes, targetSampleRate = 44100) {
  const context = getAudioContext();
  const copy = bytes.slice(0); // decodeAudioData detaches its input
  const decoded = await context.decodeAudioData(copy);
  if (decoded.sampleRate === targetSampleRate) {
    return { channels: extractChannels(decoded), sampleRate: decoded.sampleRate };
  }
  const offline = new OfflineAudioContext(
    decoded.numberOfChannels,
    Math.ceil(decoded.duration * targetSampleRate),
    targetSampleRate,
  );
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  return { channels: extractChannels(rendered), sampleRate: targetSampleRate };
}

/** Decode headerless signed 16-bit little-endian interleaved PCM. */
export function decodePcmS16Le(bytes, format, targetSampleRate = format.sampleRate) {
  const frameBytes = format.channels * 2;
  if (bytes.byteLength === 0 || bytes.byteLength % frameBytes !== 0) {
    throw new Error('Raw PCM byte length is not aligned to complete sample frames.');
  }
  const frames = bytes.byteLength / frameBytes;
  const view = new DataView(bytes);
  const source = Array.from({ length: format.channels }, () => new Float32Array(frames));
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < format.channels; channel += 1) {
      source[channel][frame] = view.getInt16((frame * format.channels + channel) * 2, true) / 32768;
    }
  }
  if (format.sampleRate === targetSampleRate) return { channels: source, sampleRate: targetSampleRate };
  const outputLength = Math.max(1, Math.round(frames * targetSampleRate / format.sampleRate));
  const channels = source.map((samples) => {
    const output = new Float32Array(outputLength);
    for (let index = 0; index < outputLength; index += 1) {
      const position = index * format.sampleRate / targetSampleRate;
      const left = Math.min(Math.floor(position), frames - 1);
      const right = Math.min(left + 1, frames - 1);
      const fraction = position - left;
      output[index] = samples[left] + (samples[right] - samples[left]) * fraction;
    }
    return output;
  });
  return { channels, sampleRate: targetSampleRate };
}

/**
 * @param {AudioBuffer} buffer
 * @returns {Float32Array[]}
 */
function extractChannels(buffer) {
  const channels = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    // Copy: AudioBuffer storage is not guaranteed stable across reuse.
    channels.push(new Float32Array(buffer.getChannelData(ch)));
  }
  return channels;
}

/**
 * @returns {AudioContext}
 */
function getAudioContext() {
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContext();
  }
  return sharedAudioContext;
}
