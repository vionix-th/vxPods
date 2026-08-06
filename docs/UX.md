# vxPods R1 UX Specification

Status: Approved baseline  
Target: Responsive mobile and desktop web application, WCAG 2.2 AA

## 1. Experience goal

vxPods should feel like a focused audio workbench: calm, direct, and trustworthy. Users should always know what they provided, which provider will receive it, what generation step is active, and what they can do next.

R1 optimizes for completing one active task from source through export.

## 2. Information architecture

Single application shell:

```text
Header
  Topbar: "A Vionix Consulting product" + vionix.cloud/GitHub links
  Branding: Vionix vxPods identity (two-tone, links to vionix.cloud)
  Provider settings

Hero band (light background)
  Product description + brief workflow orientation

Primary mode switch (pill buttons, active = brand fill)
  Text to Speech
  Podcast

Active workflow
  Cards with concise titles; podcast stepper communicates workflow position
  Source
  Settings
  Generate
  Progress/result

Footer
  Brand band: Vionix vxPods sitename, local-data/privacy statement, right-aligned Clear local data action
  Copyright/license line
```

Mode changes preserve current input in each mode for current browser session.

## 3. Text-to-Speech workflow

### Step 1: Source

- Large labeled text area: “Text to speak”.
- Secondary actions: “Import .txt or .md” and “Clear”.
- Character count below field.
- Imported filename shown as removable metadata alongside editable content.

### Step 2: Voice settings

- TTS provider configuration.
- Model identifier.
- Voice identifier or supported known choices.
- Speed control only when supported by selected request contract.
- Desired download format: WAV or MP3.

Advanced fields stay collapsed unless needed. Manual model/voice entry remains possible because compatible endpoints may expose different identifiers.

### Step 3: Generate and result

- Primary action: “Generate speech”.
- While active: progress summary and “Cancel”.
- On partial chunk failure: completed count, failed chunk, “Retry”, and “Cancel”.
- On success: native audio player, “Download WAV” or “Download MP3”, and “Generate again”.

Changing source or voice after generation retains output and labels it with generation settings used.

## 4. Podcast workflow

R1 presents a compact stepper. Completed steps remain editable until rendering begins.

### Step 1: Add source

Same input behavior as Text to Speech. Supporting copy: “vxPods uses this source to write a factual, conversational script.”

### Step 2: Shape podcast

Essential controls:

- Format: Solo or Conversation.
- Tone.
- Audience.
- Chat and TTS providers.
- Advanced settings disclosure: chat/TTS model identifiers and speaker cards with name, role, and assigned voice. Values display editable defaults and accept provider-supported custom identifiers.

Conversation displays exactly two speaker cards. Solo displays one. Defaults let users continue with every required field populated.

### Step 3: Generate script

- Summary names selected Chat provider/model.
- Primary action: “Generate script”.
- Status explains “Writing and validating JSON script”.
- Invalid output offers “Repair script” once; then “Generate again”.

### Step 4: Review or skip

After validation:

- Show title, speakers, segment count, and approximate spoken length.
- Default view presents ordered editable speaker turns.
- “Edit script” enables segment text editing.
- “Download JSON” exports canonical script.
- Primary action: “Render audio”.

Review is optional: users may render immediately. Raw JSON editing is excluded from R1 because it creates avoidable schema errors. JSON remains download format.

### Step 5: Render

Render view shows:

- Overall completed/total segments.
- Current speaker and segment number.
- Pending, failed, and completed counts.
- “Cancel remaining”.
- Retry action beside a failed segment or compact failure summary.
- Clear statement that completed audio is preserved locally.

Screen-reader announcements cover phase changes, failures, cancellation, and completion.

### Step 6: Preview and export

- Native audio player.
- “Download WAV”.
- “Download MP3”.
- “Download script JSON”.
- “Start over” with confirmation when recoverable data would be removed.

## 5. Recovery experience

On startup with one unfinished render:

- Show non-dismissible-by-accident recovery panel before starting another podcast.
- State title if available, completion count, last-updated time, and required provider/model.
- Actions: “Resume render” and “Discard”.
- Discard requires confirmation because completed segments will be removed.
- Missing saved provider configuration blocks resume and links directly to provider settings while preserving work.

## 6. Provider settings

Provider settings use one responsive dialog or full-height mobile sheet.

Saved configuration list:

- Name.
- Normalized base URL.
- Masked credential state: “Key saved”.
- Edit and delete actions.

Configuration form:

- Preset: OpenAI, OpenRouter, Manual.
- Name.
- Base URL.
- API key with Show/Hide toggle.
- “Test Chat” and “Test Speech” actions when useful.
- Save.

Explain once: “Configurations stay in this browser and requests go directly to the selected provider.”

Chat and TTS selectors elsewhere display saved configuration name plus endpoint host. An unsupported speech endpoint reports failure without changing saved configuration.

When an action needs an unavailable provider configuration, provider settings opens directly on the creation form. Saving selects that configuration for the required Chat or TTS slot and resumes the action.

## 7. Responsive behavior

### Mobile: 320–767 px

