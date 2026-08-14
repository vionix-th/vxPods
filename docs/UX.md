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
  Brand band: Vionix vxPods sitename
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
- TTS model select, with options from the selected provider configuration.
- Voice select, with options for the selected TTS model in the selected provider configuration.
- Provider settings expose MP3 or raw PCM per TTS model. Raw PCM additionally requires sample rate and channel count; `s16le` is displayed as the fixed supported encoding.
- Compact Preview action beside Voice; temporary inline audio uses the selected provider, model, voice, and speed.
- Speed control only when supported by selected request contract.

### Step 3: Generate and result

- Primary action: “Generate speech”.
- While active: progress summary and “Cancel”.
- On partial chunk failure: completed count, failed chunk, “Retry”, and “Cancel”.
- On success: native audio player, separate “Download WAV” and “Download MP3” actions, and “Generate again”.

Changing source or voice after generation retains output and labels it with generation settings used.

## 4. Podcast workflow

R1 presents a compact sticky stepper that remains visible at the top of the viewport while scrolling. Completed steps remain editable until rendering begins.

### Step 1: Add source

Same input behavior as Text to Speech. Supporting copy: “vxPods uses this material as the basis for a spoken script in the selected format.”

### Step 2: Shape podcast

Essential controls:

- Saved Episode direction and editable temporary direction instructions.
- Saved Format template and editable temporary Format instructions.
- Audience.
- Script and TTS configurations, plus their model selects. Options come from the selected provider configurations.

All Podcast settings remain visible on one page. Model and voice controls are native selects populated from lists managed locally in the provider settings dialog. Without a selected saved configuration, the affected model and voice selects are empty and disabled. The lists are never presented as discovered provider capabilities.

Episode Direction and Format selection each copy saved instructions into a session-only draft. Editing marks temporary changes; Reset restores current saved content. Switching while dirty confirms before discarding. Deleting the selected saved template leaves the draft intact as Custom.

Episode direction defines purpose, angle, priorities, depth, and intentional omissions. Essential Overview is the default. Format continues to define discourse and participation structure; Speaker Roles remain tendencies within that structure.

Bundled Formats and Speaker Profiles are flat ordered lists with three named variants for each established type. Full names such as “Conversation — Critical” and “Expert — Analyst” expose the distinction without hierarchical navigation. Every selected record shows a complete editable contract that names unfamiliar linguistic terms and explains their observable behavior. Conversation, Interview, and Panel Discussion variants define distinct interactional discourse; Narrative and Lecture variants define non-interactive cohesion, progression, and handoffs. Speaker Profiles define format-adaptive contribution and delivery tendencies; no role overrides the selected Format and no script-wide Tone control competes with per-speaker instructions.

Step 3, “Plan”, is the single source of truth for one through eight ordered speaker drafts. Each card has a stable ID, profile selector/application action, name, multi-line role, provider-specific voice, preview, Remove, Move up, and Move down. Add focuses the new card. Remove opens a confirmation naming the speaker; cancellation preserves the cast, while confirmation focuses the nearest remaining card. Host — Facilitator and Expert — Explainer are initial defaults. Once a script exists, “Apply speaker changes to script” updates name, role, and voice by ID only when cast IDs match. Added, removed, or reordered speakers affect the next generation and leave the current script renderable with a stale-settings warning. Voice previews do not create render jobs or persist audio.

### Step 3: Plan

- Summary names the selected script configuration, text-generation API, and model. The ordered speaker editor remains the single source of truth for the cast.
- “Review plan before writing” is unchecked and session-only. The default “Generate script” action shows “Planning episode…” followed by “Writing and validating script…”. When checked, the action becomes “Create plan” and stops after planning.
- A valid plan stays visible in Quick and reviewed flows. Its read view shows working title, goal, listener promise, Format approach, priorities, exclusions, speaker contributions, progression, and ending.
- “Edit plan” follows the same explicit edit lifecycle as structured script editing: it becomes “Save edits”, exposes “Cancel edits”, preserves an in-progress draft across workflow and connectivity updates, and retains invalid edits for correction. Writing, replacement-plan generation, and model revision are unavailable until edits are saved or cancelled. List and beat actions use compact, accessible move and delete controls; save and cancel restore focus to the edit action and announce the outcome. “Ask for changes to this plan” requests a complete replacement plan. “Generate script from plan” is disabled while the plan is stale.
- Invalid plan output offers one “Repair plan” action. Network/provider failure offers retry. Cancel retains the last valid plan and script.
- “Import script JSON” bypasses planning and opens the script directly in the next step.

### Step 4: Script

After validation:

- Show title, speakers, and segment count.
- Default view presents ordered editable speaker turns.
- Structured turn editing includes a validated “Pause after (ms)” control from 0 through 5000.
- “Edit script” enables segment text editing.
- A “Structured” / “JSON” view switch exposes the canonical script JSON for advanced review.
- “Edit JSON” enables raw JSON editing. Applying changes parses and validates the complete canonical script before replacing the current script; invalid JSON or schema errors retain the current valid script and remain editable for correction or discard.
- “Download JSON” exports canonical script; the same file can be imported from Step 3.
- Primary action: “Render audio”.

Review is optional: users may render immediately. Structured editing remains the default; raw JSON editing is an explicit advanced path guarded by the same schema validation used for imports and pre-render validation. JSON remains the script download format.

Source or planning-input changes mark the plan and current script stale. A stale script remains reviewable and renderable with a warning. Voice-only changes do not stale the plan.

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

On startup with one recoverable render:

- Reassemble a completed render locally and open Preview and export without requiring a provider or network connection.
- For unfinished work, show a non-dismissible-by-accident recovery panel before starting another podcast.
- State title if available, completion count, last-updated time, and required provider/model.
- Actions: “Resume render” and “Discard”.
- Discard requires confirmation because completed segments will be removed.
- Missing saved provider configuration blocks resume and links directly to provider settings while preserving work.

