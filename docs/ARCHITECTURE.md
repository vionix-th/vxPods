# vxPods R1 Architecture

Status: Approved baseline  
Scope: Static client-side browser application

## 1. Architecture goals

- Keep R1 understandable to an engineer or coding agent in one reading.
- Isolate external API calls, browser persistence, and audio processing from UI code.
- Support long-running renders through persistent segment checkpoints.
- Preserve completed work across reloads and partial failures.
- Use browser standards first; add dependencies only where browsers lack a portable capability.

## 2. Technology baseline

- Vite static build.
- Semantic HTML.
- Modern CSS with custom properties and component classes.
- Vanilla JavaScript ES modules.
- JSDoc types for public module contracts and stored data.
- Native DOM APIs; small render/component functions rather than a UI framework.
- `fetch`, `AbortController`, File API, Web Audio API, Web Workers where processing would block UI, `localStorage`, IndexedDB, and Service Worker APIs.
- Vitest for unit/integration tests.
- Playwright for browser and accessibility-flow tests.
- MP3 encoding uses one isolated dependency for portable output across supported browsers:
  `@breezystack/lamejs` (maintained lamejs fork), wrapped by `src/audio/mp3-encoder.js`
  and runnable inside `src/workers/audio-worker.js`.

Changes to technology baseline require an approved architecture decision.

## 3. System context

```text
User
  |
  v
Static vxPods application
  |-- localStorage: provider configurations + preferences + prompt-template overrides
  |-- IndexedDB: one recoverable render job + audio segments
  |-- Cache Storage: versioned application shell
  |
  |-- Text generation request -> selected Chat Completions or Responses endpoint
  `-- Speech requests ---------> selected OpenAI-compatible endpoint
```

Vionix hosting serves static files only. The browser calls user-selected provider endpoints directly. Successful generation therefore depends on endpoint support for browser CORS, supplied credentials, requested models, and required routes.

## 4. Source layout

Target layout:

```text
src/
  app/
    bootstrap.js
    online-state.js
    state.js
    routes.js
  components/
    dialog.js
    error-message.js
    progress.js
    fields.js
    provider-select.js
    source-input.js
    voice-preview.js
  domain/
    podcast-templates.js
    podcast-script-schema.js
    prompt-templates.js
    provider-config.js
  features/
    providers/
      provider-capability-editors.js
      provider-data-settings.js
      provider-form.js
      provider-store.js
    tts/
      tts-controller.js
      tts-view.js
      voice-preview-controller.js
    podcast/
      podcast-controller.js
      podcast-script-review.js
      podcast-script.js
      podcast-speaker-settings.js
      podcast-template-settings.js
      podcast-template-store.js
      podcast-view.js
  services/
    text-generation-client.js
    chat-completions-client.js
    responses-client.js
    provider-http.js
    speech-client.js
    speech-renderer.js
  storage/
    local-settings.js
    render-job-store.js
  audio/
    audio-assembler.js
    mp3-core.js
    mp3-encoder.js
    wav-writer.js
    segmenter.js
  utils/
    download.js
  workers/
    audio-worker.js
  styles/
    tokens.css
    base.css
    components.css
    app.css
  main.js
  service-worker.js
tests/
  unit/
  integration/
