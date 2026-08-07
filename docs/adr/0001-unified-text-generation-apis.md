# ADR 0001: Unified Text-Generation API Adapters

Status: Accepted; persistence migration superseded by ADR 0002
Date: 2026-08-06

## Context

vxPods generated Podcast scripts directly through Chat Completions. Supporting the Responses API by branching in the controller or UI would couple the workflow to provider wire formats. The selected route and locally managed model options also form part of the persisted provider contract.

## Decision

- Each provider configuration binds exactly one text-generation API: `chat-completions` or `responses`.
- A neutral text-generation client dispatches to API-specific adapters and returns normalized text and model metadata.
- API adapters own routes, request bodies, structured-output fields, and response parsing. Shared provider HTTP code owns authorization, offline detection, timeout, cancellation, network/CORS failures, and HTTP error normalization.
- Text-generation requests send `store: false`. Script repair remains stateless and does not use Responses continuation state.
- Model lists remain local, configuration-scoped hints. Changing API confirms before replacing the list with bundled API-specific defaults.
- At the time of this decision, settings schema version 7 replaced `chatModels` with `textGeneration` and `selectedChatProviderId` with `selectedTextProviderId`. ADR 0002 later reset the pre-release settings contract to version 1 and superseded that migration path.

## Consequences

- Podcast UI and controllers do not know the selected wire protocol.
- Users duplicate a configuration when they need both APIs for one endpoint and key.
- Endpoints that reject `store: false` are not compatible with the vxPods text-generation contract.
- Responses tools, streaming, conversations, `previous_response_id`, reasoning controls, multimodal input, and provider-side JSON Schema are not enabled by this decision.

## Alternatives considered

- Store both APIs and two model lists in one configuration. Rejected because it adds a second workflow choice and ambiguous active capability.
- Infer API/model support from `/models`. Rejected because model listings do not establish route or structured-output compatibility.
- Branch in the Podcast controller. Rejected because it places transport details in workflow coordination.

## Migration and rollback

Superseded by ADR 0002. Current pre-release builds discard unsupported settings schema versions rather than running the former version 6-to-7 migration. Rollback requires clearing local data or recreating configuration in the older shape.
