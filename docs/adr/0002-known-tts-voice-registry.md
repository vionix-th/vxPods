# ADR 0002: Consolidate TTS capabilities by model

Status: Accepted
Date: 2026-08-07

## Context

Provider model listings do not define portable speech voice or output-format capabilities. Separate model and voice maps can drift, and a format string alone cannot decode headerless PCM because its sample rate and channel count are not carried in the response.

## Decision

Store one canonical object per TTS model containing `model`, `voices`, and `responseFormat`. A raw-PCM model also contains `pcm.sampleRate`, `pcm.channels`, and fixed `pcm.encoding: 's16le'`. Every speech request sends the configured response format. MP3 and PCM converge to the same internal floating-point PCM representation before preview, assembly, WAV export, or MP3 export.

Known OpenAI presets seed MP3 objects and voice suggestions. Unknown models begin as MP3 with an empty voice list. Speech generation and voice previews reject a model with no selected voice.

## Consequences

Users must add a voice before using unknown models and must supply accurate raw-PCM metadata when selecting PCM. Incorrect metadata produces incorrect playback speed, channel layout, or an alignment error. Capabilities remain explicit and testable without changing the transparent export workflow.

## Alternatives considered

- Provider-level response format: rejected because compatible providers can expose MP3 and PCM models together.
- Parallel model, voice, and format maps: rejected because related capability data can drift.
- Query provider capabilities: rejected because OpenAI-compatible APIs do not define a portable capability endpoint.

## Migration and rollback

The product is pre-release. Settings schema is reset to version 1 and render-job schema to version 2; superseded records are discarded with no migration or backward-compatibility path. Rollback requires clearing local data or explicitly recreating configuration in the older shape.
