/** Shared speech request, retry, decoding, and chunk assembly. */

import { withRetry } from './retry.js';
import { createSpeech, decodeSpeechAudio } from './speech-client.js';
import { splitIntoChunks, DEFAULT_MAX_CHUNK_CHARS } from '../audio/segmenter.js';
import { assembleSegments, decodePcmS16Le, decodeToPcm } from '../audio/audio-assembler.js';

/**
 * Synthesize one provider-sized chunk into normalized PCM.
 * Dependencies remain injectable through feature controllers.
 */
export async function synthesizeSpeechChunk({
  provider,
  ttsModel,
  voice,
  input,
  speed,
  signal,
  targetSampleRate = 44100,
  speech = createSpeech,
  decode = decodeToPcm,
}) {
  const result = await withRetry(
    () => speech({ provider, ttsModel, voice, input, speed, signal }),
    { signal },
  );
  return decodeSpeechAudio(result, decode, targetSampleRate, decodePcmS16Le);
}

/** Synthesize arbitrarily long text and assemble its provider-sized chunks. */
export async function synthesizeSpeechText({
  input,
  maxChunkChars = DEFAULT_MAX_CHUNK_CHARS,
  targetSampleRate = 44100,
  ...request
}) {
  const parts = [];
  for (const chunk of splitIntoChunks(input, maxChunkChars)) {
    parts.push(await synthesizeSpeechChunk({
      ...request,
      input: chunk,
      targetSampleRate,
    }));
  }
  return assembleSegments(parts, targetSampleRate);
}
