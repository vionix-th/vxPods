# vxPods

vxPods is a static, client-side web application for turning text into speech or a source-grounded podcast. It runs entirely in the browser and works with OpenAI or OpenAI-compatible API endpoints selected by the user.

## Features

- Convert pasted text or UTF-8 `.txt`/`.md` files into speech.
- Generate and optionally edit a one- or two-speaker podcast script.
- Render podcast segments with assigned voices and resume incomplete renders after a reload.
- Preview and download audio as WAV or MP3.
- Export podcast scripts as JSON.
- Save provider configurations, model/voice options, preferences, and prompt-template overrides locally in the browser.
- Continue using non-generation features offline after the application shell has loaded.

## Privacy and provider requests

vxPods has no server-side application component. Provider configurations and API keys are stored in the current browser's local storage; recoverable podcast-render data is stored in IndexedDB.

Generation requests are sent directly from the browser to the selected provider endpoint. The endpoint must support browser CORS and the OpenAI-compatible routes used by vxPods:

- `POST /v1/chat/completions`
- `POST /v1/responses`
- `POST /v1/audio/speech`

Do not use the application on an untrusted or shared browser profile with credentials that should remain private.

## Requirements

- Node.js (current LTS recommended)
- npm
- A supported modern browser: Chrome, Edge, Firefox, or Safari
- An API key and an OpenAI-compatible provider endpoint for generation

## Development

Install dependencies and start the Vite development server:

```sh
npm install
npm run dev
```

Create a production build:

```sh
npm run build
```

Run the test suites:

```sh
npm test
npm run test:e2e
```

### Live provider diagnostics

Live provider tests are opt-in because they send billable requests to real providers. Copy the example target file, then replace its placeholders with a dedicated test key and current text-model, TTS-model, and voice identifiers:

```sh
cp tests/live/provider-targets.example.json tests/live/provider-targets.local.json
npm run test:live
```

Each target can contain multiple `textGeneration` cases using either `chat-completions` or `responses`, plus multiple `speech` model objects with voices and `responseFormat`. PCM cases also declare `pcm.sampleRate`, `pcm.channels`, and `pcm.encoding: "s16le"`. The command exercises vxPods' production clients, then verifies browser CORS, text-response shape, and the configured MP3 or PCM contract in Chromium. Both phases run even when one fails, and the aggregate command fails when either phase fails. Each configured text case and speech voice performs two billable requests. To keep the credential file elsewhere, set `VXPODS_LIVE_PROVIDER_CONFIG` to its path. Never commit the populated file.

## Deployment

Pushing to `main` deploys the production build to GitHub Pages through
`.github/workflows/deploy-pages.yml`. In the repository settings, select
**GitHub Actions** as the Pages source before the first deployment.

## Project structure

```text
src/
  app/         Application bootstrap, routing, and state
  audio/       Segmenting, assembly, WAV writing, and MP3 encoding
  components/  Reusable DOM components
  features/    Provider, text-to-speech, and podcast workflows
  services/    OpenAI-compatible HTTP clients and error normalization
  storage/     Local storage and IndexedDB persistence
  styles/      Design tokens and application styles
  workers/     Background audio encoding
tests/         Unit and integration tests
e2e/           Playwright end-to-end and accessibility tests
docs/          Product, architecture, and UX specifications
```

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [UX specification](docs/UX.md)

## License

vxPods is licensed under the [MIT License](LICENSE).