e2e/
```

Create each folder with its first owned module.

## 5. Module boundaries

### UI modules

- Own DOM creation, event binding, focus management, and presentation state.
- Receive data and callbacks through explicit parameters.
- Reusable components do not import feature stores, services, or persistence.
- Feature views coordinate through feature controllers and feature-owned facades; they do not implement HTTP, codecs, or storage contracts.
- Insert source, model, provider, and error text through `textContent` or safe form properties.

### Feature controllers

- Coordinate one user workflow.
- Validate inputs before calling services.
- Translate service/storage failures into stable application error categories.
- Own cancellation and state transitions.
- Delegate endpoint construction, IndexedDB transactions, and audio codecs to owning modules.

### Service clients

- Own request construction, endpoint paths, headers, response parsing, timeouts, and provider error normalization.
- Implement only configured OpenAI-compatible Chat Completions, Responses, and Speech contracts.
- Accept provider configuration and request payload as explicit inputs.

### Storage modules

- Own serialization, parsing, current-schema validation, schema versions, quota errors, and cleanup.
- Persist domain records and Blob data.
- Create and revoke object URLs at UI boundaries.

### Audio modules

- Own decoding, ordered assembly, silence insertion, WAV writing, and MP3 encoding.
- Run CPU-heavy encoding outside the main thread where supported.
- Expose progress and cancellation without knowing UI structure.

## 6. Provider contract

R1 uses one shared configuration record:

```js
/**
 * @typedef {Object} ProviderConfig
 * @property {string} id
 * @property {string} name
 * @property {string} baseUrl // normalized API root ending in /v1
 * @property {'none'|'bearer'} auth
 * @property {string} apiKey // empty when auth is 'none'
 * @property {{ api: 'chat-completions'|'responses', jsonResponseFormat: 'json_object'|'json_schema', jsonSchemaWireFormat: 'openai'|'json_object_schema', models: string[] }} textGeneration
 * @property {{ storeMode: 'omit'|'false', timeoutMs: number, temperature: number|null, maxOutputTokens: number|null, headers: { name: string, value: string }[] }} requestOptions
 * @property {{ model: string, voices: string[], responseFormat: 'mp3'|'pcm', pcm?: { sampleRate: number, channels: number, encoding: 's16le' } }[]} ttsModels
 */
```

Preset roots:

- OpenAI: `https://api.openai.com/v1`
- OpenRouter: `https://openrouter.ai/api/v1`
- Manual: user-provided HTTP or HTTPS URL, normalized without a trailing slash

Routes:

```text
POST {baseUrl}/chat/completions
POST {baseUrl}/responses
POST {baseUrl}/audio/speech
```

Each configuration binds one text-generation API; users create a second configuration to use both routes with the same endpoint. Authentication is either bearer API key or none; legacy records infer bearer authentication when a key is present. HTTP endpoints are allowed for trusted local, VPN, and custom network services, and the settings UI warns that HTTP is unencrypted. A configuration is usable for TTS when its endpoint implements the OpenAI-compatible speech route. UI reports endpoint capability errors through normalized application error.

Speech requests always set `response_format` from the selected TTS model object. MP3 responses use browser decoding. Raw PCM models also declare sample rate, channel count, and `s16le` encoding because the provider byte stream has no container header; the audio boundary parses and resamples those bytes before the shared assembly/export pipeline.

Request clients return application results or throw a normalized `AppError`:

```js
/**
 * @typedef {Object} AppError
 * @property {'validation'|'auth'|'unsupported'|'rate-limit'|'network'|'offline'|'storage'|'schema'|'encoding'|'cancelled'|'provider'} kind
 * @property {string} message
 * @property {boolean} retryable
 * @property {number | undefined} status
 * @property {unknown | undefined} cause
 * @property {{ operation?: string, endpoint?: string, model?: string, status?: number, requestId?: string, contentType?: string, jsonResponseFormat?: string } | undefined} diagnostics
 */
```

Raw provider response bodies remain request-scoped. Normalized provider failures carry a bounded diagnostic record for the collapsed error disclosure and developer reports. It may contain operation, credential-free endpoint, model, requested JSON response format, HTTP status, response content type, and provider request ID. It never contains an API key, authorization header, request input, query string, or raw response body.

## 7. Application state

State is divided by owner rather than held in one global tree:

- TTS and Podcast controllers each own an observable workflow store.
- Podcast script generation and audio rendering use separate status fields because rendering can be recovered independently.
- Provider configuration and selections are exposed through the provider-store facade backed by local settings.
- One application-level online-state service owns browser connectivity listeners and publishes changes to mounted workflows.
- Mode is persisted through the provider-store facade; the router receives a persistence callback.

Feature status values are finite and explicit:

```text
idle -> validating -> generating -> ready
  |                               ^
  `-------------------------------' validated import/recovery
                         |            |
                         v            v
                       failed      exporting
                         ^            |
                         |            v
                         `-- retry  ready

Any active state -> cancelling -> cancelled
```

