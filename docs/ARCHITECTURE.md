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
    state.js
    routes.js
  components/
    dialog.js
    error-message.js
    progress.js
    fields.js
    provider-select.js
    source-input.js
  features/
    providers/
      provider-form.js
      provider-store.js
    tts/
      tts-controller.js
      tts-view.js
    podcast/
      podcast-controller.js
      podcast-script.js
      podcast-view.js
  services/
    text-generation-client.js
    chat-completions-client.js
    responses-client.js
    provider-http.js
    speech-client.js
  storage/
    local-settings.js
    render-job-store.js
  audio/
    audio-assembler.js
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
- Delegate HTTP and persistence through feature controllers.
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

- Own serialization, parsing, validation, schema versions, migrations, quota errors, and cleanup.
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
 * @property {string} apiKey
 * @property {{ api: 'chat-completions'|'responses', models: string[] }} textGeneration
 */
```

Preset roots:

- OpenAI: `https://api.openai.com/v1`
- OpenRouter: `https://openrouter.ai/api/v1`
- Manual: user-provided HTTPS URL, normalized without a trailing slash

Routes:

```text
POST {baseUrl}/chat/completions
POST {baseUrl}/responses
POST {baseUrl}/audio/speech
```

Each configuration binds one text-generation API; users create a second configuration to use both routes with the same endpoint. A configuration is usable for TTS when its endpoint implements the OpenAI-compatible speech route. UI reports endpoint capability errors through normalized application error.

Speech requests explicitly set `response_format: 'mp3'`. This avoids endpoint-specific defaults, such as raw PCM, and gives every rendering path a consistently decodable response format.

Request clients return application results or throw a normalized `AppError`:

```js
/**
 * @typedef {Object} AppError
 * @property {'validation'|'auth'|'unsupported'|'rate-limit'|'network'|'offline'|'storage'|'schema'|'encoding'|'cancelled'|'provider'} kind
 * @property {string} message
 * @property {boolean} retryable
 * @property {number | undefined} status
 * @property {unknown | undefined} cause
 */
```

Raw provider response bodies remain request-scoped. Redacted local-development diagnostics preserve status and error category while credentials stay confined to authorization header.

## 7. Application state

Keep one in-memory state tree with explicit updates.

Top-level state:

```js
{
  mode: 'tts' | 'podcast',
  online: boolean,
  providers: ProviderConfig[],
  selectedTextProviderId: string | null,
  selectedTtsProviderId: string | null,
  tts: { /* source, settings, status, output */ },
  podcast: { /* source, preferences, script, job status */ }
}
```

Feature status values are finite and explicit:

```text
idle -> validating -> generating -> ready
                         |            |
                         v            v
                       failed      exporting
                         ^            |
                         |            v
                       retry <----- failed

Any active state -> cancelling -> cancelled
```

Illegal transitions fail in development and are ignored with a stable error in production.

## 8. Script schema

Generated and exported podcast scripts use JSON only. Canonical R1 shape:

```json
{
  "schemaVersion": 1,
  "title": "Example title",
  "language": "th",
  "format": "conversation",
  "sourceGrounded": true,
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

- `schemaVersion` equals `1`.
- `language` is a valid canonical BCP 47 tag that describes the source and spoken-script language.
- `format` is `solo` or `conversation`.
- One speaker for `solo`; exactly two for `conversation`.
- Speaker and segment IDs are unique, stable ASCII identifiers.
- Every segment references a declared speaker and contains non-whitespace text.
- `pauseAfterMs` is an integer from 0 through 5000.
- Segment order is array order.
- Unknown properties may be discarded during normalization; required properties may not be inferred except deterministic IDs.
- Exported script JSON contains canonical fields shown above.
- Imported script JSON is parsed and validated against the same canonical schema before replacing in-memory workflow state.

Model output enters as untrusted text, passes JSON isolation and schema validation, then renders through text APIs.

## 9. Podcast generation pipeline

```text
Source + preferences
  -> local validation
  -> API-neutral text-generation messages
  -> configured Chat Completions or Responses adapter
  -> JSON extraction
  -> schema validation/normalization
  -> optional user review/edit
  -> final validation
  -> create recoverable render job
  -> synthesize pending segments in order
  -> persist each completed segment
  -> assemble/encode requested output
  -> preview/download
  -> cleanup after successful export or explicit discard
```

Prompt construction lives in `features/podcast/podcast-script.js`. It must:

- State JSON schema and allowed speakers.
- Require source-grounded output.
- Constrain factual claims to supplied source.
- Ask for natural, speech-ready plain text.
- Preserve the source language and reject translation unless the source explicitly requests it.
- Allow script length to emerge from supplied source and model output; do not send a duration target.
- Keep source text clearly delimited from instructions.

One explicit stateless repair request may submit validation errors and prior output through the selected text-generation configuration. Further attempts require user action.

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
  schemaVersion: 8,
  providers: ProviderConfig[],
  selectedTextProviderId: string | null,
  selectedTtsProviderId: string | null,
  preferences: { mode: 'tts' | 'podcast' },
  promptTemplates: { /* valid per-template local overrides only; no duration target */ }
}
```

Each `ProviderConfig` includes a `textGeneration` object with one API identifier and a non-empty model list, plus non-empty `ttsModels` and a `voicesByTtsModel` list for each TTS model. These are user-managed UI options rather than inferred capabilities. A maintained local registry supplies voices when a known TTS model is added; unknown models receive an empty list. Empty lists persist and require a voice to be added before speech work can run. Version 6 records migrate to Chat Completions without changing their selection or model list. Version 8 preserves explicit voice lists, supplies registry voices for missing known-model mappings, and leaves missing unknown-model mappings empty. Read through validation; corrupt records fall back safely and semantic changes use sequential tested migrations.
Prompt defaults live in `features/podcast/prompt-templates.js`. Resolution uses a valid local override per template, otherwise bundled default. Source text, prior model output, validation errors, and credentials are runtime values only and are never persisted as template data.
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
- Startup removes data older than seven days unless currently active.
- Creating a new render requires explicit confirmation before replacing recoverable work.
- Cleanup occurs after successful export or explicit discard; export failure retains recovery data.
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
- API keys flow from local configuration to request authorization header.
- User/model strings enter DOM through text nodes or safe form values.
- File imports decode `.txt` and `.md` as data.
- Export filenames pass sanitization.
- Settings exposes provider management, prompt-template editing, and clear-local-data control.

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
- Storage migrations and expiry.
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

ADR states context, decision, consequences, considered alternatives, and migration effect.
