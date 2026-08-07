import { describe, it, expect, vi, afterEach } from 'vitest';
import { encodeWavPcm16 } from '../../src/audio/wav-writer.js';
import { assembleSegments, decodePcmS16Le } from '../../src/audio/audio-assembler.js';
import { encodeMp3 } from '../../src/audio/mp3-encoder.js';

afterEach(() => vi.unstubAllGlobals());

describe('decodePcmS16Le', () => {
  it('deinterleaves signed samples and preserves native rate', () => {
    const bytes = new ArrayBuffer(8);
    const view = new DataView(bytes);
    [16384, -16384, 32767, -32768].forEach((value, index) => view.setInt16(index * 2, value, true));
    const result = decodePcmS16Le(bytes, { sampleRate: 24000, channels: 2, encoding: 's16le' });
    expect(result.sampleRate).toBe(24000);
    expect([...result.channels[0]]).toEqual([0.5, 32767 / 32768]);
    expect([...result.channels[1]]).toEqual([-0.5, -1]);
  });

  it('resamples and rejects incomplete frames', () => {
    const bytes = new ArrayBuffer(4);
    const view = new DataView(bytes);
    view.setInt16(0, 0, true);
    view.setInt16(2, 32767, true);
    expect(decodePcmS16Le(bytes, { sampleRate: 8000, channels: 1, encoding: 's16le' }, 16000).channels[0]).toHaveLength(4);
    expect(() => decodePcmS16Le(new ArrayBuffer(3), { sampleRate: 8000, channels: 1, encoding: 's16le' })).toThrow(/aligned/);
  });
});

describe('encodeWavPcm16', () => {
  it('writes a valid RIFF/WAVE header', () => {
    const bytes = encodeWavPcm16({
      channels: [new Float32Array([0, 0.5, -0.5, 1])],
      sampleRate: 44100,
    });
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
    expect(String.fromCharCode(...bytes.slice(12, 16))).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(44100);
    expect(String.fromCharCode(...bytes.slice(36, 40))).toBe('data');
    expect(view.getUint32(40, true)).toBe(4 * 2);
    expect(bytes.length).toBe(44 + 8);
  });

  it('clamps float samples to int16 range', () => {
    const bytes = encodeWavPcm16({ channels: [new Float32Array([1, -1, 2])], sampleRate: 8000 });
    const view = new DataView(bytes.buffer);
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
    expect(view.getInt16(48, true)).toBe(0x7fff);
  });

  it('interleaves channels', () => {
    const bytes = encodeWavPcm16({
      channels: [new Float32Array([1, 1]), new Float32Array([-1, -1])],
      sampleRate: 8000,
    });
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
    expect(view.getInt16(48, true)).toBe(0x7fff);
    expect(view.getInt16(50, true)).toBe(-0x8000);
  });

  it('rejects mismatched channel lengths', () => {
    expect(() =>
      encodeWavPcm16({ channels: [new Float32Array(2), new Float32Array(3)], sampleRate: 8000 }),
    ).toThrowError();
  });
});

describe('assembleSegments', () => {
  it('concatenates segments in order', () => {
    const { channels, totalSamples } = assembleSegments(
      [
        { channels: [new Float32Array([1, 1])] },
        { channels: [new Float32Array([2, 2, 2])] },
      ],
      1000,
    );
    expect(totalSamples).toBe(5);
    expect([...channels[0]]).toEqual([1, 1, 2, 2, 2]);
  });

  it('inserts silence for pauseAfterMs', () => {
    const { channels, totalSamples } = assembleSegments(
      [
        { channels: [new Float32Array([1])], pauseAfterMs: 100 },
        { channels: [new Float32Array([2])] },
      ],
      1000,
    );
    expect(totalSamples).toBe(1 + 100 + 1);
    expect(channels[0][0]).toBe(1);
    expect(channels[0][1]).toBe(0);
    expect(channels[0][101]).toBe(2);
  });

  it('keeps multi-channel layout', () => {
    const { channels } = assembleSegments(
      [{ channels: [new Float32Array([1]), new Float32Array([9])] }],
      1000,
    );
    expect(channels).toHaveLength(2);
    expect(channels[1][0]).toBe(9);
  });

  it('rejects channel-count mismatch', () => {
    expect(() =>
      assembleSegments(
        [
          { channels: [new Float32Array(1)] },
          { channels: [new Float32Array(1), new Float32Array(1)] },
        ],
        1000,
      ),
    ).toThrowError(/channel/);
  });

  it('rejects empty input', () => {
    expect(() => assembleSegments([], 1000)).toThrowError();
  });
});

describe('encodeMp3', () => {
  it('surfaces worker runtime failures without repeating work on the main thread', async () => {
    class FailingWorker {
      postMessage() {
        queueMicrotask(() => this.onmessage({
          data: { type: 'error', message: 'worker encoding failed' },
        }));
      }

      terminate() {}
      addEventListener() {}
      removeEventListener() {}
    }
    vi.stubGlobal('Worker', FailingWorker);
    await expect(encodeMp3({
      channels: [new Float32Array([0, 0.1])],
      sampleRate: 44100,
    })).rejects.toThrowError(/worker encoding failed/);
  });
});
