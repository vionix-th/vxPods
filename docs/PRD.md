# vxPods R1 Product Requirements

Status: Approved for implementation  
Release: R1  
Audience: General public  
License: MIT

## 1. Product summary

vxPods is a static, client-side application that turns source text into speech or a configurable one-to-eight-speaker podcast. Users bring an API key for OpenAI or an OpenAI-compatible endpoint. Provider credentials, preferences, reusable Podcast templates, and unfinished render state remain in browser storage.

R1 provides two focused workflows:

1. **Text to Speech** converts pasted or uploaded text directly into audio.
2. **Podcast** uses the configured Chat Completions or Responses API to create a source-anchored JSON script, then uses text-to-speech models to render its speaker turns and assemble final audio.

## 2. Product principles

- **Immediate:** A new user can understand both workflows from visible controls and concise supporting copy.
- **Local-first:** Generation payloads go directly from browser to endpoint selected for that operation.
- **Recoverable:** An interrupted podcast render can resume after page reload.
- **Transparent:** The application shows which provider, model, and step are active.
- **Controlled:** Users can review and edit a generated script before incurring TTS work, but review is optional.
- **Accessible:** Core workflows meet WCAG 2.2 AA on mobile and desktop.
- **Focused:** R1 centers direct speech and source-anchored podcast generation.

## 3. Goals

R1 must let users:

- Save reusable provider URL/API-key configurations locally.
- Select separate saved configurations for text generation and TTS.
- Paste text or import UTF-8 `.txt` and `.md` files.
- Generate direct speech from text.
- Generate a source-anchored podcast script for one through eight speakers.
- Save reusable format templates and speaker profiles while keeping generation-page edits temporary.
- Optionally inspect and edit the generated podcast script.
- Apply script-wide speaker name, role, and voice changes from canonical Generate or update script controls.
- Render, cancel, retry, and resume podcast audio generation.
- Preview generated audio.
- Export final audio as WAV or MP3.
- Export podcast scripts as JSON.
- Import a validated podcast script JSON file for review and rendering.
- After the application shell has loaded once, use non-generation features offline.

Requirements below define complete R1 feature surface. Additional product capabilities require a later scoped change.

## 4. Users and primary jobs

R1 targets general users who want to listen to written material or reshape it into a selected spoken format. Controls and copy assume first-time use of AI audio tools.

Primary jobs:

- “Read this text aloud so I can listen to it.”
- “Turn this essay or summary into an understandable spoken format.”
- “Let me control format, speakers, and voices before rendering.”
- “Let me recover a long render if the page closes or a request fails.”
- “Let me download audio and retain the structured script.”

## 5. Functional requirements

### FR-1 Provider configurations

- Users can create, edit, select, and delete saved configurations.
- Each configuration contains a user-visible name, base URL, and API key.
- Base URLs target an OpenAI-compatible `/v1` API root.
- R1 includes presets for OpenAI and OpenRouter plus a manual URL option.
- Each saved configuration selects one text-generation API (`chat-completions` or `responses`) and includes locally editable text-generation models plus canonical TTS model objects. Each TTS model owns its voices, requested MP3 or raw-PCM response format, and raw-PCM decoding metadata when applicable. Capabilities are not inferred from provider APIs; absent configurations and empty lists leave the affected model and voice selectors empty and disabled until configured.
- Configurations persist in `localStorage` until deleted by the user or browser.
- Text-generation and TTS selectors are independent and may reference different saved configurations.
- API keys remain visible and editable in provider settings after entry.
- A connection test reports success, authentication failure, CORS/network failure, unsupported endpoint, or invalid response.
- Credential handling keeps API keys inside selected request authorization and persisted configuration.

Acceptance:

- Reloading the page preserves saved configurations and current selections.
- Deleting a configuration removes it and clears any selection that references it.
- A malformed URL or empty key cannot be saved.
- A provider-required action with no saved configuration opens provider creation; saving selects the new configuration for that action and resumes it.
- Users can export every browser-local setting as JSON, including plaintext API keys, provider model/voice lists, selections, format templates, speaker profiles, and advanced prompt templates.
- Restoring a settings JSON file validates it first, then fully replaces all existing settings after confirmation; restore never merges records.

### FR-2 Source input