- Single column.
- Sticky bottom primary action may be used when it does not cover errors or audio controls.
- Provider settings uses full-height sheet/dialog.
- Speaker cards stack.
- Progress details collapse behind a labeled disclosure.
- Long URLs and model names wrap or truncate with accessible full value.
- Workflow content reflows within viewport width.

### Tablet: 768–1023 px

- Single main column with wider settings groups.
- Speaker cards may use two columns when readable.

### Desktop: 1024 px and above

- Source and settings may form a two-column work area.
- Main content width stays bounded for readable text and clear hierarchy.
- Result/progress remains close to primary action.

Breakpoints follow content needs.

## 8. Vionix visual system

Follow current `vionix.cloud` language while adapting it from marketing page to application UI.

Core tokens:

```css
:root {
  --color-brand: #106eea;
  --color-brand-dark: #0b56b3; /* AA-safe small text on soft pill tints */
  --color-bg: #ffffff;
  --color-bg-subtle: #f5f9ff;
  --color-surface: #ffffff;
  --color-text: #444444;
  --color-heading: #222222;
  --color-on-brand: #ffffff;
  --radius-card: 14px;
  --radius-control: 6px;
  --radius-pill: 999px; /* primary CTAs, kickers, mode switch */
  --shadow-card: 0 0 25px 0 rgb(0 0 0 / 0.1);
  --shadow-cta: 0 8px 18px rgb(16 110 234 / 0.28);
}
```

Typography direction:

- Headings: Montserrat or bundled/system-compatible fallback.
- Body: Roboto or system sans-serif fallback.
- Navigation/compact labels: Open Sans or system sans-serif fallback.
- Runtime-critical fonts ship locally or resolve through system fallback.

Application adaptation:

- White and pale-blue backgrounds.
- Blue used for primary actions, focus, selected state, and restrained highlights.
- Dark neutral headings and readable medium-neutral body text.
- Cards use light border, 14 px radius, restrained shadow, and optional thin blue top accent.
- Motion remains restrained and functional; visual depth comes from brand color, spacing, borders, and subtle shadow.
- Maintain professional visual hierarchy through spacing, typography, and state clarity.

## 9. Component behavior

### Buttons

- One primary action per active step.
- Destructive actions use explicit labels such as “Discard render”.
- Disabled generation includes nearby reason.
- Loading buttons retain width and visible action label.

### Forms

- Labels remain visible; placeholders are examples only.
- Help and error text appears below relevant control.
- Validation occurs on submit and, after first error, on correction.
- Required state is conveyed in text and semantics.
- Model and voice fields accept manual identifiers alongside known defaults.

### Dialogs

- Labeled title, predictable close action, trapped modal focus, Escape support when safe, and focus restoration.
- Destructive confirmation dialogs require explicit button choice.

### Notifications

- Errors, warnings, and informational outcomes display in a global toast stack rather than inline workflow blocks.
- Every toast has an explicit close control.
- Errors remain visible until dismissed. Warnings and informational notifications auto-close after six seconds and pause while hovered or focused.
- Error copy includes what failed and next useful action.
- User-facing UI presents normalized error category and action.

### Progress

- Use determinate progress when total segments are known.
- Pair visual indicator with text such as “12 of 38 segments”.
- Indeterminate work pairs animation with textual active-state label.

## 10. Accessibility acceptance

- WCAG 2.2 AA contrast for text, controls, focus, and meaningful graphics.
- Minimum 44 by 44 CSS pixel pointer targets for primary interactive controls.
- Visible focus indicator on every interactive element.
- Semantic landmarks: header, nav where applicable, main, footer.
- One visible page heading; logical heading order.
- All inputs have labels and described errors.
- Mode control and stepper expose current selection/step.
- Dialog focus behavior works with keyboard and screen reader.
- Audio controls have accessible name and keyboard operation.
- Status announcements cover meaningful phase changes.
- Reduced-motion preference removes nonessential movement.
- 200% zoom and 320 px reflow preserve workflow in one scrolling direction.
- Status, speaker, and error meaning combine color with text or semantics.

## 11. Content style

- Plain English first.
- Use “provider”, “model”, “voice”, and “script” consistently.
- Explain technical failures in user terms while retaining useful status codes where relevant.
- State local persistence directly: “Saved in this browser.”
- State network destination at point of action: “Generate with {configuration name}.”
- Describe key persistence and provider data flow factually.

Examples:

- “Speech endpoint not supported at this URL. Choose another TTS configuration.”
- “Rate limit reached. Retry available in 24 seconds.”
- “Browser storage is full. Download or discard completed audio, then retry.”

## 12. UX release checklist

- New user can configure OpenAI and generate speech from visible interface guidance.
- User can identify separate Chat and TTS configurations.
- Podcast can be rendered directly after script validation.
- User can edit speaker turns through structured editor.
- Partial failure preserves and exposes completed work.
- Reload recovery is clear and cannot be overwritten accidentally.
- Export choices are WAV, MP3, and JSON.
- Mobile workflow exposes same actions as desktop.
- Keyboard, screen-reader smoke test, zoom/reflow, and reduced-motion checks pass.