Status and related state changes are committed atomically. Illegal transitions throw in development and are rejected without mutating state in production. Reset, validated import, and recovery transitions are explicitly represented.

## 8. Script schema

Generated and exported podcast scripts use JSON only. Canonical R1 shape:

```json
{
  "schemaVersion": 1,
  "title": "Example title",
  "language": "th",
  "speakers": [
    {
      "id": "host",
      "name": "Host",
      "role": "Guides the discussion",
      "voice": "alloy"
    },
    {
      "id": "guest",
      "name": "Guest",
      "role": "Explains the source",
      "voice": "verse"
    }
  ],
  "segments": [
    {
      "id": "segment-0001",
      "speakerId": "host",
      "text": "Welcome to the discussion.",
      "pauseAfterMs": 350
    }
  ]
}
```

Validation rules:

- `schemaVersion` is `1`.
- `language` is a valid canonical BCP 47 tag that describes the source and spoken-script language.
- `format` is not part of the render contract; reusable format instructions are request-scoped generation input.
- `speakers` contains one through eight records independent of format instructions.
- Speaker and segment IDs are unique, stable ASCII identifiers.
- Every segment references a declared speaker and contains non-whitespace text.
- `pauseAfterMs` is an integer from 0 through 5000.
- Segment order is array order.
- Unknown properties may be discarded during normalization; required properties may not be inferred except deterministic IDs.
- Exported script JSON contains canonical fields shown above.
- Imported script JSON is parsed and validated against the same canonical schema before replacing in-memory workflow state.
- Unsupported imported scripts do not replace current workflow state.

The canonical v1 schema does not contain a source-grounding assertion. Existing v1 imports that contain a legacy `sourceGrounded` property remain valid because normalization discards unknown properties; new exports omit it. Source fidelity is a generation instruction rather than a claim-level provenance guarantee.

Model output enters as untrusted text, passes JSON isolation and schema validation, then renders through text APIs.

## 9. Podcast generation pipeline

```text
Source + Episode direction + Format + Audience + Cast
  -> local validation
  -> API-neutral editorial-planner messages
  -> configured Chat Completions or Responses adapter
  -> JSON extraction
  -> EpisodePlan validation/normalization
  -> optional user review, direct edit, or complete-plan revision
  -> API-neutral script-writer messages with approved plan
  -> configured text-generation adapter
  -> PodcastScript validation/normalization
  -> optional user review, direct edit, or complete-script revision
  -> final validation
  -> create recoverable render job
  -> synthesize pending segments in order
  -> persist each completed segment
  -> assemble persisted segments
  -> preview/download
  -> cleanup after browser download is triggered or explicit discard
```

Prompt construction lives in `features/podcast/podcast-script.js`. Planning must:

- Compose source, Episode direction, Format, Audience, and Cast as separately owned inputs.
- Make editorial selection and omission explicit without prescribing exact dialogue or turn order.
- Return the canonical session-only EpisodePlan contract and exactly one contribution for each current speaker.
- Treat delimited source material as untrusted reference content rather than model instructions.

Writing must:

- State JSON schema and allowed speakers.
- Treat the approved EpisodePlan as authoritative for editorial selection, progression, and episode-specific contributions.
- Keep the global system layer limited to the output contract, source integrity, prompt precedence, sequential-audio constraints, and natural spoken output.
- Compose temporary format instructions, audience, and speaker roles as separate request layers with explicit ownership: format governs structure, interaction, and show-level delivery; speaker roles guide individual contribution and delivery within that format; audience governs shared assumptions and explanatory depth.
- Use the source as the factual and topical foundation, represent it faithfully, and permit analysis, interpretation, questioning, comparison, criticism, and clearly hypothetical illustrations.
- Prohibit false attribution and invented quotations, evidence, events, or personal experiences presented as real; do not imply claim-level provenance verification.
- Treat delimited source material as untrusted reference content rather than model instructions.
- Ask for natural, speech-ready plain text without markdown, stage directions, embedded speaker labels, or simulated overlapping audio.
- Preserve the source language and reject translation unless the source explicitly requests it.
- Allow script length to emerge from supplied source and model output; do not send a duration target.
- Keep source text clearly delimited from instructions.

