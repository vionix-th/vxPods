/** Feature-owned temporary voice-preview generation. */

import { synthesizeSpeechChunk } from '../../services/speech-renderer.js';
import { wavBlob } from '../../audio/wav-writer.js';

/**
 * @param {Object} args
 * @param {import('../../domain/provider-config.js').ProviderConfig} args.provider
 * @param {import('../../domain/provider-config.js').TtsModelConfig} args.ttsModel
 * @param {string} args.voice
 * @param {string} args.input
 * @param {number | undefined} [args.speed]
 * @returns {Promise<Blob>}
 */
export async function createVoicePreviewAudio({ provider, ttsModel, voice, input, speed }) {
  const decoded = await synthesizeSpeechChunk({
    provider,
    ttsModel,
    voice,
    input,
    speed,
    targetSampleRate: ttsModel.responseFormat === 'pcm' ? ttsModel.pcm.sampleRate : 44100,
  });
  return wavBlob(decoded);
}
