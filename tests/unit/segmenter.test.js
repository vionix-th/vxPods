import { describe, it, expect } from 'vitest';
import { splitIntoChunks, splitSentences } from '../../src/audio/segmenter.js';

describe('splitIntoChunks', () => {
  it('returns empty for blank input', () => {
    expect(splitIntoChunks('   \n ')).toEqual([]);
  });

  it('returns short text as one chunk', () => {
    expect(splitIntoChunks('hello world', 100)).toEqual(['hello world']);
  });

  it('splits at paragraph boundaries when possible', () => {
    const text = `${'a'.repeat(60)}\n\n${'b'.repeat(60)}`;
    const chunks = splitIntoChunks(text, 80);
    expect(chunks).toEqual(['a'.repeat(60), 'b'.repeat(60)]);
  });

  it('joins small paragraphs up to the limit', () => {
    const text = 'aaaa\n\nbbbb\n\ncccc';
    const chunks = splitIntoChunks(text, 11);
    expect(chunks).toEqual(['aaaa\n\nbbbb', 'cccc']);
  });

  it('splits long paragraphs at sentence boundaries', () => {
    const text = `${'a'.repeat(30)}. ${'b'.repeat(30)}. ${'c'.repeat(30)}.`;
    const chunks = splitIntoChunks(text, 40);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(40);
    }
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toContain('a'.repeat(30));
  });

  it('hard-splits words when no boundary exists', () => {
    const text = 'x'.repeat(100);
    const chunks = splitIntoChunks(text, 30);
    expect(chunks.length).toBe(4);
    expect(chunks.join('')).toBe('x'.repeat(100));
  });

  it('preserves content order', () => {
    const sentences = Array.from({ length: 20 }, (_, i) => `Sentence number ${i} here.`);
    const text = sentences.join(' ');
    const chunks = splitIntoChunks(text, 60);
    const reassembled = chunks.join(' ');
    for (const s of sentences) {
      expect(reassembled).toContain(s);
    }
    const indexes = sentences.map((s) => reassembled.indexOf(s));
    expect([...indexes].sort((a, b) => a - b)).toEqual(indexes);
  });
});

describe('splitSentences', () => {
  it('splits on terminal punctuation', () => {
    expect(splitSentences('One. Two! Three?')).toEqual(['One.', ' Two!', ' Three?']);
  });

  it('returns whole text without punctuation', () => {
    expect(splitSentences('no punctuation')).toEqual(['no punctuation']);
  });
});