Script revision reuses the current writer context, then sends the current canonical script as untrusted prior assistant output and a session-only user request. It returns a complete replacement `PodcastScript`; schema validation is required before replacing workflow state. Revision does not alter an existing render job or its completed audio, which is marked stale against the replacement script.

One explicit stateless repair request is available independently for invalid EpisodePlan output and invalid PodcastScript output. Each submits validation errors and prior output through the selected text-generation configuration, treats prior output as untrusted data, requests the minimum validation correction, and prohibits unrelated content changes. A repaired plan stops for review rather than continuing to script writing automatically.

`EpisodePlan` is canonical only within the current browser session:

```js
{
  schemaVersion: 1,
  workingTitle: string,
  editorialGoal: string,
  listenerPromise: string,
  formatApproach: string,
  priorities: string[],
  exclusions: string[],
  speakerContributions: { speakerId: string, contribution: string }[],
  beats: { id: string, title: string, purpose: string }[],
  ending: string
}
```

It is not stored in IndexedDB, embedded in PodcastScript, or exported. Provider requests for planning, plan revision, writing, script revision, and repair receive independent abort signals. Writer retry reuses the last valid plan.

## 10. Speech and audio pipeline

### Segmentation

- Direct TTS source and podcast turns are split only when request-size limits require it.
- Prefer paragraph and sentence boundaries while preserving content order.
- Record chunk-to-source or chunk-to-segment relationship for retry and assembly.
- Use configurable conservative limits because provider/model limits may differ.

### Rendering

- Default concurrency is one; maximum is two.
- Every request has its own `AbortController`.
- Retry only retryable failures, at most three automatic attempts with bounded exponential delay.
- Rate-limit responses honor `Retry-After` when present.
- Cancellation prevents new work and preserves already persisted segments.

### Intermediate format

Prefer uncompressed or consistently decodable provider output for assembly. Decode segments, normalize sample rate/channel layout, then assemble ordered audio samples.

### Export

- WAV writer produces valid RIFF/WAVE headers and ordered PCM data.
- MP3 encoder is isolated behind one module and may run in a Web Worker.
- Main-thread MP3 fallback is limited to worker-construction failure; worker runtime failures are reported instead of repeating CPU-heavy work on the UI thread.
- Encoding exposes progress and cancellation.
- Final export may require a Blob and therefore remains subject to browser memory limits.
- Storage or memory failure preserves completed segment data and explains recovery options.
- Object URLs are revoked when replaced, downloaded, or view lifecycle ends.

Long-audio support consists of segment persistence, bounded request concurrency, recoverable progress, off-main-thread encoding, and explicit browser-capacity errors.

## 11. Persistence

### localStorage

One versioned document stores:

```js
{
  schemaVersion: 1,
  podcastTemplateCatalogVersion: 2,
  providers: ProviderConfig[],
  selectedTextProviderId: string | null,
  selectedTtsProviderId: string | null,
  preferences: { mode: 'tts' | 'podcast' },
  promptTemplates: { /* valid per-template local overrides only; no duration target */ },
  episodeDirectionTemplates: EpisodeDirectionTemplate[],
  formatTemplates: FormatTemplate[],
  speakerProfiles: SpeakerProfile[]
}
```

