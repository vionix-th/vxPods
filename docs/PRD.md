# vxPods R1 Product Requirements

Status: Approved for implementation  
Release: R1  
Audience: General public  
License: MIT

## 1. Product summary

vxPods is a static, client-side application that turns source text into speech or a two-speaker podcast. Users bring an API key for OpenAI or an OpenAI-compatible endpoint. Provider credentials, preferences, and unfinished render state remain in browser storage.

R1 provides two focused workflows:

1. **Text to Speech** converts pasted or uploaded text directly into audio.
2. **Podcast** uses a Chat Completions model to create a source-grounded JSON script, then uses text-to-speech models to render its speaker turns and assemble final audio.

## 2. Product principles

- **Immediate:** A new user can understand both workflows from visible controls and concise supporting copy.
- **Local-first:** Generation payloads go directly from browser to endpoint selected for that operation.
- **Recoverable:** An interrupted podcast render can resume after page reload.
- **Transparent:** The application shows which provider, model, and step are active.
- **Controlled:** Users can review and edit a generated script before incurring TTS work, but review is optional.
- **Accessible:** Core workflows meet WCAG 2.2 AA on mobile and desktop.
- **Focused:** R1 centers direct speech and source-grounded podcast generation.

## 3. Goals

R1 must let users:

- Save reusable provider URL/API-key configurations locally.
- Select separate saved configurations for Chat Completions and TTS.
- Paste text or import UTF-8 `.txt` and `.md` files.
- Generate direct speech from text.
- Generate a source-grounded podcast script for one or two speakers.
- Optionally inspect and edit the generated podcast script.
- Render, cancel, retry, and resume podcast audio generation.
- Preview generated audio.
- Export final audio as WAV or MP3.
- Export podcast scripts as JSON.
- After the application shell has loaded once, use non-generation features offline.

Requirements below define complete R1 feature surface. Additional product capabilities require a later scoped change.

## 4. Users and primary jobs

R1 targets general users who want to listen to written material or reshape it into a conversational audio format. Controls and copy assume first-time use of AI audio tools.

Primary jobs:

- “Read this text aloud so I can listen to it.”
- “Turn this essay or summary into an understandable conversation.”
- “Let me control tone, speakers, and voices before rendering.”
- “Let me recover a long render if the page closes or a request fails.”
- “Let me download audio and retain the structured script.”

## 5. Functional requirements

### FR-1 Provider configurations

- Users can create, edit, select, and delete saved configurations.
- Each configuration contains a user-visible name, base URL, and API key.
- Base URLs target an OpenAI-compatible `/v1` API root.
- R1 includes presets for OpenAI and OpenRouter plus a manual URL option.
- Configurations persist in `localStorage` until deleted by the user or browser.
- Chat Completions and TTS selectors are independent and may reference different saved configurations.
- API keys are masked after entry and can be replaced.
- A connection test reports success, authentication failure, CORS/network failure, unsupported endpoint, or invalid response.
- Credential handling keeps API keys inside selected request authorization and persisted configuration.

Acceptance:

- Reloading the page preserves saved configurations and current selections.
- Deleting a configuration removes it and clears any selection that references it.
- A malformed URL or empty key cannot be saved.
- A provider-required action with no saved configuration opens provider creation; saving selects the new configuration for that action and resumes it.

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

- Users select a saved TTS configuration, model, voice, speed when supported, and output format.
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

- Format: solo narration or two-speaker conversation.
- Tone.
- Intended audience.
- One or two speaker names and roles.
- Voice assignment for each speaker.
- Chat Completions model.
- TTS model.

Defaults:

- Two-speaker conversation.
- Conversational tone.
- General audience.
- Source-grounded generation.
- One TTS request at a time.

Source-grounded generation is mandatory in R1. Factual claims must remain traceable to supplied source. Natural transitions, introductions, and summaries may connect or restate source material.

### FR-5 Podcast script generation

- R1 calls an OpenAI-compatible `POST /chat/completions` endpoint.
- Model output must conform to the versioned JSON schema defined in `docs/ARCHITECTURE.md`.
- The application validates and normalizes output before enabling TTS rendering.
- Validation catches unknown speakers, missing text, empty segments, invalid field types, and schema-version mismatch.
- Invalid output can be repaired through one explicit model retry or regenerated by the user.
- Script review/edit is available but skippable.
- Script JSON can be downloaded before or after audio rendering.
- Exported JSON excludes provider credentials and internal recovery metadata.

Acceptance:

- TTS rendering becomes available after script validation succeeds.
- Edits are revalidated before rendering.
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
- Temporary render data can be discarded explicitly and is removed after successful export or expiry.

Acceptance:

- Resume reuses completed segments and continues pending work.
- Final audio follows script order and assigned voices.
- Recoverable segment data remains available after export failure.

### FR-7 Local recovery

- The application stores one active podcast job, validated script, preferences, and completed audio segments in IndexedDB.
- On startup, recoverable work produces a clear Resume/Discard choice.
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

Errors appear in a global, dismissible notification stack, preserve completed work, and provide a next action where one exists. Errors persist until dismissed; warnings and informational notifications close automatically.

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
- Production build succeeds from a clean checkout.
- Documentation matches shipped behavior.