- Users can paste or type source text.
- Users can import one UTF-8 `.txt` or `.md` file.
- Imported Markdown is decoded and presented as editable source text; spoken output follows its text content.
- The interface shows filename when input came from a file.
- Users can replace or clear input before generation.
- The application displays character count and rejects empty or whitespace-only input.
- Input length is governed by provider and browser capacity; encountered limits are reported clearly.

Acceptance:

- Imported content remains editable.
- File selection accepts `.txt` and `.md`; unreadable selections produce an actionable error and retain current text.

### FR-3 Direct text-to-speech

- Users select a saved TTS configuration, model, voice, speed from 0.25 through 4.0 when supported, and output format.
- R1 calls an OpenAI-compatible `POST /audio/speech` endpoint.
- Users can cancel an active request.
- Generated audio can be played, paused, scrubbed, regenerated, and downloaded.
- Available downloads are WAV and MP3.
- Long input is split into ordered chunks when required by provider or configured request limits.
- Successful chunks remain available when failed chunks retry.

Acceptance:

- Output contains source content in original order.
- UI identifies failed chunk and offers retry or cancel.
- Download filename is stable, sanitized, and includes selected format.

### FR-4 Podcast preferences

Users can configure:

- A saved format template plus temporary editable format instructions.
- Intended audience.
- One through eight ordered speakers with stable IDs, names, and roles.
- Confirmation before removing a speaker from the generation draft.
- Reusable speaker profiles that copy an optional default name and role into a speaker draft.
- Voice assignment for each speaker.
- Text-generation model from the selected configuration.
- TTS model.
- Browser-local script and repair prompt templates. Bundled defaults apply until a valid local edit is saved.

Format templates and speaker profiles support create, read, update, delete, and explicit starter restoration in Settings. Selecting a saved record copies its values into the current generation draft; subsequent edits do not mutate the saved record and reset on reload. Speaker profiles do not store provider-specific voices.

Defaults:

- Conversation format instructions.
- Host and Expert speaker profiles.
- General audience.
- Source-anchored reasoning.
- One TTS request at a time.

The source establishes the script's subject, context, and central ideas. Generation represents the source's claims, evidence, quotations, events, and attribution faithfully while allowing analysis, interpretation, questioning, comparison, criticism, and clearly hypothetical illustrations. It does not falsely attribute material to the source or present invented quotations, evidence, events, or personal experiences as real. vxPods does not provide claim-level provenance verification.
Users may override prompt wording after an explicit warning; generated scripts still require normal JSON/schema validation.

Prompt behavior has explicit ownership:

- Global script instructions own the output contract, source integrity, source-language policy, sequential-audio constraints, and the goal of natural spoken output.
- The selected format owns discourse structure, participation relationships, interaction, and show-level delivery.
- Speaker roles guide each speaker's contribution and delivery within the selected format; the format remains authoritative when instructions conflict.
- Validation repair changes only what reported schema errors require and otherwise preserves valid script content and order.

### FR-5 Podcast script generation

- R1 calls the configured OpenAI-compatible `POST /chat/completions` or `POST /responses` endpoint.
- Model output must conform to the versioned JSON schema defined in `docs/ARCHITECTURE.md`.
- The application validates and normalizes output before enabling TTS rendering.
- Validation catches unknown speakers, missing text, empty segments, invalid field types, and schema-version mismatch.
- Invalid output can be repaired through one explicit model retry or regenerated by the user.
- Script review/edit is available but skippable.
- Script JSON can be downloaded before or after audio rendering.
- Exported JSON excludes provider credentials and internal recovery metadata.
- Users can import canonical script JSON without a text-generation configuration. The file is validated before replacing workflow state; replacing an existing script or unfinished render requires confirmation.

Acceptance:

- TTS rendering becomes available after script validation succeeds.
- Interactive formats develop the subject through responsive exchange rather than adjacent independent monologues. Narrative and Lecture use coherent non-interactive narrative or explanatory progression.
- Imported scripts open in review with the same rendering and export actions as generated scripts.
- Edits are revalidated before rendering.
- Speaker changes apply to the script-wide speaker definitions rather than individual turns; temporary voice previews do not create recoverable render work.
- Adding, removing, or reordering speakers after generation leaves the current script renderable and applies only to the next generation.
- Name, role, and voice changes may apply to an existing script only when the draft and script contain the same speaker-ID set.
- Script order and speaker assignments remain stable during rendering.