Each `ProviderConfig` includes a `textGeneration` object with one API identifier, one user-selected structured JSON protocol (`json_object` or `json_schema`), a JSON Schema wire format (`openai` or legacy `json_object_schema`), and a possibly empty model list. It also owns bounded request options: omit or send `store: false`, 30–600 second timeout, optional temperature 0–2, optional maximum output tokens, and validated additional non-Authorization headers. A null temperature omits the parameter from text-generation requests; it remains provider-scoped rather than model-scoped. These selections control the request shape for plan, script, and repair generation; the application does not retry a rejected request with another protocol. Provider records missing temperature normalize to 0.7, preserving previous request behavior. New preset configurations omit temperature. A TTS object owns its model identifier, voices, requested response format, and required raw-PCM metadata. These are user-managed options rather than inferred capabilities.
Settings schema 1 stores ordered reusable Episode directions, Formats, and speaker profiles with the current prompt suite. Episode directions are an additive v1 field: records and backups that omit it receive bundled starters, while an explicit empty collection remains empty. Unreadable, corrupt, or unsupported documents render safe defaults but remain untouched until explicit restore or clear-local-data replacement.
`podcastTemplateCatalogVersion` versions bundled Episode Direction, Format, and Speaker Profile content independently of the settings schema. A valid document or backup without the current catalog version receives a one-time replacement: records using bundled IDs are reset, all current starters are added, and custom records remain after starters unless their case-insensitive name owns a starter name. The migrated view is not written during a read; the current catalog version persists on the next settings save or explicit backup restore. Once current, deletions and edits persist until explicit starter restoration.
Episode Direction and Format templates contain stable ID, unique name, and instructions. Speaker profiles contain stable ID, unique label, optional default speaker name, and role; voices remain request-scoped. The Format and Speaker Profile catalogs contain seventeen flat starters—three independently editable variants for each of the five established types, plus two language-learning Vocabulary starters—with no family metadata or runtime inheritance. Language Learning directions and Vocabulary formats provide source-ordered bilingual sequences from paired vocabulary, optional paired example sentences, and separate target/native speaker assignment without adding a structured source schema.

```js
FormatTemplate = { id: string, name: string, instructions: string }
EpisodeDirectionTemplate = { id: string, name: string, instructions: string }
SpeakerProfile = { id: string, label: string, defaultSpeakerName: string, role: string }
```

Prompt defaults and their canonical contract live in `domain/prompt-templates.js`; bundled format, linguistic-interaction, and speaker-role prompts live in `domain/podcast-templates.js`. Each flat Format and Role starter contains its complete effective contract so editing, preview, export, and restoration never depend on hidden composition. Resolution uses a valid local override per message template, otherwise the bundled default. Script-wide tone is not a canonical preference: show-level delivery belongs to format instructions and individual delivery belongs to speaker roles. A role cannot change the selected format's participation structure. Overrides with unsupported placeholders are invalid. Prior model output, validation errors, and credentials are runtime values only and are never persisted as template data.

### Current Podcast draft

`localStorage` key `vxpods.podcast-draft` stores one separately versioned, non-portable current episode draft: source text, selected direction and Format IDs, copied temporary instructions, audience, selected models, speakers and voices, and review-plan preference. Validation is strict; unreadable, corrupt, or unsupported drafts are ignored and never overwritten implicitly. The draft is debounced on user edits, excluded from settings backup and restore, and removed only by New episode or Clear local data. Plans, scripts, raw model output, revision requests, and import-file metadata remain session-only.
The settings preview reads live Podcast view values and renders final script messages without persisting preview input or output.

### IndexedDB

Database stores one `RenderJob` plus segment Blob records keyed by job and segment ID:

```js
{
  schemaVersion: 1,
  id: string,
  createdAt: string,
  updatedAt: string,
  script: PodcastScript,
  settings: Object,
  segmentStates: Object,
  status: 'rendering' | 'cancelled' | 'failed' | 'ready'
}
```

- Writes are transactional where job state depends on a Blob write.
- Every loaded job validates its schema version, canonical script, immutable provider/model settings, timestamps, status, and exact segment-state keys before workflow code uses it.
- Resume and retry require the saved provider ID and always use the saved TTS model; changing the currently selected provider/model cannot alter a recovered render.
- Startup restores a completed job from its persisted segments without provider access; unfinished jobs offer Resume/Discard.
- Startup removes data older than seven days unless currently active.
- Creating a new render requires explicit confirmation before replacing recoverable work.
- Cleanup occurs after the UI triggers the browser download or after explicit discard; preparation, encoding, and download-trigger failures retain recovery data.
- A “Clear local data” operation removes both storage systems after confirmation.

## 12. Offline shell

Use a minimal service worker for offline application shell:

