# AGENTS.md

Purpose: govern AI-led development and maintenance. Product behavior, technical design, and UX specifications live under `docs/`.

## 1. Required context

Read before editing:

1. This file.
2. Relevant documents under `docs/`.
3. Existing implementation and tests in affected area.

Document ownership:

- `docs/PRD.md`: product scope, behavior, and acceptance criteria.
- `docs/ARCHITECTURE.md`: stack, boundaries, contracts, schemas, persistence, and deployment.
- `docs/UX.md`: interaction, visual, responsive, and accessibility requirements.
- `docs/adr/`: material design decisions, when present.

When sources conflict, identify conflict before implementation. Explicit user decisions govern current task; persistent decisions receive matching documentation updates.

## 2. Change standard

- Make smallest coherent change that fully satisfies request.
- Preserve existing behavior outside requested change.
- Keep implementation direct, readable, and locally understandable.
- Treat tests and documentation as implementation deliverables.
- Preserve user data and compatibility through explicit migrations.
- Keep external effects bounded and visible at their owning boundary.
- Add scope, infrastructure, dependencies, and abstractions only when current requirement needs them.
- Resolve material ambiguity before committing to one behavior.

## 3. Architecture governance

- Follow boundaries and dependency direction defined in architecture document.
- Separate UI, workflow coordination, external services, persistence, and processing concerns.
- Route behavior through canonical owner for its domain.
- Maintain one source of truth for each contract.
- Encapsulate external systems behind narrow interfaces.
- Centralize persistence access, validation, and versioning.
- Keep public module surfaces small and intentional.
- Use explicit state and dependencies.
- Introduce abstraction after concrete reuse or stable boundary exists.
- Record material architecture changes in ADR before or with implementation.

ADR contains context, decision, consequences, considered alternatives, migration effect, and rollback considerations.

## 4. Implementation quality

- Use names that express domain intent.
- Give each function and module one coherent responsibility.
- Pass dependencies explicitly at construction or call boundary.
- Prefer pure functions for validation, transformation, state transitions, and deterministic formatting.
- Prefer composition and plain data contracts.
- Use named options where positional or boolean arguments obscure meaning.
- Use guard clauses and small operations to keep control flow readable.
- Make long-running asynchronous work cancellable.
- Normalize expected failures at system boundaries.
- Preserve useful context for unexpected failures while redacting sensitive values.
- Write comments for constraints and reasons.
- Remove obsolete code and commentary as behavior changes.
- Name shared modules by owned concept.
- Keep focused changes free from opportunistic rewrites.

Module size and function length are review signals. Split when ownership, testing, or control flow becomes unclear; retain cohesive code together.

## 5. Data and boundary safety

- Treat user input, imported files, persisted records, model output, and remote responses as untrusted data.
- Validate boundary data and operate on canonical internal forms.
- Render external text through safe text APIs.
- Keep credentials and sensitive values redacted from URLs, logs, errors, DOM metadata, exports, caches, fixtures, and snapshots.
- Version persistent records explicitly.
- Pair stored-data changes with migrations and migration tests.
- Recover safely from corrupt or obsolete local records.
- Confirm destructive local-data operations with exact affected scope.
- Preserve valid completed work across partial failures where architecture defines recovery.

## 6. UI and accessibility governance

- Prefer semantic native HTML and controls.
- Keep every workflow keyboard operable.
- Maintain visible focus, logical focus order, and focus restoration.
- Give every form control persistent label and associated help/error text.
- Design relevant loading, empty, success, failure, cancellation, retry, offline, and recovery states.
- Pair color with text, shape, icon, or semantics for meaningful state.
- Respect reduced-motion preferences.
- Meet contrast, zoom, reflow, and target-size requirements from UX specification.
- Announce meaningful asynchronous state changes through restrained live regions.
- Give user-facing errors a cause category and useful next action.
- Present normalized errors in UI while retaining technical details only in redacted diagnostics.
- Verify responsive behavior as part of feature completion.

## 7. Dependency governance

- Prefer existing dependencies and platform capabilities.
- Add dependency when it materially reduces implementation or maintenance risk.
- Evaluate maintenance status, bundle cost, compatibility, license, security history, and overlap.
- Wrap dependencies that occupy architectural boundary or may need replacement.
- Record material dependency decisions in architecture document or ADR.
- Add runtime origins through explicit approval and documented data flow.

## 8. Testing governance

- Cover every behavior change proportionally.
- Add deterministic regression test with each bug fix.
- Test observable behavior and public contracts.
- Use fakes or intercepted requests for external systems.
- Cover relevant validation, failure, retry, cancellation, persistence, and recovery paths.
- Test migrations against representative prior records.
- Test accessibility and responsive critical paths at browser level.
- Control time, randomness, network, and storage state for deterministic tests.
- Change expectations together with governing requirement when behavior changes.
- Keep quality gates at least as strong as before change.

Before handoff, run relevant repository checks and production build. Report exact command and uncertainty for any check that cannot run.

## 9. Work protocol

### Before editing

1. Inspect working tree and identify user-owned changes.
2. Read relevant requirements, architecture, UX, implementation, and tests.
3. Define behavior and acceptance criteria being changed.
4. Identify contract, persistence, privacy, accessibility, offline, and migration effects.

### During editing

1. Work through canonical owners.
2. Maintain architecture boundaries.
3. Add or update tests with behavior.
4. Update governing documents with persistent decisions.
5. Keep generated and transient artifacts in their defined locations.

### Before handoff

1. Run relevant tests, static checks, and production build.
2. Review complete diff for scope, duplication, data safety, credential handling, and documentation consistency.
3. Verify affected responsive, keyboard, error, loading, cancellation, and recovery states.
4. Report behavior, files, verification, and known limitations precisely.

## 10. Repository safety

- Preserve unrelated working-tree changes and user work.
- Resolve destructive command targets exactly and obtain required authorization.
- Edit canonical source rather than generated output.
- Keep credentials, transient output, and machine-specific artifacts outside version control.
- Limit formatting changes to requested or affected code.
- Base completion claims on requirements and verification, not build result alone.

## 11. Documentation governance

- Keep requirements implementation-neutral where practical.
- Keep architecture factual and aligned with shipped system.
- Keep UX focused on observable interaction and presentation contracts.
- Record decision rationale rather than session history.
- Replace superseded statements so documents remain internally consistent.
- Use stable terminology across docs, code, UI, and tests.
- Update examples and schemas with their contracts.
- Review related documents for consistency after documentation changes.

## 12. Definition of done

Change is complete when:

- Requested behavior and acceptance criteria are satisfied.
- Architecture boundaries remain intact or decision documents reflect change.
- Relevant edge and failure states are handled.
- Accessibility and responsive effects are verified.
- Persistent-data changes include safe migration.
- External data and credentials remain protected from accidental disclosure.
- Relevant automated checks and production build pass, with any verification gaps reported.
- Documentation matches implementation.
- Diff stays focused on requested outcome.

Reliability, clarity, accessibility, recoverability, and maintainability govern implementation quality.