### FR-6 Podcast audio rendering

- Each script segment is synthesized using its assigned speaker voice.
- Segments render in script order with default concurrency of one and maximum concurrency of two.
- Progress shows completed, active, pending, and failed segment counts.
- Cancellation stops further requests and preserves completed segments.
- Failed segments can retry individually.
- Completed segments persist temporarily in IndexedDB.
- An unfinished render can resume after reload.
- Only one unfinished render is retained in R1.
- Final audio can be previewed and downloaded as WAV or MP3.
- Temporary render data can be discarded explicitly and is removed after the browser download is triggered or after expiry.

Acceptance:

- Resume reuses completed segments and continues pending work.
- Final audio follows script order and assigned voices.
- Recoverable segment data remains available after export failure.

### FR-7 Local recovery

- The application stores one active podcast job, validated script, preferences, and completed audio segments in IndexedDB.
- On startup, unfinished work produces a clear Resume/Discard choice; completed work is reassembled locally for preview/export without provider access.
- Recovery data expires after seven days of inactivity.

### FR-8 Offline behavior

- A minimal service worker caches the versioned application shell after first successful load.
- When offline, users can edit source text, edit recovered scripts, play recovered audio, export available data, and manage locally saved provider configurations.
- Generation controls are disabled with a clear offline explanation.
- Runtime-critical assets ship with static application build.

### FR-9 Error handling

Errors must distinguish:

- Invalid local input.
- Missing provider configuration.
- Authentication or permission failure.
- Unsupported model or endpoint.
- Rate limit.
- Provider validation failure.
- CORS or network failure.
- Offline state.
- Browser storage quota failure.
- Script-schema failure.
- Audio assembly or encoding failure.
- User cancellation.

Errors appear in a global, dismissible notification stack, preserve completed work, and provide a next action where one exists. Errors persist until dismissed; warnings and informational notifications close automatically. Provider failures include an initially collapsed technical-details disclosure containing only reportable, redacted context: error category, operation, endpoint without query or credentials, model, HTTP status, response content type, and provider request ID when supplied and exposed to the browser. API keys, authorization headers, request input, and raw response bodies never appear in this disclosure.

## 6. UX requirements

- One responsive application shell with Text to Speech and Podcast as primary modes.
- Provider management remains directly reachable from active workflow.
- Mobile layout supports every R1 task, including script editing, progress inspection, playback, and export.
- Touch targets are at least 44 by 44 CSS pixels.
- All functionality is keyboard operable.
- Focus order follows visual order; focus is restored after dialogs close.
- Live regions announce phase changes, failures, cancellation, and completion.
- Meaningful status combines color with text or iconography.
- Animations respect `prefers-reduced-motion`.
- Visual design follows the Vionix brand system specified in `docs/UX.md`.

## 7. Data and privacy

- Provider records, API keys, and current selections persist in `localStorage`.
- Temporary podcast render state uses IndexedDB.
- Network egress is limited to generation requests sent to provider endpoint selected for that operation.
- Application reads persisted keys when authorizing selected provider requests.
- Runtime code and fonts ship as first-party static assets.
- A local-data action lets users clear saved provider configurations and unfinished render data.

## 8. Compatibility and quality

- Latest stable Chrome, Edge, Firefox, and Safari are supported on desktop.
- Current Safari and Chromium-based browsers are supported on mobile.
- Minimum viewport width: 320 CSS pixels.
- Core workflows meet WCAG 2.2 AA.
- Production deployment consists of static build output.
- Browser-specific export failures preserve recoverable data and show actionable error.

## 9. R1 release criteria

R1 is complete when:

- All FR acceptance statements pass.
- Text to Speech and Podcast happy paths pass on desktop and mobile viewports.
- Reload recovery is verified during a partially completed podcast.
- WAV, MP3, and JSON downloads are verified with representative outputs.
- Offline shell behavior is verified after first online load.
- Keyboard-only and screen-reader smoke tests pass.
- Automated unit, integration, accessibility, and end-to-end checks pass.
- Explicitly enabled live checks can exercise configured text-generation API/model cases and TTS model/voice cases through both the application request clients and a real browser without committing credentials.
- Production build succeeds from a clean checkout.
- Documentation matches shipped behavior.