- Cache only hashed production assets and navigation fallback needed by the static app.
- Version cache names and delete obsolete caches on activation.
- Cache allowlist contains versioned static application assets; provider requests remain network-only.
- Prefer network for HTML update checks and cached hashed assets for stable resources.
- Production build registers service worker; development uses direct Vite asset loading.
- Offline state is communicated through a warning notification and disabled generation controls; the normal online state has no persistent indicator.
- Global notifications render outside modal workflows. Settings feedback renders through a reusable dialog-local notice component, keeping errors and outcomes visible within the native dialog top layer.

## 13. Security and privacy controls

Provider API keys use plaintext `localStorage`. Controls:

- Runtime scripts, styles, and fonts ship as first-party static assets.
- Content Security Policy restricts code and content sources while permitting HTTPS connections to configured endpoints.
- Bearer API keys flow from local configuration to request authorization headers; unauthenticated providers omit the authorization header.
- CSP permits direct HTTP and HTTPS provider requests. Browser mixed-content and CORS policies still apply when the hosted HTTPS application calls an HTTP endpoint.
- User/model strings enter DOM through text nodes or safe form values.
- File imports decode `.txt` and `.md` as data.
- Export filenames pass sanitization.
- Settings exposes provider management; Podcast format, speaker-profile, and advanced-prompt editing; backup/restore; and clear-local-data control.

## 14. Accessibility architecture

- Prefer native controls and landmarks.
- Dialogs use native `<dialog>` when behavior is consistently tested; otherwise one reusable accessible implementation.
- Every form control has persistent label and programmatic error association.
- Progress uses textual counts and one restrained live region.
- Tab-like mode switching follows WAI-ARIA Tabs behavior or uses ordinary links/buttons with simpler semantics.
- Audio uses native controls plus labeled application actions.
- Automated accessibility checks supplement keyboard and screen-reader smoke tests.

## 15. Testing strategy

Unit tests cover:

- URL normalization and provider-record validation.
- Request construction and error normalization.
- Source segmentation.
- Script parsing, schema validation, and normalization.
- State transitions.
- Storage validation and expiry.
- WAV headers and deterministic assembly ordering.
- Filename sanitization.

Integration tests cover:

- Mock both text-generation adapters with valid, invalid, refused, incomplete, and malformed output.
- Mock TTS success, partial failure, retry, cancellation, and rate limit.
- Resume from IndexedDB without regenerating completed segments.
- Storage quota and corrupt-record recovery.

End-to-end tests cover:

- Provider setup.
- Direct TTS happy path.
- Podcast generation, optional edit, render, JSON export, and audio export.
- Reload during partial render and resume.
- Offline shell and disabled generation.
- Keyboard-only completion at desktop and mobile viewports.

Tests use fixtures, intercepted requests, and synthetic credentials.

Opt-in live provider tests use a git-ignored local target document containing one or more provider roots and dedicated test keys. Each target defines independent text-generation cases—API route, model, and input—and speech cases using the same model, voice, response-format, and PCM metadata contract as application settings. The client layer verifies the production adapters. Chromium independently verifies browser CORS, text response shape, MP3 decoding, or raw PCM frame validity. The aggregate runner executes both layers even if one fails and returns failure if either layer fails. Live tests are excluded from normal test commands, perform billable provider requests only through an explicit command, and must not print API keys.

## 16. Deployment

- `npm run build` produces self-contained static output in `dist/`.
- GitHub Actions deploys the `main` branch to GitHub Pages. The workflow builds
  with the repository path as Vite's base URL, so project pages resolve assets
  and the service worker under `/<repository>/`.
- Hosting must serve correct JavaScript module, worker, audio, and service-worker MIME types.
- SPA navigation fallback is unnecessary unless real client-side routes are added.
- Service worker scope remains application root.
- Production release verifies HTTPS, CSP, cache update, and clean-checkout build.

## 17. Architecture change rule

Create ADR under `docs/adr/` for material changes to technology baseline, system boundaries, persistence model, external integrations, runtime dependencies, or public/stored contracts.

ADR states context, decision, consequences, considered alternatives, and data effect.