## 6. Settings

Settings use one responsive dialog or full-height mobile sheet. The dialog has three persistent sections: Providers, Podcast, and Data & privacy, arranged in a compact horizontal navigation bar. Podcast contains Episode directions, Formats, Speaker profiles, and Advanced prompts pages. Every Settings page uses shared outer insets, title/supporting-text spacing, content-group gaps, and action alignment. Add/edit workflows open focused subpages with a Back action. Data backup, restore, and Clear local data appear only in Data & privacy. The clear action sits in a distinct Danger zone and confirms the complete removal scope before deleting local settings and unfinished work.

Saved configuration list:

- Name.
- Normalized base URL.
- Credential state: “Key saved” or “No key”.
- Edit and delete actions.

Configuration form:

- Preset: OpenAI, OpenRouter, Manual.
- Name.
- Base URL. HTTP and HTTPS are accepted.
- Authentication choice: Bearer API key or None. The visible API key field is prefilled when editing a saved configuration and is disabled for None.
- HTTP endpoints show a persistent warning that requests can be observed or modified on the network and should only be used with a trusted endpoint.
- Text generation API: Chat Completions or Responses; each configuration binds exactly one.
- New configurations start with OpenAI selected and its local defaults. Selecting a preset replaces URL, text-generation models, TTS models, and voices after confirmation. OpenRouter and Manual start with empty model and voice lists in R1; users add identifiers accepted by their configuration. Compact text-generation-model and TTS-model chip strips. Selecting a chip opens one focused editor; the selected TTS model exposes its voice chips with add/remove controls. Known TTS models prefill their locally maintained voice list; unknown identifiers start with no voices. Changing the text-generation API confirms before replacing its model list with API-specific defaults. Removing a model or voice requires confirmation. Restore actions confirm before resetting all model/voice options or only the selected model’s known voices. Model and voice lists may be empty. Copy states that these are local hints, not API-discovered capabilities.
- “Test generation” and “Test Speech” actions when useful.
- Save.

Explain once: “Configurations stay in this browser and requests go directly to the selected provider.”

Script and TTS selectors elsewhere display saved configuration name plus endpoint host; the Script selector also displays its API. Unsupported endpoints report failure without changing saved configuration.

When an action needs an unavailable provider configuration, provider settings opens directly on the creation form. Saving selects that configuration for the required text-generation or TTS slot and resumes the action.

Settings provide JSON export and restore. Export warns that API keys are unencrypted. Restore validates current-format JSON and requires confirmation because it fully replaces provider configurations, model/voice lists, selections, Episode Direction templates, Format templates, speaker profiles, and advanced prompt templates without merging. Unsupported backups require recreation under the current format.

Episode Direction, Format, and speaker-profile lists support add, edit, confirmed delete, and starter restoration. Format and Speaker Profile selectors remain flat and preserve canonical family/variant order. Starter restoration resets bundled IDs, restores missing starters, retains custom records, and reports names skipped because a custom record already uses them. A one-time catalog replacement introduces the expanded flat starters to existing settings; subsequent edits and deletions persist. Saved record edits do not mutate active generation drafts.

Advanced prompts group keyboard-operable message pages into Planning, Writing, and Validation repair. Each planner, revision, writer, approved-plan handoff, and repair layer has its own tab/page and is read-only until explicitly unlocked. A preview toggle replaces template editing with a full-width rendered view of the planner request and, when a current plan exists, the writer request; unsaved editor changes are included and the user may refresh inputs explicitly. Returning to editing restores the selected template page. Saving modified instructions requires confirmation. Each template and all templates together can restore bundled defaults. Missing required runtime placeholders prevent save and identify exact missing placeholder.

## 7. Responsive behavior

### Mobile: 320–767 px

- Single column.
- Sticky bottom primary action may be used when it does not cover errors or audio controls.
- Settings uses full-height sheet/dialog.
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
- Regular actions use compact rectangular controls with the shared control radius; full pills are reserved for the workflow mode switch and true model/voice chips.
- Repeated, unambiguous utility actions use compact icon-only tool buttons with accessible names and native tooltips.
- Keep action rows visually quiet by limiting heavy shadows and excess horizontal padding.
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

- Errors, warnings, and informational outcomes outside a modal display in a global toast stack. Settings and other modal workflows display contextual notices inside their active dialog, so native modal layering cannot hide feedback.
- Every toast and contextual notice has an explicit close control.
- Errors and dialog-local notices remain visible until dismissed. Global warnings and informational notifications auto-close after six seconds and pause while hovered or focused.
- Error copy includes what failed and next useful action.
- User-facing UI presents normalized error category and action.
- Provider errors with reportable context offer a collapsed “Technical details” disclosure. It contains labeled operation, endpoint, model, status, response type, and request ID values when available; it never shows credentials, submitted text, or a raw response body.

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
- User can identify separate text-generation and TTS configurations and the selected text-generation API.
- Podcast can be rendered directly after script validation.
- User can edit speaker turns through structured editor.
- User can manage reusable Episode directions, Formats, and speaker profiles, then temporarily adapt copied values for one generation.
- User can add, remove, and keyboard-reorder one through eight speaker cards without changing an existing script implicitly.
- User can review and edit canonical script JSON without invalid changes replacing the current valid script.
- Partial failure preserves and exposes completed work.
- Reload recovery is clear and cannot be overwritten accidentally.
- Export choices are WAV, MP3, and JSON.
- Mobile workflow exposes same actions as desktop.
- Keyboard, screen-reader smoke test, zoom/reflow, and reduced-motion checks pass.
