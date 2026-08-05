import { describe, it, expect } from 'vitest';
import { encodeWavPcm16 } from '../../src/audio/wav-writer.js';
import { assembleSegments } from '../../src/audio/audio-assembler.js';

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
