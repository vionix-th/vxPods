# ADR 0002: Maintain a local TTS voice registry

## Context

Provider model listings do not define portable speech-voice capabilities. Assigning one global voice list to every locally configured TTS model misrepresents unknown models and silently makes invalid choices available.

## Decision

Keep a versioned, local registry mapping known TTS model identifiers to their suggested voices. Adding or loading a missing mapping for a known model pre-fills that registry list. Unknown models receive and persist an empty voice list. Explicit saved voice lists always win, including an explicit empty list. Speech generation and voice previews reject a model with no selected voice.

Settings schema version 8 records this contract. The version 7-to-8 migration only changes missing mappings: known models receive registry voices and unknown models receive an empty list.

## Consequences

Users must add a voice before using unknown models. This is intentional: lists are local hints and are never inferred from a provider endpoint. Registry changes require source, regression-test, and documentation updates.

## Alternatives considered

- Keep universal default voices: rejected; gives unsupported suggestions to unknown models.
- Query provider capabilities: rejected; OpenAI-compatible APIs do not define a portable voice-capability endpoint.

## Migration and rollback

Migration preserves saved custom lists. Older clients reject schema version 8 settings. Rollback requires export or explicit conversion to version 7; such conversion cannot retain distinction between missing and intentionally empty voice mappings.
