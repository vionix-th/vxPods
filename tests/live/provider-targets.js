import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_CONFIG_PATH = 'tests/live/provider-targets.local.json';

/** Load explicit, git-ignored live targets without ever printing API keys. */
export function loadLiveProviderTargets({ required = false } = {}) {
  const path = resolve(process.env.VXPODS_LIVE_PROVIDER_CONFIG || DEFAULT_CONFIG_PATH);
  if (!existsSync(path)) {
    if (!required) return [];
    throw new Error(
      `Live provider configuration not found at ${path}. Copy tests/live/provider-targets.example.json to ${DEFAULT_CONFIG_PATH} and add real credentials.`,
    );
  }

  let document;
  try {
    document = JSON.parse(readFileSync(path, 'utf8'));
  } catch (cause) {
    throw new Error(`Live provider configuration at ${path} is not valid JSON.`, { cause });
  }
  return validateLiveProviderDocument(document);
}

export function validateLiveProviderDocument(document) {
  if (!Array.isArray(document?.targets) || document.targets.length === 0) {
    throw new Error('Live provider configuration requires a non-empty targets array.');
  }
  return document.targets.map((target, index) => validateTarget(target, index));
}

function validateTarget(target, index) {
  const field = (name) => {
    const value = target?.[name];
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Live provider target ${index + 1} requires ${name}.`);
    }
    return value.trim();
  };
  const baseUrl = field('baseUrl').replace(/\/+$/, '');
  let parsedUrl;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new Error(`Live provider target ${index + 1} has an invalid baseUrl.`);
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
    throw new Error(`Live provider target ${index + 1} must use HTTPS unless it targets localhost.`);
  }
  const textGeneration = Array.isArray(target.textGeneration)
    ? target.textGeneration.map((testCase, caseIndex) => validateTextCase(testCase, index, caseIndex))
    : [];
  const speechInput = Array.isArray(target.speech) ? target.speech : [];
  const speech = speechInput.map((testCase, caseIndex) => validateSpeechCase(testCase, index, caseIndex));
  if (textGeneration.length === 0 && speech.length === 0) {
    throw new Error(`Live provider target ${index + 1} requires textGeneration or speech test cases.`);
  }
  return {
    name: field('name'),
    baseUrl,
    apiKey: field('apiKey'),
    textGeneration,
    speech,
  };
}

function validateTextCase(testCase, targetIndex, caseIndex) {
  const api = testCase?.api;
  if (api !== 'chat-completions' && api !== 'responses') {
    throw new Error(`Live provider target ${targetIndex + 1} text case ${caseIndex + 1} requires chat-completions or responses.`);
  }
  return {
    api,
    model: requiredCaseString(testCase?.model, targetIndex, 'text', caseIndex, 'model'),
    input: optionalCaseString(testCase?.input, 'Reply with the word ok.'),
  };
}

function validateSpeechCase(testCase, targetIndex, caseIndex) {
  if (!Array.isArray(testCase?.voices) || testCase.voices.length === 0) {
    throw new Error(`Live provider target ${targetIndex + 1} speech case ${caseIndex + 1} requires at least one voice.`);
  }
  const voices = testCase.voices.map((voice, voiceIndex) => {
    if (typeof voice !== 'string' || !voice.trim()) {
      throw new Error(`Live provider target ${targetIndex + 1} speech case ${caseIndex + 1} voice ${voiceIndex + 1} is invalid.`);
    }
    return voice.trim();
  });
  return {
    model: requiredCaseString(testCase?.model, targetIndex, 'speech', caseIndex, 'model'),
    voices,
    responseFormat: validateResponseFormat(testCase, targetIndex, caseIndex),
    ...(testCase.responseFormat === 'pcm' ? { pcm: validatePcm(testCase.pcm, targetIndex, caseIndex) } : {}),
    input: optionalCaseString(testCase?.input, 'Live text to speech connectivity test.'),
  };
}

function validateResponseFormat(testCase, targetIndex, caseIndex) {
  if (testCase?.responseFormat !== 'mp3' && testCase?.responseFormat !== 'pcm') {
    throw new Error(`Live provider target ${targetIndex + 1} speech case ${caseIndex + 1} requires responseFormat mp3 or pcm.`);
  }
  return testCase.responseFormat;
}

function validatePcm(pcm, targetIndex, caseIndex) {
  if (!Number.isInteger(pcm?.sampleRate) || !Number.isInteger(pcm?.channels) || pcm?.encoding !== 's16le') {
    throw new Error(`Live provider target ${targetIndex + 1} speech case ${caseIndex + 1} requires PCM sampleRate, channels, and s16le encoding.`);
  }
  return { sampleRate: pcm.sampleRate, channels: pcm.channels, encoding: 's16le' };
}

function requiredCaseString(value, targetIndex, kind, caseIndex, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Live provider target ${targetIndex + 1} ${kind} case ${caseIndex + 1} requires ${field}.`);
  }
  return value.trim();
}

function optionalCaseString(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
